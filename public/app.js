const data = window.EMBOLSADO_MAP_DATA;
const cabaData = window.EMBOLSADO_CABA_ZONES || { zones: [], splitLine: [] };
const umapData = window.UMAP_IMPORTED_DATA || { groups: [], layers: [], summary: { featureCount: 0 } };
const zones = [...data.zones, ...cabaData.zones];

const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
const visibleZones = new Set(zones.filter((zone) => zone.defaultVisible).map((zone) => zone.id));
const visibleUmapLayers = new Set(umapData.layers.filter((layer) => layer.defaultVisible).map((layer) => layer.id));
let selectedZoneId = zones[0].id;
let editing = false;
let showCaba = true;
let showReference = true;

const map = L.map("map", {
  zoomControl: false,
  preferCanvas: true
}).setView([-34.72, -58.64], 9);

L.control.zoom({ position: "bottomleft" }).addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: "&copy; OpenStreetMap"
}).addTo(map);

const zoneLayer = L.layerGroup().addTo(map);
const labelLayer = L.layerGroup().addTo(map);
const cabaLayer = L.layerGroup().addTo(map);
const referenceLayer = L.layerGroup().addTo(map);
const editLayer = L.layerGroup().addTo(map);
const umapLayer = L.layerGroup().addTo(map);

const zoneFilters = document.getElementById("zone-filters");
const zoneCount = document.getElementById("zone-count");
const umapLayerControls = document.getElementById("umap-layer-controls");
const umapLayerCount = document.getElementById("umap-layer-count");
const umapFeatureCount = document.getElementById("umap-feature-count");
const zoneSelect = document.getElementById("zone-editor-select");
const coordinatesEditor = document.getElementById("coordinates-editor");
const editorStatus = document.getElementById("editor-status");
const fitMapButton = document.getElementById("fit-map");
const toggleEditButton = document.getElementById("toggle-edit");
const applyCoordinatesButton = document.getElementById("apply-coordinates");
const copyConfigButton = document.getElementById("copy-config");
const toggleCaba = document.getElementById("toggle-caba");
const toggleReference = document.getElementById("toggle-reference");

function isNestedCoordinates(coordinates) {
  return Array.isArray(coordinates[0]?.[0]);
}

function coordinateDepth(value) {
  let depth = 0;
  let cursor = value;
  while (Array.isArray(cursor)) {
    depth += 1;
    cursor = cursor[0];
  }
  return depth;
}

function cloneCoordinates(coordinates) {
  return JSON.parse(JSON.stringify(coordinates));
}

function getRings(zone) {
  const depth = coordinateDepth(zone.coordinates);
  if (depth === 2) return [zone.coordinates];
  if (depth === 3) return zone.coordinates;
  if (depth === 4) return zone.coordinates.flat();
  return [];
}

function getOuterRing(zone) {
  return getRings(zone)[0] || [];
}

function setCoordinates(zone, nextCoordinates) {
  zone.coordinates = cloneCoordinates(nextCoordinates);
  if (!isNestedCoordinates(zone.coordinates)) {
    zone.labelPosition = estimateCenter(zone.coordinates);
  }
}

function estimateCenter(ring) {
  const totals = ring.reduce(
    (acc, point) => {
      acc.lat += point[0];
      acc.lng += point[1];
      return acc;
    },
    { lat: 0, lng: 0 }
  );
  return [totals.lat / ring.length, totals.lng / ring.length];
}

function validateCoordinates(value) {
  if (!Array.isArray(value) || value.length < 3) {
    throw new Error("La zona necesita al menos 3 puntos o anillos.");
  }

  const depth = coordinateDepth(value);
  const rings = depth === 4 ? value.flat() : depth === 3 ? value : [value];
  rings.forEach((ring) => {
    if (!Array.isArray(ring) || ring.length < 3) {
      throw new Error("Cada anillo necesita al menos 3 puntos.");
    }
    ring.forEach((point) => {
      if (!Array.isArray(point) || point.length !== 2) {
        throw new Error("Cada punto debe ser [lat, lng].");
      }
      const [lat, lng] = point;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("Latitud y longitud deben ser numeros.");
      }
    });
  });
}

function setStatus(message, isError = false) {
  editorStatus.textContent = message;
  editorStatus.classList.toggle("is-error", isError);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-AR").format(value || 0);
}

function polygonShape(zone) {
  return cloneCoordinates(zone.coordinates);
}

function zoneStyle(zone) {
  return {
    color: zone.color,
    weight: zone.id === selectedZoneId ? 3 : 2,
    opacity: 0.95,
    fillColor: zone.color,
    fillOpacity: zone.id === "interior" ? 0.07 : 0.18,
    dashArray: zone.id === "interior" ? "7 8" : null
  };
}

function renderZones() {
  zoneLayer.clearLayers();
  labelLayer.clearLayers();

  zones
    .filter((zone) => visibleZones.has(zone.id))
    .sort((a, b) => {
      if (a.id === "interior") return -1;
      if (b.id === "interior") return 1;
      return 0;
    })
    .forEach((zone) => {
      const polygon = L.polygon(polygonShape(zone), zoneStyle(zone)).bindPopup(`
        <div class="popup-card">
          <strong>${zone.name}</strong>
          <span>${zone.manager}</span>
          <em>${zone.description}</em>
        </div>
      `);

      polygon.on("click", () => selectZone(zone.id));
      zoneLayer.addLayer(polygon);

      L.marker(zone.labelPosition || estimateCenter(getOuterRing(zone)), {
        interactive: false,
        icon: L.divIcon({
          className: "zone-label",
          html: `<span>${zone.name}</span>`,
          iconSize: [90, 24],
          iconAnchor: [45, 12]
        })
      }).addTo(labelLayer);
    });
}

function renderCaba() {
  cabaLayer.clearLayers();
  if (!showCaba) return;

  if (!cabaData.splitLine.length) return;

  L.polyline(cabaData.splitLine.map((point) => [point.lat, point.lng]), {
    color: "#111827",
    weight: 2,
    opacity: 0.9,
    dashArray: "6 6"
  })
    .bindPopup(`<strong>Ferrocarril San Martin</strong><br><span class="excluded-area">Delimitador operativo entre CABA 1 y CABA 2.</span>`)
    .addTo(cabaLayer);
}

function renderReferencePoints() {
  referenceLayer.clearLayers();
  if (!showReference) return;

  data.referencePoints.forEach((point) => {
    L.marker([point.lat, point.lng], {
      icon: L.divIcon({
        className: "reference-marker-wrap",
        html: '<span class="reference-marker"></span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
        popupAnchor: [0, -8]
      })
    })
      .bindPopup(`
        <div class="popup-card">
          <strong>${point.name}</strong>
          <span>${point.detail}</span>
        </div>
      `)
      .addTo(referenceLayer);
  });
}

function colorForUmapLayer(layer, feature) {
  const featureColor = feature?.properties?._umap_options?.color;
  if (featureColor) return featureColor;
  if (layer.color) return layer.color;

  const fallbackColors = {
    opportunity: "#b91c1c",
    "active-total": "#16a34a",
    "inactive-total": "#d97706",
    mills: "#3f6212",
    "active-vendor": "#0f766e",
    "inactive-vendor": "#78716c",
    other: "#475569"
  };

  return fallbackColors[layer.group] || fallbackColors.other;
}

function styleForUmapFeature(layer) {
  return (feature) => {
    const color = colorForUmapLayer(layer, feature);
    const isOpportunity = layer.group === "opportunity";
    const isMill = layer.group === "mills";

    return {
      color,
      weight: isOpportunity ? 1.6 : 1.2,
      opacity: isOpportunity ? 0.75 : 0.82,
      fillColor: color,
      fillOpacity: isOpportunity ? 0.16 : isMill ? 0.22 : 0.32
    };
  };
}

function markerForUmapPoint(layer, feature, latlng) {
  const color = colorForUmapLayer(layer, feature);
  const radius = layer.group === "mills" ? 5.5 : layer.group.includes("total") ? 4.2 : 3.7;

  return L.circleMarker(latlng, {
    radius,
    color: "#ffffff",
    weight: 1,
    opacity: 0.95,
    fillColor: color,
    fillOpacity: layer.group === "inactive-total" || layer.group === "inactive-vendor" ? 0.68 : 0.84
  });
}

function popupForUmapFeature(layer, feature) {
  const properties = feature.properties || {};
  const details = [
    ["Cliente", properties.CLIENTE],
    ["Cuenta", properties.NROCTA],
    ["Vendedor", properties.VENDEDOR || properties.VENDEDOR_],
    ["Domicilio", properties.DOMICILIO],
    ["Localidad", properties.LOCALIDADES],
    ["Razon social", properties["RAZ�N SOCIAL"] || properties["RAZON SOCIAL"]],
    ["Nombre", properties.name],
    ["Detalle", properties.description]
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "");

  const body = details.length
    ? details.map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`).join("")
    : "<span>Sin datos descriptivos.</span>";

  return `
    <div class="popup-card umap-popup">
      <strong>${escapeHtml(layer.name)}</strong>
      ${body}
    </div>
  `;
}

function renderUmapLayers() {
  umapLayer.clearLayers();

  umapData.layers
    .filter((layer) => visibleUmapLayers.has(layer.id))
    .forEach((layer) => {
      L.geoJSON(layer.geojson, {
        style: styleForUmapFeature(layer),
        pointToLayer: (feature, latlng) => markerForUmapPoint(layer, feature, latlng),
        onEachFeature: (feature, leafletLayer) => {
          leafletLayer.bindPopup(popupForUmapFeature(layer, feature));
        }
      }).addTo(umapLayer);
    });
}

function setUmapGroupVisibility(groupId, checked) {
  umapData.layers
    .filter((layer) => layer.group === groupId)
    .forEach((layer) => {
      if (checked) visibleUmapLayers.add(layer.id);
      else visibleUmapLayers.delete(layer.id);
    });
  renderUmapControls();
  renderUmapLayers();
}

function renderUmapControls() {
  if (!umapLayerControls) return;
  umapLayerControls.innerHTML = "";

  if (umapLayerCount) umapLayerCount.textContent = formatNumber(umapData.summary?.layerCount || umapData.layers.length);
  if (umapFeatureCount) umapFeatureCount.textContent = `${formatNumber(umapData.summary?.featureCount)} features`;

  umapData.groups.forEach((group) => {
    const groupLayers = umapData.layers.filter((layer) => layer.group === group.id);
    if (!groupLayers.length) return;

    const details = document.createElement("details");
    details.className = "umap-group";
    details.open = ["opportunity", "active-total", "inactive-total", "mills"].includes(group.id);

    const summary = document.createElement("summary");
    const checkedCount = groupLayers.filter((layer) => visibleUmapLayers.has(layer.id)).length;
    const groupCheckbox = document.createElement("input");
    groupCheckbox.type = "checkbox";
    groupCheckbox.checked = checkedCount === groupLayers.length;
    groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < groupLayers.length;
    groupCheckbox.addEventListener("click", (event) => event.stopPropagation());
    groupCheckbox.addEventListener("change", () => setUmapGroupVisibility(group.id, groupCheckbox.checked));

    const label = document.createElement("span");
    label.innerHTML = `<strong>${escapeHtml(group.label)}</strong><small>${checkedCount}/${groupLayers.length}</small>`;
    summary.append(groupCheckbox, label);
    details.appendChild(summary);

    const list = document.createElement("div");
    list.className = "umap-layer-list";

    groupLayers.forEach((layer) => {
      const row = document.createElement("label");
      row.className = "umap-layer-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = visibleUmapLayers.has(layer.id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) visibleUmapLayers.add(layer.id);
        else visibleUmapLayers.delete(layer.id);
        renderUmapControls();
        renderUmapLayers();
      });

      const color = document.createElement("span");
      color.className = "umap-swatch";
      color.style.background = layer.color || "currentColor";

      const text = document.createElement("span");
      text.className = "umap-layer-text";
      text.innerHTML = `<strong>${escapeHtml(layer.name)}</strong><small>${formatNumber(layer.featureCount)} elementos</small>`;

      row.append(checkbox, color, text);
      list.appendChild(row);
    });

    details.appendChild(list);
    umapLayerControls.appendChild(details);
  });
}

function renderZoneControls() {
  zoneFilters.innerHTML = "";
  if (zoneCount) zoneCount.textContent = zones.length;

  zones.forEach((zone) => {
    const row = document.createElement("div");
    row.className = `zone-toggle ${zone.id === selectedZoneId ? "is-selected" : ""}`;
    row.style.setProperty("--zone-color", zone.color);

    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("aria-label", `Mostrar ${zone.name}`);
    input.checked = visibleZones.has(zone.id);
    input.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    input.addEventListener("change", (event) => {
      event.stopPropagation();
      if (input.checked) visibleZones.add(zone.id);
      else visibleZones.delete(zone.id);
      render();
    });

    const color = document.createElement("span");
    color.className = "zone-swatch";

    const text = document.createElement("span");
    text.className = "zone-text";
    text.innerHTML = `<strong>${zone.name}</strong><small>${zone.manager}</small>`;

    const button = document.createElement("button");
    button.className = "zone-edit-button";
    button.type = "button";
    button.title = `Editar ${zone.name}`;
    button.textContent = "✎";
    button.disabled = zone.editable === false;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (zone.editable === false) {
        selectZone(zone.id);
        setStatus("Esta zona se genera desde fuente oficial y no se edita manualmente.", true);
        return;
      }
      selectZone(zone.id);
      editing = true;
      render();
    });

    row.addEventListener("click", () => selectZone(zone.id));
    row.append(input, color, text, button);
    zoneFilters.appendChild(row);
  });
}

function fillZoneSelect() {
  zoneSelect.innerHTML = "";
  zones.forEach((zone) => {
    const option = document.createElement("option");
    option.value = zone.id;
    option.textContent = zone.name;
    zoneSelect.appendChild(option);
  });
}

function updateEditor() {
  const zone = zoneById.get(selectedZoneId);
  zoneSelect.value = selectedZoneId;
  coordinatesEditor.value = JSON.stringify(zone.coordinates, null, 2);
}

function renderEditHandles() {
  editLayer.clearLayers();
  toggleEditButton.classList.toggle("is-active", editing);
  toggleEditButton.textContent = editing ? "Edicion activa" : "Editar zonas";

  if (!editing) return;

  const zone = zoneById.get(selectedZoneId);
  if (zone.editable === false) return;
  const originalDepth = coordinateDepth(zone.coordinates);
  const rings = getRings(zone);

  rings.forEach((ring, ringIndex) => {
    ring.forEach((point, pointIndex) => {
      const marker = L.marker(point, {
        draggable: true,
        icon: L.divIcon({
          className: "vertex-handle-wrap",
          html: `<span class="vertex-handle" style="--handle-color:${zone.color}"></span>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        })
      });

      marker.on("drag", () => {
        const latLng = marker.getLatLng();
        rings[ringIndex][pointIndex] = [
          Number(latLng.lat.toFixed(5)),
          Number(latLng.lng.toFixed(5))
        ];
        if (originalDepth === 2) {
          zone.labelPosition = estimateCenter(zone.coordinates);
        }
        updateEditor();
        renderZones();
        setStatus("Cambios aplicados en el mapa. Copia el JSON para conservarlos.");
      });

      marker.addTo(editLayer);
    });
  });
}

function selectZone(zoneId) {
  selectedZoneId = zoneId;
  if (zoneById.get(zoneId)?.editable === false) {
    editing = false;
  }
  updateEditor();
  render();
}

function applyCoordinates() {
  const zone = zoneById.get(selectedZoneId);
  if (zone.editable === false) {
    setStatus("Esta zona se genera desde fuente oficial y no se edita manualmente.", true);
    return;
  }

  try {
    const nextCoordinates = JSON.parse(coordinatesEditor.value);
    validateCoordinates(nextCoordinates);
    setCoordinates(zone, nextCoordinates);
    setStatus("Coordenadas aplicadas.");
    render();
    fitVisible(false);
  } catch (error) {
    setStatus(error.message, true);
  }
}

async function copyConfig() {
  const payload = {
    generatedAt: data.generatedAt,
    company: data.company,
    channel: data.channel,
    zones: zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      manager: zone.manager,
      color: zone.color,
      description: zone.description,
      labelPosition: zone.labelPosition,
      coordinates: zone.coordinates
    }))
  };

  const text = JSON.stringify(payload, null, 2);

  try {
    await navigator.clipboard.writeText(text);
    setStatus("Configuracion copiada al portapapeles.");
  } catch {
    coordinatesEditor.value = text;
    setStatus("No se pudo copiar. Deje el JSON completo en el editor.");
  }
}

function fitVisible(includeInterior = true) {
  const points = [];

  zones
    .filter((zone) => visibleZones.has(zone.id))
    .filter((zone) => includeInterior || zone.id !== "interior")
    .forEach((zone) => {
      getRings(zone).forEach((ring) => points.push(...ring));
    });

  if (points.length) {
    map.fitBounds(points, { padding: [48, 48], maxZoom: includeInterior ? 5 : 10 });
  }
}

function fitInitialView() {
  if (Array.isArray(data.initialBounds)) {
    map.fitBounds(data.initialBounds, { padding: [48, 48], maxZoom: 10 });
    return;
  }

  fitVisible(false);
}

function render() {
  renderZoneControls();
  renderZones();
  renderUmapControls();
  renderUmapLayers();
  renderCaba();
  renderReferencePoints();
  renderEditHandles();
}

zoneSelect.addEventListener("change", () => selectZone(zoneSelect.value));
fitMapButton.addEventListener("click", fitInitialView);
toggleEditButton.addEventListener("click", () => {
  editing = !editing;
  render();
});
applyCoordinatesButton.addEventListener("click", applyCoordinates);
copyConfigButton.addEventListener("click", copyConfig);
toggleCaba.addEventListener("change", () => {
  showCaba = toggleCaba.checked;
  renderCaba();
});
toggleReference.addEventListener("change", () => {
  showReference = toggleReference.checked;
  renderReferencePoints();
});

fillZoneSelect();
updateEditor();
render();
fitInitialView();

requestAnimationFrame(() => {
  map.invalidateSize();
  fitInitialView();
});

window.addEventListener("resize", () => {
  map.invalidateSize();
});
