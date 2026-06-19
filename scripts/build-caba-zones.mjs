import { readFile, writeFile } from "node:fs/promises";
import pc from "polygon-clipping";

const sourcePath = process.argv[2] || "/tmp/barrios-caba.geojson";
const splitPath = process.argv[3] || "data/san-martin-split-line.json";
const outputPath = process.argv[4] || "data/generated-caba-zones.json";
const jsOutputPath = process.argv[5] || "public/caba-zones.js";

const barrios = JSON.parse(await readFile(sourcePath, "utf8"));
const splitLine = JSON.parse(await readFile(splitPath, "utf8"));

const toMultiPolygon = (geometry) => {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
};

const roundCoord = (value) => Number(value.toFixed(6));

const roundRing = (ring) => ring.map(([lng, lat]) => [roundCoord(lng), roundCoord(lat)]);

const closeRing = (ring) => {
  const next = [...ring];
  const first = next[0];
  const last = next[next.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) next.push([...first]);
  return next;
};

const multipolygonToLatLng = (multiPolygon) =>
  multiPolygon
    .map((polygon) =>
      polygon
        .map((ring) => closeRing(roundRing(ring)).map(([lng, lat]) => [lat, lng]))
        .filter((ring) => ring.length >= 4)
    )
    .filter((polygon) => polygon.length);

const bboxForMultiPolygon = (multiPolygon) => {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  multiPolygon.flat(2).forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  });

  return { minLng, minLat, maxLng, maxLat };
};

const signedArea = (ring) => {
  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
};

const areaForMultiPolygon = (multiPolygon) =>
  multiPolygon.reduce((total, polygon) => {
    const outer = Math.abs(signedArea(polygon[0] || []));
    const holes = polygon.slice(1).reduce((sum, ring) => sum + Math.abs(signedArea(ring)), 0);
    return total + outer - holes;
  }, 0);

const cabaMultiPolygon = pc.union(...barrios.features.map((feature) => toMultiPolygon(feature.geometry)));
const bbox = bboxForMultiPolygon(cabaMultiPolygon);
const pad = 0.08;
const minLng = bbox.minLng - pad;
const maxLng = bbox.maxLng + pad;
const minLat = bbox.minLat - pad;
const maxLat = bbox.maxLat + pad;

const line = splitLine.points.map((point) => point.coordinates);
const northMask = [[[
  [minLng, maxLat],
  [maxLng, maxLat],
  ...line.slice().reverse(),
  [minLng, maxLat]
]]];

const southMask = [[[
  [minLng, minLat],
  ...line,
  [maxLng, minLat],
  [minLng, minLat]
]]];

const caba1 = pc.intersection(cabaMultiPolygon, northMask);
const caba2 = pc.intersection(cabaMultiPolygon, southMask);
const totalArea = areaForMultiPolygon(cabaMultiPolygon);
const caba1Area = areaForMultiPolygon(caba1);
const caba2Area = areaForMultiPolygon(caba2);
const areaGap = Math.abs(totalArea - caba1Area - caba2Area);

if (!caba1.length || !caba2.length) {
  throw new Error("CABA split failed: one side is empty.");
}

if (areaGap / totalArea > 0.0005) {
  throw new Error(`CABA split area gap is too large: ${(areaGap / totalArea).toFixed(6)}`);
}

const payload = {
    generatedAt: new Date().toISOString(),
    sources: {
      cabaBoundary: {
        name: "GCBA barrios GeoJSON",
        url: "https://cdn.buenosaires.gob.ar/datosabiertos/datasets/barrios/barrios.geojson"
      },
      splitLine: splitLine.source
    },
    splitLine: splitLine.points,
    stats: {
      officialBarrios: barrios.features.length,
      cabaArea: totalArea,
      caba1Area,
      caba2Area,
      areaGap
    },
    caba1: multipolygonToLatLng(caba1),
    caba2: multipolygonToLatLng(caba2)
  };

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(
  jsOutputPath,
  `window.EMBOLSADO_CABA_ZONES = ${JSON.stringify({
    generatedAt: payload.generatedAt,
    sources: payload.sources,
    stats: payload.stats,
    splitLine: splitLine.points.map((point) => ({
      name: point.name,
      lat: point.coordinates[1],
      lng: point.coordinates[0]
    })),
    zones: [
      {
        id: "caba-1",
        name: "CABA 1",
        manager: "Jefe de Venta AMBA Norte",
        color: "#059669",
        defaultVisible: true,
        editable: false,
        description: "CABA al norte de la traza operativa del Ferrocarril San Martin.",
        labelPosition: [-34.565, -58.47],
        coordinates: payload.caba1
      },
      {
        id: "caba-2",
        name: "CABA 2",
        manager: "Jefe de Venta AMBA Oeste",
        color: "#1d4ed8",
        defaultVisible: true,
        editable: false,
        description: "CABA al sur de la traza operativa del Ferrocarril San Martin.",
        labelPosition: [-34.625, -58.44],
        coordinates: payload.caba2
      }
    ]
  })};\n`
);

console.log(`Generated CABA split: ${barrios.features.length} barrios, gap ratio ${(areaGap / totalArea).toFixed(8)}`);
