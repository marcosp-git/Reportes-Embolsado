import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import pc from "polygon-clipping";

const dataPath = process.argv[2] || "public/data.js";
const cabaPath = process.argv[3] || "public/caba-zones.js";
const patchesPath = process.argv[4] || "data/amba-caba-overlap-patches.json";

const context = { window: {} };
vm.createContext(context);
vm.runInContext(await readFile(dataPath, "utf8"), context);
vm.runInContext(await readFile(cabaPath, "utf8"), context);

const data = context.window.EMBOLSADO_MAP_DATA;
const caba = context.window.EMBOLSADO_CABA_ZONES;
const patches = JSON.parse(await readFile(patchesPath, "utf8")).patches;

const roundCoord = (value) => Number(value.toFixed(6));
const closeRing = (ring) => {
  const next = ring.map(([lng, lat]) => [roundCoord(lng), roundCoord(lat)]);
  const first = next[0];
  const last = next[next.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) next.push([...first]);
  return next;
};

const coordinateDepth = (value) => (Array.isArray(value) ? 1 + coordinateDepth(value[0]) : 0);
const latLngRingToLngLat = (ring) => ring.map(([lat, lng]) => [lng, lat]);

const toMultiPolygon = (coordinates) => {
  const depth = coordinateDepth(coordinates);
  if (depth === 2) return [[latLngRingToLngLat(coordinates)]];
  if (depth === 3) return [coordinates.map(latLngRingToLngLat)];
  if (depth === 4) return coordinates.map((polygon) => polygon.map(latLngRingToLngLat));
  throw new Error(`Unsupported coordinate depth ${depth}`);
};

const toLatLngMultiPolygon = (multiPolygon) =>
  multiPolygon
    .map((polygon) =>
      polygon
        .map((ring) => closeRing(ring).map(([lng, lat]) => [lat, lng]))
        .filter((ring) => ring.length >= 4)
    )
    .filter((polygon) => polygon.length);

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

const cabaMask = pc.union(...caba.zones.map((zone) => toMultiPolygon(zone.coordinates)));
const stats = {};

data.zones = data.zones.map((zone) => {
  if (!patches[zone.id]) return zone;

  const source = pc.union(toMultiPolygon(zone.coordinates), [patches[zone.id]]);
  const clipped = pc.difference(source, cabaMask);
  if (!clipped.length) throw new Error(`${zone.id} disappeared after CABA clipping`);

  stats[zone.id] = {
    sourceArea: areaForMultiPolygon(source),
    clippedArea: areaForMultiPolygon(clipped),
    polygons: clipped.length,
    rings: clipped.reduce((sum, polygon) => sum + polygon.length, 0)
  };

  return {
    ...zone,
    description: `${zone.description} Limite CABA recalculado contra geometria oficial GCBA.`,
    cabaBoundarySource: "generated-official-caba-mask",
    coordinates: toLatLngMultiPolygon(clipped)
  };
});

data.generatedAt = "2026-06-19";
data.boundaryGeneration = {
  cabaBoundarySource: caba.sources?.cabaBoundary,
  ambaPatchSource: patchesPath,
  generatedAt: new Date().toISOString(),
  stats
};

await writeFile(dataPath, `window.EMBOLSADO_MAP_DATA = ${JSON.stringify(data, null, 2)};\n`);
console.log(JSON.stringify(stats, null, 2));
