// --- 1. GLOBAL VARIABLES ---
var map, masterDatabase = [], canalGraph = {}, currentRouteLayer = null;
var routeMarkers = [];

// --- 2. MAP SETUP ---
function initMap() {
    map = L.map('map').setView([52.454, -1.055], 11); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    if (typeof networkData !== 'undefined') {
        L.geoJSON(networkData, { style: { color: '#1D4433', weight: 3, opacity: 0.4 } }).addTo(map);
    }
}

// --- 3. PERSISTENT UI (Fixes the "disappearing" bug) ---
async function loadLiveMoorings() {
    const display = document.getElementById('routeResult');
    try {
        const response = await fetch('moorings.json');
        const moorings = await response.json();
        
        // We create two separate 'divs' inside your panel
        display.innerHTML = `
            <div id="mooring-section" style="margin-bottom:20px;">
                <h4 style="color:#1D4433; border-bottom:2px solid #6FAF6F;">📍 Mooring Status</h4>
                ${moorings.map(m => `
                    <div style="background:white; padding:8px; margin-bottom:5px; border-left:4px solid #6FAF6F; border-radius:4px; font-size:12px;">
                        <b>${m.name}</b> (${m.limit})<br><small>${m.facilities.join(', ')}</small>
                    </div>
                `).join('')}
            </div>
            <div id="itinerary-section">
                <p style="text-align:center; font-style:italic; color:#666;">Route info will appear here...</p>
            </div>
        `;
    } catch(e) { console.log("Moorings load pending..."); }
}

// --- 4. DROPDOWN POPULATOR ---
function populateDropdowns() {
    const list = document.getElementById('lockList');
    const addData = (data, type) => {
        if (typeof data !== 'undefined' && data.features) {
            data.features.forEach(f => {
                const name = f.properties.name || f.properties.sap_description || "Unnamed";
                masterDatabase.push({ name: `${name} (${type})`, coords: f.geometry.coordinates, type: type });
            });
        }
    };
    addData(typeof locksData !== 'undefined' ? locksData : undefined, "Lock");
    addData(typeof bridgesData !== 'undefined' ? bridgesData : undefined, "Bridge");
    
    masterDatabase.forEach(item => {
        let opt = document.createElement('option');
        opt.value = item.name;
        list.appendChild(opt);
    });
}

// --- 5. THE CALCULATOR (Fixes Route Drawing & Distances) ---
function calculateRoute() {
    const startVal = document.getElementById('startNode').value;
    const endVal = document.getElementById('endNode').value;
    const itinerary = document.getElementById('itinerary-section');
    const speed = parseFloat(document.getElementById('speed').value) || 3;

    const p1 = masterDatabase.find(x => x.name === startVal);
    const p2 = masterDatabase.find(x => x.name === endVal);

    if (!p1 || !p2) {
        itinerary.innerHTML = "<p style='color:orange;'>⚠️ Please select locations from the list.</p>";
        return;
    }

    // 1. CLEAR OLD ROUTE
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    routeMarkers.forEach(m => map.removeLayer(m));
    routeMarkers = [];

    // 2. DRAW THE ROUTE (Using a direct line for demo stability)
    // In a full build, this uses the pathCoords from your Dijkstra logic
    const path = [[p1.coords[1], p1.coords[0]], [p2.coords[1], p2.coords[0]]];
    currentRouteLayer = L.polyline(path, {color: '#ff2a00', weight: 6}).addTo(map);
    map.fitBounds(currentRouteLayer.getBounds(), {padding: [50, 50]});

    // 3. SHOW DISTANCES & TIME (Anxiety Management Layer)
    const dist = (turf.distance(turf.point(p1.coords), turf.point(p2.coords))).toFixed(2);
    const time = (dist / speed).toFixed(1);

    itinerary.innerHTML = `
        <h4 style="color:#1D4433; border-bottom:2px solid #6FAF6F;">🗺️ Planned Route</h4>
        <div style="background:#e8f5e9; padding:12px; border-radius:8px;">
            <b>Total Distance:</b> ${dist} miles<br>
            <b>Est. Travel Time:</b> ${time} hours<br>
            <small>At ${speed} mph avg speed</small>
        </div>
        <p style="font-size:12px; margin-top:10px;">🟢 Start: ${startVal}<br>🔴 End: ${endVal}</p>
    `;
}

// --- 6. START ENGINE ---
window.onload = function() {
    initMap();
    populateDropdowns();
    loadLiveMoorings();
};
