import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const sourceDir = process.argv[2];
const outputFile = process.argv[3] || "public/umap-data.js";

if (!sourceDir) {
  console.error("Usage: node scripts/import-umap.mjs <umap-export-dir> [output-file]");
  process.exit(1);
}

const groupForName = (name) => {
  if (name === "ESPACIOS BLANCOS") return "opportunity";
  if (name === "Molinos Harineros" || name === "MOLINOS") return "mills";
  if (name === "CLIENTES ACTIVOS TOTALES") return "active-total";
  if (name === "CLIENTES INACTIVOS TOTALES") return "inactive-total";
  if (name.startsWith("A") || name.startsWith("AD") || name.startsWith("AZ")) return "active-vendor";
  if (name.startsWith("I") || name.startsWith("ID")) return "inactive-vendor";
  return "other";
};

const defaultVisibility = (name) =>
  name === "CLIENTES ACTIVOS TOTALES" ||
  name === "ESPACIOS BLANCOS" ||
  name === "Molinos Harineros";

const walkCoordinates = (coordinates, visitor) => {
  if (!Array.isArray(coordinates)) return;
  if (typeof coordinates[0] === "number" && typeof coordinates[1] === "number") {
    visitor(coordinates[0], coordinates[1]);
    return;
  }
  coordinates.forEach((child) => walkCoordinates(child, visitor));
};

const featureTypes = (features) => {
  const counts = new Map();
  features.forEach((feature) => {
    const type = feature.geometry?.type || "Unknown";
    counts.set(type, (counts.get(type) || 0) + 1);
  });
  return Array.from(counts.entries()).map(([type, count]) => ({ type, count }));
};

const bboxForFeatures = (features) => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  features.forEach((feature) => {
    walkCoordinates(feature.geometry?.coordinates, (lng, lat) => {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    });
  });

  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
};

const files = (await readdir(sourceDir))
  .filter((file) => /^datalayer_\d+_.+\.json$/.test(file))
  .sort((a, b) => Number(a.match(/^datalayer_(\d+)_/)?.[1] || 0) - Number(b.match(/^datalayer_(\d+)_/)?.[1] || 0));

const layers = [];

for (const file of files) {
  const source = JSON.parse(await readFile(join(sourceDir, file), "utf8"));
  const options = source._umap_options || {};
  const name = options.name || basename(file, ".json");
  const features = source.features || [];

  layers.push({
    id: options.id || basename(file, ".json"),
    rank: options.rank || layers.length + 1,
    name,
    group: groupForName(name),
    color: options.color || null,
    defaultVisible: defaultVisibility(name),
    featureCount: features.length,
    geometryTypes: featureTypes(features),
    bbox: bboxForFeatures(features),
    geojson: {
      type: "FeatureCollection",
      features
    }
  });
}

const summary = layers.reduce(
  (acc, layer) => {
    acc.layerCount += 1;
    acc.featureCount += layer.featureCount;
    acc.groups[layer.group] = (acc.groups[layer.group] || 0) + layer.featureCount;
    return acc;
  },
  { layerCount: 0, featureCount: 0, groups: {} }
);

const payload = {
  generatedAt: new Date().toISOString(),
  source: {
    name: "Espacios Blancos",
    url: "https://umap.openstreetmap.fr/es/map/espacios-blancos_1239001",
    note: "Importado desde uMap publico/exportable antes de volverlo privado."
  },
  summary,
  groups: [
    { id: "opportunity", label: "Espacios blancos", description: "Zonas sin clientes identificadas como oportunidad comercial." },
    { id: "active-total", label: "Clientes activos", description: "Capa total de clientes activos geolocalizados." },
    { id: "inactive-total", label: "Clientes inactivos", description: "Capa total de clientes inactivos geolocalizados." },
    { id: "mills", label: "Molinos", description: "Molinos y referencias competitivas." },
    { id: "active-vendor", label: "Activos por vendedor", description: "Capas individuales de clientes activos por vendedor." },
    { id: "inactive-vendor", label: "Inactivos por vendedor", description: "Capas individuales de clientes inactivos por vendedor." },
    { id: "other", label: "Otras capas", description: "Capas importadas sin grupo especifico." }
  ],
  layers
};

await writeFile(
  outputFile,
  `window.UMAP_IMPORTED_DATA = ${JSON.stringify(payload)};\n`
);

console.log(`Imported ${summary.layerCount} layers and ${summary.featureCount} features into ${outputFile}`);
