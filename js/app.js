// ── 頁面控制：論文目錄 → 節 → 步驟；欄位繪製、共用規則、即時產生、記憶 ──
const $ = id => document.getElementById(id);
const blank = s => !s || !String(s).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const KEY = "research-prompts-v3";
let store = { values: {}, rules: {}, sec: "s0-1", step: {} };
try { Object.assign(store, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch {}
// 沿用舊版已填的欄位與規則勾選
try {
  for (const k of ["research-prompts-v2", "research-prompts-v1"]) {
    const old = JSON.parse(localStorage.getItem(k) || "null");
    if (old && !store.migrated) {
      store.values = Object.assign({}, old.values, store.values);
      store.rules = Object.assign({}, old.rules, store.rules);
    }
  }
  if (store.values.st_hyps && !store.values.hy_paths) store.values.hy_paths = store.values.st_hyps;
  store.migrated = true;
} catch {}
if (!ALL_SECS.some(s => s.id === store.sec)) store.sec = "s0-1";
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} };

const sec = () => ALL_SECS.find(s => s.id === store.sec);
const steps = () => stepsOf(sec());
const stepIdx = () => Math.min(store.step[store.sec] || 0, steps().length - 1);
const step = () => steps()[stepIdx()];
const mod = () => DEFS[step().mod];
const ref = s => fillRefs(s || "", sec());

// 欄位值：此步驟固定的值優先，其次是使用者填的，再來是此步驟的預設（preset），最後是模組預設值
// 有 preset 的欄位依節分別記住，不影響其他節
const vkey = id => (step().preset && id in step().preset) ? store.sec + "|" + id : id;
const valuesOf = m => {
  const p = {}, st = step(), fixed = st.fixed || {}, preset = st.preset || {};
  m.fields.forEach(f => {
    p[f.id] = f.id in fixed ? fixed[f.id]
      : store.values[vkey(f.id)] ?? preset[f.id] ?? (Array.isArray(f.value) ? f.value.slice() : f.value ?? "");
  });
  return p;
};
// 步驟自訂規則預設（rules）時，勾選依節分別記住
const ruleKey = (m, p) => (step().rules ? store.sec + "|" : "") + step().mod + (m.variant ? ":" + m.variant(p) : "");
const activeRules = (m, p) => store.rules[ruleKey(m, p)] ?? step().rules ?? m.rules(p);

// 左側目錄
function renderToc() {
  $("toc").innerHTML = OUTLINE.map(c => {
    const open = c.quick || c.secs.some(s => s.id === store.sec);
    return `<details class="${c.quick ? "quick" : ""}" ${open ? "open" : ""}><summary>${esc(c.ch)}</summary>` +
      c.secs.map(s => `<button data-sec="${s.id}" class="${s.id === store.sec ? "on" : ""}"><b>${s.no}</b>${esc(s.title)}</button>`).join("") +
      `</details>`;
  }).join("");
}

// 節標題與步驟
function renderSection() {
  const s = sec(), i = stepIdx();
  const single = steps().length === 1 && !s.no;
  $("sechead").innerHTML = `<h2>${s.no ? `<span class="no">${s.no}</span>` : ""}${esc(s.title)}</h2><p class="hint">${esc(s.desc)}</p>
    <ol class="steps" ${single ? "hidden" : ""}>${steps().map((st, k) =>
      `<li><button data-step="${k}" class="${k === i ? "on" : ""}${st.finish ? " fin" : ""}"><b>${k + 1}</b>${esc(DEFS[st.mod].label)}</button></li>`).join("")}</ol>`;
}

function renderPane() {
  const m = mod(), p = valuesOf(m), fixed = step().fixed || {};
  const fields = m.fields.filter(f => !(f.id in fixed)).map(f => {
    const lab = `<label class="f">${esc(f.label)}${f.hint ? ` <small>${esc(ref(f.hint))}</small>` : ""}</label>`;
    if (f.type === "radio") return lab + `<div class="chips">` + f.options.map(([v, t]) =>
      `<label class="chip"><input type="radio" name="${f.id}" data-f="${f.id}" value="${v}" ${p[f.id] === v ? "checked" : ""}>${esc(t)}</label>`).join("") + `</div>`;
    if (f.type === "checks") return lab + `<div class="chips">` + f.options.map(([v, t, locked]) =>
      `<label class="chip${locked ? " lock" : ""}"><input type="checkbox" data-c="${f.id}" value="${v}" ${locked || p[f.id].includes(v) ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(t)}</label>`).join("") + `</div>`;
    if (f.type === "picker") return lab + `<div class="picker" id="pick-${f.id}"></div>`;
    if (f.type === "textarea") return lab + `<textarea data-f="${f.id}" class="${f.mono ? "mono" : ""}" style="min-height:${(f.rows || 4) * 24}px" placeholder="${esc(f.placeholder || "")}">${esc(p[f.id])}</textarea>`;
    return lab + `<input type="text" data-f="${f.id}" value="${esc(p[f.id])}" placeholder="${esc(f.placeholder || "")}">`;
  }).join("");
  $("pane").innerHTML = `<h3>${sec().no ? `步驟 ${stepIdx() + 1}　` : ""}${esc(m.label)}</h3>
    <p class="target t-${m.target}">${esc(TARGETS[m.target])}</p>
    <p class="stepnote">${esc(ref(step().note))}</p>
    <p class="hint">${esc(ref(m.hint))}</p>${fields}
    ${m.rules ? `<fieldset class="struct"><legend>附加共用規則</legend><div class="chips" id="rules"></div>
      <p class="hint" style="margin:8px 0 0">${step().rules ? "本節預設精簡組合；勾選會依本節分別記住。" : "預設沿用原本的組合；勾選會依模組分別記住。"}</p></fieldset>` : ""}
    <div class="note" id="status"></div>`;
  renderRules();
}

function renderRules() {
  const m = mod(); if (!m.rules) return;
  const p = valuesOf(m), on = activeRules(m, p);
  $("rules").innerHTML = RULES.filter(r => !r.opt || (step().rules || []).includes(r.key)).map(r =>
    `<label class="chip"><input type="checkbox" data-r="${r.key}" ${on.includes(r.key) ? "checked" : ""}>${esc(r.label)}</label>`).join("");
}

// 由其他欄位內容產生的勾選框（例如由變數清單解析出的變數），內容變動時才重畫
function renderPickers(m, p) {
  m.fields.filter(f => f.type === "picker").forEach(f => {
    const box = $("pick-" + f.id); if (!box) return;
    const opts = f.source(p), sig = JSON.stringify(opts), on = p[f.id] || [];
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = opts.length ? f.roles.map(([r, label]) => {
      const vs = opts.filter(o => o.role === r).sort((a, b) => a.extra - b.extra);   // 架構中的變數在前，「未納入架構」在後
      return `<div class="pickrole"><small>${esc(label)}</small><div class="chips">${vs.length ? vs.map(o =>
        `<label class="chip${o.extra ? " extra" : ""}" title="${esc([o.src, o.frames].filter(Boolean).join("｜"))}"><input type="checkbox" data-c="${f.id}" value="${esc(o.key)}" ${on.includes(o.key) ? "checked" : ""}>${esc(o.name)}${o.frames ? ` <small>${esc(o.frames)}</small>` : ""}</label>`).join("")
        : `<small>（無）</small>`}</div></div>`;
    }).join("") : `<p class="hint">（貼上回覆後，這裡會列出可勾選的變數）</p>`;
  });
}

function update() {
  const m = mod(), p = valuesOf(m);
  renderPickers(m, p);
  const R = m.rules ? RULES.filter(r => activeRules(m, p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("") : "";
  const out = m.build(p, R);
  $("out").textContent = out || m.empty || "";
  $("copy").disabled = !out;
  $("copy").textContent = m.copyLabel || "複製 Prompt";
  $("count").textContent = out ? `${out.length.toLocaleString()} 字元` : "";
  $("next").textContent = ref(m.next);
  const st = m.status ? m.status(p) : "";
  $("status").textContent = st;
  $("status").className = "note" + (st && /沒有|過長/.test(st) ? " warn" : "");
  save();
}

function showAll() { renderToc(); renderSection(); renderPane(); update(); }

$("toc").addEventListener("click", e => {
  const b = e.target.closest("button[data-sec]"); if (!b) return;
  store.sec = b.dataset.sec; showAll();
  if (window.innerWidth < 900) $("sechead").scrollIntoView({ behavior: "smooth" });
});
$("sechead").addEventListener("click", e => {
  const b = e.target.closest("button[data-step]"); if (!b) return;
  store.step[store.sec] = +b.dataset.step; renderSection(); renderPane(); update();
});
$("pane").addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.f) {
    store.values[vkey(t.dataset.f)] = t.value;
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
