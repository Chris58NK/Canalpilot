 console.log("🚀 engine.js is loading...");

// --- 1. GLOBAL VARIABLES ---
let masterDatabase = [];
let canalGraph = {};
let map; 
let currentRouteLayer = null; // Memory for the drawn red line

// --- 2. MAP SETUP ---
function initMap() {
    console.log("🗺️ Initializing map...");
    const mapDiv = document.getElementById('map');
    if (!mapDiv) {
        console.error("❌ Could not find <div id='map'> in HTML!");
        return;
    }
    
    // Centers the map on the UK
    map = L.map('map').setView([52.5, -1.5], 7); 
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // Draw the beautiful blue canal network
    if (typeof networkData !== 'undefined') {
        L.geoJSON(networkData, {
            style: { color: '#007BFF', weight: 3, opacity: 0.8 }
        }).addTo(map);
        console.log("🌊 Canal network drawn on map.");
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
            data.features.forEach(feature => { // Changed from 'f' to 'feature' to be totally safe!
                const rawName = feature.properties.sap_description || feature.properties.name || `Unnamed ${type}`;
                const displayName = `${rawName} (${type})`; 
                masterDatabase.push({
                    name: displayName,
                    coords: feature.geometry.coordinates,
                    type: type
                });
            });
        }
    };

    addToMaster(typeof locksData !== 'undefined' ? locksData : undefined, "Lock");
    addToMaster(typeof bridgesData !== 'undefined' ? bridgesData : undefined, "Bridge");
    addToMaster(typeof tunnelsData !== 'undefined' ? tunnelsData : undefined, "Tunnel");
    addToMaster(typeof windingData !== 'undefined' ? windingData : undefined, "Winding Hole");
    addToMaster(typeof aqueductsData !== 'undefined' ? aqueductsData : undefined, "Aqueduct");
    addToMaster(typeof wharvesData !== 'undefined' ? wharvesData : undefined, "Wharf/Marina");
    addToMaster(typeof tunnelPortalsData !== 'undefined' ? tunnelPortalsData : undefined, "Tunnel Portal");
    addToMaster(typeof facilitiesData !== 'undefined' ? facilitiesData : undefined, "Facility");

    masterDatabase.sort((a, b) => a.name.localeCompare(b.name));
    masterDatabase.forEach(item => {
        const option = document.createElement('option');
        option.value = item.name;
        list.appendChild(option);
    });
    console.log(`✅ Loaded ${masterDatabase.length} total waypoints.`);
}

// --- 4. BUILD THE NAVIGATION GRAPH ---
function buildGraph() {
    console.log("🕸️ Building canal routing graph...");
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
    console.log(`✅ Network online! Mapped ${Object.keys(canalGraph).length} navigation points.`);
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

// --- 6. CALCULATE ROUTE & DRAW RED LINE ---
function calculateRoute() {
    const startVal = document.getElementById('startNode').value;
    const endVal = document.getElementById('endNode').value;
    const resultDisplay = document.getElementById('routeResult');

    const startPoint = masterDatabase.find(item => item.name === startVal);
    const endPoint = masterDatabase.find(item => item.name === endVal);

    if (!startPoint || !endPoint) {
        resultDisplay.innerHTML = "<span style='color:#d97706;'>⚠️ Please select valid points from the dropdown.</span>";
        return;
    }

    resultDisplay.innerHTML = "<i>Calculating water route... Please wait...</i>";

    setTimeout(() => {
        const startNodeId = findClosestNode(startPoint.coords);
        const endNodeId = findClosestNode(endPoint.coords);

        const distances = {};
        const previousNodes = {}; // The breadcrumb trail
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
                    previousNodes[neighbor] = currNode; // Drop a breadcrumb
                    activeNodes.set(neighbor, alt);
                }
            }
        }

        const totalMiles = distances[endNodeId];

        if (totalMiles === Infinity) {
            resultDisplay.innerHTML = `<span style='color:red;'>❌ No connected water route found between these points.</span>`;
        } else {
            // --- DRAW THE ROUTE ---
            let pathCoords = [];
            let step = endNodeId;
            while (step) {
                let [lon, lat] = step.split(',').map(Number);
                pathCoords.push([lat, lon]); 
                step = previousNodes[step];
            }

            if (currentRouteLayer) {
                map.removeLayer(currentRouteLayer); // Erase old route
            }

            currentRouteLayer = L.polyline(pathCoords, {
                color: '#ff2a00',
                weight: 6,
                opacity: 0.9,
                lineCap: 'round'
            }).addTo(map);

            map.fitBounds(currentRouteLayer.getBounds(), { padding: [40, 40] }); // Auto-zoom

            const speed = parseFloat(document.getElementById('speed').value) || 3;
            resultDisplay.innerHTML = `
                <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 5px solid #28a745;">
                    <strong>🗺️ Route Mapped Successfully!</strong><br><br>
                    Distance: <b>${totalMiles.toFixed(2)} miles</b><br>
                    Est. Travel Time (${speed}mph): <b>${(totalMiles / speed).toFixed(1)} hours</b>
                </div>`;
        }
    }, 50); 
}

// --- 7. START ENGINE ON LOAD ---
window.onload = function() {
    console.log("🏁 Window loaded, starting engine...");
    initMap();
    populateDropdowns();
    buildGraph(); 
};