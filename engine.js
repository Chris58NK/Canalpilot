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

    // Fallback support for network or networkData
    const networkFeatures = typeof network !== 'undefined' ? network : (typeof networkData !== 'undefined' ? networkData : undefined);
    if (networkFeatures) {
        L.geoJSON(networkFeatures, {
            style: { color: '#007BFF', weight: 3, opacity: 0.8 }
        }).addTo(map);
    }
}

// --- 3. POPULATE DROPDOWNS ---
function populateDropdowns() {
    console.log("📋 Populating dropdowns...");
    const list = document.getElementById('lockList');
    if (!list) return;

    list.innerHTML = ""; 
    masterDatabase = [];

    const addToMaster = (data, type) => {
        if (typeof data !== 'undefined' && data.features) {
            data.features.forEach(feature => { 
                if (!feature.geometry || !feature.geometry.coordinates) return;

                let coords = feature.geometry.coordinates;
                while (Array.isArray(coords[0])) {
                    coords = coords[0];
                }

                if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
                    const rawName = feature.properties.sap_description || feature.properties.name || `Unnamed ${type}`;
                    const displayName = `${rawName} (${type})`; 
                    masterDatabase.push({
                        name: displayName,
                        coords: [coords[0], coords[1]],
                        type: type
                    });
                }
            });
        }
    };

    addToMaster(typeof locksData !== 'undefined' ? locksData : undefined, "Lock");
    addToMaster(typeof bridgesData !== 'undefined' ? bridgesData : undefined, "Bridge");
    addToMaster(typeof tunnelsData !== 'undefined' ? tunnelsData : undefined, "Tunnel");
    addToMaster(typeof windingHolesData !== 'undefined' ? windingHolesData : undefined, "Winding Hole"); // <-- Matched!
    addToMaster(typeof aqueductsData !== 'undefined' ? aqueductsData : undefined, "Aqueduct");
    addToMaster(typeof wharvesData !== 'undefined' ? wharvesData : undefined, "Wharf/Marina"); // <-- Matched!
    addToMaster(typeof tunnelPortalsData !== 'undefined' ? tunnelPortalsData : undefined, "Tunnel Portal"); // <-- Matched!
    addToMaster(typeof facilitiesData !== 'undefined' ? facilitiesData : undefined, "Facility");
    masterDatabase.sort((a, b) => a.name.localeCompare(b.name));
    masterDatabase.forEach(item => {
        const option = document.createElement('option');
        option.value = item.name;
        list.appendChild(option);
    });
}

// --- 4. BUILD THE NAVIGATION GRAPH ---
function buildGraph() {
    console.log("🕸️ Building canal routing graph...");
    canalGraph = {};
    const networkFeatures = typeof network !== 'undefined' ? network : (typeof networkData !== 'undefined' ? networkData : undefined);
    if (!networkFeatures) return;

    networkFeatures.features.forEach(feature => {
        if (feature.geometry && feature.geometry.type === 'LineString') {
            const coords = feature.geometry.coordinates;
            for (let i = 0; i < coords.length - 1; i++) {
                const p1 = coords[i];
                const p2 = coords[i+1];
                const id1 = p1.join(','); 
                const id2 = p2.join(',');
                
                const dist = turf.distance(turf.point(p1), turf.point(p2), {units: 'miles'});
                
                if (!canalGraph[id1]) canalGraph[id1] = {};
                if (!canalGraph[id2]) canalGraph[id2] = {};
                
                canalGraph[id1][id2] = dist;
                canalGraph[id2][id1] = dist; 
            }
        }
    });
}

// --- 5. FIND CLOSEST CANAL POINT ---
function findClosestNode(targetCoords) {
    let closestId = null;
    let minDistance = Infinity;
    const targetPt = turf.point(targetCoords);
    
    for (const nodeId in canalGraph) {
        const [lon, lat] = nodeId.split(',').map(Number);
        const dist = turf.distance(targetPt, turf.point([lon, lat]), {units: 'miles'});
        if (dist < minDistance) {
            minDistance = dist;
            closestId = nodeId;
        }
    }
    return closestId;
}

// --- 6. CALCULATE ROUTE ---
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
        let activeNodes = new Map();
        
        for (let node in canalGraph) {
            distances[node] = Infinity;
            previousNodes[node] = null;
        }
        distances[startNodeId] = 0;
        activeNodes.set(startNodeId, 0);

        while (activeNodes.size > 0) {
            let currNode = null;
            let minVal = Infinity;
            
            for (let [node, dist] of activeNodes.entries()) {
                if (dist < minVal) {
                    minVal = dist;
                    currNode = node;
                }
            }

            if (currNode === null || currNode === endNodeId) break; 
            
            activeNodes.delete(currNode);

            for (let neighbor in canalGraph[currNode]) {
                let alt = distances[currNode] + canalGraph[currNode][neighbor];
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
        } else {
            let pathCoords = [];
            let step = endNodeId;
            while (step) {
                let [lon, lat] = step.split(',').map(Number);
                pathCoords.push([lat, lon]); 
                step = previousNodes[step];
            }
            
            // Reverse the path so it goes Start -> End!
            pathCoords.reverse();

            // Draw Route
            if (currentRouteLayer) map.removeLayer(currentRouteLayer);
            if (startMarker) map.removeLayer(startMarker);
            if (endMarker) map.removeLayer(endMarker);

           currentRouteLayer = L.polyline(pathCoords, {
                color: '#22c55e',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round'
            }).addTo(map);

            startMarker = L.marker([startPoint.coords[1], startPoint.coords[0]])
                .addTo(map).bindPopup(`<b>🟢 Start:</b> ${startPoint.name}`);

            endMarker = L.marker([endPoint.coords[1], endPoint.coords[0]])
                .addTo(map).bindPopup(`<b>🔴 End:</b> ${endPoint.name}`);

            map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] }); 

            // Get the speed for calculations
            const speed = parseFloat(document.getElementById('speed').value) || 3;
            
            // Generate the Itinerary HTML from the scanner
            const itineraryHTML = scanWaypoints(pathCoords, speed);

            // Print the Green Summary Box + The Itinerary List
            resultDisplay.innerHTML = `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 5px solid #28a745; margin-bottom: 15px;">
                    <strong>🗺️ Route Mapped Successfully!</strong><br><br>
                    Distance: <b>${totalMiles.toFixed(2)} miles</b><br>
                   const lockDelay = parseFloat(document.getElementById('lockDelay').value) || 12;
             const lockCount = itinerary.filter(item => item.type === 'Lock').length;

             const cruiseHours = totalMiles / speed;
             const lockHours = (lockCount * lockDelay) / 60;
             const totalHours = cruiseHours + lockHours;
                </div>
                ${itineraryHTML}
            `;
        }
    }, 50); 
}

// --- 7. THE WAYPOINT SCANNER & ITINERARY ---
window.setAllFilters = function(state) {
    document.querySelectorAll('.wp-filter').forEach(cb => cb.checked = state);
};

function scanWaypoints(pathCoords, speed) {
    console.log("🔍 Scanning and building refined itinerary...");

    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeMarkers = [];
    let itinerary = []; 

    const activeFilters = Array.from(document.querySelectorAll('.wp-filter:checked')).map(cb => cb.value);
    if (activeFilters.length === 0 || pathCoords.length < 2) return ""; 

    const typeMapping = {
        'lock': ['Lock'],
        'bridge': ['Bridge'],
        'winding': ['Winding Hole'],
        'marina': ['Wharf/Marina'],
        'wharf': ['Wharf/Marina'],
        'aqueduct': ['Aqueduct'],
        'tunnel': ['Tunnel Portal'], // SURGERY 1: Removed 'Tunnel' to fix the sandwich
        'junction': ['Junction']
    };

    let allowedTypes = [];
    activeFilters.forEach(filter => {
        if (typeMapping[filter]) allowedTypes.push(...typeMapping[filter]);
    });

    const turfLine = turf.lineString(pathCoords.map(c => [c[1], c[0]]));
    const startPoint = turf.point([pathCoords[0][1], pathCoords[0][0]]);

    masterDatabase.forEach(item => {
        if (allowedTypes.includes(item.type)) {
            const pt = turf.point(item.coords); 
            const distToLine = turf.pointToLineDistance(pt, turfLine, {units: 'miles'});
            
            if (distToLine < 0.05) {
                const markerColor = getMarkerColor(item.type);
                const marker = L.circleMarker([item.coords[1], item.coords[0]], {
                    radius: 6, fillColor: markerColor, color: "#ffffff", weight: 2, opacity: 1, fillOpacity: 1
                }).bindPopup(`<b>${item.name}</b>`);
                marker.addTo(map);
                routeMarkers.push(marker);

                const snapped = turf.nearestPointOnLine(turfLine, pt);
                const sliced = turf.lineSlice(startPoint, snapped, turfLine);
                const milesAlongRoute = turf.length(sliced, {units: 'miles'});

                itinerary.push({
                    name: item.name,
                    type: item.type,
                    distance: milesAlongRoute,
                    color: markerColor
                });
            }
        }
    });

    // Sort by distance
    itinerary.sort((a, b) => a.distance - b.distance);

    // SURGERY 2: Final HTML Generation (Sunlight Optimized / Tunnel Labeled)
    let html = `<div style="max-height: 400px; overflow-y: auto; padding-right: 10px;">`;
    
  itinerary.forEach((step, index, array) => {
    const hours = step.distance / speed;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    const timeString = h > 0 ? `${h}h ${m}m` : `${m} mins`;

    // 1. STRIP BRACKETS & TITLE CASE
    let cleanName = step.name.split('(')[0].trim().toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

    // 2. DIRECTIONAL LOGIC (DISTANCE-BASED)
    let displayTitle = cleanName;
    if (step.type === 'Tunnel Portal') {
        // Find the "other" portal for this tunnel in the route
        const portals = array.filter(wp => wp.type === 'Tunnel Portal' && wp.name.split('(')[0].trim() === cleanName);
        if (portals.length > 1) {
            // If my distance is the shortest of the two, I am the entrance
            const minDistance = Math.min(...portals.map(p => p.distance));
            displayTitle = step.distance === minDistance ? `${cleanName} (Entrance)` : `${cleanName} (Exit)`;
        }
    }

    // 3. MODERN NAUTICAL UI (NO BLACK/WHITE)
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
                ${step.type}
            </div>
        </div>
        <div style="text-align: right; min-width: 90px; border-left: 2px solid #cbd5e1; padding-left: 15px; margin-left: 10px;">
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
    return html;
}

function getMarkerColor(type) {
    if (type === 'Lock') return '#ff6b6b';
    if (type === 'Bridge') return '#4ecdc4';
    if (type === 'Winding Hole') return '#e74c3c';
    if (type === 'Wharf/Marina') return '#45b7d1';
    if (type === 'Aqueduct') return '#f39c12';
    if (type === 'Tunnel' || type === 'Tunnel Portal') return '#95a5a6';
    return '#3498db'; 
}

// --- 8. START ENGINE ON LOAD ---
window.onload = function() {
    console.log("🏁 Window loaded, starting engine...");
    initMap();
    populateDropdowns();
    buildGraph(); 
};
