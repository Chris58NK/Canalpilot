// engine.js — CanalPilot proof-of-concept engine

 function calculateRoute(startFeature, endFeature, corridorData) {
    if (!startFeature || !endFeature) return null;

    // 1. Build the Map (Graph)
    const graph = {};
    corridorData.features.forEach(f => {
        graph[f.id] = { ...f, edges: {} };
    });

    // 2. Wire up the Connections
    corridorData.features.forEach(f => {
        if (f.connections) {
            f.connections.forEach(conn => {
                graph[f.id].edges[conn.targetId] = conn.distance;
                // Canals go both ways, so we connect the reverse direction too
                if (graph[conn.targetId]) {
                    graph[conn.targetId].edges[f.id] = conn.distance;
                }
            });
        }
    });

    // 3. The Pathfinding Algorithm (Dijkstra's)
    const distances = {};
    const previous = {};
    const unvisited = new Set();

    for (let id in graph) {
        distances[id] = Infinity;
        previous[id] = null;
        unvisited.add(Number(id));
    }
    distances[startFeature.id] = 0;

    while (unvisited.size > 0) {
        // Find the closest unvisited point
        let currentId = null;
        let minDistance = Infinity;
        for (let id of unvisited) {
            if (distances[id] < minDistance) {
                minDistance = distances[id];
                currentId = Number(id);
            }
        }

        // Stop if we reached the end or can't go further
        if (currentId === null || currentId === endFeature.id) break;

        unvisited.delete(currentId);

        // Check neighbors and update shortest paths
        for (let neighborId in graph[currentId].edges) {
            neighborId = Number(neighborId);
            if (unvisited.has(neighborId)) {
                let altDistance = distances[currentId] + graph[currentId].edges[neighborId];
                if (altDistance < distances[neighborId]) {
                    distances[neighborId] = altDistance;
                    previous[neighborId] = currentId;
                }
            }
        }
    }

    // 4. Trace the steps backward to build the final route
    const path = [];
    let curr = endFeature.id;
    if (previous[curr] !== null || curr === startFeature.id) {
        while (curr !== null) {
            path.unshift(graph[curr]);
            curr = previous[curr];
        }
    }

    return {
        path: path,
        totalDistance: distances[endFeature.id] !== Infinity ? distances[endFeature.id] : 0
    };
}
