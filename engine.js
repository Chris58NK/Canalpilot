console.log("🚀 engine.js is loading...");

// --- 1. GLOBAL VARIABLES ---
let masterDatabase = [];
let canalGraph = {};
let map;
let currentRouteLayer = null;
let startMarker = null;
let endMarker = null;
let routeMarkers = [];

// --- 2. MAP SETUP ---
function initMap() {
    console.log("🗺️ Initializing map...");
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    map = L.map('map').setView([52.5, -1.5], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    const networkFeatures =
        typeof network !== 'undefined'
            ? network
            : (typeof networkData !== 'undefined' ? networkData : undefined);

    if (networkFeatures) {
        L.geoJSON(networkFeatures, {
            style: { color: '#007BFF', weight: 3, opacity: 0.8 }
        }).addTo(map);
    }
}

// --- 3. DROPDOWN FILTER TYPE MAPPING ---
function getAllowedTypesFromFilters() {
    const typeMapping = {
        lock: ['Lock'],
        bridge: ['Bridge'],
        winding: ['Winding Hole'],
        marina: ['Wharf/Marina'],
        wharf: ['Wharf/Marina'],
        aqueduct: ['Aqueduct'],
        tunnel: ['Tunnel Portal'],
        junction: ['Junction']
    };

    const activeFilters = Array.from(document.querySelectorAll('.wp-filter:checked'))
        .map(cb => cb.value);

    let allowedTypes = [];
    activeFilters.forEach(filter => {
        if (typeMapping[filter]) {
            allowedTypes.push(...typeMapping[filter]);
        }
    });

    return allowedTypes;
}

// --- 4. POPULATE MASTER DATABASE ---
function populateDropdowns() {
    console.log("📋 Populating dropdowns...");
    masterDatabase = [];

    const addToMaster = (data, type) => {
        if (!data || !data.features) return;

        data.features.forEach(feature => {
            if (!feature.geometry || !feature.geometry.coordinates) return;

            let coords = feature.geometry.coordinates;

            while (Array.isArray(coords[0])) {
                coords = coords[0];
            }

            if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                const rawName =
                    feature.properties?.sap_description ||
                    feature.properties?.name ||
                    `Unnamed ${type}`;

                const waterway =
                    feature.properties?.waterway_name ||
                    feature.properties?.waterway ||
                    "";

                // Keep original display style, but add waterway for numbered/duplicate-prone names
                const needsWaterway =
                    /^\D*\d+\D*$/.test(rawName) || /^lock\s+\d+/i.test(rawName) || /^bridge\s+\d+/i.test(rawName);

                const displayName = needsWaterway && waterway
                    ? `${rawName} - ${waterway} (${type})`
                    : `${rawName} (${type})`;

                masterDatabase.push({
                    name: displayName,
                    coords: [coords[0], coords[1]], // [lon, lat]
                    type: type,
                    rawName: rawName,
                    waterway: waterway
                });
            }
        });
    };

    addToMaster(typeof locksData !== 'undefined' ? locksData : undefined, "Lock");
    addToMaster(typeof bridgesData !== 'undefined' ? bridgesData : undefined, "Bridge");
    addToMaster(typeof tunnelsData !== 'undefined' ? tunnelsData : undefined, "Tunnel");
    addToMaster(typeof windingHolesData !== 'undefined' ? windingHolesData : undefined, "Winding Hole");
    addToMaster(typeof aqueductsData !== 'undefined' ? aqueductsData : undefined, "Aqueduct");
    addToMaster(typeof wharvesData !== 'undefined' ? wharvesData : undefined, "Wharf/Marina");
    addToMaster(typeof marinasData !== 'undefined' ? marinasData : undefined, "Wharf/Marina");
    addToMaster(typeof tunnelPortalsData !== 'undefined' ? tunnelPortalsData : undefined, "Tunnel Portal");

    masterDatabase.sort((a, b) => a.name.localeCompare(b.name));
    updateDropdownOptions();
}

// --- 5. REBUILD DATALIST BASED ON CHECKED FILTERS ---
function updateDropdownOptions() {
    const list = document.getElementById('lockList');
    if (!list) return;

    list.innerHTML = "";

    const allowedTypes = getAllowedTypesFromFilters();

    const filteredItems = masterDatabase
        .filter(item => allowedTypes.includes(item.type))
        .sort((a, b) => a.name.localeCompare(b.name));

    filteredItems.forEach(item => {
        const option = document.createElement('option');
        option.value = item.name;
        list.appendChild(option);
    });
}

// --- 6. BUILD THE NAVIGATION GRAPH ---
function buildGraph() {
    console.log("🕸️ Building canal routing graph...");
    canalGraph = {};

    const networkFeatures =
        typeof network !== 'undefined'
            ? network
            : (typeof networkData !== 'undefined' ? networkData : undefined);

    if (!networkFeatures || !networkFeatures.features) return;

    networkFeatures.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'LineString') {
            const coords = feature.geometry.coordinates;

            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = coords[i];
                const p2 = coords[i + 1];
                const id1 = p1.join(',');
                const id2 = p2.join(',');

                const dist = turf.distance(
                    turf.point(p1),
                    turf.point(p2),
                    { units: 'miles' }
                );

                if (!canalGraph[id1]) canalGraph[id1] = {};
                if (!canalGraph[id2]) canalGraph[id2] = {};

                canalGraph[id1][id2] = dist;
                canalGraph[id2][id1] = dist;
            }
        }
    });
}

// --- 7. FIND CLOSEST CANAL NODE ---
function findClosestNode(targetCoords) {
    let closestId = null;
    let minDistance = Infinity;
    const targetPt = turf.point(targetCoords);

    for (const nodeId in canalGraph) {
        const [lon, lat] = nodeId.split(',').map(Number);
        const dist = turf.distance(
            targetPt,
            turf.point([lon, lat]),
            { units: 'miles' }
        );

        if (dist < minDistance) {
            minDistance = dist;
            closestId = nodeId;
        }
    }

    return closestId;
}

// --- 8. MAIN ROUTE CALCULATION ---
function calculateRoute() {
    const startVal = document.getElementById('startNode').value;
    const endVal = document.getElementById('endNode').value;
    const resultDisplay = document.getElementById('routeResult');

    const startPoint = masterDatabase.find(item => item.name === startVal);
    const endPoint = masterDatabase.find(item => item.name === endVal);

    if (!startPoint || !endPoint) {
        resultDisplay.innerHTML = "<span style='color:#d97706;'>⚠️ Please select valid points.</span>";
        return;
    }

    resultDisplay.innerHTML = "<i>Calculating water route... Please wait...</i>";

    setTimeout(() => {
        const startNodeId = findClosestNode(startPoint.coords);
        const endNodeId = findClosestNode(endPoint.coords);

        const distances = {};
        const previousNodes = {};
        const activeNodes = new Map();

        for (const node in canalGraph) {
            distances[node] = Infinity;
            previousNodes[node] = null;
        }

        distances[startNodeId] = 0;
        activeNodes.set(startNodeId, 0);

        while (activeNodes.size > 0) {
            let currNode = null;
            let minVal = Infinity;

            for (const [node, dist] of activeNodes.entries()) {
                if (dist < minVal) {
                    minVal = dist;
                    currNode = node;
                }
            }

            if (currNode === null || currNode === endNodeId) break;

            activeNodes.delete(currNode);

            for (const neighbor in canalGraph[currNode]) {
                const alt = distances[currNode] + canalGraph[currNode][neighbor];
                if (alt < distances[neighbor]) {
                    distances[neighbor] = alt;
                    previousNodes[neighbor] = currNode;
                    activeNodes.set(neighbor, alt);
                }
            }
        }

        const totalMiles = distances[endNodeId];

        if (totalMiles === Infinity) {
            resultDisplay.innerHTML = `<span style='color:red;'>❌ No connected water route found.</span>`;
            return;
        }

        let pathCoords = [];
        let step = endNodeId;

        while (step) {
            const [lon, lat] = step.split(',').map(Number);
            pathCoords.push([lat, lon]); // Leaflet format
            step = previousNodes[step];
        }

        pathCoords.reverse();

        // Clear old route/markers
        if (currentRouteLayer) map.removeLayer(currentRouteLayer);
        if (startMarker) map.removeLayer(startMarker);
        if (endMarker) map.removeLayer(endMarker);
        routeMarkers.forEach(marker => map.removeLayer(marker));
        routeMarkers = [];

        // Draw route
        currentRouteLayer = L.polyline(pathCoords, {
            color: '#22c55e',
            weight: 6,
            opacity: 0.9,
            lineCap: 'round'
        }).addTo(map);

        startMarker = L.marker([startPoint.coords[1], startPoint.coords[0]])
            .addTo(map)
            .bindPopup(`<b>🟢 Start:</b> ${startPoint.name}`);

        endMarker = L.marker([endPoint.coords[1], endPoint.coords[0]])
            .addTo(map)
            .bindPopup(`<b>🔴 End:</b> ${endPoint.name}`);

        map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] });

        const speed = parseFloat(document.getElementById('speed').value) || 3;
        const lockDelay = parseFloat(document.getElementById('lockDelay').value) || 12;

       const itineraryResult = scanWaypoints(
    pathCoords,
    speed,
    lockDelay,
    startPoint.name,
    endPoint.name
);
        const itineraryHTML = itineraryResult.html;
        const lockCount = itineraryResult.lockCount;

        const cruiseHours = totalMiles / speed;
        const lockHours = (lockCount * lockDelay) / 60;
        const totalHours = cruiseHours + lockHours;

        resultDisplay.innerHTML = `
            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 5px solid #28a745; margin-bottom: 15px;">
                <strong>🗺️ Route Mapped Successfully!</strong><br><br>
                Distance: <b>${totalMiles.toFixed(2)} miles</b><br>
                Locks on route: <b>${lockCount}</b><br>
                Cruising time (${speed}mph): <b>${cruiseHours.toFixed(1)} hours</b><br>
                Lock delay (${lockDelay} mins each): <b>${lockHours.toFixed(1)} hours</b><br>
                <span style="font-size: 1.05em;">Estimated total time: <b>${totalHours.toFixed(1)} hours</b></span>
            </div>
            ${itineraryHTML}
        `;
    }, 50);
}

// --- 9. FILTER TOGGLES ---
window.setAllFilters = function(state) {
    document.querySelectorAll('.wp-filter').forEach(cb => {
        cb.checked = state;
    });
    updateDropdownOptions();
};
function shouldExcludeWaypointForRoute(item, startPointName, endPointName) {
    const routeText = `${startPointName} ${endPointName}`.toLowerCase();

    const usesHarborough =
        routeText.includes("market harborough") ||
        routeText.includes("union wharf") ||
        routeText.includes("harborough");

    const raw = (item.rawName || "").toLowerCase();
    const waterway = (item.waterway || "").toLowerCase();

    return (
        usesHarborough &&
        item.type === "Lock" &&
        waterway.includes("leicester line") &&
        ["lock 17", "lock 16", "lock 15", "lock 14"].some(lock => raw.includes(lock))
    );
}

// --- 10. WAYPOINT SCANNER ---
function scanWaypoints(pathCoords, speed, lockDelay, startPointName, endPointName) {
    console.log("🔍 Scanning and building refined itinerary...");
    console.log("Route names:", startPointName, "->", endPointName);
    if (pathCoords.length < 2) {
        return {
            html: "",
            lockCount: 0
        };
    }

    const allowedTypes = getAllowedTypesFromFilters();

    const turfLine = turf.lineString(pathCoords.map(c => [c[1], c[0]])); // back to [lon, lat]
    const routeStartPoint = turf.point([pathCoords[0][1], pathCoords[0][0]]);

    const allMatchedWaypoints = [];

    masterDatabase.forEach(item => {
       if (shouldExcludeWaypointForRoute(item, startPointName, endPointName)) return;
        const pt = turf.point(item.coords);
        const distToLine = turf.pointToLineDistance(pt, turfLine, { units: 'miles' });

        let threshold = 0.05;
        if (item.type === 'Wharf/Marina') threshold = 0.35;

        if (distToLine < threshold) {
            const snapped = turf.nearestPointOnLine(turfLine, pt);
            const sliced = turf.lineSlice(routeStartPoint, snapped, turfLine);
            const milesAlongRoute = turf.length(sliced, { units: 'miles' });

            allMatchedWaypoints.push({
                name: item.name,
                rawName: item.rawName,
                waterway: item.waterway,
                type: item.type,
                distance: milesAlongRoute,
                color: getMarkerColor(item.type),
                coords: item.coords
            });
        }
    });

    allMatchedWaypoints.sort((a, b) => a.distance - b.distance);

    // Summary lock count should always use all matched route features, not filtered display
    const lockCount = allMatchedWaypoints.filter(item => item.type === 'Lock').length;

    // Running elapsed time should also use all matched route features
    let previousDistance = 0;
    let elapsedMinutes = 0;

    allMatchedWaypoints.forEach(step => {
        const segmentMiles = Math.max(0, step.distance - previousDistance);
        elapsedMinutes += (segmentMiles / speed) * 60;

        // arrival time at this feature
        step.elapsedMinutes = elapsedMinutes;

        // add lock working time after arriving, so later steps include it
        if (step.type === 'Lock') {
            elapsedMinutes += lockDelay;
        }

        previousDistance = step.distance;
    });

    // Only visible itinerary respects filters
    const displayedItinerary = allMatchedWaypoints.filter(item => allowedTypes.includes(item.type));

    // Draw only displayed markers
    displayedItinerary.forEach(item => {
        const marker = L.circleMarker([item.coords[1], item.coords[0]], {
            radius: 6,
            fillColor: item.color,
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        }).bindPopup(`<b>${item.name}</b>`);

        marker.addTo(map);
        routeMarkers.push(marker);
    });

    let html = `<div style="max-height: 400px; overflow-y: auto; padding-right: 10px;">`;

    displayedItinerary.forEach((step, index, array) => {
        const totalMinutes = Math.round(step.elapsedMinutes);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        const timeString = h > 0 ? `${h}h ${m}m` : `${m} mins`;

        let cleanName = step.rawName
            .trim()
            .toLowerCase()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        let displayTitle = cleanName;

        if (step.type === 'Tunnel Portal') {
            const baseName = step.rawName
                .toLowerCase()
                .replace(/(north|south|east|west)/g, '')
                .replace(/portal/g, '')
                .replace(/\(.*?\)/g, '')
                .trim();

            const portals = array.filter(wp => {
                if (wp.type !== 'Tunnel Portal') return false;

                const wpBase = wp.rawName
                    .toLowerCase()
                    .replace(/(north|south|east|west)/g, '')
                    .replace(/portal/g, '')
                    .replace(/\(.*?\)/g, '')
                    .trim();

                return wpBase === baseName;
            });

            if (portals.length >= 2) {
                const sorted = [...portals].sort((a, b) => a.distance - b.distance);
                displayTitle = step.distance === sorted[0].distance
                    ? `${cleanName} (Entrance)`
                    : `${cleanName} (Exit)`;
            }
        }

        html += `
        <div style="
            background: #f8fafc;
            margin-bottom: 10px;
            padding: 16px;
            border-radius: 14px;
            border: 1px solid #e2e8f0;
            box-shadow: 0 2px 4px rgba(0,0,0,0.04);
            display: flex;
            justify-content: space-between;
            align-items: center;
        ">
            <div style="flex: 1; text-align: left;">
                <div style="
                    color: #1e3a8a;
                    font-size: 1.1rem;
                    font-weight: 700;
                    line-height: 1.2;
                ">
                    ${displayTitle}
                </div>
                <div style="
                    color: #64748b;
                    font-size: 0.85rem;
                    font-weight: 600;
                    margin-top: 4px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                ">
                    ${step.type}${step.waterway ? ` • ${step.waterway}` : ''}
                </div>
            </div>
            <div style="
                text-align: right;
                min-width: 90px;
                border-left: 2px solid #cbd5e1;
                padding-left: 15px;
                margin-left: 10px;
            ">
                <div style="color: #0f172a; font-size: 1.15rem; font-weight: 800;">
                    ${step.distance.toFixed(2)} <span style="font-size: 0.7rem; color: #94a3b8;">MI</span>
                </div>
                <div style="color: #475569; font-size: 0.9rem; font-weight: 600; margin-top: 2px;">
                    ${timeString}
                </div>
            </div>
        </div>`;
    });

    html += `</div>`;

    return {
        html,
        lockCount
    };
}
    
// --- 11. MARKER COLOURS ---
function getMarkerColor(type) {
    if (type === 'Lock') return '#ff6b6b';
    if (type === 'Bridge') return '#4ecdc4';
    if (type === 'Winding Hole') return '#e74c3c';
    if (type === 'Wharf/Marina') return '#45b7d1';
    if (type === 'Aqueduct') return '#f39c12';
    if (type === 'Tunnel' || type === 'Tunnel Portal') return '#95a5a6';
    return '#3498db';
}

// --- 12. START ENGINE ON LOAD ---
window.onload = function() {
    console.log("🏁 Window loaded, starting engine...");
    initMap();
    populateDropdowns();
    buildGraph();

    document.querySelectorAll('.wp-filter').forEach(cb => {
        cb.addEventListener('change', updateDropdownOptions);
    });
};
