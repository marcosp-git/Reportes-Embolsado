import { readFile, writeFile } from "node:fs/promises";
import vm from "node:vm";
import pc from "polygon-clipping";

const dataPath = process.argv[2] || "public/data.js";
const cabaPath = process.argv[3] || "public/caba-zones.js";
const rulesPath = process.argv[4] || "data/amba-topology-rules.json";

const context = { window: {} };
vm.createContext(context);
vm.runInContext(await readFile(dataPath, "utf8"), context);
vm.runInContext(await readFile(cabaPath, "utf8"), context);

const data = context.window.EMBOLSADO_MAP_DATA;
const caba = context.window.EMBOLSADO_CABA_ZONES;
const rules = JSON.parse(await readFile(rulesPath, "utf8"));

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
const landMask = [rules.landMask];
let assigned = cabaMask;
const priority = rules.priority || ["amba-norte", "amba-oeste", "amba-sur"];

const nextZonesById = new Map(data.zones.map((zone) => [zone.id, zone]));

priority.forEach((zoneId) => {
  const zone = nextZonesById.get(zoneId);
  if (!zone) throw new Error(`Missing zone ${zoneId}`);

  const sourceExpansion = rules.sourceExpansions?.[zone.id] || [];
  const source = sourceExpansion.length
    ? pc.union(toMultiPolygon(zone.coordinates), [sourceExpansion])
    : toMultiPolygon(zone.coordinates);
  const onLand = pc.intersection(source, landMask);
  const clipped = pc.difference(onLand, assigned);
  if (!clipped.length) throw new Error(`${zone.id} disappeared after CABA clipping`);

  stats[zone.id] = {
    sourceArea: areaForMultiPolygon(source),
    landArea: areaForMultiPolygon(onLand),
    clippedArea: areaForMultiPolygon(clipped),
    polygons: clipped.length,
    rings: clipped.reduce((sum, polygon) => sum + polygon.length, 0)
  };

  nextZonesById.set(zone.id, {
    ...zone,
    description: `${zone.description} Limites recalculados contra CABA oficial, tierra y prioridad AMBA sin solapes.`,
    cabaBoundarySource: "generated-official-caba-mask",
    topologySource: "generated-amba-priority-mask",
    coordinates: toLatLngMultiPolygon(clipped)
  });

  assigned = pc.union(assigned, clipped);
});

data.zones = data.zones.map((zone) => nextZonesById.get(zone.id) || zone);

data.generatedAt = "2026-06-19";
data.boundaryGeneration = {
  cabaBoundarySource: caba.sources?.cabaBoundary,
  ambaTopologySource: rulesPath,
  priority,
  generatedAt: new Date().toISOString(),
  stats
};

await writeFile(dataPath, `window.EMBOLSADO_MAP_DATA = ${JSON.stringify(data, null, 2)};\n`);
console.log(JSON.stringify(stats, null, 2));
