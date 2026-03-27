// --- 1. GLOBAL VARIABLES ---
var map, masterDatabase = [], canalGraph = {}, currentRouteLayer = null;
var routeMarkers = []; 

// --- 2. MAP SETUP ---
function initMap() {
    map = L.map('map').setView([52.454, -1.055], 11); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    if (typeof networkData !== 'undefined') {
        L.geoJSON(networkData, { style: { color: '#1D4433', weight: 3, opacity: 0.3 } }).addTo(map);
    }
}

// --- 3. PERSISTENT MOORING LIST ---
async function loadLiveMoorings() {
    const section = document.getElementById('mooring-panel');
    try {
        const response = await fetch('moorings.json');
        const moorings = await response.json();
        
        section.innerHTML = `<h4>📍 Live Mooring Status</h4>` + moorings.map(m => `
            <div style="background:white; padding:10px; margin-bottom:8px; border-left:5px solid #6FAF6F; border-radius:4px; font-size:12px; color:#333;">
                <b>${m.name}</b> (${m.limit})<br>
                <small>${m.facilities.join(', ')}</small>
            </div>
        `).join('');
    } catch(e) { console.log("Mooring load pending..."); }
}

// --- 4. DROPDOWN POPULATOR ---
function populateDropdowns() {
    const list = document.getElementById('lockList');
    const addToMaster = (data, type) => {
        if (typeof data !== 'undefined' && data.features) {
            data.features.forEach(f => {
                const name = f.properties.name || f.properties.sap_description || "Unnamed";
                masterDatabase.push({ name: `${name} (${type})`, coords: f.geometry.coordinates, type: type });
            });
        }
    };
    addToMaster(typeof locksData !== 'undefined' ? locksData : undefined, "Lock");
    addToMaster(typeof bridgesData !== 'undefined' ? bridgesData : undefined, "Bridge");
    
    masterDatabase.forEach(item => {
        let opt = document.createElement('option'); opt.value = item.name; list.appendChild(opt);
    });
}

// --- 5. THE CALCULATOR (Now with Forward Distance List) ---
function calculateRoute() {
    const startVal = document.getElementById('startNode').value;
    const endVal = document.getElementById('endNode').value;
    const itinerary = document.getElementById('itinerary-panel');
    const speed = parseFloat(document.getElementById('speed').value) || 3;

    const p1 = masterDatabase.find(x => x.name === startVal);
    const p2 = masterDatabase.find(x => x.name === endVal);

    if (!p1 || !p2) {
        itinerary.innerHTML = "<p style='color:orange;'>⚠️ Select valid locations.</p>";
        return;
    }

    // A. Drawing logic
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    const path = [[p1.coords[1], p1.coords[0]], [p2.coords[1], p2.coords[0]]];
    currentRouteLayer = L.polyline(path, {color: 'red', weight: 6, opacity: 0.8}).addTo(map);
    map.fitBounds(currentRouteLayer.getBounds(), {padding: [50, 50]});

    // B. Distance Logic
    const totalDist = turf.distance(turf.point(p1.coords), turf.point(p2.coords), {units: 'miles'});
    
    // C. Forward Scanner (Simulating waypoints along the route)
    let waypointsHTML = "";
    masterDatabase.forEach(item => {
        const d = turf.distance(turf.point(p1.coords), turf.point(item.coords), {units: 'miles'});
        if (d < totalDist && d > 0.1) {
            waypointsHTML += `
                <div style="background:rgba(255,255,255,0.7); padding:8px; margin-bottom:5px; border-left:3px solid #1D4433; font-size:11px; color:#333;">
                    <b>${item.name}</b><br>
                    ${d.toFixed(1)} miles ahead | ⏱️ ${((d/speed)*60).toFixed(0)} mins
                </div>`;
        }
    });

    itinerary.innerHTML = `
        <h4 style="color:#1D4433; border-bottom:2px solid #6FAF6F;">🗺️ Planned Route</h4>
        <div style="background:#e8f5e9; padding:12px; border-radius:8px; color:#333; margin-bottom:10px;">
            <b>Total: ${totalDist.toFixed(1)} miles</b> | <b>${(totalDist/speed).toFixed(1)} hrs</b>
        </div>
        ${waypointsHTML || "<p style='color:#666;'>No locks or bridges detected.</p>"}
    `;
}

// --- 6. START ENGINE ---
window.onload = function() {
    initMap();
    populateDropdowns();
    loadLiveMoorings();
};
