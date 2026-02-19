export const testCorridor = {
  corridorName: "Sample Canal Corridor",
  features: [
    {
      type: "lock",
      name: "Lock 1",
      location: { latitude: 52.5, longitude: 13.4 },
      depth: 4,
      width: 5
    },
    {
      type: "bridge",
      name: "Bridge 1",
      location: { latitude: 52.6, longitude: 13.5 },
      clearance: 10,
      width: 6
    },
    {
      type: "lock",
      name: "Lock 2",
      location: { latitude: 52.7, longitude: 13.6 },
      depth: 4,
      width: 5
    },
    {
      type: "bridge",
      name: "Bridge 2",
      location: { latitude: 52.8, longitude: 13.7 },
      clearance: 12,
      width: 7
    }
  ]
};