const data = window.EMBOLSADO_MAP_DATA;
const cabaData = window.EMBOLSADO_CABA_ZONES || { zones: [], splitLine: [] };
const umapData = window.UMAP_IMPORTED_DATA || { groups: [], layers: [], summary: { featureCount: 0 } };
const dashboardData = window.EMBOLSADO_DASHBOARD_DATA || {
  period: {},
  totals: {},
  projected: [],
  daily: [],
  sellers: [],
  teamNewRecovered: {},
  teamActivity: {},
  clientRanking: [],
  zoneVolume: [],
  sources: []
};
const commercialData = window.EMBOLSADO_COMMERCIAL_DATA || {
  clients: [],
  summary: {},
  coverage: [],
  zoneSummary: [],
  statusCounts: {},
  zoneCounts: {},
  volumeByZone: {}
};
const zones = [...data.zones, ...cabaData.zones];

const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
const commercialClientById = new Map((commercialData.clients || []).map((client) => [client.id, client]));
const visibleZones = new Set(zones.filter((zone) => zone.defaultVisible).map((zone) => zone.id));
const visibleUmapLayers = new Set(umapData.layers.filter((layer) => layer.defaultVisible).map((layer) => layer.id));
const visibleClientStatuses = new Set(["A", "I", "CONFLICTO A/I", "SIN ESTADO"]);
let selectedZoneId = zones[0].id;
let selectedClientId = null;
let editing = false;
let showCaba = true;
let showReference = true;
let showCommercialClients = true;
let activeDashboardTab = "summary";

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
const commercialClientLayer = L.layerGroup().addTo(map);

const zoneFilters = document.getElementById("zone-filters");
const zoneCount = document.getElementById("zone-count");
const umapLayerControls = document.getElementById("umap-layer-controls");
const umapLayerCount = document.getElementById("umap-layer-count");
const umapFeatureCount = document.getElementById("umap-feature-count");
const commercialClientCount = document.getElementById("commercial-client-count");
const clientStatusControls = document.getElementById("client-status-controls");
const drilldownContent = document.getElementById("drilldown-content");
const dataDiagnostic = document.getElementById("data-diagnostic");
const dashboardPeriod = document.getElementById("dashboard-period");
const dashboardKpis = document.getElementById("dashboard-kpis");
const dashboardView = document.getElementById("dashboard-view");
const dashboardTabs = document.querySelectorAll("[data-dashboard-tab]");
const clientsStatus = document.getElementById("clients-status");
const volumeStatus = document.getElementById("volume-status");
const zoneSelect = document.getElementById("zone-editor-select");
const coordinatesEditor = document.getElementById("coordinates-editor");
const editorStatus = document.getElementById("editor-status");
const fitMapButton = document.getElementById("fit-map");
const toggleEditButton = document.getElementById("toggle-edit");
const applyCoordinatesButton = document.getElementById("apply-coordinates");
const copyConfigButton = document.getElementById("copy-config");
const toggleCaba = document.getElementById("toggle-caba");
const toggleReference = document.getElementById("toggle-reference");
const toggleCommercialClients = document.getElementById("toggle-commercial-clients");

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

function formatDecimal(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits }).format(value || 0);
}

function formatVolume(value) {
  if (!value) return "0";
  return formatDecimal(value, value >= 1000 ? 0 : 1);
}

function formatPercent(value, digits = 0) {
  return new Intl.NumberFormat("es-AR", {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(value || 0);
}

function formatSignedPercent(value) {
  const formatted = formatPercent(Math.abs(value || 0), 1);
  return `${value >= 0 ? "+" : "-"}${formatted}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function statusLabel(status) {
  const labels = {
    A: "Activo",
    I: "Inactivo",
    "CONFLICTO A/I": "Conflicto A/I",
    "SIN ESTADO": "Sin estado"
  };
  return labels[status] || status || "Sin estado";
}

function colorForClientStatus(status) {
  const colors = {
    A: "#16a34a",
    I: "#f59e0b",
    "CONFLICTO A/I": "#dc2626",
    "SIN ESTADO": "#64748b"
  };
  return colors[status] || colors["SIN ESTADO"];
}

function topBy(items, keyFn, valueFn = () => 1, limit = 5) {
  const totals = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || "(sin dato)";
    totals.set(key, (totals.get(key) || 0) + valueFn(item));
  });
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, value]) => ({ name, value }));
}

function performanceClass(value) {
  if (value >= 0.95) return "good";
  if (value >= 0.8) return "watch";
  return "risk";
}

function progressBar(value) {
  const pct = Math.max(0, Math.min(120, (value || 0) * 100));
  return `<div class="progress-track"><span class="${performanceClass(value)}" style="width:${Math.min(pct, 100)}%"></span></div>`;
}

function dashboardMetricCard(label, value, detail, tone = "neutral") {
  return `
    <article class="kpi-card ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function remainingBusinessDays() {
  const period = dashboardData.period || {};
  return Math.max(0, (period.monthDays || 0) - (period.countedDays || 0));
}

function requiredDailyToClose(metric) {
  const days = remainingBusinessDays();
  if (!days) return 0;
  return Math.max(0, ((metric?.objective || 0) - (metric?.actual || 0)) / days);
}

function getProjected(category, team) {
  return (dashboardData.projected || []).find((item) => item.category === category && item.team === team);
}

function teamsFromProjected() {
  return (dashboardData.projected || [])
    .filter((item) => !["TOTAL", "MOSTRADOR"].includes(item.team))
    .reduce((acc, item) => {
      if (!acc.includes(item.team)) acc.push(item.team);
      return acc;
    }, []);
}

function teamSummary(team) {
  const hae = getProjected("HAE", team) || {};
  const pre = getProjected("PREMEZCLAS", team) || {};
  const newRecovered = dashboardData.teamNewRecovered?.[team] || {};
  const activity = Object.entries(dashboardData.teamActivity || {}).find(([key]) => key.includes(team[0]))?.[1] || {};
  return { team, hae, pre, newRecovered, activity };
}

function renderDashboardKpis() {
  if (!dashboardKpis) return;
  const totals = dashboardData.totals || {};
  const period = dashboardData.period || {};
  const haeTotal = getProjected("HAE", "TOTAL") || {};
  const preTotal = getProjected("PREMEZCLAS", "TOTAL") || {};
  const haeGap = (haeTotal.objective || totals.haeObjective || 0) - (haeTotal.actual || totals.haeActual || 0);
  const preGap = (preTotal.objective || totals.premezclasObjective || 0) - (preTotal.actual || totals.premezclasActual || 0);

  if (dashboardPeriod) {
    dashboardPeriod.textContent = period.countedDays
      ? `${formatNumber(period.countedDays)}/${formatNumber(period.monthDays)} dias`
      : "sin datos";
  }

  dashboardKpis.innerHTML = [
    dashboardMetricCard(
      "HAE cumplimiento a fecha",
      formatPercent(haeTotal.vsToDate || totals.haeVsToDate, 0),
      `Obj mes ${formatVolume(haeTotal.objective || totals.haeObjective)} · Obj fecha ${formatVolume(haeTotal.objectiveToDate)} · Real ${formatVolume(haeTotal.actual || totals.haeActual)}`,
      performanceClass(haeTotal.vsToDate || totals.haeVsToDate)
    ),
    dashboardMetricCard(
      "HAE requerido diario",
      formatVolume(requiredDailyToClose(haeTotal)),
      `${formatVolume(haeGap)} bolsas restantes en ${formatNumber(remainingBusinessDays())} dias habiles`,
      haeGap <= 0 ? "good" : "watch"
    ),
    dashboardMetricCard(
      "Premezclas cumplimiento a fecha",
      formatPercent(preTotal.vsToDate || totals.premezclasVsToDate, 0),
      `Obj mes ${formatVolume(preTotal.objective || totals.premezclasObjective)} · Obj fecha ${formatVolume(preTotal.objectiveToDate)} · Real ${formatVolume(preTotal.actual || totals.premezclasActual)}`,
      performanceClass(preTotal.vsToDate || totals.premezclasVsToDate)
    ),
    dashboardMetricCard(
      "Premezclas requerido diario",
      formatVolume(requiredDailyToClose(preTotal)),
      `${formatVolume(preGap)} bolsas restantes en ${formatNumber(remainingBusinessDays())} dias habiles`,
      preGap <= 0 ? "good" : "watch"
    )
  ].join("");
}

function tableRows(rows, columns) {
  return rows
    .map(
      (row) => `
        <tr>
          ${columns.map((column) => `<td class="${column.align || ""}">${column.render(row)}</td>`).join("")}
        </tr>
      `
    )
    .join("");
}

function renderSummaryDashboard() {
  const teams = teamsFromProjected().map(teamSummary);
  const teamCards = teams
    .map(({ team, hae, pre, newRecovered }) => {
      const newPct = newRecovered.newObjective ? newRecovered.newActual / newRecovered.newObjective : 0;
      const recoveredNet = (newRecovered.recoveredActual || 0) - (newRecovered.lostClients || 0);
      return `
        <article class="team-card">
          <div>
            <strong>${escapeHtml(team)}</strong>
            <span>HAE ${formatPercent(hae.vsToDate, 0)} · Pre ${formatPercent(pre.vsToDate, 0)}</span>
          </div>
          ${progressBar(hae.vsToDate)}
          <dl>
            <dt>Vta HAE</dt><dd>${formatVolume(hae.actual)}</dd>
            <dt>Nuevos</dt><dd>${formatVolume(newRecovered.newActual || 0)}/${formatVolume(newRecovered.newObjective || 0)}</dd>
            <dt>Rec neta</dt><dd>${formatVolume(recoveredNet)}</dd>
          </dl>
        </article>
      `;
    })
    .join("");

  const zoneRows = (dashboardData.zoneVolume || [])
    .slice(0, 6)
    .map((row) => `<li><span>${escapeHtml(row.zone)}</span><strong>${formatVolume(row.volume)}</strong></li>`)
    .join("");

  dashboardView.innerHTML = `
    <div class="dashboard-grid">
      ${teamCards || "<p class='empty-state'>Sin resumen por equipo.</p>"}
    </div>
    <div class="dashboard-split">
      <div class="rank-block">
        <span>Volumen geolocalizado por zona</span>
        <ul>${zoneRows}</ul>
      </div>
      <div class="rank-block">
        <span>Actualizacion</span>
        <ul>
          <li><span>Exceles fuente</span><strong>${formatNumber((dashboardData.sources || []).length)}</strong></li>
          <li><span>Dataset local</span><strong>${escapeHtml(dashboardData.generatedAt || "sin fecha")}</strong></li>
        </ul>
      </div>
    </div>
  `;
}

function renderTeamsDashboard() {
  const rows = teamsFromProjected().map(teamSummary);
  dashboardView.innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>Equipo</th>
          <th>HAE obj mes</th>
          <th>HAE obj fecha</th>
          <th>HAE real</th>
          <th>HAE %</th>
          <th>HAE req/dia</th>
          <th>Pre %</th>
          <th>Pre req/dia</th>
          <th>Nuevos</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows(rows, [
          { render: (row) => `<strong>${escapeHtml(row.team)}</strong>` },
          { align: "num", render: (row) => formatVolume(row.hae.objective) },
          { align: "num", render: (row) => formatVolume(row.hae.objectiveToDate) },
          { align: "num", render: (row) => formatVolume(row.hae.actual) },
          { render: (row) => `${formatPercent(row.hae.vsToDate, 0)} ${progressBar(row.hae.vsToDate)}` },
          { align: "num", render: (row) => formatVolume(requiredDailyToClose(row.hae)) },
          { render: (row) => `${formatPercent(row.pre.vsToDate, 0)} ${progressBar(row.pre.vsToDate)}` },
          { align: "num", render: (row) => formatVolume(requiredDailyToClose(row.pre)) },
          { align: "num", render: (row) => `${formatVolume(row.newRecovered.newActual || 0)}/${formatVolume(row.newRecovered.newObjective || 0)}` }
        ])}
      </tbody>
    </table>
  `;
}

function renderSellersDashboard() {
  const sellers = (dashboardData.sellers || []).filter((seller) => seller.haeActual || seller.totalTn).slice(0, 24);
  dashboardView.innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>Corredor</th>
          <th>Jefe</th>
          <th>HAE acum</th>
          <th>TN 2SJ</th>
          <th>PP kg</th>
          <th>Activos</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows(sellers, [
          { render: (row) => `<strong>${escapeHtml(row.seller)}</strong>` },
          { render: (row) => escapeHtml(row.teamCode || "") },
          { align: "num", render: (row) => formatVolume(row.haeActual) },
          { align: "num", render: (row) => formatDecimal(row.totalTn, 1) },
          { align: "num", render: (row) => formatMoney(row.ppxKg).replace("$", "") },
          { align: "num", render: (row) => `${formatNumber(row.activeClients)} / ${formatNumber(row.inactiveClients)}` }
        ])}
      </tbody>
    </table>
  `;
}

function renderClientsDashboard() {
  const clients = (dashboardData.clientRanking || []).slice(0, 18);
  dashboardView.innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>Cliente</th>
          <th>Vendedor</th>
          <th>Categoria</th>
          <th>Total</th>
          <th>Objetivo +35%</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows(clients, [
          { render: (row) => `<strong>${escapeHtml(row.name || row.id)}</strong><small>${escapeHtml(row.id)}</small>` },
          { render: (row) => escapeHtml(row.seller || "") },
          { render: (row) => escapeHtml(row.category || "") },
          { align: "num", render: (row) => formatVolume(row.total) },
          { align: "num", render: (row) => formatVolume(row.objective35) }
        ])}
      </tbody>
    </table>
  `;
}

function renderDashboard() {
  if (!dashboardView) return;
  renderDashboardKpis();
  dashboardTabs.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.dashboardTab === activeDashboardTab);
  });
  if (activeDashboardTab === "teams") renderTeamsDashboard();
  else if (activeDashboardTab === "sellers") renderSellersDashboard();
  else if (activeDashboardTab === "clients") renderClientsDashboard();
  else renderSummaryDashboard();
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

function filteredCommercialClients() {
  return (commercialData.clients || []).filter((client) => {
    if (!showCommercialClients) return false;
    if (!visibleZones.has(client.zoneId)) return false;
    if (!visibleClientStatuses.has(client.status)) return false;
    return Number.isFinite(client.lat) && Number.isFinite(client.lon);
  });
}

function clientRadius(client) {
  if (!client.totalUm) return 3.2;
  return Math.max(4.2, Math.min(13, 3.8 + Math.sqrt(client.totalUm) / 28));
}

function popupForCommercialClient(client) {
  const families = (client.families || [])
    .slice(0, 4)
    .map((item) => `<span><b>${escapeHtml(item.name)}:</b> ${formatVolume(item.um)}</span>`)
    .join("");

  return `
    <div class="popup-card commercial-popup">
      <strong>${escapeHtml(client.name || client.id)}</strong>
      <span><b>Cuenta:</b> ${escapeHtml(client.id)}</span>
      <span><b>Zona:</b> ${escapeHtml(client.zoneName)}</span>
      <span><b>Vendedor:</b> ${escapeHtml(client.seller || "Sin dato")}</span>
      <span><b>Estado:</b> ${escapeHtml(statusLabel(client.status))}</span>
      <span><b>UM:</b> ${formatVolume(client.totalUm)}</span>
      ${families}
    </div>
  `;
}

function renderCommercialClients() {
  commercialClientLayer.clearLayers();
  const clients = filteredCommercialClients();

  if (commercialClientCount) {
    commercialClientCount.textContent = formatNumber(clients.length);
  }

  clients.forEach((client) => {
    const selected = client.id === selectedClientId;
    L.circleMarker([client.lat, client.lon], {
      radius: selected ? clientRadius(client) + 3 : clientRadius(client),
      color: selected ? "#111827" : "#ffffff",
      weight: selected ? 2.4 : 1.1,
      opacity: 0.96,
      fillColor: colorForClientStatus(client.status),
      fillOpacity: client.totalUm ? 0.82 : 0.54
    })
      .bindPopup(popupForCommercialClient(client))
      .on("click", () => selectClient(client.id))
      .addTo(commercialClientLayer);
  });
}

function renderClientStatusControls() {
  if (!clientStatusControls) return;
  clientStatusControls.innerHTML = "";

  const statusOrder = ["A", "I", "CONFLICTO A/I", "SIN ESTADO"];
  statusOrder.forEach((status) => {
    const count = commercialData.statusCounts?.[status] || 0;
    if (!count) return;

    const row = document.createElement("label");
    row.className = "status-row";
    row.style.setProperty("--status-color", colorForClientStatus(status));

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = visibleClientStatuses.has(status);
    input.addEventListener("change", () => {
      if (input.checked) visibleClientStatuses.add(status);
      else visibleClientStatuses.delete(status);
      renderCommercialClients();
      renderDrilldown();
    });

    const dot = document.createElement("span");
    dot.className = "status-dot";

    const label = document.createElement("span");
    label.innerHTML = `<strong>${escapeHtml(statusLabel(status))}</strong><small>${formatNumber(count)}</small>`;

    row.append(input, dot, label);
    clientStatusControls.appendChild(row);
  });
}

function metricList(rows) {
  return rows.map(([label, value]) => `<div class="mini-metric"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join("");
}

function renderClientDetail(client) {
  const families = (client.families || []).length
    ? client.families.map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${formatVolume(item.um)}</strong></li>`).join("")
    : "<li><span>Sin familia asignada</span><strong>0</strong></li>";
  const products = (client.products || []).length
    ? client.products.map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${formatVolume(item.um)}</strong></li>`).join("")
    : "<li><span>Sin detalle producto</span><strong>0</strong></li>";

  drilldownContent.innerHTML = `
    <div class="drill-card">
      <div class="drill-title">
        <strong>${escapeHtml(client.name || client.id)}</strong>
        <span>${escapeHtml(client.id)}</span>
      </div>
      ${metricList([
        ["Zona", escapeHtml(client.zoneName)],
        ["Vendedor", escapeHtml(client.seller || "Sin dato")],
        ["Estado", escapeHtml(statusLabel(client.status))],
        ["UM", formatVolume(client.totalUm)]
      ])}
      <div class="rank-block">
        <span>Familias</span>
        <ul>${families}</ul>
      </div>
      <div class="rank-block">
        <span>Productos</span>
        <ul>${products}</ul>
      </div>
    </div>
  `;
}

function renderZoneDrilldown(zoneId) {
  const zone = zoneById.get(zoneId);
  const zoneClients = (commercialData.clients || []).filter((client) => client.zoneId === zoneId);
  const totalVolume = zoneClients.reduce((sum, client) => sum + (client.totalUm || 0), 0);
  const withVolume = zoneClients.filter((client) => client.totalUm > 0).length;
  const topSellers = topBy(zoneClients, (client) => client.seller, () => 1, 5);
  const topClients = [...zoneClients]
    .filter((client) => client.totalUm > 0)
    .sort((a, b) => b.totalUm - a.totalUm)
    .slice(0, 5);

  const sellerRows = topSellers.length
    ? topSellers.map((item) => `<li><span>${escapeHtml(item.name)}</span><strong>${formatNumber(item.value)}</strong></li>`).join("")
    : "<li><span>Sin vendedor</span><strong>0</strong></li>";

  const clientRows = topClients.length
    ? topClients.map((client) => `<li><button type="button" data-client-id="${escapeHtml(client.id)}">${escapeHtml(client.name || client.id)}</button><strong>${formatVolume(client.totalUm)}</strong></li>`).join("")
    : "<li><span>Sin volumen cargado</span><strong>0</strong></li>";

  drilldownContent.innerHTML = `
    <div class="drill-card">
      <div class="drill-title">
        <strong>${escapeHtml(zone?.name || "Zona")}</strong>
        <span>${escapeHtml(zone?.manager || "")}</span>
      </div>
      ${metricList([
        ["Clientes con punto", formatNumber(zoneClients.length)],
        ["Clientes con volumen", formatNumber(withVolume)],
        ["UM total", formatVolume(totalVolume)],
        ["Estado", "framework"]
      ])}
      <div class="rank-block">
        <span>Vendedores</span>
        <ul>${sellerRows}</ul>
      </div>
      <div class="rank-block">
        <span>Top clientes</span>
        <ul>${clientRows}</ul>
      </div>
    </div>
  `;

  drilldownContent.querySelectorAll("[data-client-id]").forEach((button) => {
    button.addEventListener("click", () => selectClient(button.dataset.clientId));
  });
}

function renderDrilldown() {
  if (!drilldownContent) return;
  const selectedClient = selectedClientId ? commercialClientById.get(selectedClientId) : null;
  if (selectedClient) renderClientDetail(selectedClient);
  else renderZoneDrilldown(selectedZoneId);
}

function renderDataDiagnostic() {
  if (clientsStatus) {
    clientsStatus.textContent = commercialData.summary?.mapClients
      ? `${formatNumber(commercialData.summary.mapClients)} mapeados`
      : "sin dataset";
  }
  if (volumeStatus) {
    volumeStatus.textContent = commercialData.summary?.withVolume
      ? `${formatNumber(commercialData.summary.withVolume)} clientes`
      : "sin volumen";
  }
  if (!dataDiagnostic) return;

  const summary = commercialData.summary || {};
  const bestCoverage = (commercialData.coverage || [])
    .slice()
    .sort((a, b) => Number(b.coverage_pct || 0) - Number(a.coverage_pct || 0))
    .slice(0, 3);

  const coverageRows = bestCoverage
    .map((row) => `<li><span>${escapeHtml(row.source)}</span><strong>${escapeHtml(row.coverage_pct)}%</strong></li>`)
    .join("");

  dataDiagnostic.innerHTML = `
    ${metricList([
      ["Normalizados", formatNumber(summary.clients)],
      ["Con punto", formatNumber(summary.mapClients)],
      ["Sin coordenadas", formatNumber(summary.missingCoordinates)],
      ["Conflictos A/I", formatNumber(summary.statusConflicts)]
    ])}
    <div class="rank-block">
      <span>Mejor cobertura</span>
      <ul>${coverageRows || "<li><span>Sin fuentes</span><strong>0%</strong></li>"}</ul>
    </div>
  `;
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
  selectedClientId = null;
  if (zoneById.get(zoneId)?.editable === false) {
    editing = false;
  }
  updateEditor();
  render();
}

function selectClient(clientId) {
  const client = commercialClientById.get(clientId);
  if (!client) return;
  selectedClientId = clientId;
  selectedZoneId = client.zoneId;
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
  renderDashboard();
  renderZoneControls();
  renderZones();
  renderClientStatusControls();
  renderCommercialClients();
  renderDrilldown();
  renderDataDiagnostic();
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
toggleCommercialClients.addEventListener("change", () => {
  showCommercialClients = toggleCommercialClients.checked;
  renderCommercialClients();
  renderDrilldown();
});
dashboardTabs.forEach((button) => {
  button.addEventListener("click", () => {
    activeDashboardTab = button.dataset.dashboardTab;
    renderDashboard();
  });
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
