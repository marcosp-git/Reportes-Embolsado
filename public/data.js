window.EMBOLSADO_MAP_DATA = {
  generatedAt: "2026-06-18",
  company: "Lagomarsino S.A.",
  channel: "Embolsado",
  notes: {
    capitalFederal: "Capital Federal queda excluida de esta primera version.",
    sales: "No hay ventas cargadas todavia.",
    clients: "Los clientes reales geolocalizados se cargaran luego desde Exceles actuales."
  },
  cabaExclusion: {
    name: "Capital Federal",
    color: "#6b7280",
    coordinates: [
      [-34.534, -58.535],
      [-34.548, -58.458],
      [-34.566, -58.374],
      [-34.594, -58.335],
      [-34.631, -58.347],
      [-34.667, -58.381],
      [-34.694, -58.459],
      [-34.665, -58.529],
      [-34.615, -58.532],
      [-34.566, -58.548]
    ]
  },
  zones: [
    {
      id: "amba-norte",
      name: "AMBA Norte",
      manager: "Jefe de Venta AMBA Norte",
      color: "#047857",
      defaultVisible: true,
      description: "Zona tentativa de GBA norte, sin Capital Federal.",
      labelPosition: [-34.43, -58.68],
      coordinates: [
        [-34.548, -58.458],
        [-34.515, -58.43],
        [-34.415, -58.465],
        [-34.305, -58.62],
        [-34.31, -58.875],
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
      description: "Zona tentativa de GBA oeste, sin Capital Federal.",
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
      description: "Zona tentativa de GBA sur, sin Capital Federal.",
      labelPosition: [-34.86, -58.38],
      coordinates: [
        [-34.665, -58.529],
        [-34.82, -58.64],
        [-35.02, -58.64],
        [-35.11, -58.37],
        [-35.02, -58.12],
        [-34.84, -58.05],
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
      description: "Cobertura tentativa fuera de AMBA. El hueco evita superponer AMBA.",
      labelPosition: [-32.9, -63.2],
      coordinates: [
        [
          [-21.6, -73.8],
          [-21.6, -52.7],
          [-55.2, -52.7],
          [-55.2, -73.8]
        ],
        [
          [-34.24, -59.28],
          [-35.15, -59.28],
          [-35.15, -57.88],
          [-34.24, -57.88]
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
      name: "Interior",
      lat: -32.95,
      lng: -60.64,
      detail: "Referencia territorial, no cliente."
    }
  ]
};
