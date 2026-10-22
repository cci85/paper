// ── 頁面控制：分組／模組切換、欄位繪製、共用規則勾選、即時產生、記憶 ──
const $ = id => document.getElementById(id);
const blank = s => !s || !String(s).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const PAGE = document.body.dataset.page;
const page = PAGES[PAGE];
const ref = s => fillRefs(s || "", PAGE);

// 欄位值兩頁共用（同一個模組在兩頁出現時內容一致）；分組與模組選擇各頁分開
const KEY = "research-prompts-v2";
let store = { values: {}, rules: {}, pages: {} };
try { Object.assign(store, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
// 沿用舊版（單頁版）已填的欄位與規則勾選
try {
  const old = JSON.parse(localStorage.getItem("research-prompts-v1") || "null");
  if (old && !store.migrated) {
    store.values = Object.assign({}, old.values, store.values);
    store.rules = Object.assign({}, old.rules, store.rules);
    store.migrated = true;
  }
} catch {}
const ps = store.pages[PAGE] = Object.assign(
  { group: page.groups[0].id, current: Object.fromEntries(page.groups.map(g => [g.id, g.mods[0]])) },
  store.pages[PAGE] || {});
if (!page.groups.some(g => g.id === ps.group)) ps.group = page.groups[0].id;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };

const group = () => page.groups.find(g => g.id === ps.group);
const modId = () => { const g = group(); return g.mods.includes(ps.current[g.id]) ? ps.current[g.id] : g.mods[0]; };
const mod = () => DEFS[modId()];
const valuesOf = m => {
  const p = {};
  m.fields.forEach(f => { p[f.id] = store.values[f.id] ?? (Array.isArray(f.value) ? f.value.slice() : f.value ?? ""); });
  return p;
};
const ruleKey = (m, p) => modId() + (m.variant ? ":" + m.variant(p) : "");
const activeRules = (m, p) => store.rules[ruleKey(m, p)] ?? m.rules(p);

function renderGroups() {
  $("groups").innerHTML = page.groups.map(g =>
    `<button data-g="${g.id}" class="${g.id === ps.group ? "on" : ""}">${esc(g.label)}</button>`).join("");
}
function renderModules() {
  $("modules").innerHTML = group().mods.map(id =>
    `<button data-id="${id}" class="${id === modId() ? "on" : ""}"><b>${numberOf(PAGE, id)}</b>${esc(DEFS[id].label)}</button>`).join("");
}

function renderPane() {
  const m = mod(), p = valuesOf(m);
  const fields = m.fields.map(f => {
    const lab = `<label class="f">${esc(f.label)}${f.hint ? ` <small>${esc(ref(f.hint))}</small>` : ""}</label>`;
    if (f.type === "radio") return lab + `<div class="chips">` + f.options.map(([v, t]) =>
      `<label class="chip"><input type="radio" name="${f.id}" data-f="${f.id}" value="${v}" ${p[f.id] === v ? "checked" : ""}>${esc(t)}</label>`).join("") + `</div>`;
    if (f.type === "checks") return lab + `<div class="chips">` + f.options.map(([v, t, locked]) =>
      `<label class="chip${locked ? " lock" : ""}"><input type="checkbox" data-c="${f.id}" value="${v}" ${locked || p[f.id].includes(v) ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(t)}</label>`).join("") + `</div>`;
    if (f.type === "textarea") return lab + `<textarea data-f="${f.id}" class="${f.mono ? "mono" : ""}" style="min-height:${(f.rows || 4) * 24}px" placeholder="${esc(f.placeholder || "")}">${esc(p[f.id])}</textarea>`;
    return lab + `<input type="text" data-f="${f.id}" value="${esc(p[f.id])}" placeholder="${esc(f.placeholder || "")}">`;
  }).join("");
  $("pane").innerHTML = `<h2>[${numberOf(PAGE, modId())}] ${esc(m.label)}</h2>
    <p class="target t-${m.target}">${esc(TARGETS[m.target])}</p>
    <p class="hint">${esc(ref(m.hint))}</p>${fields}
    ${m.rules ? `<fieldset class="struct"><legend>附加共用規則</legend><div class="chips" id="rules"></div>
      <p class="hint" style="margin:8px 0 0">預設沿用原本的組合；勾選會依模組分別記住。</p></fieldset>` : ""}
    <div class="note" id="status"></div>`;
  renderRules();
}

function renderRules() {
  const m = mod(); if (!m.rules) return;
  const p = valuesOf(m), on = activeRules(m, p);
  $("rules").innerHTML = RULES.map(r =>
    `<label class="chip"><input type="checkbox" data-r="${r.key}" ${on.includes(r.key) ? "checked" : ""}>${esc(r.label)}</label>`).join("");
}

function update() {
  const m = mod(), p = valuesOf(m);
  const R = m.rules ? RULES.filter(r => activeRules(m, p).includes(r.key)).map(r => r.text).join("") : "";
  const out = m.build(p, R);
  $("out").textContent = out || m.empty || "";
  $("copy").disabled = !out;
  $("copy").textContent = m.copyLabel || "複製 Prompt";
  $("count").textContent = out ? `${out.length.toLocaleString()} 字元` : "";
  $("next").textContent = ref(m.next);
  const st = m.status ? m.status(p) : "";
  $("status").textContent = st;
  $("status").className = "note" + (st && /沒有/.test(st) ? " warn" : "");
  save();
}

function showAll() { renderGroups(); renderModules(); renderPane(); update(); }

$("groups").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  ps.group = b.dataset.g; showAll();
});
$("modules").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  ps.current[ps.group] = b.dataset.id; showAll();
});
$("pane").addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.f) {
    store.values[t.dataset.f] = t.value;
    if (t.type === "radio") renderRules();   // 不同選項有各自的規則預設
  } else if (t.dataset.c) {
    store.values[t.dataset.c] = [...document.querySelectorAll(`input[data-c="${t.dataset.c}"]:checked`)].map(x => x.value);
  } else if (t.dataset.r) {
    const m = mod(), p = valuesOf(m);
    store.rules[ruleKey(m, p)] = [...document.querySelectorAll("#rules input:checked")].map(x => x.dataset.r);
  }
  update();
});

$("copy").addEventListener("click", async () => {
  const text = $("out").textContent;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  const b = $("copy"), old = b.textContent; b.textContent = "已複製 ✓";
  setTimeout(() => (b.textContent = old), 1500);
});

showAll();
