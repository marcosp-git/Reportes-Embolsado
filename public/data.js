window.EMBOLSADO_MAP_DATA = {
  generatedAt: "2026-06-18",
  company: "Lagomarsino S.A.",
  channel: "Embolsado",
  notes: {
    caba: "CABA se divide comercialmente en CABA 1 y CABA 2 por la traza operativa del Ferrocarril San Martin.",
    sales: "No hay ventas cargadas todavia.",
    clients: "Los clientes reales geolocalizados se cargaran luego desde Exceles actuales."
  },
  territoryAssignment: {
    rule: "specific-zones-first",
    priority: ["caba-1", "caba-2", "amba-norte", "amba-oeste", "amba-sur", "interior"],
    fallbackZoneId: "interior",
    excludedZoneIds: []
  },
  initialBounds: [
    [-35.08, -59.1],
    [-34.3, -58.02]
  ],
  zones: [
    {
      id: "amba-norte",
      name: "AMBA Norte",
      manager: "Jefe de Venta AMBA Norte",
      color: "#047857",
      defaultVisible: true,
      description: "Zona tentativa de GBA norte hasta Zarate. CABA 1 se administra por el mismo jefe.",
      labelPosition: [-34.35, -58.82],
      coordinates: [
        [-34.548, -58.458],
        [-34.515, -58.43],
        [-34.415, -58.465],
        [-34.245, -58.63],
        [-34.095, -59.025],
        [-34.235, -59.16],
        [-34.43, -59.045],
        [-34.56, -58.985],
        [-34.61, -58.735],
        [-34.566, -58.548]
      ]
    },
    {
      id: "amba-oeste",
      name: "AMBA Oeste",
      manager: "Jefe de Venta AMBA Oeste",
      color: "#2563eb",
      defaultVisible: true,
      description: "Zona tentativa de GBA oeste. CABA 2 se administra por el mismo jefe.",
      labelPosition: [-34.69, -58.82],
      coordinates: [
        [-34.566, -58.548],
        [-34.61, -58.735],
        [-34.56, -58.985],
        [-34.64, -59.18],
        [-34.81, -59.16],
        [-34.91, -58.89],
        [-34.82, -58.64],
        [-34.665, -58.529]
      ]
    },
    {
      id: "amba-sur",
      name: "AMBA Sur",
      manager: "Jefe de Venta AMBA Sur",
      color: "#dc2626",
      defaultVisible: true,
      description: "Zona tentativa de GBA sur incluyendo La Plata.",
      labelPosition: [-34.9, -58.28],
      coordinates: [
        [-34.665, -58.529],
        [-34.82, -58.64],
        [-35.02, -58.64],
        [-35.14, -58.34],
        [-35.06, -58.02],
        [-34.92, -57.87],
        [-34.78, -58.02],
        [-34.68, -58.22],
        [-34.631, -58.347],
        [-34.694, -58.459]
      ]
    },
    {
      id: "interior",
      name: "Interior",
      manager: "Jefe de Venta Interior",
      color: "#7c3aed",
      defaultVisible: true,
      description: "Resto del pais para analizar ventas fuera de AMBA.",
      labelPosition: [-32.9, -63.8],
      coordinates: [
        [
          [-21.78, -66.22],
          [-22.1, -62.2],
          [-24.05, -59.15],
          [-25.65, -57.74],
          [-25.45, -54.35],
          [-26.25, -53.45],
          [-27.45, -54.35],
          [-27.6, -55.9],
          [-30.18, -57.63],
          [-33.65, -58.42],
          [-35.25, -57.1],
          [-37.0, -56.75],
          [-38.15, -57.45],
          [-39.25, -61.8],
          [-40.9, -62.75],
          [-42.85, -64.05],
          [-46.02, -66.25],
          [-49.3, -67.05],
          [-52.35, -67.55],
          [-55.05, -67.15],
          [-54.86, -70.88],
          [-51.62, -73.28],
          [-48.88, -73.58],
          [-45.8, -71.72],
          [-42.26, -71.78],
          [-39.15, -71.13],
          [-36.62, -70.33],
          [-34.18, -69.86],
          [-31.95, -69.22],
          [-29.25, -68.65],
          [-26.52, -68.34],
          [-24.12, -67.32],
          [-21.78, -66.22]
        ],
        [
          [-34.0, -59.28],
          [-34.0, -57.72],
          [-35.28, -57.72],
          [-35.28, -59.28],
          [-34.0, -59.28]
        ]
      ]
    }
  ],
  referencePoints: [
    {
      name: "GBA Norte",
      lat: -34.47,
      lng: -58.63,
      detail: "Referencia territorial, no cliente."
    },
    {
      name: "GBA Oeste",
      lat: -34.68,
      lng: -58.73,
      detail: "Referencia territorial, no cliente."
    },
    {
      name: "GBA Sur",
      lat: -34.83,
      lng: -58.36,
      detail: "Referencia territorial, no cliente."
    },
    {
      name: "Rosario",
      lat: -32.9442,
      lng: -60.6505,
      detail: "Referencia territorial, no cliente."
    },
    {
      name: "Cordoba",
      lat: -31.4201,
      lng: -64.1888,
      detail: "Referencia territorial, no cliente."
    },
    {
      name: "Mendoza",
      lat: -32.8895,
      lng: -68.8458,
      detail: "Referencia territorial, no cliente."
    },
    {
      name: "Mar del Plata",
      lat: -38.0055,
      lng: -57.5426,
      detail: "Referencia territorial, no cliente."
    }
  ]
};
