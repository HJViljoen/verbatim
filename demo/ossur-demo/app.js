/* Shared sidebar render + utility helpers
 * Each page mounts the sidebar by calling renderSidebar(activeRoute) into <div id="sidebar">.
 */

const NAV = [
  { id: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "▢" },
  { id: "market", label: "Market Intelligence", href: "market-intelligence.html", icon: "✦" },
  { id: "voc", label: "Voice of Customer", href: "voice-of-customer.html", icon: "❝" },
  { id: "competitive", label: "Competitive", href: "#", icon: "⚔", disabled: true, hint: "v1+" },
  { id: "content", label: "Content Analysis", href: "content-analysis.html", icon: "▶" },
  { id: "reports", label: "Reports", href: "reports.html", icon: "✉" },
  { id: "agent", label: "AI Agent", href: "#", icon: "✱", disabled: true, hint: "soon" },
  { id: "settings", label: "Settings", href: "#", icon: "⚙", disabled: true }
];

function renderSidebar(activeId) {
  const navHtml = NAV.map(item => {
    const cls = (item.id === activeId ? "active" : "") + (item.disabled ? " disabled" : "");
    const hint = item.hint ? `<span class="muted" style="font-size:10px;margin-left:auto;">${item.hint}</span>` : "";
    const target = item.disabled ? "#" : item.href;
    const onclick = item.disabled ? 'event.preventDefault();' : '';
    return `<a href="${target}" class="${cls}" onclick="${onclick}" style="${item.disabled ? 'opacity:0.45;cursor:default;' : ''}">
      <span class="icon">${item.icon}</span>
      <span>${item.label}</span>
      ${hint}
    </a>`;
  }).join("");

  return `
    <div class="brand">
      <div class="brand-mark">SL</div>
      <div>
        <div class="brand-name">SocialLens</div>
        <div class="brand-tag">Consumer intelligence</div>
      </div>
    </div>
    <div class="client-switch" title="Switch client">
      <div>
        <div class="client-name">Össur</div>
        <div class="client-status">design partner · weekly</div>
      </div>
      <span style="opacity:0.6;font-size:14px;">⌄</span>
    </div>
    <nav>${navHtml}</nav>
    <div class="footer">Run: <span class="mono">a1b2c3d4</span> · Apr 28 09:00</div>
  `;
}

function mountSidebar(activeId) {
  const el = document.getElementById("sidebar");
  if (el) el.innerHTML = renderSidebar(activeId);
}

function renderTopbar(crumbs, runStatus = "Complete · Apr 28 09:00") {
  const crumbHtml = crumbs.map((c, i) => {
    return `<span>${c}</span>${i < crumbs.length - 1 ? '<span class="sep">›</span>' : ''}`;
  }).join("");
  return `
    <div class="crumbs">${crumbHtml}</div>
    <div class="actions">
      <span class="pill"><span class="dot"></span>${runStatus}</span>
      <button class="btn">Export</button>
      <button class="btn btn-primary">Run now</button>
    </div>
  `;
}

function mountTopbar(crumbs) {
  const el = document.getElementById("topbar");
  if (el) el.innerHTML = renderTopbar(crumbs);
}

function watermark() {
  return `<div class="watermark">Demo · Illustrative data</div>`;
}

function injectWatermark() {
  const div = document.createElement("div");
  div.innerHTML = watermark();
  document.body.appendChild(div.firstElementChild);
}

/* Sentiment donut using inline SVG. No CDN dependency. */
function sentimentDonut(positive, neutral, negative, size = 200, strokeW = 28) {
  const total = positive + neutral + negative;
  const r = (size - strokeW) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2, cy = size / 2;

  const segs = [
    { val: positive, color: "var(--positive)" },
    { val: neutral,  color: "var(--neutral)" },
    { val: negative, color: "var(--negative)" }
  ];

  let offset = 0;
  const arcs = segs.map(s => {
    const len = (s.val / total) * c;
    const arc = `<circle cx="${cx}" cy="${cy}" r="${r}"
      stroke="${s.color}" stroke-width="${strokeW}" fill="none"
      stroke-dasharray="${len} ${c}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${cx} ${cy})" />`;
    offset += len;
    return arc;
  }).join("");

  return `
    <div class="donut-wrapper" style="width:${size}px;height:${size}px;">
      <svg width="${size}" height="${size}">
        <circle cx="${cx}" cy="${cy}" r="${r}" stroke="var(--bg-subtle)" stroke-width="${strokeW}" fill="none" />
        ${arcs}
      </svg>
      <div class="donut-center">
        <div class="num-big">${positive}%</div>
        <div class="label">Positive</div>
      </div>
    </div>
  `;
}

function sentimentLegend(positive, neutral, negative) {
  return `
    <div class="legend">
      <div class="legend-row"><span class="swatch" style="background:var(--positive);"></span> Positive <span class="pct">${positive}%</span></div>
      <div class="legend-row"><span class="swatch" style="background:var(--neutral);"></span> Neutral <span class="pct">${neutral}%</span></div>
      <div class="legend-row"><span class="swatch" style="background:var(--negative);"></span> Negative <span class="pct">${negative}%</span></div>
    </div>
  `;
}

/* Stacked SOV bar — same colour conventions */
function sovBar(sov) {
  const colors = {
    "Össur":           "var(--primary)",
    "Ossur":           "var(--primary)",
    "Ottobock":        "var(--negative)",
    "industry-other":  "#7C3AED"
  };
  const labels = {
    "Össur": "Össur",
    "Ossur": "Össur",
    "Ottobock": "Ottobock",
    "industry-other": "Industry & other creators"
  };

  const entries = Object.entries(sov);
  const segs = entries.map(([k, v]) => `
    <div class="sov-seg" style="flex:${v}; background:${colors[k]};">${v}%</div>
  `).join("");
  const legend = entries.map(([k, v]) => `
    <div class="sov-legend-row"><span class="swatch" style="background:${colors[k]};"></span>${labels[k] || k}</div>
  `).join("");
  return `
    <div class="sov-stack">${segs}</div>
    <div class="sov-legend">${legend}</div>
  `;
}

/* Strength bar (1-10 scale) */
function strengthBar(score) {
  const pct = (score / 10) * 100;
  return `
    <span class="strength">
      <span>Strength</span>
      <span class="strength-bar"><span class="strength-fill" style="width:${pct}%;"></span></span>
      <span class="mono">${score}/10</span>
    </span>
  `;
}

/* Score block (used for confidence/opportunity on Market Intelligence cards) */
function scoreBlock(label, score) {
  return `
    <div class="score-block">
      <div class="score-label">${label}</div>
      <div class="score-value">${score} <span class="max">/ 10</span></div>
    </div>
  `;
}

function entityBadge(derived) {
  const map = {
    "client": { cls: "badge-entity-client", text: "Össur" },
    "competitor:Ottobock": { cls: "badge-entity-competitor", text: "Ottobock" },
    "industry-other": { cls: "badge-entity-industry", text: "Industry" }
  };
  const m = map[derived] || map["industry-other"];
  return `<span class="badge ${m.cls}">${m.text}</span>`;
}

function emotionPill(emotion) {
  return `<span class="badge" style="background:#F3F4F6;color:#4B5563;">${emotion}</span>`;
}

function platformChip(p) {
  return `<span class="badge badge-platform"><span style="margin-right:4px;">${platformIcon(p)}</span>${platformLabel(p)}</span>`;
}

function platformChipsRow(platforms) {
  return platforms.map(platformChip).join(" ");
}
