var map, masterDatabase = [], currentRouteLayer = null;

// --- 1. SYNC GUARD ---
window.onload = function() {
    console.log("🚀 Page loaded. Checking Data Layers...");
    initMap();
    populateDropdowns();
    loadMoorings();
};

// --- 2. MAP INITIALIZATION ---
function initMap() {
    map = L.map('map').setView([52.454, -1.055], 11); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    // Fuse networkData if present
    if (typeof networkData !== 'undefined') {
        L.geoJSON(networkData, { style: { color: '#007BFF', weight: 4, opacity: 0.5 } }).addTo(map);
        console.log("✅ Network Data Fused.");
    } else {
        console.error("❌ networkData is missing from folder or script tags.");
    }
}

// --- 3. MOORING STATUS (Persistent) ---
async function loadMoorings() {
    const content = document.getElementById('mooring-content');
    try {
        const response = await fetch('moorings.json');
        const moorings = await response.json();
        content.innerHTML = moorings.map(m => `
            <div style="padding:10px; border-bottom:1px solid #eee; font-size:13px;">
                <strong style="color:#1D4433;">${m.name}</strong><br>
                <small>${m.limit} | ${m.facilities.join(', ')}</small>
            </div>
        `).join('');
    } catch(e) { content.innerHTML = "No custom mooring data found."; }
}

// --- 4. DROPDOWN POPULATOR ---
function populateDropdowns() {
    const list = document.getElementById('lockList');
    const addToMaster = (data, type) => {
        if (typeof data !== 'undefined' && data.features) {
            data.features.forEach(f => {
                const name = f.properties.name || f.properties.sap_description || "Unnamed";
                masterDatabase.push({ 
                    name: `${name} (${type})`, 
                    coords: f.geometry.coordinates, 
                    type: type 
                });
            });
        }
    };
    addToMaster(typeof locksData !== 'undefined' ? locksData : undefined, "Lock");
    addToMaster(typeof bridgesData !== 'undefined' ? bridgesData : undefined, "Bridge");
    
    masterDatabase.sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
        let opt = document.createElement('option');
        opt.value = item.name;
        list.appendChild(opt);
    });
}

// --- 5. CALCULATOR & ROUTING ---
function calculateRoute() {
    const startVal = document.getElementById('startNode').value;
    const endVal = document.getElementById('endNode').value;
    const content = document.getElementById('itinerary-content');

    const p1 = masterDatabase.find(x => x.name === startVal);
    const p2 = masterDatabase.find(x => x.name === endVal);

    if (!p1 || !p2) {
        content.innerHTML = "⚠️ Please select valid locations.";
        return;
    }

    // Drawing the Line
    if (currentRouteLayer) map.removeLayer(currentRouteLayer);
    const latlngs = [[p1.coords[1], p1.coords[0]], [p2.coords[1], p2.coords[0]]];
    currentRouteLayer = L.polyline(latlngs, {color: '#ff2a00', weight: 6}).addTo(map);
    map.fitBounds(currentRouteLayer.getBounds(), {padding: [50, 50]});

    // Distance Calculation
    const dist = turf.distance(turf.point(p1.coords), turf.point(p2.coords), {units: 'miles'});
    
    content.innerHTML = `
        <div style="background:#e8f5e9; padding:10px; border-radius:6px; margin-bottom:15px;">
            <strong>Route Found</strong><br>
            Distance: <b>${dist.toFixed(2)} miles</b><br>
            Time (3mph): <b>${(dist / 3).toFixed(1)} hours</b>
        </div>
        <p style="font-size:12px; color:#666;">🟢 ${startVal}<br>🔴 ${endVal}</p>
    `;
}
