console.log("🚀 CanalPilot Engine: Loading Advanced Navigation & Data Fusion...");

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
    console.log("🗺️ Initializing Leaflet map...");
    const mapDiv = document.getElementById('map');
    if (!mapDiv) return;
    
    // Centered on the Leicester Line/Kilworth area
    map = L.map('map').setView([52.454, -1.055], 11); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    if (typeof networkData !== 'undefined') {
        L.geoJSON(networkData, {
            style: { color: '#1D4433', weight: 4, opacity: 0.6 } // Deep Green network lines
        }).addTo(map);
    }
}

// --- 3. FETCH LIVE MOORING DATA (The "Anxiety Management" Layer) ---
async function loadLiveMoorings() {
    const resultDisplay = document.getElementById('routeResult');
    try {
        const response = await fetch('moorings.json');
        const moorings = await response.json();
        
        let mooringHTML = `
            <div style="margin-bottom: 20px; border-bottom: 3px solid #6FAF6F; padding-bottom: 10px;">
                <h4 style="margin:0; color:#1D4433;">📍 Local Mooring Status</h4>
        `;
        
        moorings.forEach(spot => {
            mooringHTML += `
                <div style="background: white; padding: 12px; border-left: 6px solid #6FAF6F; margin-bottom: 10px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); color: #333;">
                    <strong style="color: #1D4433; font-size: 14px;">${spot.name}</strong><br>
                    <small>Stay: ${spot.limit} | Facilities: ${spot.facilities.join(', ')}</small>
                </div>
            `;
        });
        
        mooringHTML += `</div>`;
        resultDisplay.innerHTML = mooringHTML + resultDisplay.innerHTML;
        
    } catch (e) {
        console.log("Mooring data file not found, waiting for user route...");
    }
}

// --- 4. POPULATE DROPDOWNS ---
function populateDropdowns() {
    console.log("📋 Populating infrastructure dropdowns...");
    const list = document.getElementById('lockList');
    if (!list) return;

    list.innerHTML = ""; 
    masterDatabase = [];

    const addToMaster = (data, type) => {
        if (typeof data !== 'undefined' && data.features) {
            data.features.forEach(feature => { 
                if (!feature.geometry || !feature.geometry.coordinates) return;
                let coords = feature.geometry.coordinates;
                while (Array.isArray(coords[0])) { coords = coords[0]; }

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
    addToMaster(typeof windingData !== 'undefined' ? windingData : undefined, "Winding Hole");
    addToMaster(typeof wharvesData !== 'undefined' ? wharvesData : undefined, "Wharf/Marina");
    addToMaster(typeof facilitiesData !== 'undefined' ? facilitiesData : undefined, "Facility");

    masterDatabase.sort((a, b) => a.name.localeCompare(b.name));
    masterDatabase.forEach(item => {
        const option = document.createElement('option');
        option.value = item.name;
        list.appendChild(option);
    });
}

// --- 5. BUILD THE NAVIGATION GRAPH ---
function buildGraph() {
    console.log("🕸️ Building canal routing graph (Dijkstra-ready)...");
    canalGraph = {};
    if (typeof networkData === 'undefined') return;

    networkData.features.forEach(feature => {
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

// --- 6. ROUTE CALCULATOR ---
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

    resultDisplay.innerHTML = "<i>🔄 Calculating water route via Dijkstra...</i>";

    setTimeout(() => {
        const findClosestNode = (targetCoords) => {
            let closestId = null; let minDistance = Infinity;
            const targetPt = turf.point(targetCoords);
            for (const nodeId in canalGraph) {
                const [lon, lat] = nodeId.split(',').map(Number);
                const dist = turf.distance(targetPt, turf.point([lon, lat]), {units: 'miles'});
                if (dist < minDistance) { minDistance = dist; closestId = nodeId; }
            }
            return closestId;
        };

        const startNodeId = findClosestNode(startPoint.coords);
        const endNodeId = findClosestNode(endPoint.coords);

        // --- DIJKSTRA ALGORITHM ---
        const distances = {}; const previousNodes = {}; let activeNodes = new Map();
        for (let node in canalGraph) { distances[node] = Infinity; previousNodes[node] = null; }
        distances[startNodeId] = 0; activeNodes.set(startNodeId, 0);

        while (activeNodes.size > 0) {
            let currNode = null; let minVal = Infinity;
            for (let [node, dist] of activeNodes.entries()) {
                if (dist < minVal) { minVal = dist; currNode = node; }
            }
            if (currNode === null || currNode === endNodeId) break; 
            activeNodes.delete(currNode);
            for (let neighbor in canalGraph[currNode]) {
                let alt = distances[currNode] + canalGraph[currNode][neighbor];
                if (alt < distances[neighbor]) {
                    distances[neighbor] = alt; previousNodes[neighbor] = currNode; 
                    activeNodes.set(neighbor, alt);
                }
            }
        }

        const totalMiles = distances[endNodeId];

        if (totalMiles === Infinity) {
            resultDisplay.innerHTML = `<span style='color:red;'>❌ No connected route found.</span>`;
        } else {
            let pathCoords = []; let step = endNodeId;
            while (step) {
                let [lon, lat] = step.split(',').map(Number);
                pathCoords.push([lat, lon]); step = previousNodes[step];
            }
            pathCoords.reverse();

            if (currentRouteLayer) map.removeLayer(currentRouteLayer);
            if (startMarker) map.removeLayer(startMarker);
            if (endMarker) map.removeLayer(endMarker);

            currentRouteLayer = L.polyline(pathCoords, { color: '#ff2a00', weight: 6, opacity: 0.9 }).addTo(map);
            startMarker = L.marker([startPoint.coords[1], startPoint.coords[0]]).addTo(map);
            endMarker = L.marker([endPoint.coords[1], endPoint.coords[0]]).addTo(map);
            map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] }); 

            const speed = parseFloat(document.getElementById('speed').value) || 3;
            const itineraryHTML = scanWaypoints(pathCoords, speed);

            resultDisplay.innerHTML = `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 5px solid #28a745; margin-bottom: 15px; color: #333;">
                    <strong>🗺️ Journey Optimized!</strong><br><br>
                    Distance: <b>${totalMiles.toFixed(2)} miles</b><br>
                    Est. Time (${speed}mph): <b>${(totalMiles / speed).toFixed(1)} hours</b>
                </div>
                ${itineraryHTML}
            `;
        }
    }, 50); 
}

// --- 7. THE WAYPOINT SCANNER ---
function scanWaypoints(pathCoords, speed) {
    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeMarkers = [];
    let itinerary = []; 

    const activeFilters = Array.from(document.querySelectorAll('.wp-filter:checked')).map(cb => cb.value);
    const turfLine = turf.lineString(pathCoords.map(c => [c[1], c[0]]));
    const startPoint = turf.point([pathCoords[0][1], pathCoords[0][0]]);

    masterDatabase.forEach(item => {
        const pt = turf.point(item.coords); 
        const distToLine = turf.pointToLineDistance(pt, turfLine, {units: 'miles'});
        
        if (distToLine < 0.05) {
            const snapped = turf.nearestPointOnLine(turfLine, pt);
            const sliced = turf.lineSlice(startPoint, snapped, turfLine);
            const milesAlong = turf.length(sliced, {units: 'miles'});

            itinerary.push({ name: item.name, type: item.type, distance: milesAlong });
        }
    });

    itinerary.sort((a, b) => a.distance - b.distance);
    let html = `<div style="max-height: 400px; overflow-y: auto; color: #333;">`;
    itinerary.forEach(step => {
        const hours = step.distance / speed;
        const timeStr = hours < 1 ? `${Math.round(hours*60)}m` : `${Math.floor(hours)}h ${Math.round((hours%1)*60)}m`;
        html += `<div style="background:rgba(255,255,255,0.8); margin-bottom:8px; padding:10px; border-radius:6px; border-left:4px solid #1D4433;">
                    <b>${step.name}</b> (${step.type})<br>
                    <small>📍 ${step.distance.toFixed(1)} mi | ⏱️ ${timeStr}</small>
                 </div>`;
    });
    return html + `</div>`;
}

// --- 8. START ENGINE ON LOAD ---
window.onload = function() {
    initMap();
    populateDropdowns();
    buildGraph(); 
    loadLiveMoorings(); // Fuse your custom mooring data immediately
};
