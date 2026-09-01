/* ============================================================
   app.js — rendering + interaction glue
   ============================================================ */

let state = loadState();

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const money = n => `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const STATUS_LABEL = { open: "Open", seated: "Seated", fired: "Fired", check: "Check dropped" };

/* ---------------- view switching ---------------- */

const VIEW_META = {
  dashboard: { title: "The Pass", sub: "Sunday, Aug 30 — dinner service" },
  orders: { title: "Tickets", sub: "Everything fired since doors opened" },
  tables: { title: "Floor", sub: "Live table status" },
  menu: { title: "Menu & Stock", sub: "On-hand vs par, by station" },
  staff: { title: "Crew", sub: "Who's on the schedule tonight" }
};

function setView(name) {
  $$(".rail-link").forEach(b => b.classList.toggle("is-active", b.dataset.view === name));
  $$(".view").forEach(v => v.classList.toggle("is-active", v.id === `view-${name}`));
  $("#viewTitle").textContent = VIEW_META[name].title;
  $("#viewSub").textContent = VIEW_META[name].sub;
  renderAll();
}

$$(".rail-link").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));

/* ---------------- theme ---------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#themeLabel").textContent = theme === "night" ? "Night service" : "Day service";
  $("#themeSwitch").classList.toggle("is-day", theme === "day");
  localStorage.setItem("orion_theme", theme);
}

$("#themeSwitch").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "night" ? "day" : "night";
  applyTheme(next);
});

applyTheme(localStorage.getItem("orion_theme") || "night");

/* ---------------- dashboard ---------------- */

function renderStatCards(selector, stats) {
  $(selector).innerHTML = stats.map((s, i) => `
    <div class="stat-card reveal" style="transition-delay:${i * 50}ms">
      <span class="stat-label">${s.label}</span>
      <span class="stat-value">${s.value}</span>
      <span class="stat-note">${s.note}</span>
    </div>
  `).join("");
  observeReveals(selector);
}

function renderStatRow() {
  const revenue = state.orders.reduce((s, o) => s + o.total, 0);
  const openTix = state.orders.filter(o => o.status === "fired").length;
  const seated = state.tables.filter(t => t.status !== "open").length;
  const avgTicket = state.orders.length ? Math.round(revenue / state.orders.length) : 0;

  const stats = [
    { label: "Revenue tonight", value: money(revenue), note: `${state.orders.length} tickets` },
    { label: "Tickets fired", value: openTix, note: "currently at the pass" },
    { label: "Tables in play", value: `${seated} / ${state.tables.length}`, note: "seated or turning" },
    { label: "Average check", value: money(avgTicket), note: "per ticket" }
  ];
  renderStatCards("#statRow", stats);
}

function renderCoversChart() {
  const data = state.coversByHour;
  const max = Math.max(...data.map(d => Math.max(d.today, d.lastWeek))) * 1.15;
  const bars = data.map(d => {
    const hToday = Math.round((d.today / max) * 100);
    const hLast = Math.round((d.lastWeek / max) * 100);
    return `
      <div class="cbar-group">
        <div class="cbar-pair">
          <div class="cbar cbar-last" style="height:${hLast}%" title="Last Sunday: ${d.lastWeek}"></div>
          <div class="cbar cbar-today" style="height:${hToday}%" title="Today: ${d.today}"></div>
        </div>
        <span class="cbar-label">${d.hour}</span>
      </div>`;
  }).join("");

  $("#coversChart").innerHTML = `
    <div class="cbars">${bars}</div>
    <div class="chart-legend">
      <span><i class="swatch swatch-today"></i>Today</span>
      <span><i class="swatch swatch-last"></i>Last Sunday</span>
    </div>`;
}

function renderDashInsights() {
  const findings = Orion.analyze(state).slice(0, 4);
  const box = $("#dashInsights");
  if (!findings.length) {
    box.innerHTML = `<p class="empty-note">No flags right now — Orion's watching stock, tickets and the floor as service moves.</p>`;
    return;
  }
  box.innerHTML = findings.map(f => `
    <div class="insight insight-${f.severity}">
      <span class="insight-dot"></span>
      <p>${f.text}</p>
    </div>
  `).join("");
}

function renderBestSellers() {
  const best = Orion.bestSellers(state, 6);
  const max = best.length ? best[0].count : 1;
  $("#bestSellers").innerHTML = best.map(b => `
    <li>
      <span class="rank-name">${b.name}</span>
      <span class="rank-bar-track"><span class="rank-bar" style="width:${Math.round((b.count / max) * 100)}%"></span></span>
      <span class="rank-count">${b.count}</span>
    </li>
  `).join("") || `<p class="empty-note">No items ordered yet.</p>`;
}

function renderMiniFloor() {
  $("#floorNote").textContent = `${state.tables.filter(t => t.status !== "open").length} of ${state.tables.length} occupied`;
  $("#miniFloor").innerHTML = state.tables.map(t => `
    <span class="mini-seat status-${t.status}" title="Table ${t.label}: ${STATUS_LABEL[t.status]}">${t.label}</span>
  `).join("");
}

/* ---------------- orders / tickets ---------------- */

function renderOrderStats() {
  const revenue = state.orders.reduce((s, o) => s + o.total, 0);
  const fired = state.orders.filter(o => o.status === "fired").length;
  const seated = state.orders.filter(o => o.status === "seated").length;
  const check = state.orders.filter(o => o.status === "check").length;

  renderStatCards("#ordersStatRow", [
    { label: "Tickets open", value: state.orders.length, note: "across the floor" },
    { label: "Fired", value: fired, note: "at the pass now" },
    { label: "Check dropped", value: check, note: "waiting to close" },
    { label: "Revenue on tickets", value: money(revenue), note: `${seated} not yet fired` }
  ]);
}

const ORDER_FILTERS = ["all", "fired", "seated", "check"];
let orderFilter = "all";

function renderOrderFilters() {
  $("#orderFilters").innerHTML = ORDER_FILTERS.map(f => `
    <button class="chip ${orderFilter === f ? "is-active" : ""}" data-filter="${f}">
      ${f === "all" ? "All tickets" : STATUS_LABEL[f]}
    </button>
  `).join("");
  $$("#orderFilters .chip").forEach(c => c.addEventListener("click", () => {
    orderFilter = c.dataset.filter;
    renderOrderFilters();
    renderTicketBoard();
  }));
}

function renderTicketBoard() {
  const list = state.orders
    .filter(o => orderFilter === "all" || o.status === orderFilter)
    .slice()
    .sort((a, b) => a.firedAt - b.firedAt);

  $("#ticketBoard").innerHTML = list.map((o, i) => {
    const mins = Math.round((Date.now() - o.firedAt) / 60000);
    return `
    <article class="ticket status-${o.status} reveal" style="transition-delay:${i * 40}ms">
      <header>
        <span class="ticket-table">Table ${o.table}</span>
        <span class="ticket-status">${STATUS_LABEL[o.status]}</span>
      </header>
      <ul class="ticket-items">
        ${o.items.map(i => `<li>${i}</li>`).join("")}
      </ul>
      <footer>
        <span>${o.server} · ${mins} min ago</span>
        <span class="ticket-total">${money(o.total)}</span>
      </footer>
      <div class="ticket-actions">
        ${nextStatusButtons(o)}
      </div>
    </article>`;
  }).join("") || `<p class="empty-note">No tickets match this filter.</p>`;

  $$(".ticket").forEach((el, i) => el.dataset.id = list[i].id);
  $$(".ticket-actions button").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.closest(".ticket").dataset.id;
      const order = state.orders.find(o => o.id === id);
      advanceOrder(order);
    });
  });

  observeReveals("#ticketBoard");
}

function nextStatusButtons(o) {
  if (o.status === "seated") return `<button class="btn btn-mini">Fire ticket</button>`;
  if (o.status === "fired") return `<button class="btn btn-mini">Drop check</button>`;
  if (o.status === "check") return `<button class="btn btn-mini">Close &amp; clear</button>`;
  return "";
}

function advanceOrder(order) {
  if (order.status === "seated") order.status = "fired";
  else if (order.status === "fired") order.status = "check";
  else if (order.status === "check") {
    // close it out: free the table
    const table = state.tables.find(t => t.label === order.table);
    if (table) { table.status = "open"; table.server = null; }
    state.orders = state.orders.filter(o => o.id !== order.id);
    saveAndRender();
    return;
  }
  saveAndRender();
}

/* ---------------- tables / floor ---------------- */

function renderTableStats() {
  const open = state.tables.filter(t => t.status === "open").length;
  const seated = state.tables.filter(t => t.status === "seated").length;
  const fired = state.tables.filter(t => t.status === "fired").length;
  const check = state.tables.filter(t => t.status === "check").length;

  renderStatCards("#tablesStatRow", [
    { label: "Open", value: open, note: "ready to seat" },
    { label: "Seated", value: seated, note: "menus dropped" },
    { label: "Fired", value: fired, note: "food in progress" },
    { label: "Check dropped", value: check, note: "turning soon" }
  ]);
}

const STATUS_CYCLE = ["open", "seated", "fired", "check"];

function renderFloorPlan() {
  $("#floorPlan").innerHTML = state.tables.map((t, i) => `
    <button class="floor-table status-${t.status} reveal" style="transition-delay:${i * 30}ms" data-id="${t.id}">
      <span class="ft-label">${t.label}</span>
      <span class="ft-seats">${t.seats} top</span>
      <span class="ft-status">${STATUS_LABEL[t.status]}</span>
      ${t.server ? `<span class="ft-server">${t.server}</span>` : ""}
    </button>
  `).join("");
  observeReveals("#floorPlan");

  $$(".floor-table").forEach(btn => btn.addEventListener("click", () => {
    const table = state.tables.find(t => t.id === btn.dataset.id);
    const idx = STATUS_CYCLE.indexOf(table.status);
    table.status = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
    if (table.status === "open") table.server = null;
    else if (!table.server) table.server = state.servers[Math.floor(Math.random() * state.servers.length)];
    saveAndRender();
  }));
}

/* ---------------- menu / stock ---------------- */

let menuFilter = "All";

function renderMenuStats() {
  const low = state.menu.filter(m => m.par > 0 && m.onHand / m.par <= 0.35).length;
  const critical = state.menu.filter(m => m.par > 0 && m.onHand / m.par <= 0.2).length;
  const stations = new Set(state.menu.map(m => m.station)).size;
  const avgPrice = Math.round(state.menu.reduce((s, m) => s + m.price, 0) / state.menu.length);

  renderStatCards("#menuStatRow", [
    { label: "Menu items", value: state.menu.length, note: `${stations} stations` },
    { label: "Running low", value: low, note: "below 35% of par" },
    { label: "Reorder now", value: critical, note: "below 20% of par" },
    { label: "Average price", value: money(avgPrice), note: "across the menu" }
  ]);
}

function renderMenuFilters() {
  const cats = ["All", ...new Set(state.menu.map(m => m.category))];
  $("#menuFilters").innerHTML = cats.map(c => `
    <button class="chip ${menuFilter === c ? "is-active" : ""}" data-cat="${c}">${c}</button>
  `).join("");
  $$("#menuFilters .chip").forEach(c => c.addEventListener("click", () => {
    menuFilter = c.dataset.cat;
    renderMenuFilters();
    renderStockTable();
  }));
}

function renderStockTable() {
  const rows = state.menu.filter(m => menuFilter === "All" || m.category === menuFilter);
  $("#stockBody").innerHTML = rows.map(m => {
    const pct = m.par > 0 ? m.onHand / m.par : 1;
    const status = m.par === 0 ? "n/a" : pct <= 0.2 ? "critical" : pct <= 0.35 ? "low" : "ok";
    const statusText = { "n/a": "—", critical: "Reorder now", low: "Running low", ok: "Stocked" }[status];
    return `
    <tr>
      <td class="cell-name">${m.name}</td>
      <td>${m.station}</td>
      <td>
        <div class="onhand-cell">
          <input type="number" min="0" class="onhand-input" data-id="${m.id}" value="${m.onHand}">
        </div>
      </td>
      <td>${m.par || "—"}</td>
      <td><span class="pill pill-${status}">${statusText}</span></td>
      <td>${money(m.price)}</td>
    </tr>`;
  }).join("");

  $$(".onhand-input").forEach(inp => inp.addEventListener("change", () => {
    const item = state.menu.find(m => m.id === inp.dataset.id);
    item.onHand = Math.max(0, parseInt(inp.value || "0", 10));
    saveAndRender();
  }));
}

/* ---------------- staff ---------------- */

function renderCrewStats() {
  const servers = state.staff.filter(s => s.role === "Server").length;
  const boh = state.staff.filter(s => /chef|cook/i.test(s.role)).length;
  const sections = new Set(state.staff.map(s => s.note)).size;

  renderStatCards("#staffStatRow", [
    { label: "On shift", value: state.staff.length, note: "tonight" },
    { label: "Servers", value: servers, note: "on the floor" },
    { label: "Kitchen", value: boh, note: "chef + sous" },
    { label: "Sections covered", value: sections, note: "front + back of house" }
  ]);
}

function renderCrew() {
  $("#crewGrid").innerHTML = state.staff.map((s, i) => `
    <div class="crew-card reveal" style="transition-delay:${i * 40}ms">
      <div class="crew-avatar">${s.name.charAt(0)}</div>
      <div>
        <h3>${s.name}</h3>
        <p class="crew-role">${s.role}</p>
        <p class="crew-meta">${s.shift}</p>
        <p class="crew-meta muted">${s.note}</p>
      </div>
    </div>
  `).join("");
  observeReveals("#crewGrid");
}

/* ---------------- new order modal ---------------- */

function openModal() {
  $("#ordTable").innerHTML = state.tables.filter(t => t.status !== "check")
    .map(t => `<option value="${t.label}">Table ${t.label} (${t.seats} top)</option>`).join("");
  $("#ordServer").innerHTML = state.servers.map(s => `<option value="${s}">${s}</option>`).join("");
  $("#modalScrim").classList.add("is-active");
  $("#newOrderModal").classList.add("is-active");
}
function closeModal() {
  $("#modalScrim").classList.remove("is-active");
  $("#newOrderModal").classList.remove("is-active");
  $("#newOrderForm").reset();
}

$("#newOrderBtn").addEventListener("click", openModal);
$("#cancelOrder").addEventListener("click", closeModal);
$("#modalScrim").addEventListener("click", closeModal);

$("#newOrderForm").addEventListener("submit", e => {
  e.preventDefault();
  const tableLabel = $("#ordTable").value;
  const items = $("#ordItems").value.split(",").map(s => s.trim()).filter(Boolean);
  const server = $("#ordServer").value;
  if (!items.length) return closeModal();

  const priced = items.reduce((sum, raw) => {
    const { name, qty } = parseItemLocal(raw);
    const menuItem = state.menu.find(m => m.name.toLowerCase() === name.toLowerCase());
    return sum + (menuItem ? menuItem.price * qty : 20 * qty);
  }, 0);

  const order = {
    id: "o" + Math.random().toString(36).slice(2, 9),
    table: tableLabel,
    items,
    server,
    status: "seated",
    firedAt: Date.now(),
    total: priced
  };
  state.orders.push(order);

  const table = state.tables.find(t => t.label === tableLabel);
  if (table) { table.status = "seated"; table.server = server; }

  closeModal();
  saveAndRender();
});

function parseItemLocal(raw) {
  const m = raw.match(/^(.*?)(?:\s*x(\d+))?$/i);
  return { name: (m[1] || raw).trim(), qty: m[2] ? parseInt(m[2], 10) : 1 };
}

/* ---------------- print prep sheet ---------------- */

$("#printDay").addEventListener("click", () => {
  const low = state.menu.filter(m => m.par > 0 && m.onHand / m.par <= 0.35);
  const win = window.open("", "_blank");
  win.document.write(`
    <html><head><title>Prep sheet — Service</title>
    <style>body{font-family:sans-serif;padding:2rem;max-width:600px} h1{font-size:1.2rem} li{margin:.3rem 0}</style>
    </head><body>
    <h1>Prep / reorder sheet — ${new Date().toLocaleDateString()}</h1>
    <ul>${low.map(m => `<li>${m.name} — on hand ${m.onHand}, par ${m.par}, station: ${m.station}</li>`).join("") || "<li>Nothing below par.</li>"}</ul>
    </body></html>`);
  win.document.close();
  win.print();
});

/* ---------------- Orion drawer ---------------- */

function openOrion() {
  $("#orionScrim").classList.add("is-active");
  $("#orionDrawer").classList.add("is-active");
  if (!$("#orionThread").dataset.greeted) {
    pushOrionMessage("orion", `Evening. Service is up on ${state.orders.length} tickets. Ask me anything about stock, the floor, or who's on tonight — or tap a prompt below.`);
    $("#orionThread").dataset.greeted = "1";
  }
}
function closeOrion() {
  $("#orionScrim").classList.remove("is-active");
  $("#orionDrawer").classList.remove("is-active");
}

$("#orionLaunch").addEventListener("click", openOrion);
$("#orionClose").addEventListener("click", closeOrion);
$("#orionScrim").addEventListener("click", closeOrion);

function renderOrionChips() {
  $("#orionChips").innerHTML = Orion.CHIPS.map(c => `<button class="chip chip-sm">${c}</button>`).join("");
  $$("#orionChips .chip").forEach(chip => chip.addEventListener("click", () => {
    askOrion(chip.textContent);
  }));
}

function pushOrionMessage(who, text) {
  const thread = $("#orionThread");
  const div = document.createElement("div");
  div.className = `orion-msg orion-msg-${who}`;
  div.innerHTML = `<p>${text}</p>`;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

function askOrion(text) {
  pushOrionMessage("user", text);
  const reply = Orion.answerQuestion(state, text);
  setTimeout(() => pushOrionMessage("orion", reply), 260);
}

$("#orionForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = $("#orionInput");
  const text = input.value.trim();
  if (!text) return;
  askOrion(text);
  input.value = "";
});

/* ---------------- render orchestration ---------------- */

function saveAndRender() {
  saveState(state);
  renderAll();
}

function renderAll() {
  renderStatRow();
  renderCoversChart();
  renderDashInsights();
  renderBestSellers();
  renderMiniFloor();

  renderOrderStats();
  renderOrderFilters();
  renderTicketBoard();

  renderTableStats();
  renderFloorPlan();

  renderMenuStats();
  renderMenuFilters();
  renderStockTable();

  renderCrewStats();
  renderCrew();
}

/* ---------------- scroll interactions ---------------- */

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("in-view");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });

function observeReveals(scopeSelector) {
  $$(`${scopeSelector} .reveal`, document).forEach(el => {
    if (!el.dataset.revealBound) {
      el.dataset.revealBound = "1";
      revealObserver.observe(el);
    }
  });
}

// static panels present at load time
observeReveals("body");

const progressBar = $("#scrollProgress");
const topbarEl = $(".topbar");
const toTopBtn = $("#toTop");

function onScroll() {
  const doc = document.documentElement;
  const max = doc.scrollHeight - doc.clientHeight;
  const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
  progressBar.style.width = pct + "%";

  topbarEl.classList.toggle("is-condensed", window.scrollY > 24);
  toTopBtn.classList.toggle("is-visible", window.scrollY > 480);
}

window.addEventListener("scroll", onScroll, { passive: true });
toTopBtn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
onScroll();

renderOrionChips();
renderAll();

// live-ish clock feel: re-render aging fields every 30s without full reload
setInterval(() => {
  renderStatRow();
  renderTicketBoard();
  renderDashInsights();
  renderOrderStats();
  renderTableStats();
}, 30000);
