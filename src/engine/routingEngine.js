// routingEngine.js

// Function to get a summary of the route
export function getRouteSummary(routeData) {
    // Calculate and return route summary information
    const totalDistance = routeData.reduce((acc, segment) => acc + segment.distance, 0);
    const totalTime = routeData.reduce((acc, segment) => acc + segment.time, 0);
    return {
        totalDistance,
        totalTime,
        segmentCount: routeData.length
    };
}

// Function to get upcoming window features
export function getWindowFeatures(routeData) {
    // Calculate and return upcoming features
    return routeData.filter(segment => segment.isUpcoming);
}