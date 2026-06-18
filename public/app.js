const data = window.EMBOLSADO_MAP_DATA;
const zones = data.zones;

const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
const visibleZones = new Set(zones.filter((zone) => zone.defaultVisible).map((zone) => zone.id));
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

const zoneFilters = document.getElementById("zone-filters");
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

function cloneCoordinates(coordinates) {
  return JSON.parse(JSON.stringify(coordinates));
}

function getRings(zone) {
  return isNestedCoordinates(zone.coordinates) ? zone.coordinates : [zone.coordinates];
}

function getOuterRing(zone) {
  return getRings(zone)[0];
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

  const rings = isNestedCoordinates(value) ? value : [value];
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

  L.polygon(data.cabaExclusion.coordinates, {
    color: data.cabaExclusion.color,
    weight: 2,
    opacity: 0.95,
    fillColor: data.cabaExclusion.color,
    fillOpacity: 0.16,
    dashArray: "3 6"
  })
    .bindPopup(`<strong>${data.cabaExclusion.name}</strong><br><span class="excluded-area">Excluida de esta primera version.</span>`)
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

function renderZoneControls() {
  zoneFilters.innerHTML = "";

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
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
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
        zone.coordinates = isNestedCoordinates(zone.coordinates) ? rings : rings[0];
        if (!isNestedCoordinates(zone.coordinates)) {
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
  updateEditor();
  render();
}

function applyCoordinates() {
  const zone = zoneById.get(selectedZoneId);

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
