// ── 頁面控制：論文目錄 → 節 → 步驟；欄位繪製、共用規則、即時產生、記憶 ──
const $ = id => document.getElementById(id);
const blank = s => !s || !String(s).trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const KEY = "research-prompts-v3";
let store = { values: {}, rules: {}, replies: {}, name: "", sec: "s0-1", step: {} };
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
// 2026-11 第零章重整：步驟移到新的節，AI 回覆跟著搬（舊存檔讀入時也會套用）
const REPLY_MOVE = { "s0-1|gapsel": "s0-4|gapsel", "s0-4|lr": "s2-2|lr", "s0-4|astat": "s0-6|astat", "s0-4|asq": "s0-6|asq", "q-final|dr": "q-draft|dr", "s2-3|m8": "q-newlit|m8" };
function migrateReplies(r) {
  if (!r) return r;
  Object.entries(REPLY_MOVE).forEach(([a, b]) => {
    if (a in r) { if (blank(r[b])) r[b] = r[a]; delete r[a]; }
  });
  return r;
}
migrateReplies(store.replies);
if (store.values.gs_mode === "upload") store.values.gs_mode = "source";   // 選定變數改到 NotebookLM
if ((store.layout || 0) < 2) { delete store.step["s0-1"]; delete store.step["s0-4"]; store.layout = 2; }
if ((store.layout || 0) < 3) { delete store.step["s0-5"]; store.layout = 3; }   // 0.3 讀圖併入檢核步驟
if ((store.layout || 0) < 4) {   // 0.2 路線改為 A、B、C；0.3 只保留 0.2 的兩個來源，貼上文字的架構移到路線 C
  delete store.step["s0-4"]; delete store.step["s0-5"];
  const v = store.values;
  if (v.ac_src !== "mix" && v.ac_src !== "own") {
    if (!blank(v.ac_arch) && blank(v.ow_vars) && importArch(v.ac_arch)) { v.ow_imp = v.ac_arch; v.ow_mode = "import"; v.ac_src = "own"; }
    else v.ac_src = "mix";
  }
  store.layout = 4;
}
if ((store.layout || 0) < 6) {   // 「深入了解單一變數」與「區辨相近變數」合併為「了解變數」兩個步驟
  const r = store.replies || {};
  if (r["q-vcomp|vcomp"] && !r["q-var|vcomp"]) { r["q-var|vcomp"] = r["q-vcomp|vcomp"]; delete r["q-vcomp|vcomp"]; }
  if (store.sec === "q-vcomp") { store.sec = "q-var"; store.step["q-var"] = 1; }
  delete store.step["q-vcomp"];
}
if ((store.layout || 0) < 5) {   // 0.2 併成兩步：補充變數清單併入步驟 1，篩選中介與調節併入組合；自行設計移到 0.3
  delete store.step["s0-4"]; delete store.step["s0-5"];
  const v = store.values, r = store.replies || {};
  if (!blank(r["s0-4|asmore"]) && blank(v.as_morereply)) { v.as_morereply = r["s0-4|asmore"]; v.as_more_on = ["on"]; }
  if (!blank(r["s0-4|amech"]) && blank(v.am_reply)) { v.am_reply = r["s0-4|amech"]; v.am_on = ["on"]; }
  store.layout = 5;
}
if ((store.layout || 0) < 6) store.layout = 6;
if ((store.layout || 0) < 7) {   // 常用「核實改寫：補強」「核實改寫：精簡」合併為「核實改寫：補強或精簡」
  if (store.sec === "q-final") { store.sec = "q-draft"; store.values.dr_stage = "final"; }
  delete store.step["q-final"]; store.layout = 7;
}
if ((store.layout || 0) < 8) { if ((store.step || {})["s1-2"]) store.step["s1-2"] = 0; store.layout = 8; }   // 1.2 只保留撰寫步驟
rebuildCh2();   // 第二章各節依「第二章架構」產生
if ((store.layout || 0) < 9) { migrateCh3(); delete store.step["s3-1"]; delete store.step["s3-3"]; store.layout = 9; }   // 3.1 與 3.2 合併；3.2（原 3.3）移除名詞釋義步驟
if (!ALL_SECS.some(s => s.id === store.sec)) store.sec = "s0-1";
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {} if (window.onStoreSave) window.onStoreSave(); };

const sec = () => ALL_SECS.find(s => s.id === store.sec);
const steps = () => stepsOf(sec());
const stepIdx = () => Math.min(store.step[store.sec] || 0, steps().length - 1);
const step = () => steps()[stepIdx()];
const mod = () => DEFS[step().mod];
const ref = s => fillRefs(s || "", sec());
const OUTBOX = document.getElementById("outbox");   // 複製 Prompt 區塊：每次繪製欄位後放回「AI 回覆」上方
const COPY_TO = { nlm: "貼到 NotebookLM", table: "貼到 NotebookLM「資料表」，不是對話框", ai: "貼到一般 AI" };
const replyKey = () => store.sec + "|" + step().mod;   // 每一步的 AI 回覆（存檔用）

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
  const m = mod();
  // seed：欄位空白時，由前面步驟帶入內容（之後由研究者自行修改；清空欄位或按「重新帶入」可再次帶入）
  const sd = m.seed ? m.seed() : {};
  Object.entries(sd).forEach(([k, v]) => { if (blank(store.values[k]) && !blank(v)) store.values[k] = v; });
  if (m.init) m.init();
  let seedShown = false;
  const seedRow = id => {
    if (!m.seed || seedShown || !(id in sd)) return "";
    seedShown = true;
    return `<p class="hint seedrow"><button type="button" id="reseed" data-reseed="top">重新帶入</button> ${esc(m.seedNote)}；按「重新帶入」會清空欄位，改填${esc(m.seedFrom)}的最新內容。<span id="seedmsg"></span></p>`;
  };
  const p = valuesOf(m), fixed = step().fixed || {};
  document.querySelector(".work main").classList.toggle("stack", !!m.stack);
  const fieldHtml = f => {
    const lab = seedRow(f.id) + `<label class="f">${esc(f.label)}${f.hint ? ` <small>${esc(ref(f.hint))}</small>` : ""}</label>`;
    if (f.type === "radio") return lab + `<div class="chips">` + f.options.map(([v, t]) =>
      `<label class="chip"><input type="radio" name="${f.id}" data-f="${f.id}" value="${v}" ${p[f.id] === v ? "checked" : ""}>${esc(t)}</label>`).join("") + `</div>`;
    if (f.type === "checks") return lab + `<div class="chips">` + f.options.map(([v, t, locked]) =>
      `<label class="chip${locked ? " lock" : ""}"><input type="checkbox" data-c="${f.id}" value="${v}" ${locked || p[f.id].includes(v) ? "checked" : ""} ${locked ? "disabled" : ""}>${esc(t)}</label>`).join("") + `</div>`;
    if (f.type === "picker") return lab + `<div class="picker" id="pick-${f.id}"></div>`;
    if (f.type === "diagram") return lab + `<div class="dg-tools">${f.seed ? `<button type="button" data-dg="${f.id}" data-act="reset">依文字重畫</button>` : ""}<button type="button" data-dg="${f.id}" data-act="layout">重新排列</button><button type="button" data-dg="${f.id}" data-act="clear">清除箭頭</button><button type="button" data-dg="${f.id}" data-act="png">下載 PNG</button>${f.tray ? `<button type="button" data-dg="${f.id}" data-act="tray">移到待選區</button>` : ""}</div><div class="diagram" id="diag-${f.id}"></div>${f.tray ? `<div class="dg-tray" id="tray-${f.id}"></div>` : ""}`;
    if (f.type === "button") return `<div class="fbtn"><button type="button" class="copy" data-fbtn="${f.id}">${esc(f.label)}</button>${f.hint ? ` <small class="hint">${esc(f.hint)}</small>` : ""}<div class="note" id="fmsg-${f.id}"></div></div>`;
    if (f.type === "cands") return lab + `<div class="cands" id="cands-${f.id}"></div>`;
    if (f.type === "promptbox") return lab + `<div class="pbox"><button type="button" class="copy pcopy" data-pcopy="${f.id}">${esc(f.copyLabel || "複製")}</button>
      <details><summary>展開 Prompt</summary><pre class="pboxpre" id="pbox-${f.id}"></pre></details></div>`;
    if (f.type === "textarea" && f.reseed) return lab + `<textarea data-f="${f.id}" class="${f.mono ? "mono" : ""}" style="min-height:${(f.rows || 4) * 24}px" placeholder="${esc(f.placeholder || "")}">${esc(p[f.id])}</textarea>` +
      `<p class="hint seedrow"><button type="button" data-reseed="field" data-jump="${esc(f.reseed.jump || "")}">重新帶入</button> ${esc(f.reseed.note || "")}<span class="seedmsg"></span></p>`;
    if (f.type === "textarea") return lab + `<textarea data-f="${f.id}" class="${f.mono ? "mono" : ""}" style="min-height:${(f.rows || 4) * 24}px" placeholder="${esc(f.placeholder || "")}">${esc(p[f.id])}</textarea>`;
    return lab + `<input type="text" data-f="${f.id}" value="${esc(p[f.id])}" placeholder="${esc(f.placeholder || "")}">`;
  };
  // when：依其他欄位決定是否顯示；below：放在「AI 回覆」下方
  const shown = m.fields.filter(f => !(f.id in fixed) && (!f.when || f.when(p)));
  const fields = shown.filter(f => !f.below && !f.afterOut && !f.top).map(fieldHtml).join("");
  const top = shown.filter(f => f.top).map(fieldHtml).join("");   // top：放在步驟說明之前，最醒目的位置
  const afterOut = shown.filter(f => f.afterOut).map(fieldHtml).join("");
  const below = shown.filter(f => f.below).map(fieldHtml).join("");
  const ch2g = /^s2-/.test(store.sec), ch3g = /^s3-/.test(store.sec), gd = (GUIDE_CH1.secs || {})[store.sec] || (ch2g ? GUIDE_CH2.html : ch3g ? GUIDE_CH3.html : "");   // 第一、二、三章各節：可展開的寫作規範
  $("pane").innerHTML = `${gd ? `<details class="guide"><summary>${ch2g ? "第二章寫作規範" : ch3g ? "第三章寫作規範" : "本節寫作規範（第一章）"}　點開查看</summary><div class="guide-body">${gd}</div>
      ${ch2g || ch3g ? "" : `<p><button type="button" data-go="q-ch1g" data-gostep="0">查看第一章完整寫作規範 →</button></p>`}</details>` : ""}${steps().length === 1 && !sec().no ? "" : `<h3>${sec().no ? `步驟 ${stepIdx() + 1}　` : ""}${esc(m.label)}</h3>`}
    <p class="target t-${m.target}">${esc(TARGETS[m.target])}</p>${top ? `<div class="topfield">${top}</div>` : ""}
    <p class="stepnote">${esc(ref(step().note))}</p>
    <p class="hint">${esc(ref(m.hint))}</p>${fields}
    ${m.rules ? `<fieldset class="struct"><legend>附加共用規則</legend><div class="chips" id="rules"></div>
      <p class="hint" style="margin:8px 0 0">${step().rules ? "本節預設精簡組合；勾選會依本節分別記住。" : "預設沿用原本的組合；勾選會依模組分別記住。"}</p></fieldset>` : ""}
    <div class="note" id="status"></div>
    ${afterOut ? `<div id="afterout" class="afterout">${afterOut}</div>` : ""}
    ${m.target === "tool" || m.noReply ? "" : `<fieldset class="struct reply"><legend>AI 回覆</legend>
      <p class="hint" style="margin:0 0 6px">選填；貼上這一步的 AI 回覆，會一併存入研究存檔，不影響上方的 Prompt。</p>
      <textarea data-reply="1" rows="5" placeholder="把 AI 的回覆貼在這裡">${esc((store.replies || {})[replyKey()] || "")}</textarea></fieldset>`}
    ${m.replyView ? `<div id="replyview"></div>` : ""}
    ${below ? `<div class="below">${below}</div>` : ""}
    ${step().after ? `<p class="stepnote after">${esc(ref(step().after))}</p>` : ""}
    ${goNext()}${finBox()}`;
  const rf = $("afterout") || $("pane").querySelector("fieldset.reply");
  rf ? $("pane").insertBefore(OUTBOX, rf) : $("pane").appendChild(OUTBOX);
  renderRules();
}

function renderRules() {
  const m = mod(); if (!m.rules) return;
  const p = valuesOf(m), on = activeRules(m, p);
  $("rules").innerHTML = RULES.filter(r => !r.opt || (step().rules || m.rules(p)).includes(r.key) || on.includes(r.key)).map(r =>
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
        `<label class="chip${o.extra ? " extra" : ""}${o.def ? " hasdef" : ""}" title="${esc([o.src, o.frames].filter(Boolean).join("｜"))}"><input type="checkbox" data-c="${f.id}" value="${esc(o.key)}" ${on.includes(o.key) ? "checked" : ""}><span>${esc(o.name)}${o.frames ? ` <small>${esc(o.frames)}</small>` : ""}${o.def ? `<span class="def">${esc(o.def)}</span>` : ""}</span></label>`).join("")
        : `<small>（無）</small>`}</div></div>`;
    }).join("") : `<p class="hint">（貼上回覆後，這裡會列出可勾選的變數）</p>`;
  });
}

function update() {
  const m = mod(), p = valuesOf(m);
  renderPickers(m, p);
  m.fields.filter(f => f.type === "diagram").forEach(f => renderDiagram(f, p));
  const R = m.rules ? RULES.filter(r => activeRules(m, p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("") : "";
  const out = m.build(p, R);
  $("out").textContent = out || "";
  $("copy").disabled = !out;
  const two = m.fields.some(f => f.afterOut && f.type === "promptbox" && (!f.when || f.when(p)));   // 分兩則送出
  $("copy").textContent = m.copyLabel || `${two ? "① 複製第一則 Prompt" : "複製 Prompt"}（${COPY_TO[m.target] || "貼到 AI"}）`;
  const over = !!out && out.length > 3000 && m.target === "nlm";   // 一般 AI 沒有這個上限
  $("count").textContent = out ? `${out.length.toLocaleString()} 字元` + (over ? "（可能超過 NotebookLM 單次輸入上限）" : "") : (m.empty || "");
  $("count").classList.toggle("over", over);
  $("outd").hidden = !out;
  $("next").textContent = ref(m.next);
  renderReplyView();
  m.fields.filter(f => f.type === "cands").forEach(f => { const el = $("cands-" + f.id); if (el) el.innerHTML = f.render(p); });
  m.fields.filter(f => f.type === "promptbox").forEach(f => {
    const el = $("pbox-" + f.id); if (!el) return;
    const t = f.build(p), btn = document.querySelector(`button[data-pcopy="${f.id}"]`);
    el.textContent = t || f.empty || "";
    if (btn) btn.disabled = !t;
  });
  // 帶入來源已有不同內容時提醒（短欄位列出來源的內容）
  let sdiff = "";
  if (m.seed) {
    const sd = m.seed(), F = Object.fromEntries(m.fields.map(f => [f.id, f]));
    const diff = Object.keys(sd).filter(k => !(m.seedQuiet || []).includes(k) && !blank(sd[k]) && sd[k].trim() !== String(p[k] || "").trim());
    if (diff.length) sdiff = `請確認：${m.seedFrom}與這裡的${diff.map(k => "「" + F[k].label + "」").join("、")}不同，要採用${m.seedFrom}的版本，請按「重新帶入」。` +
      diff.filter(k => F[k].type !== "textarea").map(k => `\n${m.seedFrom}的${F[k].label}：${sd[k]}`).join("");
  }
  const st = [sdiff, m.status ? m.status(p) : ""].filter(Boolean).join("\n");
  $("status").textContent = st;
  $("status").className = "note" + (st && /沒有|過長|請確認/.test(st) ? " warn" : "");
  save();
}

// 換節或換步驟時，Prompt 收合（本頁處理的工具步驟則展開，結果就是要看的內容）
const foldOut = () => { $("outd").open = mod().target === "tool"; };
// 貼上 AI 回覆後的整理檢視（例如依角色列出變數定義與衡量）
function renderReplyView() {
  const m = mod(), el = $("replyview"); if (!m.replyView || !el) return;
  el.innerHTML = m.replyView(deLatex((store.replies || {})[replyKey()] || ""));
}
function showAll() { rebuildCh2(); migrateCh3(); if (!ALL_SECS.some(s => s.id === store.sec)) store.sec = "s2-0"; renderToc(); renderSection(); renderPane(); foldOut(); update(); }

// 每一步最下方的「建議下一步」：可直接跳到目標節與步驟
function goNext() {
  const go = step().go; if (!go || !go.length) return "";
  return `<div class="gonext"><b>建議下一步</b>` + go.map(g => {
    const s = ALL_SECS.find(x => x.id === g.to); if (!s) return "";
    const st = stepsOf(s)[g.step || 0], label = `${s.no ? s.no + " " : ""}${s.title}${stepsOf(s).length > 1 ? `・步驟 ${(g.step || 0) + 1}「${DEFS[st.mod].label}」` : ""}`;
    return `<div class="go"><button type="button" data-go="${g.to}" data-gostep="${g.step || 0}">前往 ${esc(label)} →</button>${g.when ? `<small>${esc(g.when)}</small>` : ""}</div>`;
  }).join("") + `</div>`;
}
$("pane").addEventListener("click", e => {
  const b = e.target.closest("button[data-go]"); if (!b) return;
  store.sec = b.dataset.go; store.step[store.sec] = +b.dataset.gostep; showAll();
  $("sechead").scrollIntoView({ behavior: "smooth" });
});

$("toc").addEventListener("click", e => {
  const b = e.target.closest("button[data-sec]"); if (!b) return;
  store.sec = b.dataset.sec; showAll();
  if (window.innerWidth < 900) $("sechead").scrollIntoView({ behavior: "smooth" });
});
$("sechead").addEventListener("click", e => {
  const td = e.target.closest("button[data-todr]");
  if (td) { store.values.dr_sec = td.dataset.todr; store.sec = "q-draft"; store.step["q-draft"] = 0; save(); showAll(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  const b = e.target.closest("button[data-step]"); if (!b) return;
  store.step[store.sec] = +b.dataset.step; renderSection(); renderPane(); foldOut(); update();
});
// 本節定稿直接修改：整節是一個可編輯的區塊；每次修改依區塊內的段落重組文字，離開時重新排版
function finFromView(v) {
  const out = [];
  v.childNodes.forEach(n => {
    const txt = (n.nodeType === 3 ? n.textContent : n.innerText || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim(); if (!txt) return;
    out.push(n.nodeType === 1 && n.tagName === "H4" ? "#### " + txt.replace(/\s*\n\s*/g, " ") : txt);
  });
  return out.join("\n\n");
}
$("pane").addEventListener("focusout", e => {
  if (!(e.target.dataset && e.target.dataset.fall)) return;
  const v = $("finview"); if (v) v.innerHTML = finHtml(finText(store.sec));
});
$("pane").addEventListener("paste", e => {   // 貼上時只保留純文字
  if (!(e.target.closest && e.target.closest("[data-fall]"))) return;
  e.preventDefault(); document.execCommand("insertText", false, (e.clipboardData || window.clipboardData).getData("text/plain"));
});
$("pane").addEventListener("input", e => {
  const t = e.target;
  if (t.dataset.sved) {   // 問卷預覽：直接修改題項（不重畫，避免游標跳走）
    const e = (store.values.sv_edit ||= {}), txt = t.textContent.trim();
    if (txt === t.dataset.orig) delete e[t.dataset.sved]; else e[t.dataset.sved] = { orig: t.dataset.orig, text: txt };
    t.closest(".sv-item").classList.toggle("edited", txt !== t.dataset.orig); save(); return;
  }
  if (t.dataset.svnote) {   // 修改意見：同步下方彙整清單，不重畫
    (store.values.sv_fix ||= {})[t.dataset.svnote] = t.value; save();
    t.classList.toggle("filled", !blank(t.value));
    const box = $("svfixbox"); if (box) box.innerHTML = svFixBox(parseSurvey(svReply()));
    return;
  }
  if (t.dataset.bppick) {   // 背景與動機的寫法：勾選 → 組成「選定的寫法」
    const os = bpOptions(deLatex((store.replies || {})[replyKey()] || ""));
    const picked = [...document.querySelectorAll("input[data-bppick]:checked")].map(x => os[+x.dataset.bppick]).filter(Boolean);
    store.values.bp_pick = picked.map(o => o.title);
    const gapPat = (mdSection(deLatex((store.replies || {})[replyKey()] || ""), ["缺口句型"]) || "").split("\n").slice(1).join("\n").trim();
    store.values.bg_plan = picked.map(o => `${o.title}\n${o.text}`).join("\n\n") + (picked.length && gapPat ? "\n\n【參考的缺口句型】\n" + gapPat : "");
    save(); t.closest(".bp-opt").classList.toggle("on", t.checked);
    return;
  }
  if (t.dataset.poedit) {   // 逐句修改建議：使用者自己的修改句
    const x = poParse((store.replies || {})[replyKey()] || "")[+t.dataset.poedit];
    if (x) { (store.values.po_edit ||= {})[store.sec + "|" + x.from] = t.value; save(); }
    return;
  }
  if (t.dataset.ref) {   // 參考文獻：逐筆核對或填入
    (store.values.refs ||= {})[t.dataset.ref] = t.value; save();
    const item = t.closest(".ref-item"); if (item) item.className = "ref-item " + (blank(t.value) ? "miss" : "ok");
    $("out").textContent = refList().join("\n"); $("copy").disabled = !refList().length;
    return;
  }
  if (t.dataset && t.dataset.fall) { setFin(store.sec, finFromView(t)); save(); return; }   // 本節定稿：直接在呈現頁面修改
  if (t.dataset.finref) {   // 本節定稿：貼上 AI 整理的參考文獻 → 自動配對
    (store.values.rf_paste ||= {})[t.dataset.finref] = t.value; save();
    const c = $("finrefcount"); if (c) c.innerHTML = finRefCount(sec());
    return;
  }
  if (t.dataset.fin) {   // 本節定稿：直接修改文字
    setFin(t.dataset.fin, t.value); save();
    const v = $("finview"); if (v) v.innerHTML = finHtml(t.value);
    return;
  }
  if (t.dataset.tbfill) {   // 待補資料查證：只存值，不重畫（保留游標）
    (store.values.tb_fill ||= {})[t.dataset.tbfill] = t.value; save();
    t.classList.toggle("filled", !blank(t.value));
    const items = tbItems(), fill = store.values.tb_fill, c = $("tbcount");
    if (c) c.textContent = `已填 ${items.filter(x => !blank(fill[x.key])).length}／${items.length} 項`;
    $("out").textContent = tbText(); $("copy").disabled = !tbText();
    return;
  }
  if (t.dataset.reply) {
    (store.replies ||= {})[replyKey()] = t.value; save(); renderReplyView();
    const fb = $("finbox"); if (fb) { const open = fb.open; fb.outerHTML = finBox(); const nb = $("finbox"); if (nb) nb.open = open; }   // 撰寫步驟貼上回覆後，定稿立即更新
    return;
  }
  if (t.dataset.f) {
    store.values[vkey(t.dataset.f)] = t.value;
    if (t.dataset.f === "ch2_plan" || t.dataset.f === "hy_paths") { rebuildCh2(); renderToc(); }   // 第二章分節即時更新目錄
    if (t.type === "radio") {
      if (mod().fields.some(f => f.when)) { renderPane(); }   // 有條件顯示的欄位時，重畫欄位
      else renderRules();   // 不同選項有各自的規則預設
    }
  } else if (t.dataset.c) {
    store.values[t.dataset.c] = [...document.querySelectorAll(`input[data-c="${t.dataset.c}"]:checked`)].map(x => x.value);
    const f = mod().fields.find(x => x.id === t.dataset.c);
    if (f && f.type === "checks" && mod().fields.some(x => x.when)) { renderPane(); }   // 勾選會決定其他欄位是否顯示時，重畫欄位
  } else if (t.dataset.r) {
    const m = mod(), p = valuesOf(m);
    store.rules[ruleKey(m, p)] = [...document.querySelectorAll("#rules input:checked")].map(x => x.dataset.r);
  }
  update();
});

$("pane").addEventListener("click", async e => {
  if (e.target.closest("button[data-adopt]")) {   // 0.3：採用 AI 修正後的架構
    adoptRevised(); save(); renderPane(); update();
    $("pane").scrollIntoView({ behavior: "smooth" }); return;
  }
  const pa = e.target.closest("button[data-poadopt], button[data-poundo]");
  if (pa) { if (pa.dataset.poundo) poUndo(+pa.dataset.poundo); else poAdopt(+pa.dataset.poadopt); save(); renderReplyView(); const fv = $("finview"); if (fv) fv.innerHTML = finHtml(finText(store.sec)); const ta = document.querySelector("textarea[data-fin]"); if (ta) ta.value = finText(store.sec); return; }
  const rp = e.target.closest("button[data-refpick]");   // 同年多筆：選定一筆，去掉年份字母
  if (rp) { const r = refRows().find(x => x.key === rp.dataset.refpick), a = r && r.alts[+rp.dataset.i];
    if (a) { (store.values.refs ||= {})[r.key] = refNoLetter(a, r.year); save(); update(); } return; }
  const rd = e.target.closest("button[data-refdel]");
  if (rd) { delete (store.values.refs || {})[rd.dataset.refdel]; save(); renderPane(); update(); return; }
  if (e.target.closest("button[data-drhl]")) {   // 修訂論文：用反白的文字（還沒反白時，展開並捲到「本節論文內容」）
    if (!FIN_SEL.trim()) { const fb = $("finbox"); if (fb) { fb.open = true; fb.scrollIntoView({ behavior: "smooth", block: "start" }); } return; }
    drUseSel(FIN_SEL); return;
  }
  if (e.target.closest("button[data-gowhole]")) {   // 定稿提醒：前往本節的修訂論文，改寫方向設為整節統整
    const k = steps().findIndex(x => x.mod === "dr"); if (k < 0) return;
    store.step[store.sec] = k; store.values.dr_stage = "whole"; store.values.dr_text_sid = store.sec;
    save(); renderSection(); renderPane(); foldOut(); update(); window.scrollTo({ top: 0, behavior: "smooth" }); return;
  }
  const fb2 = e.target.closest("button[data-finedit], button[data-finreset], button[data-drrep]");
  if (fb2) {   // 本節定稿：修改文字／重新帶入；段落核實改寫：以改寫結果取代
    if (fb2.dataset.finedit) { const ta = document.querySelector("textarea[data-fin]"); ta.hidden = !ta.hidden; fb2.textContent = ta.hidden ? "修改文字" : "完成修改"; if (!ta.hidden) ta.focus(); return; }
    if (fb2.dataset.finreset) { if (!confirm("以撰寫步驟目前的 AI 回覆重新產生本節定稿？在這裡修改過或取代過的內容會被覆蓋。")) return; delete (store.values.fin || {})[store.sec]; }
    if (fb2.dataset.drrep) drReplace(fb2.dataset.drrep);
    save(); renderPane(); update(); if (fb2.dataset.drrep) { const fbx = $("finbox"); if (fbx) { fbx.open = true; fbx.scrollIntoView({ behavior: "smooth", block: "start" }); } }
    return;
  }
  const dp = e.target.closest("button[data-drpick], button[data-drdone], button[data-drsel], button[data-drall]");
  if (dp) {   // 段落核實改寫：選段落、標記完成、選取要融合的段落
    const ps = drParas();
    if (dp.dataset.drall) {   // 全選：補強／精簡帶入全部段落；融合時全部加入
      if (store.values.dr_stage === "merge") {
        store.values.dr_sel = ps.map(x => x.key);
        store.values.dr_text = ps.map((x, j) => `【段落${"一二三四五六七八九十"[j] || j + 1}】${x.head ? "（" + x.head + "）" : ""}\n${x.text}`).join("\n\n");
      } else store.values.dr_text = ps.map(x => x.text).join("\n\n");
      save(); renderPane(); update(); const ta = document.querySelector('textarea[data-f="dr_text"]'); if (ta) ta.scrollIntoView({ behavior: "smooth", block: "center" }); return;
    }
    if (dp.dataset.drsel) {
      const k = ps[+dp.dataset.drsel].key, sel = (store.values.dr_sel ||= []);
      store.values.dr_sel = sel.includes(k) ? sel.filter(x => x !== k) : [...sel, k];
      const chosen = ps.filter(x => store.values.dr_sel.includes(x.key));
      store.values.dr_text = chosen.map((x, j) => `【段落${"一二三四五六七八九十"[j] || j + 1}】${x.head ? "（" + x.head + "）" : ""}\n${x.text}`).join("\n\n");
      save(); renderPane(); update(); return;
    }
    if (dp.dataset.drpick) { store.values.dr_text = ps[+dp.dataset.drpick].text; save(); renderPane(); update(); const ta = document.querySelector('textarea[data-f="dr_text"]'); if (ta) ta.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    const k = ps[+dp.dataset.drdone].key, d = (store.values.dr_done ||= {}); if (d[k]) delete d[k]; else d[k] = true;
    save(); update(); return;
  }
  const cb = e.target.closest("button[data-cand]");
  if (cb) {   // 候選架構：選定
    const f = mod().fields.find(x => x.type === "cands"); f.choose(+cb.dataset.cand);
    save(); renderPane(); update();
    const fin = $("diag-fin_diag"); if (fin) fin.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const fb = e.target.closest("button[data-fbtn]");
  if (fb) {   // 欄位中的動作按鈕（例如匯入到圖上）
    const m = mod(), f = m.fields.find(x => x.id === fb.dataset.fbtn), msg = f.run(valuesOf(m));
    save(); renderPane(); update();
    const el = $("fmsg-" + f.id); if (el) { el.textContent = msg || ""; el.className = "note" + (/沒有|無法/.test(msg) ? " warn" : ""); }
    return;
  }
  if (e.target.closest("button[data-findedup]")) {   // 本節定稿：刪除所有完全相同的重複段落
    const before = finBlocks(finText(store.sec)).length;
    if (!confirm("清除重複段落：每組重複只保留最後面（最新）的那一段。確定嗎？（之後可按「復原清除重複前的內容」）")) return;
    (store.values.fin_undo ||= {})[store.sec] = finText(store.sec); setFin(store.sec, finDedupLatest(finText(store.sec))); alert(`已刪除 ${before - finBlocks(finText(store.sec)).length} 段重複的段落。`);
    save(); renderPane(); update(); const fbx = $("finbox"); if (fbx) fbx.open = true; return;
  }
  if (e.target.closest("button[data-finundo]")) {
    const u = (store.values.fin_undo || {})[store.sec]; if (u) { setFin(store.sec, u); delete store.values.fin_undo[store.sec]; }
    save(); renderPane(); update(); const fbx = $("finbox"); if (fbx) fbx.open = true; return;
  }
  const fd = e.target.closest("button[data-findel]");
  if (fd) {   // 本節定稿：刪除重複的段落
    const bs = finBlocks(finText(store.sec)); bs.splice(+fd.dataset.findel, 1); setFin(store.sec, bs.join("\n\n")); save(); renderPane(); update();
    const fbx = $("finbox"); if (fbx) fbx.open = true; return;
  }
  const ff = e.target.closest("button[data-drfollow]");
  if (ff) {   // 修訂論文：只有追問回覆時，複製接續修訂 Prompt
    const old = ff.textContent;
    try { await navigator.clipboard.writeText(DR_FOLLOW); } catch {
      const ta = document.createElement("textarea"); ta.value = DR_FOLLOW; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    ff.textContent = "已複製 ✓"; setTimeout(() => (ff.textContent = old), 1500); return;
  }
  const fr = e.target.closest("button[data-finrefcopy]");
  if (fr) {   // 本節定稿：複製查找文獻 Prompt
    const it = refFillItems(fr.dataset.finrefcopy), text = it ? T.ref_fill({ items: it }) : "", old = fr.textContent;
    if (!text) { fr.textContent = "本節的參考文獻已齊全"; setTimeout(() => (fr.textContent = old), 1500); return; }
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    fr.textContent = "已複製 ✓"; setTimeout(() => (fr.textContent = old), 1500); return;
  }
  const pc = e.target.closest("button[data-pcopy]");
  if (pc) {   // 欄位中的第二個 Prompt（例如讀圖 Prompt）
    const text = $("pbox-" + pc.dataset.pcopy).textContent, old = pc.textContent;
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    pc.textContent = "已複製 ✓"; setTimeout(() => (pc.textContent = old), 1500); return;
  }
  const sb = e.target.closest("button[data-svclear], button[data-svver], button[data-svrestore], button[data-svcopy], button[data-svfixcopy], button[data-svnotecopy]");
  if (sb) {   // 問卷預覽的按鈕
    let focusKey = "";
    if (sb.dataset.svclear === "*") { if (!confirm("清除全部修改意見？")) return; store.values.sv_fix = {}; }
    else if (sb.dataset.svclear) delete (store.values.sv_fix || {})[sb.dataset.svclear];
    if (sb.dataset.svver) store.values.sv_ver = sb.dataset.svver;
    if (sb.dataset.svrestore) delete (store.values.sv_edit || {})[sb.dataset.svrestore];
    if (sb.dataset.svcopy || sb.dataset.svfixcopy || sb.dataset.svnotecopy) {
      const text = sb.dataset.svcopy ? svText() : sb.dataset.svfixcopy ? svFixPrompt(+sb.dataset.svfixcopy) : svNotesText();
      try { await navigator.clipboard.writeText(text); } catch {
        const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      }
      const old = sb.textContent; sb.textContent = "已複製 ✓"; setTimeout(() => (sb.textContent = old), 1500); return;
    }
    save(); renderReplyView();
    if (focusKey) { const inp = [...document.querySelectorAll("input.sv-note")].find(x => x.dataset.svnote === focusKey); if (inp) inp.focus(); }
    return;
  }
  const ct = e.target.closest("button[data-copytext]");
  if (ct) {   // 複製單一文字（例如 Scholar Labs 問句）
    const text = ct.dataset.copytext;
    try { await navigator.clipboard.writeText(text); } catch {
      const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    ct.textContent = "已複製 ✓"; setTimeout(() => (ct.textContent = "複製"), 1500); return;
  }
  const rs = e.target.closest("button[data-reseed]");
  if (rs) {   // 重新帶入（欄位上方，或欄位下方的第二顆按鈕）
    const sd = mod().seed(), got = Object.entries(sd).filter(([, v]) => !blank(v));
    const msg = rs.parentElement.querySelector(".seedmsg, #seedmsg");
    if (!got.length) { if (msg) msg.textContent = `　${mod().seedFrom}目前是空的：請先到該步驟，把 AI 的回覆貼到最下方的「AI 回覆」欄位。`; return; }
    got.forEach(([k, v]) => { store.values[k] = v; });
    const jump = rs.dataset.reseed !== "top" && rs.dataset.jump;
    renderPane(); update();
    const el = jump && $(jump); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  const b = e.target.closest("button[data-dg]"); if (!b) return;
  const f = mod().fields.find(x => x.id === b.dataset.dg);
  if (f) diagramAction(f, b.dataset.act, b.dataset.key);
});

$("copy").addEventListener("click", async () => {
  const text = $("out").textContent;
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  const b = $("copy"), old = b.textContent, to = COPY_TO[mod().target];
  b.textContent = to ? `已複製 ✓ 請${to}` : "已複製 ✓";
  setTimeout(() => (b.textContent = old), 1500);
  const second = document.querySelector("#afterout .pbox");   // 分兩則：提醒第二則
  if (second) { second.classList.remove("attn"); void second.offsetWidth; second.classList.add("attn"); }
});

showAll();
$("outd").addEventListener("toggle", () => {
  $("outd").querySelector("summary").textContent = $("outd").open ? "收合 Prompt" : "展開 Prompt";
});

// 網站更新提示：定期（與切回分頁時）讀取最新的 index.html，比對程式版本；不同時顯示提示，按下即載入新版
(() => {
  const ver = (document.querySelector('script[src*="js/app.js"]') || {}).src?.match(/v=(\w+)/)?.[1];
  if (!ver) return;
  let last = 0;
  const check = async () => {
    if (Date.now() - last < 60000) return; last = Date.now();
    try {
      const t = await (await fetch(location.pathname + "?nv=" + Date.now(), { cache: "no-store" })).text();
      const nv = t.match(/js\/app\.js\?v=(\w+)/)?.[1];
      if (nv && nv !== ver) $("newver").hidden = false;
    } catch {}
  };
  setInterval(check, 5 * 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  window.addEventListener("focus", check);
  $("newverbtn").addEventListener("click", async () => {
    try { if (window.flushSave) await window.flushSave(); } catch {}
    location.href = location.pathname + "?r=" + Date.now();
  });
})();

// 記住「本節論文內容」中最後一次反白的文字（按按鈕時選取可能已消失）；反白時在旁邊浮出「用這段修改」
let FIN_SEL = "";
const drStepIdx = () => steps().findIndex(x => x.mod === "dr");
function drUseSel(sel) {   // 反白的文字帶入本節「修訂論文」步驟的「論文段落」
  const x = finFind(finText(store.sec), sel);
  if (!x) { alert("在本節定稿中找不到反白的文字（可能選到了定稿以外的內容），請只在「本節論文內容」裡反白。"); return; }
  const k = drStepIdx(); if (k < 0) return;
  store.step[store.sec] = k; Object.assign(store.values, { dr_text: x, dr_ask: "", dr_sel: [], dr_text_sid: store.sec }); FIN_SEL = ""; hlBtn.style.display = "none";
  if (getSelection()) getSelection().removeAllRanges();
  save(); renderSection(); renderPane(); foldOut(); update();
  const ta = document.querySelector('textarea[data-f="dr_text"]'); if (ta) ta.scrollIntoView({ behavior: "smooth", block: "center" });
}
const hlBtn = Object.assign(document.createElement("button"), { type: "button", className: "copy hl-float", textContent: "用這段修改" });
hlBtn.style.cssText = "display:none;position:absolute;z-index:50;padding:4px 10px;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,.25)";
hlBtn.addEventListener("mousedown", e => { e.preventDefault(); if (FIN_SEL.trim()) drUseSel(FIN_SEL); });   // mousedown：避免點按鈕時選取先消失
document.body.appendChild(hlBtn);
document.addEventListener("selectionchange", () => {
  const g = getSelection(), v = $("finview");
  if (!g || !g.rangeCount || g.isCollapsed || !v || !v.contains(g.anchorNode) || !v.contains(g.focusNode) || !g.toString().trim()) { hlBtn.style.display = "none"; return; }
  FIN_SEL = g.toString();
  if (drStepIdx() < 0) return;   // 本節沒有「修訂論文」步驟
  const r = g.getRangeAt(0).getBoundingClientRect();
  hlBtn.style.left = Math.max(8, r.right + scrollX - 90) + "px"; hlBtn.style.top = (r.bottom + scrollY + 6) + "px"; hlBtn.style.display = "";
});
