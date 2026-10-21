// ── 頁面控制：分組／模組切換、欄位繪製、共用規則勾選、即時產生、記憶 ──
const $ = id => document.getElementById(id);
const blank = s => !s || !String(s).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const KEY = "research-prompts-v1";
let state = { group: "write", current: { write: "lr", map: "m5a", deep: "m6a", tools: "m5d" }, values: {}, rules: {} };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

const mod = () => MODULES.find(m => m.id === state.current[state.group]);
const valuesOf = m => {
  const p = {};
  m.fields.forEach(f => { p[f.id] = state.values[f.id] ?? f.value ?? ""; });
  return p;
};
const ruleKey = (m, p) => m.id + (m.variant ? ":" + m.variant(p) : "");
const activeRules = (m, p) => state.rules[ruleKey(m, p)] ?? m.rules(p);

// 分組分頁
function renderGroups() {
  $("groups").innerHTML = GROUPS.map(g =>
    `<button data-g="${g.id}" class="${g.id === state.group ? "on" : ""}">${esc(g.label)}</button>`).join("");
}

// 模組按鈕
function renderModules() {
  $("modules").innerHTML = MODULES.filter(m => m.group === state.group).map(m =>
    `<button data-id="${m.id}" class="${m.id === state.current[state.group] ? "on" : ""}"><b>${m.code}</b>${esc(m.label)}</button>`).join("");
}

// 欄位與規則勾選
function renderPane() {
  const m = mod(), p = valuesOf(m);
  const fields = m.fields.map(f => {
    const lab = `<label class="f">${esc(f.label)}${f.hint ? ` <small>${esc(f.hint)}</small>` : ""}</label>`;
    if (f.type === "radio") return lab + `<div class="chips">` + f.options.map(([v, t]) =>
      `<label class="chip"><input type="radio" name="${f.id}" data-f="${f.id}" value="${v}" ${p[f.id] === v ? "checked" : ""}>${esc(t)}</label>`).join("") + `</div>`;
    if (f.type === "textarea") return lab + `<textarea data-f="${f.id}" class="${f.mono ? "mono" : ""}" style="min-height:${(f.rows || 4) * 24}px" placeholder="${esc(f.placeholder || "")}">${esc(p[f.id])}</textarea>`;
    return lab + `<input type="text" data-f="${f.id}" value="${esc(p[f.id])}" placeholder="${esc(f.placeholder || "")}">`;
  }).join("");
  $("pane").innerHTML = `<h2>[${m.code}] ${esc(m.label)}</h2><p class="hint">${esc(m.hint)}</p>${fields || ""}
    ${m.tool ? "" : `<fieldset class="struct"><legend>附加共用規則</legend><div class="chips" id="rules"></div>
      <p class="hint" style="margin:8px 0 0">預設沿用原本的組合；勾選會依模組分別記住。</p></fieldset>`}
    <div class="note" id="status"></div>`;
  renderRules();
}

function renderRules() {
  const m = mod(); if (m.tool) return;
  const p = valuesOf(m), on = activeRules(m, p);
  $("rules").innerHTML = RULES.map(r =>
    `<label class="chip"><input type="checkbox" data-r="${r.key}" ${on.includes(r.key) ? "checked" : ""}>${esc(r.label)}</label>`).join("");
}

function update() {
  const m = mod(), p = valuesOf(m);
  const R = m.tool ? "" : RULES.filter(r => activeRules(m, p).includes(r.key)).map(r => r.text).join("");
  const out = m.build(p, R);
  $("out").textContent = out || m.empty || "";
  $("copy").disabled = !out;
  $("copy").textContent = m.copyLabel || "複製 Prompt";
  $("count").textContent = out ? `${out.length.toLocaleString()} 字元` : "";
  $("next").textContent = m.next;
  const st = m.status ? m.status(p) : "";
  $("status").textContent = st;
  $("status").className = "note" + (st && /沒有/.test(st) ? " warn" : "");
  save();
}

function showAll() { renderGroups(); renderModules(); renderPane(); update(); }

$("groups").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  state.group = b.dataset.g; showAll();
});
$("modules").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  state.current[state.group] = b.dataset.id; showAll();
});
$("pane").addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.f) {
    state.values[t.dataset.f] = t.value;
    if (t.type === "radio") renderRules();   // 不同選項有各自的規則預設
  } else if (t.dataset.r) {
    const m = mod(), p = valuesOf(m);
    state.rules[ruleKey(m, p)] = [...document.querySelectorAll("#rules input:checked")].map(x => x.dataset.r);
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

if (!MODULES.some(m => m.id === state.current[state.group])) state.group = "write";
showAll();
