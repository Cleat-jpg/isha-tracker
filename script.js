"use strict";
/* For Me — front end (served from GitHub Pages, talks to the Apps Script backend) */

// Paste your Apps Script Web app URL (ends in /exec) here
const GAS_URL = "https://script.google.com/macros/s/AKfycby-p4d7tZ83wQWJ736W42jSYtJ885NxnohHFRzhahD7X11LMUmotc_75vgCkBzPXG2X/exec";
const TOKEN_KEY = "forme_token";

/* ---------- small helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (s) => {
  if (s == null) return "";
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};
const peso = (n) => {
  const v = Number(n) || 0;
  return "₱" + v.toLocaleString("en-PH", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
};
const pad = (n) => String(n).padStart(2, "0");
const todayIso = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
const toDate = (iso) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const fmtDate = (iso) => (iso ? toDate(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "");
const monthLabel = (iso) => (iso ? toDate(iso).toLocaleDateString("en-PH", { month: "long", year: "numeric" }) : "No date");
const lower = (s) => String(s || "").toLowerCase();
const sum = (list) => list.reduce((a, i) => a + (Number(i.amount) || 0), 0);
// Newest first; entries without a date go last
const sorted = (items) => items.slice().sort((a, b) => (b.whenIso || "").localeCompare(a.whenIso || "") || b.row - a.row);

const store = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } },
  set: (v) => { try { localStorage.setItem(TOKEN_KEY, v); } catch (e) {} },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
};

/* ---------- state ---------- */
let S = null;            // data from the sheet: { val: {items, categories}, me: {...} }
let view = "home";
let locked = false;      // true while the sign-in screen is showing
let loginMsg = "";
let loadError = "";
const filt = { val: "ALL", me: "ALL" };
const query = { val: "", me: "" };

/* ---------- talking to the backend ---------- */
const run = async (fn, ...args) => {
  const res = await fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({ fn, args, token: store.get() })
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); }
  catch (e) { throw new Error("The Apps Script sent back a web page instead of data. Check that the latest version is deployed and access is set to Anyone."); }
  if (json.status === "error") {
    if (json.error === "UNAUTHORIZED") {
      store.clear(); S = null; locked = true; loginMsg = "Your session ended. Please sign in again.";
      throw new Error("Signed out");
    }
    throw new Error(json.error);
  }
  return json.data;
};

async function load() {
  if (!store.get()) { locked = true; S = null; render(); return; }
  locked = false;
  render();
  try {
    S = await run("getAll");
    loadError = "";
  } catch (e) {
    if (!locked) {
      loadError = String((e && e.message) || e);
      toast("Couldn’t reach the sheet. Check your connection and refresh.");
    }
  }
  render();
}
$("#refresh").onclick = () => { S = null; loadError = ""; load(); };

/* ---------- shell ---------- */
function render() {
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
  const el = $("#app");
  if (locked) { el.innerHTML = loginHtml(); bindLogin(); return; }
  if (!S) {
    el.innerHTML = loadError
      ? '<div class="card err">Couldn’t load your data: ' + esc(loadError) + "<br><br>Tap ⟳ to try again.</div>"
      : '<div class="empty">Loading…</div>';
    return;
  }
  try {
    el.innerHTML = view === "home" ? renderHome() : renderTab(view);
    el.insertAdjacentHTML("beforeend", '<div style="text-align:center;margin:8px 0 24px"><button class="btn ghost" id="signout">Sign out</button></div>');
    $("#signout").onclick = () => { store.clear(); S = null; locked = true; loginMsg = ""; render(); };
  } catch (err) {
    console.error(err);
    el.innerHTML = '<div class="card err">This page hit an error while drawing: ' + esc(err && err.message) + "</div>";
  }
}
$("#nav").onclick = (e) => {
  const b = e.target.closest("button[data-v]");
  if (b) { view = b.dataset.v; render(); window.scrollTo(0, 0); }
};

function errCard(x) {
  return '<div class="card err">This tab didn’t load' + (x && x.error ? ": " + esc(x.error) : ".") + "</div>";
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 3200);
}

/* ---------- sign in ---------- */
function loginHtml() {
  return `<div class="card" style="margin-top:28px">
    <h2>Sign in</h2>
    <p class="muted" style="margin:0 0 12px">Enter your passphrase to open the app.</p>
    ${loginMsg ? `<p class="err" role="alert" style="margin:0 0 10px">${esc(loginMsg)}</p>` : ""}
    <label for="pw" class="muted" style="display:block;font-size:13.5px">Passphrase</label>
    <input id="pw" type="password" autocomplete="current-password" style="display:block;width:100%;margin:4px 0 14px;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);font-size:16px">
    <button class="btn" id="pw-go" style="width:100%">Unlock</button>
  </div>`;
}
function bindLogin() {
  const go = $("#pw-go"), pw = $("#pw");
  const submit = async () => {
    const v = pw.value;
    if (!v) { pw.focus(); return; }
    go.disabled = true; go.textContent = "Checking…";
    try {
      const token = await run("login", v);
      store.set(token); locked = false; loginMsg = ""; load();
    } catch (e) {
      loginMsg = String((e && e.message) || "Couldn’t sign in."); render();
    }
  };
  go.onclick = submit;
  pw.onkeydown = (e) => { if (e.key === "Enter") submit(); };
  pw.focus();
}

/* ---------- rows ---------- */
function rowHtml(tab, it) {
  const sub = [it.where, it.what].filter(Boolean).map(esc).join(" · ");
  return `
  <div class="row">
    <button class="chk ${it.done ? "on" : ""}" data-a="toggle" data-tab="${tab}" data-row="${it.row}"
      aria-label="Mark ${esc(it.title)} as ${it.done ? "planned" : tab === "me" ? "bought" : "happened"}">${it.done ? "✓" : ""}</button>
    <div class="body">
      <div class="t">${esc(it.title)}</div>
      ${sub ? `<div class="s">${sub}</div>` : ""}
      <div style="margin-top:4px">
        ${it.category ? `<span class="pill">${esc(lower(it.category))}</span> ` : ""}
        ${it.done ? "" : '<span class="pill plan">planned</span> '}
        ${it.whenIso ? `<span class="s">${esc(fmtDate(it.whenIso))}</span>` : ""}
      </div>
    </div>
    ${tab === "me" ? `<div class="amt">${peso(it.amount)}</div>` : ""}
    <button class="edit" data-a="edit" data-tab="${tab}" data-row="${it.row}" aria-label="Edit ${esc(it.title)}">✎</button>
  </div>`;
}

/* ---------- home ---------- */
function renderHome() {
  const v = S.val, m = S.me;
  if (!v || v.error) return errCard(v);
  const vDone = v.items.filter((i) => i.done);
  const vPlan = v.items.filter((i) => !i.done);
  const ym = todayIso().slice(0, 7);
  const thisMonth = vDone.filter((i) => (i.whenIso || "").startsWith(ym)).length;
  const latest = sorted(vDone)[0];

  let html = `
  <div class="card hero">
    <div class="sub">From Val</div>
    <div class="big">${vDone.length}</div>
    <div class="sub">dates, treats and gifts so far</div>
    <div class="stats">
      <div class="stat"><b>${thisMonth}</b><span>This month</span></div>
      <div class="stat"><b>${vPlan.length}</b><span>Planned</span></div>
    </div>
    ${latest ? `<div class="sub" style="margin-top:12px">Latest: ${esc(latest.title)} · ${esc(fmtDate(latest.whenIso))}</div>` : ""}
  </div>`;

  // What the moments were
  const counts = {};
  vDone.forEach((i) => { const c = i.category || "OTHER"; counts[c] = (counts[c] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length) {
    const max = entries[0][1];
    html += `<div class="card"><h2>What it was</h2>` +
      entries.map(([c, n]) => `
      <div class="cat"><span class="n"></span><span>${esc(lower(c))}</span><b>${n}</b>
        <div class="bar"><i style="width:${(n / max) * 100}%"></i></div></div>`).join("") + `</div>`;
  }

  if (vPlan.length) {
    const upcoming = vPlan.slice().sort((a, b) => (a.whenIso || "9999").localeCompare(b.whenIso || "9999")).slice(0, 5);
    html += `<div class="card"><h2>Planned</h2>${upcoming.map((i) => rowHtml("val", i)).join("")}</div>`;
  }

  const recent = sorted(vDone).slice(0, 5);
  html += `<div class="card">
    <div class="addbar"><h2 style="margin:0">Recent from Val</h2><button class="btn ghost" data-a="goto" data-v="val">See all</button></div>
    ${recent.length ? recent.map((i) => rowHtml("val", i)).join("") : '<div class="empty">Nothing logged yet.</div>'}
  </div>`;

  if (m && !m.error) {
    const mDone = m.items.filter((i) => i.done);
    const mPlan = m.items.filter((i) => !i.done);
    html += `<div class="card">
      <div class="addbar"><h2 style="margin:0">From me</h2><button class="btn ghost" data-a="goto" data-v="me">See all</button></div>
      <div class="kv" style="margin-top:12px">
        <div><span>Spent so far</span><b>${peso(sum(mDone))}</b></div>
        <div><span>${mPlan.length ? "Planned" : "Purchases"}</span><b>${mPlan.length ? peso(sum(mPlan)) : mDone.length}</b></div>
      </div>
      ${sorted(mDone).slice(0, 3).map((i) => rowHtml("me", i)).join("")}
    </div>`;
  } else if (m && m.error) {
    html += errCard(m);
  }
  return html;
}

/* ---------- the two list tabs ---------- */
function listInner(tab) {
  const d = S[tab];
  const q = query[tab].trim().toLowerCase();
  const items = sorted(d.items).filter((i) =>
    (filt[tab] === "ALL" || i.category === filt[tab]) &&
    (!q || [i.title, i.where, i.what, i.category].join(" ").toLowerCase().includes(q)));
  if (!items.length) return '<div class="empty">Nothing here yet.</div>';
  let out = "", cur = null;
  for (const it of items) {
    const mk = it.whenIso ? it.whenIso.slice(0, 7) : "none";
    if (mk !== cur) { cur = mk; out += `<div class="month">${esc(monthLabel(it.whenIso))}</div>`; }
    out += rowHtml(tab, it);
  }
  return out;
}

function renderTab(tab) {
  const d = S[tab];
  if (!d || d.error) return errCard(d);
  const done = d.items.filter((i) => i.done);
  const plan = d.items.filter((i) => !i.done);
  const cats = ["ALL"].concat(d.categories);

  const hero = tab === "me"
    ? `<div class="card hero">
         <div class="sub">Spent on me</div>
         <div class="big">${peso(sum(done))}</div>
         <div class="sub">${done.length} purchase${done.length === 1 ? "" : "s"}${plan.length ? ` · ${peso(sum(plan))} planned` : ""}</div>
       </div>`
    : `<div class="card hero">
         <div class="sub">From Val</div>
         <div class="big">${done.length}</div>
         <div class="sub">dates, treats and gifts${plan.length ? ` · ${plan.length} planned` : ""}</div>
       </div>`;

  return `${hero}
  <div class="card">
    <div class="addbar"><h2 style="margin:0">${tab === "me" ? "Big girl purchases" : "Dates and gifts"}</h2><button class="btn" data-a="add" data-tab="${tab}">Add</button></div>
    <div class="chips" style="margin-top:10px">
      ${cats.map((c) => `<button class="chip ${c === filt[tab] ? "on" : ""}" data-a="chip" data-tab="${tab}" data-v="${esc(c)}">${c === "ALL" ? "All" : esc(lower(c))}</button>`).join("")}
    </div>
    <input class="search" id="q" data-tab="${tab}" type="search" placeholder="Search" aria-label="Search" value="${esc(query[tab])}">
    <div id="list">${listInner(tab)}</div>
  </div>`;
}

// Search updates only the list so the keyboard stays open
$("#app").addEventListener("input", (e) => {
  if (e.target.id === "q" && S) {
    const tab = e.target.dataset.tab;
    query[tab] = e.target.value;
    $("#list").innerHTML = listInner(tab);
  }
});

/* ---------- add / edit modal ---------- */
function closeModal() { const m = $("#modal"); m.classList.remove("open"); m.innerHTML = ""; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#modal").classList.contains("open")) closeModal(); });

function openModal(cfg) {
  const m = $("#modal");
  const field = (f) => {
    const id = "f_" + f.k;
    const control = f.type === "select"
      ? `<select id="${id}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`
      : `<input id="${id}" type="${f.type || "text"}" value="${esc(f.value == null ? "" : f.value)}" placeholder="${esc(f.ph || "")}" autocomplete="off" ${f.type === "number" ? 'step="0.01" inputmode="decimal"' : ""}>`;
    return `<label for="${id}">${esc(f.label)}${control}</label>`;
  };
  m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(cfg.title)}">
    <h3>${esc(cfg.title)}</h3>
    ${cfg.fields.map(field).join("")}
    <div class="actions">
      ${cfg.del ? '<button class="btn danger" id="m_del">Delete</button>' : ""}
      <button class="btn ghost" id="m_cancel">Cancel</button>
      <button class="btn" id="m_save">Save</button>
    </div>
  </div>`;
  m.classList.add("open");
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  $("#m_cancel").onclick = closeModal;

  const busy = async (fn) => {
    const btns = m.querySelectorAll("button");
    btns.forEach((b) => (b.disabled = true));
    try { await fn(); closeModal(); render(); }
    catch (e) {
      if (locked) { closeModal(); render(); return; }
      toast(String((e && e.message) || "Couldn’t save. Try again."));
      btns.forEach((b) => (b.disabled = false));
    }
  };
  $("#m_save").onclick = () => {
    const vals = {};
    for (const f of cfg.fields) {
      const el = $("#f_" + f.k);
      vals[f.k] = f.type === "select" ? el.value : el.value.trim();
      if (f.req && !vals[f.k]) { toast("Add a " + f.label.toLowerCase() + " first."); el.focus(); return; }
    }
    busy(() => cfg.save(vals));
  };
  if (cfg.del) {
    $("#m_del").onclick = () => {
      const b = $("#m_del");
      if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Tap again to delete"; return; }
      busy(cfg.del);
    };
  }
  const first = m.querySelector("input");
  if (first && !first.value) first.focus();
}

function openEntry(tab, row) {
  const d = S[tab];
  const it = row ? d.items.find((i) => i.row === row) : null;
  const cats = d.categories.slice();
  if (it && it.category && !cats.includes(it.category)) cats.push(it.category);

  const fields = [
    { k: "title", label: "Title", value: it ? it.title : "", req: true },
    { k: "where", label: "Where", value: it ? it.where : "" },
    { k: "what", label: "What", value: it ? it.what : "" },
    { k: "when", label: "When", type: "date", value: it ? it.whenIso : todayIso() },
    { k: "category", label: "Category", type: "select", options: [["", "None"]].concat(cats.map((c) => [c, lower(c)])), value: it ? it.category : "" }
  ];
  if (tab === "me") fields.push({ k: "amount", label: "How much (₱)", type: "number", value: it ? it.amount : "", req: true });
  fields.push({
    k: "status", label: "Status", type: "select",
    options: [["done", tab === "me" ? "Bought" : "Happened"], ["plan", "Planned"]],
    value: it ? (it.done ? "done" : "plan") : "done"
  });

  openModal({
    title: it ? "Edit entry" : "New entry",
    fields,
    save: async (v) => {
      S[tab] = await run("saveLog", tab, row || null, {
        title: v.title, where: v.where, what: v.what, whenIso: v.when,
        category: v.category, amount: v.amount, done: v.status === "done"
      });
    },
    del: it ? async () => { S[tab] = await run("deleteLog", tab, row); } : null
  });

  // New entry: a future date suggests "Planned" (until you choose a status yourself)
  if (!it) {
    const dateEl = $("#f_when"), stEl = $("#f_status");
    let touched = false;
    stEl.onchange = () => { touched = true; };
    dateEl.oninput = () => { if (!touched) stEl.value = dateEl.value && dateEl.value > todayIso() ? "plan" : "done"; };
  }
}

/* ---------- clicks ---------- */
$("#app").addEventListener("click", async (e) => {
  const el = e.target.closest("[data-a]");
  if (!el || !S) return;
  const a = el.dataset.a, tab = el.dataset.tab, row = Number(el.dataset.row) || 0;
  try {
    if (a === "toggle") {
      const it = S[tab].items.find((i) => i.row === row);
      it.done = !it.done; render();
      S[tab] = await run("setLogDone", tab, row, it.done); render();
    } else if (a === "add" || a === "edit") {
      openEntry(tab, row);
    } else if (a === "chip") {
      filt[tab] = el.dataset.v; render();
    } else if (a === "goto") {
      view = el.dataset.v; render(); window.scrollTo(0, 0);
    }
  } catch (err) {
    if (!locked) toast("That didn’t save. Refreshing from the sheet.");
    load();
  }
});

load();