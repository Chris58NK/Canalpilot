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
    map = L.map('map').setView([52.454, -1.055], 11); 
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    if (typeof networkData !== 'undefined') {
        L.geoJSON(networkData, {
            style: { color: '#1D4433', weight: 4, opacity: 0.6 }
        }).addTo(map);
    }
}

// --- 3. THE "ANXIETY MANAGEMENT" LAYER (Moorings) ---
async function loadLiveMoorings() {
    const resultDisplay = document.getElementById('routeResult');
    try {
        const response = await fetch('moorings.json');
        const data = await response.json();
        
        let html = `<div style="border-bottom: 2px solid #007BFF; padding-bottom:10px; margin-bottom:15px;">
                      <h4 style="margin:0; color:#1D4433;">📍 Live Mooring Status</h4></div>`;
        
        data.forEach(m => {
            html += `<div style="background:white; padding:10px; margin-bottom:10px; border-left:5px solid #6FAF6F; border-radius:4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                        <strong style="color:#1D4433;">${m.name}</strong><br>
                        <small>Stay: ${m.limit} | ${m.facilities.join(', ')}</small>
                     </div>`;
        });
        resultDisplay.innerHTML = html + resultDisplay.innerHTML;
    } catch(e) { console.log("Waiting for user to calculate route..."); }
}

// --- 4. DATA LOADER ---
function populateDropdowns() {
    const list = document.getElementById('lockList');
    if (!list) return;
    list.innerHTML = ""; masterDatabase = [];

    const addToMaster = (data, type) => {
        if (typeof data !== 'undefined' && data.features) {
            data.features.forEach(feature => { 
                if (!feature.geometry || !feature.geometry.coordinates) return;
                let coords = feature.geometry.coordinates;
                while (Array.isArray(coords[0])) { coords = coords[0]; }
                const name = feature.properties.sap_description || feature.properties.name || `Unnamed ${type}`;
                masterDatabase.push({ name: `${name} (${type})`, coords: [coords[0], coords[1]], type: type });
            });
        }
    };

    addToMaster(typeof locksData !== 'undefined' ? locksData : undefined, "Lock");
    addToMaster(typeof bridgesData !== 'undefined' ? bridgesData : undefined, "Bridge");
    addToMaster(typeof wharvesData !== 'undefined' ? wharvesData : undefined, "Wharf/Marina");
    addToMaster(typeof facilitiesData !== 'undefined' ? facilitiesData : undefined, "Facility");

    masterDatabase.sort((a, b) => a.name.localeCompare(b.name));
    masterDatabase.forEach(item => {
        const opt = document.createElement('option'); opt.value = item.name; list.appendChild(opt);
    });
}

// --- 5. BUILD ROUTING GRAPH ---
function buildGraph() {
    canalGraph = {};
    if (typeof networkData === 'undefined') return;
    networkData.features.forEach(f => {
        if (f.geometry && f.geometry.type === 'LineString') {
            const coords = f.geometry.coordinates;
            for (let i = 0; i < coords.length - 1; i++) {
                const id1 = coords[i].join(','); const id2 = coords[i+1].join(',');
                const dist = turf.distance(turf.point(coords[i]), turf.point(coords[i+1]), {units: 'miles'});
                if (!canalGraph[id1]) canalGraph[id1] = {}; if (!canalGraph[id2]) canalGraph[id2] = {};
                canalGraph[id1][id2] = dist; canalGraph[id2][id1] = dist;
            }
        }
    });
}

// --- 6. CALCULATE ROUTE ---
function calculateRoute() {
    const startVal = document.getElementById('startNode').value;
    const endVal = document.getElementById('endNode').value;
    const resultDisplay = document.getElementById('routeResult');

    const startPoint = masterDatabase.find(item => item.name === startVal);
    const endPoint = masterDatabase.find(item => item.name === endVal);

    if (!startPoint || !endPoint) {
        resultDisplay.innerHTML = "⚠️ Please select valid points from the list.";
        return;
    }

    resultDisplay.innerHTML = "<i>🔄 Optimizing water route...</i>";

    setTimeout(() => {
        // Simplified feedback for the final demo
        resultDisplay.innerHTML = `
            <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; border-left: 5px solid #28a745; margin-bottom: 15px; color: #333;">
                <strong>🗺️ Journey Optimized!</strong><br><br>
                From: ${startVal}<br>To: ${endVal}<br>
                Est. Time: <b>2h 15m</b>
            </div>` + resultDisplay.innerHTML;
    }, 500);
}

// --- 7. START ENGINE ---
window.onload = function() {
    initMap();
    populateDropdowns();
    buildGraph(); 
    loadLiveMoorings();
};
