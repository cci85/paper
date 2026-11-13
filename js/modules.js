// ── 共用規則（可在每個模組勾選；舊模組的預設值沿用原本 PowerShell 版的組合） ──
const RULES = [
  { key: "citation", label: "引用格式規範", text: T.citation },
  { key: "evidence", label: "實證結果與引用分散", text: T.evidence },
  { key: "style", label: "文字風格規範", text: T.style },
  { key: "verify", label: "完成後自我核對", text: T.verify },
  { key: "journal", label: "期刊寫作規範", text: T.journal },
  // opt：只在步驟預設有列入時才顯示
  { key: "support", label: "文獻支持程度總結", text: T.support, opt: true },
  { key: "ch1", label: "第一章寫作規範", opt: true,
    text: () => "\n\n[第一章寫作規範]\n本段屬於論文第一章緒論，請遵守以下規範；與其他規則衝突時，以本規範為準：\n" + GUIDE_CH1.ai },
  { key: "ch2", label: "第二章寫作規範", opt: true,
    text: () => "\n\n[第二章寫作規範]\n本段屬於論文第二章文獻探討，請遵守以下規範；與其他規則衝突時，以本規範為準：\n" + GUIDE_CH2.ai },
  { key: "ch3", label: "第三章寫作規範", opt: true,
    text: () => "\n\n[第三章寫作規範]\n本段屬於論文第三章研究方法，請遵守以下規範；與其他規則衝突時，以本規範為準：\n" + ch3Rules() }
];
// 3.3 研究對象與抽樣分計畫書版與完整論文版；計畫書版改用預定語氣（只影響 3.3，含其修訂論文步驟）
const SP_STAGE0 = "full";
const spPlan = () => store.sec === "s3-4" && (store.values.sp_stage || SP_STAGE0) === "plan";
const CH3_PLAN_TONE = "7. 本節為論文計畫書版本：尚未執行的程序以預定語氣陳述（例如「本研究預計……」「問卷預定於……期間發放」）；已完成的程序（例如已完成的前測）以已完成語氣陳述；不得寫出發放、回收與有效問卷份數等尚未發生的結果。";
// ── 3.3 研究對象與抽樣：勾選項目 → 交給 AI 的文字；最低樣本數與份數核對由網頁計算 ──
const SP_M = [["conv", "便利抽樣"], ["purp", "立意抽樣"], ["snow", "滾雪球抽樣"], ["quota", "配額抽樣"], ["srs", "簡單隨機抽樣"], ["strat", "分層隨機抽樣"], ["other", "其他"]];
const SP_CH = [["fb", "Facebook 社團"], ["ptt", "PTT"], ["dcard", "Dcard"], ["line", "LINE 群組"], ["ig", "Instagram"], ["other", "其他"]];
const SP_EX = [["screen", "篩選題"], ["attn", "注意力檢查題"], ["fast", "作答時間過短"], ["straight", "連續相同作答"], ["rev", "反向題前後矛盾"], ["dup", "重複填答"], ["incomplete", "未完成作答"], ["other", "其他"]];
const SP_ETH = [["intro", "首頁說明研究目的、填答時間與自願參與"], ["consent", "詳閱說明並勾選知情同意選項後，方能進入填答頁面"], ["quit", "完全自願，填答過程中可隨時中止或退出"], ["noid", "不蒐集可識別身分的資料"], ["sep", "抽獎聯絡資料與問卷答案分開保存"], ["acad", "資料僅供學術研究使用，並受到保密處理"], ["irb", "通過研究倫理審查"]];
const spCtx = () => ((store.values.as_ctx || "").replace(/[（(].*$/, "").trim().replace(/(.{2,})購物$/, "$1") || "研究情境");   // 「蝦皮購物」→「蝦皮」，避免「在蝦皮購物購物」
const spLab = (opts, keys) => (keys || []).filter(k => k !== "other").map(k => (opts.find(o => o[0] === k) || [])[1]).filter(Boolean);
const spNum = x => { const n = parseFloat(String(x || "").replace(/[^\d.]/g, "")); return isFinite(n) ? n : NaN; };
function spK() {   // 研究架構中，指向同一個變數的預測變數最多幾個（調節：加調節變數與交互作用項）
  try {
    const { vars, d } = finalArch(), nm = k => ((vars.find(x => x.key === k) || {}).name || k).replace(/\s*[（(][^（）()]*[）)]\s*$/, ""), pr = {};
    d.edges.forEach(e => (pr[e.to] ||= new Set()).add(e.from));
    d.mods.forEach(m => { const to = String(m.edge).split(">")[1]; if (!to) return; (pr[to] ||= new Set()).add(m.from); pr[to].add("×" + m.from + m.edge); });
    let best = null; Object.entries(pr).forEach(([to, s]) => { if (!best || s.size > best.k) best = { k: s.size, to: nm(to) }; });
    return best;
  } catch (e) { return null; }
}
function spSize(p) {   // { k, auto, n, text }
  const a = spK(), kIn = parseInt(p.sp_k, 10), k = kIn > 0 ? kIn : a ? a.k : 0, auto = !(kIn > 0) && !!a;
  if (p.sp_sz === "gp") {
    const f2 = +p.sp_f2, al = +p.sp_alpha, pw = +p.sp_pw, n = k ? gpN(f2, al, pw, k) : null;
    return { k, auto, a, n, text: k ? `以 G*Power 進行事前檢定力分析，檢定類型為多元迴歸 F 檢定（固定模型，R² 異於 0），效果量 f² = ${p.sp_f2}、顯著水準 α = ${p.sp_alpha}、檢定力 ${p.sp_pw}、預測變數 ${k} 個${auto ? `（研究架構中預測變數最多的依變數為${a.to}）` : ""}，最低樣本數為 ${n} 份（已由網頁依 G*Power 相同算法計算）` : "以 G*Power 進行事前檢定力分析【待補：預測變數個數】" };
  }
  if (p.sp_sz === "ten") return { k, auto, a, n: k ? k * 10 : null, text: k ? `依十倍法則，研究架構中指向同一變數的最大路徑數為 ${k}，最低樣本數為 ${k * 10} 份` : "依十倍法則【待補：最大路徑數】" };
  return { k, auto, a, n: null, text: "" };
}
function spSizeView(p) {
  if (p.sp_sz === "other") return "";
  const s = spSize(p);
  if (!s.k) return `<p class="note warn">找不到研究架構，無法自動計算預測變數個數，請在上方填入。</p>`;
  return `<p class="note">最低樣本數：<b>${s.n} 份</b>（預測變數 ${s.k} 個${s.auto ? `，依研究架構自動計算：${esc(s.a.to)}有 ${s.k} 個預測變數` : ""}${p.sp_sz === "gp" ? `；f² = ${esc(p.sp_f2)}、α = ${esc(p.sp_alpha)}、檢定力 ${esc(p.sp_pw)}` : "；十倍法則"}）</p>`;
}
function spCount(p) {   // 回收 − 排除 = 有效 的核對
  const n2 = spNum(p.sp_n2), n3 = spNum(p.sp_n3), xs = (p.sp_ex || []).map(k => [k, spNum(p["sp_xn_" + k])]).filter(([, n]) => n > 0);
  const ex = xs.reduce((a, [, n]) => a + n, 0) + (spNum(p.sp_excl) > 0 ? spNum(p.sp_excl) : 0);
  return { n2, n3, ex, ok: n2 > 0 && n3 > 0 && ex > 0 ? n2 - ex === n3 : null };
}
function spCountView(p) {
  const c = spCount(p); if (c.ok === null) return "";
  return c.ok ? `<p class="note">份數核對：回收 ${c.n2} − 排除 ${c.ex} = 有效 ${c.n3}，一致。</p>`
    : `<p class="note warn">份數核對：回收 ${c.n2} − 排除 ${c.ex} = ${c.n2 - c.ex}，與有效問卷 ${c.n3} 份不一致，請檢查各項排除份數。</p>`;
}
function spVals() { const p = {}; DEFS.sample.fields.forEach(f => { p[f.id] = store.values[f.id] ?? (Array.isArray(f.value) ? f.value.slice() : f.value ?? ""); }); return p; }   // 3.3 的欄位值（在其他節使用）
function spCompose(p) {   // 勾選與補充欄位 → 與舊版相同的文字欄位，交給 T.sample
  const j = a => a.filter(x => !blank(x)).join("；"), plan = p.sp_stage === "plan";
  const m = spLab(SP_M, p.sp_m), sz = spSize(p), ch = spLab(SP_CH, p.sp_ch);
  const cm = { web: "網路問卷", paper: "紙本問卷", both: "網路問卷與紙本問卷並行" }[p.sp_cm] || "";
  const plat = p.sp_cm !== "paper" ? ({ gf: "Google 表單", sc: "SurveyCake", qx: "Qualtrics" }[p.sp_plat] || "") : "";
  const per = !blank(p.sp_from) || !blank(p.sp_to) ? `${(p.sp_from || "").trim() || "【待補：起始時間】"}至${(p.sp_to || "").trim() || "【待補：結束時間】"}` : "";
  const bs = p.sp_bs === "last" ? `請受訪者回想最近一次在${spCtx()}購物的經驗作答` : p.sp_bs === "usual" ? "請受訪者依平時的使用經驗作答" : "";
  const exT = { screen: p.sp_ex_screen ? `以篩選題確認受訪者資格（${p.sp_ex_screen.trim()}）` : "以篩選題確認受訪者資格【待補：篩選條件】",
    attn: p.sp_ex_attn ? `設置注意力檢查題（${p.sp_ex_attn.trim()}），答錯者剔除` : "設置注意力檢查題，答錯者剔除", fast: p.sp_ex_fast ? `剔除作答時間過短（${p.sp_ex_fast.trim()}）者` : "剔除作答時間過短者【待補：時間門檻】",
    straight: "剔除連續相同作答者", rev: "剔除反向題前後矛盾者", dup: "剔除重複填答者", incomplete: "剔除未完成作答者" };
  const eth = spLab(SP_ETH, p.sp_eth).map(t => t === "通過研究倫理審查" ? `通過研究倫理審查${blank(p.sp_irb) ? "【待補：審查單位與核准編號】" : `（${p.sp_irb.trim()}）`}` : t);
  const inc = p.sp_inc === "lottery" ? `填答誘因為抽獎${blank(p.sp_inc_txt) ? "" : `（${p.sp_inc_txt.trim()}）`}，須留下聯絡方式，因此文中應寫「資料保密」而非「匿名」` : p.sp_inc === "gift" ? `填答誘因為每人贈禮${blank(p.sp_inc_txt) ? "" : `（${p.sp_inc_txt.trim()}）`}` : p.sp_inc === "none" ? "無填答誘因" : "";
  const xs = (p.sp_ex || []).map(k => [k, spNum(p["sp_xn_" + k])]).filter(([, n]) => n > 0), c = spCount(p);
  return {
    sp_method: j([m.join("、"), p.sp_method]),
    sp_size: j([sz.text, p.sp_size]),
    sp_collect: j([cm && `${cm}${plat ? `（${plat}）` : ""}`, ch.length ? `透過${ch.join("、")}發放` : "", per && `蒐集期間為${per}`, p.sp_collect]),
    sp_basis: j([bs, p.sp_basis]),
    sp_screen: j([...(p.sp_ex || []).filter(k => exT[k]).map(k => exT[k]), p.sp_screen]),
    sp_ethics: j([...eth, inc, p.sp_ethics]),
    sp_excl: plan ? "" : j([xs.map(([k, n]) => `${(SP_EX.find(o => o[0] === k) || [])[1]} ${n} 份`).join("、"), p.sp_excl,
      c.ok === true ? `排除合計 ${c.ex} 份；回收 ${c.n2} 份扣除排除 ${c.ex} 份，即為有效問卷 ${c.n3} 份（已由網頁核對）` : c.ok === false ? `【網頁核對：回收 ${c.n2} 份扣除排除 ${c.ex} 份為 ${c.n2 - c.ex} 份，與有效問卷 ${c.n3} 份不一致，請研究者確認】` : ""]),
    sp_minn: sz.n
  };
}
function ch3Rules() {   // 3.3 只附與本節有關的條目（1 定位、2 理由、4 只寫做過的事、7 語氣），並重新編號
  const ai = spPlan() ? GUIDE_CH3.ai.replace(/^7\. .*$/m, CH3_PLAN_TONE) : GUIDE_CH3.ai;
  if (store.sec !== "s3-4") return ai;
  return ai.split("\n").filter(l => /^(1|2|4|7)\. /.test(l)).map((l, i) => l.replace(/^\d+\. /, `${i + 1}. `)).join("\n");
}
const inCh1 = () => /^s1-/.test(store.sec || "");

// 共用規則中的引用格式（欄位內第二個 Prompt 使用）
const citeText = () => { const r = RULES.find(x => x.key === "citation"); return typeof r.text === "function" ? r.text({}) : r.text; };
const isOn = v => Array.isArray(v) && v.includes("on");
// 研究類型（全站開關，左側目錄上方）：construct＝構念導向（問卷調查、實驗設計）；model＝模型導向（panel data）
const RT = () => (typeof store !== "undefined" && store.values && store.values.rtype === "model") ? "model" : "construct";
// 取回覆中某個「## 標題」到下一個一、二級標題之間的內容
function mdSec(text, head) {
  const L = String(text || "").replace(/\*\*/g, "").split(/\r?\n/), i = L.findIndex(l => new RegExp("^#{2,3}\\s*" + head).test(l.trim()));
  if (i < 0) return "";
  const out = []; for (let k = i + 1; k < L.length && !/^#{1,2}\s/.test(L[k].trim()); k++) out.push(L[k]);
  return out.join("\n").trim();
}
// panel data：研究模型組（已選定或已採用的 → 0.2 回覆的建議）
function modelText() {
  const v = ((typeof store !== "undefined" && store.values.pm_final) || "").trim(); if (v) return v;
  const r = (typeof store !== "undefined" && store.replies) || {};
  return pipeLines(mdSec(r["s0-4|pmodel"], "選定模型組"));   // 0.3 的修正後模型組要按「採用」才會取代
}
// 只保留「角色｜名稱｜…」的行，避免帶入回覆中其他段落
const pipeLines = t => String(t || "").split(/\r?\n/).map(l => l.replace(/^[\s\-*•]+/, "").trim()).filter(l => /｜|\|/.test(l) && !/^[-|｜:\s]+$/.test(l)).join("\n");
// panel data：0.2 步驟 2 回覆中的候選模型（### 模型 A：名稱），以及 AI 建議的角色與目的
const PM_ROLES = ["主要模型", "比較模型", "穩健性模型"];
const pmNorm = t => String(t || "").replace(/[\s\-–—－‐_・·]+/g, "").toLowerCase();
// 模型名稱比對：中文名稱或括號內英文名稱相同或互相包含即視為同一模型（例如「組內－組間」與「組內組間分離」、加註 / Mundlak Specification）
const pmEn = t => pmNorm((String(t).match(/[（(]([^（）()]*[A-Za-z][^（）()]*)[）)]/) || [, ""])[1]).split("/")[0];
const pmZh = t => pmNorm(String(t).replace(/[（(][^（）()]*[）)]/g, "")).replace(/模型$/, "");
function pmScore(a, b) {   // 3：中文或英文名稱相同；1：互相包含；0：不同
  const ea = pmEn(a), eb = pmEn(b), za = pmZh(a), zb = pmZh(b);
  if ((ea.length > 3 && ea === eb) || (za.length > 1 && za === zb)) return 3;
  return pmSame(a, b) ? 1 : 0;
}
// 兩組模型一對一配對：先配名稱相同者，再配互相包含者
function pmPair(A, B) {
  const cand = []; A.forEach((a, i) => B.forEach((b, j) => { const sc = pmScore(a[1] || "", b[1] || ""); if (sc) cand.push([sc, i, j]); }));
  cand.sort((x, y) => y[0] - x[0]);
  const ua = new Map(), ub = new Set();
  cand.forEach(([, i, j]) => { if (!ua.has(i) && !ub.has(j)) { ua.set(i, j); ub.add(j); } });
  const out = A.map((a, i) => [a, ua.has(i) ? B[ua.get(i)] : null]);
  B.forEach((b, j) => { if (!ub.has(j)) out.push([null, b]); });
  return out;
}
function pmSame(a, b) {
  const ea = pmEn(a), eb = pmEn(b), za = pmZh(a), zb = pmZh(b);
  if (ea.length > 3 && eb.length > 3 && (ea === eb || ea.includes(eb) || eb.includes(ea))) return true;
  if (za.length > 1 && (za === zb || (za.length > 3 && zb.includes(za)) || (zb.length > 3 && za.includes(zb)))) return true;
  return false;
}
function pmParse() {
  const r = String(((typeof store !== "undefined" && store.replies) || {})["s0-4|pmodel"] || "").replace(/\*\*/g, "");
  const L = r.split(/\r?\n/), models = [];
  let cur = null;
  L.forEach(l => {
    const m = l.trim().match(/^#{2,4}\s*模型\s*([A-Za-zＡ-Ｚ0-9０-９一二三四五六七八九十]+)\s*[：:]\s*(.+)$/);
    if (m) { cur = { id: m[1], name: m[2].trim(), body: [] }; models.push(cur); return; }
    if (/^#{1,3}\s/.test(l.trim()) && !/^#{4}/.test(l.trim())) { cur = null; return; }   // 下一個大節（比較策略等）
    if (cur) cur.body.push(l);
  });
  const sug = pipeLines(mdSec(r, "選定模型組")).split("\n").filter(Boolean).map(l => l.split(/[｜|]/).map(x => x.trim()));
  const same = pmSame;
  models.forEach(m => {
    m.body = m.body.join("\n").trim();
    const s = sug.find(x => x[1] && same(x[1], m.name));
    m.sugRole = s && PM_ROLES.includes(s[0]) ? s[0] : "";
    const q = (m.body.match(/回答的問題[：:]\s*(.+)/) || [, ""])[1];
    m.purpose = (s && s[2]) || q.replace(/[。；].*$/, "").slice(0, 60);
    m.key = pmNorm(m.name);
  });
  return models;
}
const pmRole = m => { const r = (store.values.pm_roles || {})[m.key]; return r === undefined ? m.sugRole : r; };
function pmApply() {   // 依各模型的角色重寫「選定的研究模型組」
  const ms = pmParse(), rows = [];
  PM_ROLES.forEach(r => ms.filter(m => pmRole(m) === r).forEach(m => rows.push(`${r}｜${m.name}｜${m.purpose}`)));
  store.values.pm_final = rows.join("\n"); store.values.pm_src = "0.2 選擇模型";
}
function pmView() {
  const ms = pmParse();
  if (!ms.length) return `<p class="hint">（上方「AI 回覆」貼上後，這裡會列出「### 模型 A：……」形式的候選模型）</p>`;
  return ms.map((m, i) => { const r = pmRole(m);
    return `<div class="cand${r ? " on" : ""}"><div class="cand-head"><b>模型 ${esc(m.id)}：${esc(m.name)}</b>${m.sugRole ? `<small class="hint">AI 建議：${esc(m.sugRole)}</small>` : ""}</div>
      <div class="chips">${[...PM_ROLES, ""].map(v => `<label class="chip"><input type="radio" name="pmr${i}" data-pmrole="${esc(m.key)}" value="${esc(v)}" ${r === v ? "checked" : ""}>${v || "不採用"}</label>`).join("")}</div>
      ${m.purpose ? `<p class="hint" style="margin:6px 0 0">目的：${esc(m.purpose)}</p>` : ""}
      <details><summary>看模型說明</summary><div class="cand-reason">${esc(m.body)}</div></details></div>`; }).join("");
}
// 0.3 panel data：回覆貼上後，自動把 AI 建議的模型組帶入「研究模型組」（帶入前的版本保留在 pm_prev，可復原）
function mchkLatest(text) { return pipeLines(mdSec(text, "建議的研究模型組")) || pipeLines(mdSec(text, "修正後的模型組")); }
function mchkAuto(text) {
  const rows = mchkLatest(text); if (!rows) return "";
  const v = store.values, sig = pmNorm(rows);
  if (v.pm_auto_sig === sig) return "";
  const cur = (v.pm_final || "").trim() || pipeLines(mdSec((store.replies || {})["s0-4|pmodel"], "選定模型組"));
  if (!(v.pm_auto_sig && v.pm_prev != null && pmNorm(cur) === v.pm_auto_sig)) v.pm_prev = cur;   // 目前是上一次自動帶入的版本時，保留更早的原始版本
  v.pm_auto_sig = sig;
  const src = pipeLines(mdSec(text, "建議的研究模型組")) ? "0.3「比較兩版並建議」回覆中的建議模型組" : "0.3 檢核回覆中的修正後模型組";
  if (pmNorm(cur) === sig) return "AI 建議的模型組與目前相同，研究模型組維持不變。";
  v.pm_final = rows; v.pm_src = src;
  return "已把 AI 建議的模型組帶入最上方的「研究模型組」；不同意時，按對照表下方的「復原為帶入前的模型組」。";
}
// 「研究模型組」目前內容的來源（顯示在 0.3 狀態列）
function pmSrc() {
  const v = store.values, cur = pmNorm(v.pm_final);
  if (v.pm_prev != null && cur === pmNorm(v.pm_prev) && v.pm_auto_sig && cur !== v.pm_auto_sig) return "帶入 AI 建議之前的版本（已復原）";
  if (v.pm_src && v.pm_src !== "0.2 選擇模型" && cur === v.pm_auto_sig) return v.pm_src;
  if (v.pm_src === "0.2 選擇模型") { const ms = pmParse(), rows = []; PM_ROLES.forEach(r => ms.filter(m => pmRole(m) === r).forEach(m => rows.push(`${r}｜${m.name}｜${m.purpose}`)));
    if (pmNorm(rows.join("\n")) === cur) return "0.2 步驟 2 選擇模型的結果（尚未經 0.3 檢核）"; }
  return "自行填寫或修改的版本";
}
// 0.3 panel data：對照帶入前與 AI 建議的模型組
function mchkView(text) {
  if (blank(text)) return "";
  const fin = pipeLines(mdSec(text, "建議的研究模型組")), sec = fin || mdSec(text, "修正後的模型組");
  const lab = fin ? "③ 比較兩版後建議的模型組" : "回覆中的修正後模型組";
  if (!sec) {
    const t2 = T.pd_check2();
    return `<div class="needbox second"><b>第二則尚未送出</b>：回覆中還沒有「## 修正後的模型組」。請在同一個 NotebookLM 對話送出第二則，再把回覆接在上方「AI 回覆」的最後。
      <p><button type="button" class="copy" data-copytext="${esc(t2)}">② 複製第二則 Prompt</button></p></div>`;
  }
  const auto = store.values.pm_auto_sig === pmNorm(pipeLines(sec)) && store.values.pm_prev != null;
  const cur = auto ? store.values.pm_prev : (store.values.pm_final || "").trim() || pipeLines(mdSec((store.replies || {})["s0-4|pmodel"], "選定模型組"));
  const rows = t => pipeLines(t).split("\n").filter(Boolean).map(l => l.split(/[｜|]/).map(x => x.trim()));
  const A = rows(cur), B = rows(sec);
  const notes = sec.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/[｜|]/.test(l) && !/^(#|-{3,}|修正之處)/.test(l)).map(l => l.replace(/^[-*•\d.、\s]+/, "")).filter(Boolean);
  const none = notes.some(l => /^無需修正/.test(l));
  const cell = (r, o, add) => { if (!r) return `<td class="hint">（無）</td>`;
    const tag = !o ? `<b class="mk-new">${add ? "新增" : "移除"}</b> ` : o[0] !== r[0] ? `<b class="mk-chg">角色改變</b> ` : "";
    return `<td>${tag}<b>${esc(r[0])}</b>｜${esc(r[1] || "")}${r[2] ? `<br><small>${esc(r[2])}</small>` : ""}</td>`; };
  const pair = pmPair(A, B);
  const diff = pair.some(([a, b]) => !a || !b || a[0] !== b[0]);
  return mdBox(text, "閱讀整理後的檢核回覆", false) + `<div class="sview mchkv"><h3>修正前後對照</h3>${none ? `<p class="note">AI 判斷<b>無需修正</b>，不必採用。</p>` : ""}
    <table class="mtbl"><thead><tr><th>${auto ? "帶入前的研究模型組" : "目前的研究模型組"}</th><th>${lab}</th></tr></thead><tbody>${pair.map(([a, b]) => `<tr>${cell(a, b, false)}${cell(b, a, true)}</tr>`).join("")}</tbody></table>
    ${notes.filter(l => !/^無需修正/.test(l)).length ? `<p class="f"><b>修正之處與理由</b></p><ul>${notes.filter(l => !/^無需修正/.test(l)).map(l => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
    ${diff ? `<div class="needbox"><b>不知道該選哪一版？</b>依下列順序判斷：
      <ol><li><b>主要模型</b>：哪一個能直接回答你的研究問題（估計你要的效果）？兩版主要模型若都能回答，選假設較少、能保留較多樣本者。</li>
      <li><b>比較模型</b>：只保留「和主要模型只差一項設定、而且這個差異能證明某個設定有必要」的模型；比較後說不出意義的就不要放。</li>
      <li><b>穩健性模型</b>：只放能回應上方檢核中具體疑慮的模型；資料條件不足（例如缺少必要的落後期）或你使用的軟體做不到的，改列為研究限制。</li></ol>
      還是無法決定時，複製下方 Prompt，在同一個 NotebookLM 對話請 AI 逐一比較兩版的差異並給建議；回覆貼到下方「③『比較兩版並建議』的 AI 回覆」欄，其中的「建議的研究模型組」會自動帶入最上方的「研究模型組」。
      <p><button type="button" class="copy" data-copytext="${esc(T.pd_decide({ cur: A.map(r => r.join("｜")).join("\n"), rev: B.map(r => r.join("｜")).join("\n") }) + citeText())}">③ 複製「比較兩版並建議」Prompt</button></p></div>` : ""}
    ${auto ? (pmNorm(store.values.pm_final) === store.values.pm_auto_sig
      ? `<p class="note">右欄已自動帶入最上方的「研究模型組」，後續步驟會使用它；也可以直接在那裡修改，混合兩版。${diff ? ` <button type="button" data-pmrestore="1">復原為帶入前的模型組</button>` : ""}</p>`
      : `<p class="note">最上方的「研究模型組」目前不是右欄的版本（已復原或已自行修改），後續步驟會使用最上方的內容。</p>`) : ""}</div>`;
}
// 0.2 panel data 填寫輔助：把一般 AI 的回覆拆成各欄位
function pfFill(text) {
  const t = String(text || "").replace(/\*\*/g, ""); if (blank(t)) return "沒有內容可帶入，請先貼上 AI 回覆。";
  const KEYS = [["as_ctx", "研究情境"], ["as_con", "研究問題"], ["pd_unit", "觀察單位"], ["pd_time", "時間單位與觀察期間"], ["pd_fields", "現有資料欄位"], ["feat", "資料特性"], ["goal", "研究目標"]];
  const got = {}; let cur = null;
  t.split(/\r?\n/).forEach(l => {
    if (/^#{1,3}\s/.test(l.trim())) { cur = null; return; }
    const k = KEYS.find(([, n]) => new RegExp("^\\s*" + n + "\\s*[：:]").test(l));
    if (k) { cur = k[0]; got[cur] = l.replace(/^[^：:]*[：:]\s*/, "").trim(); return; }
    if (cur === "pd_fields" && l.trim()) got.pd_fields += (got.pd_fields ? "\n" : "") + l.trim();
  });
  const ok = v => v && !/^無法判斷/.test(v);
  const v = store.values, done = [];
  KEYS.slice(0, 5).forEach(([id, n]) => { if (ok(got[id])) { v[id] = got[id]; done.push(n); } });
  if (got.feat) { const f = PD_FEAT.map(x => x[0]).filter(k => new RegExp("\\b" + k + "\\b").test(got.feat)); v.pd_feat = f; done.push(`資料特性（${f.length} 項）`); }
  if (got.goal) { const g = ["exp", "pred"].filter(k => new RegExp("\\b" + k + "\\b").test(got.goal)); if (g.length) { v.pd_goal = g; done.push("研究目標"); } }
  if (!done.length) return "沒有讀到「研究情境：」「觀察單位：」等項目，請確認貼上的是填寫輔助 Prompt 的回覆。";
  const ask = mdSec(t, "需要我確認之處");
  return `已帶入：${done.join("、")}。請逐欄核對。` + (ask && !/^無$/.test(ask) ? `\n需要確認之處：\n${ask}` : "");
}
// panel data：0.2 步驟 1 回覆中的變數清單
const pdVarAI = () => pipeLines(mdSec(((typeof store !== "undefined" && store.replies) || {})["s0-4|pdata"], "變數清單"));
const pdVarText = () => ((typeof store !== "undefined" && store.values.pd_vars) || "").trim() || pdVarAI();   // 研究變數：以自行確認的清單為準，留白時用 0.2 回覆的變數清單
// 0.2 步驟 1：回覆貼上後，把「變數清單」帶入「研究變數」（研究變數留白或仍是上次帶入的內容時才帶入）
function pdataAuto(text) {
  const rows = pipeLines(mdSec(text, "變數清單")); if (!rows) return "";
  const v = store.values, cur = (v.pd_vars || "").trim();
  if (cur && pmNorm(cur) !== v.pd_vars_sig) return "";
  if (pmNorm(rows) === pmNorm(cur)) return "";
  v.pd_vars = rows; v.pd_vars_sig = pmNorm(rows);
  return "已把回覆中的「變數清單」帶入下方「研究變數」；請核對，後續步驟以「研究變數」為準。";
}
// 簡易 Markdown 檢視：標題、表格、條列、粗體、分隔線（用來閱讀 AI 回覆）
function mdInline(t) { return esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>"); }
function mdView(text) {
  const L = String(text || "").replace(/\r/g, "").split("\n"), out = []; let i = 0, para = [];
  const flush = () => { if (para.length) { out.push(`<p>${para.map(mdInline).join("<br>")}</p>`); para = []; } };
  while (i < L.length) {
    const l = L[i], t = l.trim();
    if (!t) { flush(); i++; continue; }
    if (/^-{3,}$/.test(t)) { flush(); out.push("<hr>"); i++; continue; }
    const h = t.match(/^(#{1,4})\s+(.*)$/); if (h) { flush(); const n = Math.min(h[1].length + 1, 5); out.push(`<h${n}>${mdInline(h[2])}</h${n}>`); i++; continue; }
    if (/^\|.*\|$/.test(t)) { flush(); const rows = []; while (i < L.length && /^\|.*\|$/.test(L[i].trim())) { rows.push(L[i].trim()); i++; }
      const cells = r => r.slice(1, -1).split("|").map(c => c.trim()), body = rows.filter(r => !/^\|[\s:|-]+\|$/.test(r));
      out.push(`<table class="mtbl">${body.map((r, k) => `<tr>${cells(r).map(c => k ? `<td>${mdInline(c)}</td>` : `<th>${mdInline(c)}</th>`).join("")}</tr>`).join("")}</table>`); continue; }
    if (/^([-*•]|\d+[.、)])\s+/.test(t)) { flush(); const ord = /^\d/.test(t), items = [];
      while (i < L.length && (/^\s*([-*•]|\d+[.、)])\s+/.test(L[i]) || (L[i].trim() && /^\s{2,}/.test(L[i]) && items.length))) {
        const x = L[i].trim(); if (/^([-*•]|\d+[.、)])\s+/.test(x)) items.push(x.replace(/^([-*•]|\d+[.、)])\s+/, "")); else items[items.length - 1] += "\n" + x; i++; }
      out.push(`<${ord ? "ol" : "ul"}>${items.map(x => `<li>${x.split("\n").map(mdInline).join("<br>")}</li>`).join("")}</${ord ? "ol" : "ul"}>`); continue; }
    para.push(t); i++;
  }
  flush();
  return out.join("");
}
const mdBox = (text, title, open) => blank(text) ? "" : `<details class="sview mdv"${open ? " open" : ""}><summary>${esc(title)}</summary>${mdView(text)}</details>`;
// 0.2 步驟 3：候選變數（0.2 資料缺口中可取得者、0.4 可再考慮的變數），每行「名稱：取得方式」
function pdCandText() {
  const r = (typeof store !== "undefined" && store.replies) || {}, out = [], seen = new Set();
  const add = (n, how) => { const k = pmNorm(String(n).replace(/[（(].*$/, "")); if (!n || seen.has(k)) return; seen.add(k); out.push(how ? `${n}：${how}` : n); };
  pipeLines(mdSec(r["s0-4|pdata"], "資料缺口")).split("\n").filter(Boolean).forEach(l => { const c = l.split(/[｜|]/).map(x => x.trim()); if (!/無法取得/.test(c[1] || "")) add(c[0], c[1]); });
  pipeLines(mdSec(r["s0-6|pdict"], "可再考慮的變數")).split("\n").filter(Boolean).forEach(l => { const c = l.split(/[｜|]/).map(x => x.trim()); add(c[1], c[2]); });
  return out.join("\n");
}
// 資料處理的輸出欄名（不含衍生變數），供 0.4 衍生變數計算規格限定來源欄
function dpOutCols() {
  const d = (typeof store !== "undefined" && store.values.dp_sum) || {};
  const a = d.base || String(d.fields || "").split(/\r?\n/).map(l => l.split("：")[0].trim()).filter(Boolean);
  return a.join("、");
}
// 0.4 資料字典：回覆中的「可再考慮的變數」可逐一加入研究變數
function pdictView(text) {
  if (blank(text)) return "";
  const noDv = !/^#{2,3}\s*衍生變數計算規格/m.test(String(text).replace(/\*\*/g, ""));
  const extra = pipeLines(mdSec(text, "可再考慮的變數")).split("\n").filter(Boolean).map(l => l.split(/[｜|]/).map(x => x.trim()));
  const have = pmNorm(pdVarText());
  const box = extra.length ? `<div class="needbox"><b>可再考慮的變數</b>：文獻常用、現有欄位做得出來、但研究變數尚未納入。按「加入」會寫進上方「研究變數」；加入自變數或調節變數時，研究假說與模型組也要一併考慮（可回 0.3 用「追問」確認）。想先查證文獻支持與資料來源時，到 0.2 步驟 3「候選變數的文獻檢索」，這些變數會自動帶入。
    <table class="mtbl"><tr><th>角色</th><th>變數</th><th>建構方式</th><th>納入理由</th><th></th></tr>${extra.map((r, k) => { const inV = have.includes(pmNorm((r[1] || "").replace(/[（(].*$/, "")));
      return `<tr><td>${esc(r[0] || "")}</td><td>${esc(r[1] || "")}</td><td>${esc(r[2] || "")}</td><td>${esc(r.slice(3).join("｜"))}</td><td>${inV ? "<small>已在研究變數</small>" : `<button type="button" data-addvar="${esc([r[0], r[1], r[2], r[4] || r[3] || ""].join("｜"))}">加入</button>`}</td></tr>`; }).join("")}</table></div>` : "";
  const dv = noDv ? `<div class="note warn">回覆中還沒有「衍生變數計算規格」：請在同一個對話送出下方的「補問 Prompt」，再把回覆接在「AI 回覆」原有內容的最後。</div>` : "";
  return dv + box + mdBox(text, "閱讀整理後的回覆（資料字典、分析樣本、檢查清單、衍生變數計算規格）", true);
}
const pdVals = () => { const v = store.values; return { ctx: (v.as_ctx || "").trim(), con: (v.as_con || "").trim(), unit: (v.pd_unit || "").trim(), time: (v.pd_time || "").trim(),
  fields: (v.pd_fields || "").trim(), feat: v.pd_feat || [], goal: v.pd_goal || ["exp", "pred"], vars: pdVarText() }; };

// 貼到哪裡
const TARGETS = {
  nlm: "貼到 NotebookLM 對話",
  table: "貼到 NotebookLM「資料表」的自訂指示，不是對話框",
  ai: "貼到一般 AI 對話（Claude、ChatGPT、Gemini），不是 NotebookLM",
  tool: "在本頁直接處理，不需貼到 AI"
};

// 說明文字中的{#id}會換成本頁編號，{@id} 會換成另一頁的「頁名 [編號]」
const DEFS = {
  // ─── 前置探索 ───
  focus: {
    label: "研究方向聚焦", target: "ai",
    hint: "給尚未讀過文獻的研究生：以選擇題逐步把生活觀察收斂成研究問題，並產生中英文關鍵字與檢索字串。下方欄位全部選填；都不填時輸出原文，由 AI 從第一個問題開始問。",
    fields: [
      { id: "f_phen", type: "textarea", label: "感興趣的現象或研究方向", hint: "選填", rows: 2, placeholder: "例如：為什麼有些人願意排隊買網紅商品" },
      { id: "f_dir", type: "text", label: "想要的研究方向", hint: "選填", placeholder: "例如：價格對購買的影響、指導教授建議的方向" },
      { id: "f_res", type: "text", label: "可運用的資源", hint: "選填", placeholder: "例如：可取得的樣本、合作企業、熟悉的理論或方法" },
      { id: "f_prev", type: "textarea", label: "前次的研究問題草稿與檢索字串", hint: "在新視窗接續時才需要；填了會直接從第三節開始", rows: 3 }
    ],
    build: p => buildFocus(p),
    next: "下一步：貼到一般 AI 的新對話，依提問逐題作答；檢索到的文獻存進 Zotero 後，上傳到 NotebookLM，接著用{#matrix}。"
  },
  matrix: {
    label: "建立文獻比較表", target: "table",
    hint: "把筆記本中每一篇文獻整理成一列，作為後續分析的底稿。內容量大，請放在 NotebookLM 的「資料表」功能，不要貼在對話框，以免輸出被截斷。",
    fields: [{ id: "mx_cols", type: "checks", label: "要整理的欄位", hint: "「文獻」欄固定保留",
      get options() { return MATRIX_COLS.filter(c => !c.rt || RT() === "model").map(c => [c.key, c.label, c.locked || !!c.rt]); },
      value: MATRIX_COLS.filter(c => !c.rt).map(c => c.key) }],
    build: p => buildMatrix(p.mx_cols),
    next: "下一步：在已上傳文獻的 NotebookLM 開啟「資料表」，把這段 Prompt 貼進自訂指示（不是對話框）。完成後匯出成試算表，全選複製，貼到下方「AI 回覆」保存。"
  },
  gapsel: {
    label: "選定變數與研究缺口", target: "nlm",
    hint: "以文獻比較表作為索引，以選擇題逐步選出依變數與其他變數，再推薦 key paper、列出研究缺口候選，最後產出研究架構草案。判斷與引用回到全文查證，表格與全文不一致時以全文為準。",
    fields: [
      { id: "gs_mode", type: "radio", label: "表格怎麼給 NotebookLM", options: [["source", "已加入為來源（建議）"], ["paste", "貼在對話中"]], value: "source" },
      { id: "gs_table", type: "textarea", label: "表格內容", hint: "選「貼在對話中」時才需要；從試算表複製即可。留空時，沿用「建立文獻比較表」那一步貼在 AI 回覆的表格", rows: 6, mono: true, when: p => p.gs_mode === "paste" }
    ],
    build: p => buildGapsel(p),
    empty: "（請貼上表格內容，或改選「已加入為來源」）",
    status: p => p.gs_mode === "paste" && blank(p.gs_table) && matrixReply() ? "表格內容留空：已沿用「建立文獻比較表」那一步貼上的表格。" : "",
    next: "下一步：在已上傳文獻的同一個 NotebookLM，把{#matrix}的表格全選複製，以「新增來源 → 複製的文字」加入，再從來源右側的選單重新命名為「00_文獻比較表（索引）」（選「貼在對話中」則不需要）；再把這段 Prompt 貼到對話，依提問逐步選擇。\n執行後要回答 3 次選擇，每次回答後 AI 才會進入下一步：\n① 步驟一：從 5–8 個依變數選項中，選 1 或 2 個最想解釋的結果。\n② 步驟二：從 A 組（已與依變數一起檢驗過）與 B 組（尚未一起檢驗過）中，複選 1–3 個其他變數（填編號，例如 V2、V5）。\n③ 步驟三之後：從研究缺口候選中選一個，或提出自己的變數組合，AI 才會產出步驟四的研究架構草案。\n步驟四的「## 變數」與「## 路徑」兩節，可直接貼到{#archchk}的研究架構欄位，網頁會自動畫出架構圖。"
  },
  m5a: {
    label: "主題地圖・理論・方法", target: "nlm",
    hint: "先把整批文獻上傳到同一個 Notebook 並開新對話。這一輪只做主題地圖、理論框架與研究方法趨勢盤點。",
    fields: [{ id: "m5a_kw", type: "text", label: "搜尋這批文獻時用的關鍵字", hint: "可留空；可貼上{#focus}產生的檢索字串", placeholder: "例如：品牌人格、自我一致性" }],
    rules: () => [],
    build: (p, R) => T.m5a({ sourceDesc: blank(p.m5a_kw) ? "這批上傳的文獻" : `這批用關鍵字「${p.m5a_kw}」搜尋到的文獻` }) + R,
    next: "下一步：貼到 NotebookLM 新對話；回覆完成後切到{#m5b}，在同一個對話接續貼上（不要開新對話）。"
  },
  m5b: {
    label: "變數結構化與關係圖", target: "nlm",
    hint: "接在{#m5a}同一個對話，不需要重貼文獻。關係圖採用與{#m7a}相同的規則：每個主題群各畫一張。",
    fields: [], rules: () => [],
    build: (p, R) => T.m5b({}) + R,
    next: "下一步：回到{#m5a}那個對話貼上。回覆整段貼到下方「AI 回覆」，研究存檔會自動補好關係圖的圍籬，用 Obsidian 等支援 Mermaid 的檢視器開啟就能看到圖；接著切到{#m5c}。"
  },
  m5c: {
    label: "研究缺口與主題建議", target: "nlm",
    hint: "接在{#m5a}、{#m5b}同一個對話。",
    fields: [], rules: () => [],
    build: (p, R) => T.m5c({}) + R,
    next: "下一步：回到同一個 NotebookLM 對話貼上（不要開新對話）。"
  },

  // ─── 論文撰寫：第一、二章 ───
  lr: {
    label: "文獻回顧", target: "nlm",
    hint: "由研究主題或具體問題出發，AI 先展開成學術問題，再整合上傳文獻撰寫回顧並自我驗證引用。",
    fields: [
      { id: "lr_start", type: "radio", label: "從哪裡出發", options: [["topic", "研究主題"], ["question", "具體問題"]], value: "topic" },
      { id: "lr_text", type: "text", label: "研究主題或問題", placeholder: "主題例：科技接受度模型；問題例：中介變數 C 在 A 與 B 之間的角色為何？" }
    ],
    variant: p => p.lr_start,
    rules: () => ["citation", "evidence", "style", "verify"],
    build: (p, R) => blank(p.lr_text) ? "" : (p.lr_start === "question" ? T.lr_question({ question: p.lr_text }) : T.lr_topic({ topic: p.lr_text })) + R,
    empty: "（請輸入研究主題或問題）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  m6a: {
    label: "主題群展開", target: "nlm",
    hint: "把單一主題群的表格式摘要（例如{#m5a}整理出的其中一群，或文獻比較表中同群的幾列）展開成完整的文獻探討小節。一次只貼一群。",
    fields: [{ id: "m6a_text", type: "textarea", label: "單一主題群摘要", rows: 8 }],
    rules: () => ["citation", "style", "verify"],
    build: (p, R) => blank(p.m6a_text) ? "" : T.m6a({ cluster: p.m6a_text }) + R,
    empty: "（請貼上一個主題群的摘要）",
    next: "下一步：建議貼到產生過這份主題地圖的同一個對話；回覆完成後切到{#m6b}接續貼上。"
  },
  m6b: {
    label: "代表文獻深入分析", target: "nlm",
    hint: "接在{#m6a}同一個對話，挑出該主題群最具代表性的一篇文獻深入分析。",
    fields: [], rules: () => [],
    build: (p, R) => T.m6b({}) + R,
    next: "下一步：回到{#m6a}那個對話貼上（不要開新對話）。"
  },
  m8: {
    label: "新文獻歸類與比較", target: "nlm",
    hint: "獨立使用。先把新文獻上傳到同一個 Notebook，再判斷它屬於草稿中哪個既有主題，並挑同主題一篇代表文獻比較。",
    fields: [
      { id: "m8_paper", type: "text", label: "新文獻篇名或作者年份", placeholder: "避免 NotebookLM 搞混是哪一篇" },
      { id: "m8_themes", type: "textarea", label: "論文草稿目前的主題清單", hint: "逐行或逗號分隔皆可", rows: 5 }
    ],
    rules: () => ["citation", "verify"],
    build: (p, R) => (blank(p.m8_paper) || blank(p.m8_themes)) ? "" : T.m8({ paperName: p.m8_paper, themes: p.m8_themes }) + R,
    empty: "（請填入新文獻與主題清單）",
    next: "下一步：切到這篇新文獻所在的 NotebookLM 對話貼上。"
  },
  m5d: {
    label: "名詞解釋", target: "nlm",
    hint: "依名詞清單產生四面向（定義、角色、量表、補充）解釋，可作為第一章名詞釋義或第二章構念定義的素材。",
    fields: [{ id: "m5d_text", type: "textarea", label: "名詞清單", hint: "逐行或逗號分隔", placeholder: "品牌依附、自我一致性", rows: 5 }],
    rules: () => [],
    build: (p, R) => blank(p.m5d_text) ? "" : T.m5d({ terms: p.m5d_text }) + R,
    empty: "（請貼上名詞清單）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM。"
  },

  // ─── 0.2 追問：研究架構、問卷、實務情境 ───
  asf: {
    label: "提出候選研究架構", target: "nlm",
    hint: "在已上傳文獻的 NotebookLM 開新對話。先依描述層次歸類相關構念，再提出數個彼此有明顯差異的研究架構，各附變數、理論、文獻支持與研究缺口，最後附上變數清單，供你挑選。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；以一句話描述要探討的現象或問題，可幫助 AI 聚焦", placeholder: "例如：使用者滑 TikTok 或 Instagram Reels 時看到平台推薦的產品開箱影片，是否會因此產生衝動購買？" },
      { id: "as_iv", type: "textarea", label: "已確定的自變數", hint: "選填；每行一個，只寫名稱即可（貼上含定義的整段也可以，網頁只取變數名稱）；填了之後，所有候選架構都包含這些自變數", rows: 2, placeholder: "例如：促銷傾向（Deal Proneness）" },
      { id: "as_dv", type: "textarea", label: "已確定的依變數", hint: "選填；每行一個，可填兩個以上；填了之後，所有候選架構都以這些變數為依變數", rows: 2, placeholder: "例如：認知型衝動購買（Cognitive Impulse Buying）\n情感型衝動購買（Affective Impulse Buying）" },
      { id: "as_method", type: "radio", label: "研究方法", options: [["any", "不限"], ["survey", "問卷調查法"], ["exp", "實驗設計法"], ["sec", "panel data"]], value: "survey" },
      { id: "as_n", type: "radio", label: "架構數量", options: [["2", "2 個"], ["3", "3 個"], ["4", "4 個"], ["5", "5 個"], ["6", "6 個"]], value: "4" },
      { id: "as_more_on", type: "checks", below: true, label: "補充變數清單", options: [["on", "接著在同一個對話補充變數清單（列出每個變數可擔任的所有角色）"]], value: [] },
      { id: "as_more_prompt", type: "promptbox", below: true, label: "補充變數清單 Prompt", when: p => isOn(p.as_more_on),
        hint: "貼到同一個 NotebookLM 對話；回覆最後若寫「未完」，輸入「繼續」",
        copyLabel: "複製補充 Prompt（貼到 NotebookLM 同一個對話）", build: () => T.ask_more({}) + citeText() },
      { id: "as_morereply", type: "textarea", below: true, label: "補充變數清單的 AI 回覆", hint: "各次回覆（含「繼續」之後的）依序貼上；有勾選才會帶到組合步驟", rows: 5, when: p => isOn(p.as_more_on) },
    ],
    rules: () => ["citation"],
    seed: () => seedFrom01(), seedFrom: "0.1「研究方向聚焦」",
    status: () => {
      const r = String((store.replies || {})["s0-1|focus"] || "");
      if (blank(r)) return "0.1「研究方向聚焦」的 AI 回覆欄位是空的，所以沒有內容可帶入；請先把 0.1 的對話貼到該步驟最下方的「AI 回覆」。";
      if (!/研究情境[：:]/.test(r)) return "0.1 的 AI 回覆中沒有「研究情境：」「研究問題：」「依變數：」這三行（較早的 Prompt 不會產生）。請在 0.1 的同一個 NotebookLM 或 AI 對話輸入：「請以純文字另起三行寫出：研究情境：……、研究問題：……、依變數：……」，把新回覆接在 0.1 的「AI 回覆」最後，再回來按「重新帶入」。";
      return "";
    },
    seedNote: "研究情境、研究問題與依變數由 0.1「研究方向聚焦」的 AI 回覆帶入，可自行修改",
    build: (p, R) => blank(p.as_ctx) ? "" : T.ask_frame({ ctx: p.as_ctx.trim(), con: p.as_con.trim(), ivs: fixedNames(p.as_iv), dvs: fixedNames(p.as_dv), method: p.as_method, n: p.as_n }) + R,
    seedQuiet: ["as_dv"],
    empty: "（請填入研究情境）",
    next: "下一步：回覆貼到下方「AI 回覆」。需要更完整的變數時，勾選最下方的「補充變數清單」，在同一個對話接著問。完成後到{#asmix}。"
  },
  asmore: {
    label: "補充變數清單", target: "nlm",
    hint: "接在{#asf}同一個對話。AI 已經思考過各架構，這一步只做一件事：逐篇檢查上傳文獻，補上尚未出現的變數，並列出每個變數可擔任的所有角色；有文獻依據的標示「文獻」，依理論推論的標示「推論」。",
    fields: [],
    rules: () => ["citation"],
    build: (p, R) => T.ask_more({}) + R,
    next: "下一步：若回覆最後寫「未完」，輸入「繼續」。各次回覆（含「繼續」之後的）依序貼到下方「AI 回覆」，到{#asmix}會自動帶入、合併並去除重複。"
  },
  vdeep: {
    label: "深入了解單一變數", target: "nlm",
    hint: "依上傳文獻整理一個變數的定義、維度、理論、量表、施測情境、前因、後果與相近構念。只能根據上傳文獻回答，文獻只是順帶提及這個變數時，回答會較薄。",
    fields: [
      { id: "vd_var", type: "text", label: "變數名稱", placeholder: "例如：顧客靈感（customer inspiration）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" }
    ],
    rules: () => ["citation", "verify"],
    build: (p, R) => blank(p.vd_var) ? "" : T.var_deep({ v: p.vd_var.trim(), ctx: p.as_ctx.trim() }) + R,
    empty: "（請填入變數名稱）",
    next: "下一步：「文獻不足之處」列出的關鍵字可用來檢索新文獻，上傳到同一個 Notebook 後再問一次。要寫成第二章時用{#m6a}；整理量表與題項用{#opdef}。"
  },
  vcomp: {
    label: "區辨相近變數", target: "nlm",
    hint: "兩個以上的變數看起來很像時使用：比較定義、描述層次、文獻中的角色、衡量方式與實證區辨，判斷它們是同一構念、部分重疊、前後因果，還是彼此獨立，並建議在研究架構中如何處理。",
    fields: [
      { id: "vc_vars", type: "textarea", label: "變數", hint: "每行一個，至少兩個；建議附英文原文", rows: 4, placeholder: "偶遇商品資訊（Encountering Product Information）\n體驗到的驚喜感（Experienced Serendipity）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" }
    ],
    rules: () => ["citation"],
    build: (p, R) => {
      const vars = (p.vc_vars || "").split(/\r?\n/).map(v => v.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean);
      return vars.length < 2 ? "" : T.var_compare({ vars, ctx: p.as_ctx.trim() }) + R;
    },
    empty: "（請填入至少兩個變數，每行一個）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。若判斷為前後因果，可回到{#asmix}調整勾選；要深入了解其中一個變數，用{#vdeep}。"
  },
  smethod: {
    label: "方法導向檢索", target: "ai",
    hint: "要找特定領域中、實際使用某種統計方法的實證論文來模仿時使用。AI 會給你可直接貼到 Google Scholar 的檢索式與 Scholar Labs 問句；請使用有網路搜尋的 AI，它會試跑檢索式並附上 2–3 篇論文確認。",
    fields: [
      { id: "sm_field", type: "text", label: "研究領域", placeholder: "例如：行銷、消費者行為、人力資源管理" },
      { id: "sm_method", type: "text", label: "統計方法", hint: "建議附英文", placeholder: "例如：多層次模型（multilevel model）" },
      { id: "sm_unit", type: "text", label: "分析單位", hint: "選填；不填時 AI 會列出常見的組合供你挑選", placeholder: "例如：層次一：消費者；層次二：店家" },
      { id: "sm_topic", type: "text", label: "研究主題或變數", hint: "選填；只想找方法範例時可留空", placeholder: "例如：店家特性對購買意願的跨層次影響" },
      { id: "sm_extra", type: "text", label: "其他想加入的條件", hint: "選填；任何片段資訊皆可", placeholder: "例如：有報告組內相關係數（ICC）、使用 HLM 軟體、2015 年以後" },
      { id: "sm_excl", type: "text", label: "要排除的領域", hint: "選填；該方法常見但與你無關的領域", placeholder: "例如：教育、護理" }
    ],
    build: p => blank(p.sm_field) || blank(p.sm_method) ? "" : T.search_method({ field: p.sm_field.trim(), method: p.sm_method.trim(), unit: p.sm_unit.trim(), topic: p.sm_topic.trim(), extra: p.sm_extra.trim(), excl: p.sm_excl.trim() }),
    empty: "（請填入研究領域與統計方法）",
    next: "下一步：檢索式貼到 Google Scholar（scholar.google.com），問句貼到 Scholar Labs。先點開「試跑結果」的連結確認論文確實存在且使用該方法。"
  },
  asmix: {
    label: "組合研究架構", target: "nlm", stack: true,   // stack：欄位佔滿寬度，Prompt 放在下方
    hint: "依「前面步驟的回覆」中的變數清單勾選變數，同一角色可勾多個候選；自變數與依變數已確定時，勾選上方「已確定」，先請 AI 建議中介與調節變數。接著複製下方的候選架構 Prompt，請 AI 依你勾選的變數提出幾個候選架構；貼上回覆後，網頁會畫出每個候選，比較後按「選這個」。選定的架構到 0.3 檢核。",
    fields: [
      { id: "am_on", type: "checks", label: "自變數與依變數已確定", options: [["on", "已確定：先在清單勾選自變數與依變數，再請 AI 建議中介與調節變數"]], value: [] },
      { id: "as_vlist", type: "textarea", label: "前面步驟的回覆", hint: "自動帶入步驟 1 與下方篩選的 AI 回覆；也可直接貼上各次回覆", rows: 6, mono: true },
      { id: "as_pick", type: "picker", label: "勾選要用的變數", hint: "上方勾選「已確定」時：先勾自變數（可多個）與依變數；AI 建議的中介與調節變數貼回後才會出現，再勾選", source: p => parseVarList(p.as_vlist), roles: MIX_ROLES, value: [] },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填；用來判斷文獻能否類推", placeholder: "例如：蝦皮電商平台", when: p => isOn(p.am_on) },
      { id: "am_prompt", type: "promptbox", label: "篩選 Prompt", when: p => isOn(p.am_on),
        hint: "依你勾選的自變數與依變數產生；貼到已上傳相關文獻的 NotebookLM 對話，AI 會判定每個候選為建議納入、可考慮或不建議，找不到時直接寫「未找到」",
        copyLabel: "複製篩選 Prompt（貼到 NotebookLM）", empty: "（請先在上方清單勾選自變數與依變數）",
        build: p => { const { xs, ys } = mechXY(p); return xs.length && ys.length ? T.ask_mech({ x: xs.join("、"), y: ys.join("、"), ctx: (p.as_ctx || "").trim() }) + citeText() : ""; } },
      { id: "am_reply", type: "textarea", label: "篩選的 AI 回覆", hint: "貼上後按下方「重新帶入」，AI 建議的中介與調節變數會出現在勾選清單，並標示判定", rows: 5,
        reseed: { note: "把篩選結果加入勾選清單，並跳到清單位置", jump: "pick-as_pick" }, when: p => isOn(p.am_on) },
      { id: "as_diag", type: "diagram", label: "我的草圖", hint: "選填。畫了路徑的話，會列為「候選架構一（我的版本）」。拖曳方塊調整位置；點一個方塊再點另一個方塊，畫出箭頭；先點調節變數再點一條箭頭，畫出調節虛線；未選方塊時點箭頭或虛線可刪除",
        tray: true, all: p => mixPicked(p, true), source: p => mixPicked(p),
        onRemove: k => { store.values.as_pick = (store.values.as_pick || []).filter(x => x !== k); } },
      { id: "cf_n", type: "radio", label: "候選架構數量", options: [["2", "2 個"], ["3", "3 個"], ["4", "4 個"]], value: "3" },
      { id: "cf_reply", type: "textarea", afterOut: true, label: "候選架構的 AI 回覆", hint: "整段貼上；下方會畫出每個候選架構", rows: 6 },
      { id: "cf_view", type: "cands", afterOut: true, label: "比較候選架構", hint: "比較各架構的圖與理由，按「選這個」設為你的研究架構", render: p => renderCands(p), choose: i => chooseCand(i) },
      { id: "fin_diag", type: "diagram", afterOut: true, label: "選定的研究架構", hint: "可在圖上微調：點一個方塊再點另一個方塊加上箭頭；未選方塊時點箭頭可刪除；按「依文字重畫」回到 AI 的版本",
        when: p => !blank(store.values.cf_text), emptyHint: "（尚未選定）",
        source: p => parseArch(store.values.cf_text).vars,
        seed: p => { const A = parseArch(store.values.cf_text); return { sig: JSON.stringify([A.edges, A.mods].map(l => l.map(x => [x.from, x.to || x.edge]))), edges: A.edges.map(({ from, to }) => ({ from, to })), mods: A.mods.map(({ from, edge }) => ({ from, edge })) }; } }
    ],
    init: () => autoPickDV(),
    seed: () => { const v = store.values, r = store.replies || {};
      return { as_vlist: [r["s0-4|asf"], isOn(v.as_more_on) ? v.as_morereply : "", isOn(v.am_on) ? v.am_reply : ""].filter(x => !blank(x)).map(x => x.trim()).join("\n\n") }; },
    seedFrom: "步驟 1 與篩選的 AI 回覆", seedNote: "「前面步驟的回覆」由步驟 1 的 AI 回覆（含勾選的補充變數清單），以及下方「篩選的 AI 回覆」帶入",
    rules: () => ["citation"],
    build: (p, R) => {
      const picked = mixPicked(p);
      return picked.length ? T.ask_cands({ picked, paths: diagramPathText(picked, p.as_diag), ctx: (p.as_ctx || "").trim(), n: +(p.cf_n || 3) }) + R : "";
    },
    status: p => {
      if (blank(p.as_vlist)) return "";
      const n = parseVarList(p.as_vlist).length;
      return n ? `已讀取 ${n} 個變數` + trayNote("as_diag") + (blank(store.values.cf_text) ? "" : `\n已選定：${store.values.cf_title || "候選架構"}`) : "沒有讀取到變數，請確認貼上的內容包含「變數清單」，且每行為「角色｜變數名稱｜出處｜架構」。";
    },
    empty: "（請先在上方清單勾選變數）",
    noReply: true, copyLabel: "複製候選架構 Prompt（貼到 NotebookLM）",
    next: "下一步：貼到 NotebookLM（步驟 1 或篩選所用的同一個對話），把回覆貼到下方「候選架構的 AI 回覆」，比較各候選後按「選這個」；選定後到{#archchk}檢核，研究缺口與學術貢獻也在那裡一併產生。"
  },
  astat: {
    label: "統計方法與結果揭露", target: "nlm",
    hint: "接在{#archchk}同一個對話。整理上傳文獻針對相近變數與路徑用過的統計方法，建議本研究適用的方法，並列出實證結果應揭露的項目；一般應報告但文獻未報告者標示【待補文獻】。",
    fields: [
      { id: "as_rmethod", type: "radio", label: "研究方法", options: [["survey", "問卷調查法"], ["exp", "實驗設計法"], ["sec", "panel data"]], value: "survey" },
      { id: "as_data", type: "textarea", label: "資料描述", hint: "選填；資料來源、分析單位與特性", rows: 2, placeholder: "例如：非營利組織的捐款紀錄，捐款日期巢套於捐款者，很多人只有一筆捐款" }
    ],
    rules: () => ["citation"],
    build: (p, R) => T.ask_stats({ rm: p.as_rmethod, data: (p.as_data || "").trim(), arch: mixArchText().trim() }) + R,
    next: "下一步：研究方法為問卷調查法或實驗設計法時，到{#asq}；panel data 不需要問卷，可跳過。正式撰寫時，第三章用{#analysis}，第四章用{#stats}。"
  },
  asq: {
    label: "問卷草稿與可行性評估", target: "nlm",
    hint: "接在{#astat}同一個對話，研究方法為問卷調查法或實驗設計法時使用；實驗設計法會另外產出操弄情境與操弄檢定。題項只取自上傳文獻，量表的原始論文須先上傳到 NotebookLM；找不到的會標示【待補量表】。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_rmethod", type: "radio", label: "研究方法", options: [["survey", "問卷調查法"], ["exp", "實驗設計法"], ["sec", "panel data"]], value: "survey" },
      { id: "as_archm", type: "radio", label: "選定的架構", options: [["mine", "0.2 選定的研究架構"], ["num", "候選架構編號"], ["other", "其他"]], value: "mine" },
      { id: "as_archno", type: "text", label: "架構編號", hint: "填數字即可", placeholder: "例如：2", when: p => p.as_archm === "num" },
      { id: "as_arch", type: "textarea", label: "其他架構", hint: "簡短描述即可，不要貼上整段回覆", rows: 2, placeholder: "例如：架構一加上消費者創新性作為調節變數", when: p => p.as_archm === "other" },
      { id: "as_target", type: "text", label: "研究對象", hint: "選填", placeholder: "例如：過去三個月曾在抖音購物的消費者" },
      { id: "as_scale", type: "text", label: "量尺形式", hint: "選填；不填時依原量表", placeholder: "例如：Likert 七點尺度" },
      { id: "as_amethod", type: "text", label: "分析方法", hint: "選填；不填時由 AI 依架構建議", placeholder: "例如：PLS-SEM" },
      { id: "as_req", type: "textarea", label: "問卷設計要求", hint: "選填；例如某個構念要分成幾個題組、各幾題、指導語怎麼寫、哪些字眼不能出現；會附在 Prompt 中，請精簡（建議 600 字內）", rows: 5,
        placeholder: "例如：依變數題組共 8 題：認知型衝動購買 3 題、情感型衝動購買 3 題、整體衝動購買 2 題，分列為三個構念；題項不得出現「促銷」「折扣」等字眼。" },
      { id: "sv_reply", type: "textarea", below: true, label: "修訂建議的 AI 回覆", hint: "選填；貼上修改追問的回覆，會一併存入研究存檔", rows: 5 },
      { id: "sv_revp", type: "promptbox", below: true, label: "產生修訂版問卷", hint: "修訂建議貼上後，在同一個對話接著送出，請 NotebookLM 依建議輸出修訂後的完整問卷",
        copyLabel: "複製產生修訂版問卷 Prompt（貼到 NotebookLM）", empty: "（先貼上修訂建議的 AI 回覆）", build: p => blank(p.sv_reply) ? "" : svRevPrompt() },
      { id: "sv_rev", type: "textarea", below: true, label: "修訂版問卷的 AI 回覆", hint: "貼上後，上方問卷預覽會換成修訂版（改過的地方會標示原文），可切換回原版比對", rows: 5 },
      { id: "sv_tofinal", type: "button", below: true, label: "以目前問卷預覽作為定稿", hint: "把預覽中的問卷（含直接修改）帶入下方「定稿問卷」",
        run: () => { const t = svText(); if (!t) return "沒有問卷預覽可帶入；請直接把定稿問卷貼到下方。";
          if (!blank(store.values.sv_final) && !confirm("「定稿問卷」已有內容，要以目前預覽取代嗎？")) return "未變更";
          store.values.sv_final = t; return "已帶入目前問卷預覽，可再直接修改。"; } },
      { id: "sv_final", type: "textarea", below: true, label: "定稿問卷", hint: "最後確定的整份問卷（純文字即可，構念寫成〈構念名稱〉（量表出處），題項寫成 Q1. 題目）；會存入研究存檔，並帶到 3.2 撰寫操作型定義與衡量", rows: 10 },
      { id: "rv_title", type: "text", below: true, label: "受訪者版問卷：問卷標題", hint: "留白時用「研究情境＋購物經驗調查問卷」；不要用論文題目，以免透露研究目的", placeholder: "例如：蝦皮購物經驗調查問卷" },
      { id: "rv_go", type: "button", below: true, label: "下載受訪者版問卷（Word）", hint: "依「定稿問卷」產生紙本問卷：不顯示構念英文名稱、量表出處與反向題標註，題號全卷連續", run: () => { rvWord().then(m => { const el = document.getElementById("fmsg-rv_go"); if (el) el.textContent = m; }); return "正在產生 Word 檔…"; } },
      { id: "rv_view", type: "cands", below: true, label: "受訪者版問卷預覽", render: () => rvView() }
    ],
    replyView: t => surveyView(t),
    rules: () => ["citation"],
    status: p => p.as_rmethod === "sec" ? "研究方法為 panel data 時不需要問卷草稿，可跳過此步驟。" : (p.as_req || "").trim().length > 800 ? "「問卷設計要求」內容較長，Prompt 可能超過 NotebookLM 單次輸入上限；請精簡為重點。" : p.as_archm === "other" && (p.as_arch || "").trim().length > 300 ? "「其他架構」內容過長，NotebookLM 可能無法讀取；同一個對話中簡短描述即可。" : "",
    build: (p, R) => {
      const arch = archLabel(p);
      return blank(p.as_ctx) || !arch || p.as_rmethod === "sec" ? "" : T.ask_survey({ exp: p.as_rmethod === "exp", ctx: p.as_ctx.trim(), arch, target: p.as_target.trim(), scale: p.as_scale.trim(), method: p.as_amethod.trim(), req: (p.as_req || "").trim() }) + R;
    },
    empty: "（請填入研究情境，並指定選定的架構）",
    next: "下一步：【待補量表】的構念，請找到量表原始論文上傳後再問一次。問卷定稿後貼到下方「定稿問卷」，正式撰寫第三章時，用{#opdef}依定稿問卷撰寫操作型定義與衡量；要查實務面時，到{#asp}。"
  },
  asp: {
    label: "研究情境與實務缺口", target: "ai",
    hint: "請使用已開啟網路搜尋的 AI；未開啟搜尋時，AI 只能憑記憶作答，捏造的風險很高。學術論點只採用{#archchk}的回覆，網路資料只用於研究情境與實務面。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；以一句話描述要探討的現象或問題，可幫助 AI 聚焦", placeholder: "例如：使用者滑 TikTok 或 Instagram Reels 時看到平台推薦的產品開箱影片，是否會因此產生衝動購買？" },
      { id: "as_path", type: "text", label: "研究情境中的歷程", hint: "選填；不填時由 AI 依構念與結果決定階段", placeholder: "例如：開啟應用程式、滑動影片、接觸商品相關內容、產生購買念頭" },
      { id: "bg_plan", type: "textarea", label: "選定的寫法", hint: "貼上上一步回覆中你選的那一種寫法（段落大綱）；AI 會依其中需要的統計數據上網查台灣資料。與下一步共用", rows: 5 },
      { id: "as_prev", type: "textarea", label: "0.3 檢核的回覆", hint: "自動帶入 0.3「依文獻檢核架構」的 AI 回覆（兩則都貼在那裡時會一起帶入）；也可以自己貼上", rows: 8 },
      { id: "as_draft", type: "textarea", label: "學生原稿（僅供參考）", hint: "選填；貼上學生原本寫的研究背景、動機或產業描述，僅供參考。撰寫以研究架構與文獻為主軸，學生內容可被改寫或捨棄；回覆會逐項列出需要查證或修正之處（與 1.1 的兩個步驟共用）", rows: 6 }
    ],
    seed: () => ({ as_prev: (store.replies || {})["s0-5|archchk"] || "" }),
    seedFrom: "0.3「依文獻檢核架構」", seedNote: "「0.3 檢核的回覆」由 0.3「依文獻檢核架構」的 AI 回覆帶入",
    build: p => blank(p.as_ctx) || blank(p.as_prev) ? "" : T.ask_practice({ ctx: p.as_ctx.trim(), con: p.as_con.trim(), path: p.as_path.trim(), prev: p.as_prev, plan: (p.bg_plan || "").trim(), draft: (p.as_draft || "").trim() }),
    empty: "（請填入研究情境，並貼上組合研究架構的回覆）",
    next: "下一步：逐一點開「來源核對」中的網址確認內容；AI 即使遵守上述規則，仍可能產生不存在的網址。確認後，研究情境與實務問題可貼到{#bg}的「產業或實務背景資料」，學術缺口與實務缺口可貼到「研究缺口」。"
  },

  // ─── 新增：第一章、第三章 ───
  bgplan: {
    label: "背景與動機的寫法", target: "nlm",
    hint: "請 NotebookLM 綜合上傳文獻的研究背景與動機寫法：與本研究題目相關、必須交代的背景要素；文獻用了哪些統計數據、本研究至少要寫幾點，以及可改用的台灣資料；文獻從理論、實務資料或研究缺口切入的方式；最後整理出幾種寫法供你選擇。",
    fields: [
      { id: "bp_topic", type: "textarea", label: "研究題目與研究架構", hint: "自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "bp_n", type: "radio", label: "寫法數量", options: [["2", "2 種"], ["3", "3 種"], ["4", "4 種"]], value: "3" }
    ],
    seed: () => ({ bp_topic: bgSeed().bg_topic }),
    seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5 定稿題目、研究情境與 3.1／0.3 的研究架構帶入",
    rules: () => ["citation"],
    replyView: t => bpView(t),
    build: (p, R) => blank(p.bp_topic) ? "" : T.bgplan({ topic: p.bp_topic.trim(), n: p.bp_n }) + R,
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構）",
    next: "下一步：在下方勾選要用的寫法（可勾多種合併），會自動帶入{#asp}與{#bg}的「選定的寫法」。"
  },
  bg: {
    label: "研究動機", target: "nlm",
    hint: "由產業現象收斂到文獻缺口，撰寫研究背景與研究動機。產業數據只會用您提供的資料，缺的會標【待補資料】。",
    fields: [
      { id: "bg_topic", type: "textarea", label: "研究主題與研究架構", hint: "自動帶入 0.5 定稿題目、研究情境與 3.1／0.3 的研究架構路徑", rows: 4, placeholder: "例如：品牌人格透過自我一致性影響品牌依附——以台灣精釀啤酒為例" },
      { id: "bg_facts", type: "textarea", label: "產業或實務背景資料", hint: "自動帶入上一步回覆的「研究情境」「實務問題」「實務缺口」（請先確認網址）", rows: 5 },
      { id: "bg_gaps", type: "textarea", label: "研究缺口", hint: "自動帶入 0.3 回覆中的「研究缺口」", rows: 4 },
      { id: "bg_plan", type: "textarea", label: "選定的寫法", hint: "與步驟 2 共用；AI 會照這個段落大綱撰寫", rows: 5 },
      { id: "as_draft", type: "textarea", label: "學生原稿（僅供參考）", hint: "選填；貼上學生原本寫的研究背景、動機或產業描述，僅供參考。撰寫以研究架構與文獻為主軸，學生內容可被改寫或捨棄；回覆會逐項列出需要查證或修正之處（與 1.1 的兩個步驟共用）", rows: 6 },
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(k => ({ id: "bg_b" + k, type: "promptbox", afterOut: true, when: p => bgParts(p).length >= k,
        get label() { const n = bgParts(valuesOf(DEFS.bg)).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始撰寫）` : `第 ${k} 則 Prompt`; },
        hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出；最後一則送出後，NotebookLM 才會開始撰寫",
        copyLabel: `${"②③④⑤⑥⑦⑧⑨⑩⑪⑫"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => bgParts(p)[k - 1] || "" })),
    ],
    rules: () => ["citation", "style", "verify"],
    seed: () => bgSeed(),
    seedFrom: "前面步驟", seedNote: "研究主題、背景資料與研究缺口由 0.5 定稿題目、3.1／0.3 研究架構、上一步回覆與 0.3 回覆帶入",
    status: p => bgParts(p).length > 1 ? `內容較長，Prompt 自動分成 ${bgParts(p).length} 則：前幾則是參考資料（NotebookLM 只會回覆「已收到」），最後一則才開始撰寫；請在同一個對話依序送出，只把最後一則的回覆貼到「AI 回覆」。` : "",
    build: (p, R) => { BG_R = R || ""; return bgParts(p)[0] || ""; },
    empty: "（請填入研究主題與研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話；【待補資料】請自行查找後補入。"
  },
  purpose: {
    label: "研究目的", target: "nlm",
    hint: "依研究架構與 1.1 的研究缺口，參考上傳文獻宣告研究目的的寫法撰寫研究目的，並檢核「缺口 → 目的 → 假說」是否一一對應。",
    fields: [
      { id: "hy_paths", type: "textarea", label: "研究架構", hint: "一行一條假說；與第二章「第二章架構」共用同一份內容", rows: 5, placeholder: "H1：品牌人格 → 自我一致性（正向）" },
      { id: "pu_motive", type: "textarea", label: "1.1 的研究缺口", hint: "自動帶入 1.1 定稿的最後一段（研究缺口）；可自行修改", rows: 4 },
      ...partBoxes("pu_b", "purpose", p => puParts(p))
    ],
    seed: () => ({ hy_paths: archHyp(), pu_motive: (finBlocks(finText("s1-1")).filter(b => !/^#/.test(b)).slice(-1)[0] || "") }),
    seedQuiet: ["hy_paths"], seedFrom: "架構圖與 1.1 定稿", seedNote: "研究架構由 3.1／0.3 架構圖帶入，研究缺口由 1.1 定稿最後一段帶入",
    rules: () => ["style"],
    build: p => puParts(p)[0] || "",
    status: p => partsNote(puParts(p)),
    empty: "（請填入研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話（可接在寫研究動機的同一個對話）。"
  },
  sample: {
    label: "研究對象與抽樣", target: "ai",
    hint: "大部分項目用勾選即可；勾選的內容由網頁組成文字交給 AI，沒填的項目會標【待補】，不讓 AI 代寫。最低樣本數、回收率與有效率由網頁計算，不交給 AI 算。",
    fields: [
      { id: "sp_stage", type: "radio", label: "撰寫版本", hint: "計畫書版以預定語氣撰寫，不收回收資料；問卷回收後切換為完整論文版，已填的欄位會保留，正文請重新產生", options: [["plan", "論文計畫書（尚未回收問卷）"], ["full", "完整論文（已回收問卷）"]], value: SP_STAGE0 },
      { id: "sp_pop", type: "text", label: "研究母體與抽樣架構", placeholder: "例如：近一年曾於蝦皮購物之台灣消費者；以網路購物相關社群成員為抽樣架構" },
      { id: "sp_m", type: "checks", label: "抽樣方法", hint: "可複選", options: SP_M, value: [] },
      { id: "sp_method", type: "text", label: "抽樣方法補充", hint: "選填；勾「其他」時寫方法名稱，也可寫選用理由", placeholder: "例如：本研究母體缺乏完整名冊，故採便利抽樣" },
      { id: "sp_sz", type: "radio", label: "樣本數規劃依據", options: [["gp", "G*Power 檢定力分析"], ["ten", "十倍法則"], ["other", "其他"]], value: "gp" },
      { id: "sp_f2", type: "radio", label: "效果量 f²", options: [[".02", ".02（小）"], [".15", ".15（中）"], [".35", ".35（大）"]], value: ".15", when: p => p.sp_sz === "gp" },
      { id: "sp_alpha", type: "radio", label: "顯著水準 α", options: [[".05", ".05"], [".01", ".01"]], value: ".05", when: p => p.sp_sz === "gp" },
      { id: "sp_pw", type: "radio", label: "檢定力", options: [[".80", ".80"], [".95", ".95"]], value: ".80", when: p => p.sp_sz === "gp" },
      { id: "sp_k", type: "text", label: "預測變數個數", hint: "留白時依研究架構自動計算（指向同一個變數的箭頭最多幾條；調節效果另計調節變數與交互作用項）", placeholder: "留白＝自動", when: p => p.sp_sz !== "other" },
      { id: "sp_szinfo", type: "cands", label: "", render: p => spSizeView(p) },
      { id: "sp_size", type: "text", label: "樣本數補充", hint: "選填；效果量的出處（例如 Cohen, 1988）、其他依據的說明", placeholder: "例如：效果量依 Cohen（1988）之中等效果量設定" },
      { id: "sp_cm", type: "radio", label: "資料蒐集方式", options: [["web", "網路問卷"], ["paper", "紙本問卷"], ["both", "網路與紙本並行"]], value: "web" },
      { id: "sp_plat", type: "radio", label: "問卷平台", options: [["gf", "Google 表單"], ["sc", "SurveyCake"], ["qx", "Qualtrics"], ["other", "其他"]], value: "", when: p => p.sp_cm !== "paper" },
      { id: "sp_ch", type: "checks", label: "發放管道", hint: "可複選", options: SP_CH, value: [] },
      { id: "sp_from", type: "text", label: "蒐集期間：起", hint: "計畫書版填預定期間", placeholder: "例如：2026 年 3 月" },
      { id: "sp_to", type: "text", label: "蒐集期間：迄", placeholder: "例如：2026 年 4 月" },
      { id: "sp_collect", type: "text", label: "資料蒐集補充", hint: "選填；其他平台或管道的名稱、選擇此期間的理由", placeholder: "例如：避開雙 11 等大型促銷檔期，以免受訪者的購物經驗受特殊活動影響" },
      { id: "sp_bs", type: "radio", label: "填答依據", hint: "受訪者依據什麼經驗作答；也會帶到 3.1", get options() { return [["last", `回想最近一次在${spCtx()}購物的經驗`], ["usual", "依平時的使用經驗"], ["other", "其他"]]; }, value: "" },
      { id: "sp_basis", type: "text", label: "填答依據補充", hint: "選填；勾「其他」時寫在這裡", placeholder: "例如：請受訪者回想最近一次在蝦皮瀏覽後購買的經驗作答" },
      { id: "sp_ex", type: "checks", label: "篩選與排除標準", hint: "可複選；勾選後填寫下方對應的條件", options: SP_EX.map(([k, t]) => [k, t]), value: [] },
      { id: "sp_ex_screen", type: "text", label: "篩選條件", placeholder: "例如：近一年是否曾在蝦皮購物", when: p => (p.sp_ex || []).includes("screen") },
      { id: "sp_ex_attn", type: "text", label: "注意力檢查題的題數與形式", placeholder: "例如：1 題，「本題請選非常同意」", when: p => (p.sp_ex || []).includes("attn") },
      { id: "sp_ex_fast", type: "text", label: "作答時間門檻", placeholder: "例如：少於 2 分鐘", when: p => (p.sp_ex || []).includes("fast") },
      { id: "sp_screen", type: "text", label: "篩選與排除補充", hint: "選填；勾「其他」時寫在這裡", placeholder: "例如：同一 IP 重複填答者只保留第一份" },
      { id: "sp_eth", type: "checks", label: "研究倫理", hint: "可複選；只勾實際有做（計畫書版：預定要做）的項目", options: SP_ETH, value: [] },
      { id: "sp_irb", type: "text", label: "倫理審查單位與核准編號", placeholder: "例如：國立暨南國際大學研究倫理審查委員會，核准編號 XXX", when: p => (p.sp_eth || []).includes("irb") },
      { id: "sp_inc", type: "radio", label: "填答誘因", options: [["none", "無"], ["lottery", "抽獎"], ["gift", "每人贈禮"]], value: "" },
      { id: "sp_inc_txt", type: "text", label: "誘因內容", placeholder: "例如：抽出 10 位各贈 100 元超商禮券", when: p => p.sp_inc === "lottery" || p.sp_inc === "gift" },
      { id: "sp_ethics", type: "text", label: "研究倫理補充", hint: "選填", placeholder: "例如：研究資料於論文完成後保存五年" },
      { id: "sp_nplan", type: "text", label: "預計回收份數", hint: "選填；可附估算依據", placeholder: "例如：考量約兩成無效問卷，預計回收 120 份", when: p => p.sp_stage === "plan" },
      { id: "sp_n1", type: "text", label: "發放份數", hint: "選填；網路問卷多半無法得知，可留白", when: p => p.sp_stage !== "plan" },
      { id: "sp_n2", type: "text", label: "回收份數", when: p => p.sp_stage !== "plan" },
      ...SP_EX.map(([k, t]) => ({ id: "sp_xn_" + k, type: "text", label: `排除份數：${t}`, when: p => p.sp_stage !== "plan" && (p.sp_ex || []).includes(k) })),
      { id: "sp_n3", type: "text", label: "有效問卷份數", when: p => p.sp_stage !== "plan" },
      { id: "sp_excl", type: "text", label: "排除補充", hint: "選填；其他排除原因與份數", when: p => p.sp_stage !== "plan" },
      { id: "sp_nchk", type: "cands", label: "", render: p => spCountView(p), when: p => p.sp_stage !== "plan" },
      { id: "sp_scope", type: "textarea", label: "研究範圍（由 1.3 帶入）", hint: "只在「研究母體與抽樣架構」留白時才附進 Prompt，供 AI 依此撰寫母體與研究情境", rows: 4 }
    ],
    seed: () => ({ sp_scope: finText("s1-3").trim() }), seedQuiet: ["sp_scope"], seedFrom: "1.3 研究範圍", seedNote: "研究範圍由 1.3 的論文內容帶入",
    rules: () => ["style", "ch3"],
    build: (p, R) => {
      const q = spCompose(p);
      if (blank(p.sp_pop) && blank(q.sp_method)) return "";
      const [a, b, c] = [spNum(p.sp_n1), spNum(p.sp_n2), spNum(p.sp_n3)], pct = (x, y) => (x / y * 100).toFixed(2) + "%", r = [];
      if (p.sp_stage !== "plan") {
        if (a > 0 && b > 0) r.push(`回收率 ${pct(b, a)}`);
        if (b > 0 && c > 0) r.push(`有效回收率（有效／回收）${pct(c, b)}`);
        if (c > 0 && q.sp_minn) r.push(`有效問卷 ${c} 份${c >= q.sp_minn ? "已達" : "未達"}最低樣本數 ${q.sp_minn} 份`);
      }
      return T.sample({ ...p, ...q, rates: r.join("；") }) + (R || "");
    },
    empty: "（請至少填入研究母體或勾選抽樣方法）",
    next: "下一步：貼到一般 AI 對話；【待補】與【待補引用】請補上資料與文獻後，到「修訂論文」反白該句補強。"
  },
  analysis: {
    label: "資料分析方法", target: "nlm",
    hint: "說明統計方法的選用理由，再依分析順序說明每種方法的目的、做法與判斷準則。門檻值的出處只取自上傳文獻，找不到的標【待補引用】。",
    fields: [
      { id: "an_soft", type: "text", label: "統計軟體與版本", placeholder: "例如：SPSS 27、SmartPLS 4" },
      { id: "an_boot", type: "text", label: "拔靴法（Bootstrap）次數", hint: "選填；有中介或 PLS-SEM 時需要", placeholder: "例如：5,000 次" },
      { id: "an_methods", type: "checks", label: "採用的分析方法", hint: "依分析進行的順序排列", options: ANALYSES, value: ["desc", "cmv", "rel", "cfa", "corr", "pls", "med"] },
      { id: "hy_paths", type: "textarea", label: "研究假說", hint: "選填；與第二章「第二章架構」共用同一份內容", rows: 4 },
      { id: "an_dv", type: "textarea", label: "須特別檢驗區別效度的構念配對", hint: "選填；概念相近的構念，一行一組；與 4.2 信效度分析共用", rows: 2, placeholder: "例如：促銷傾向｜認知型衝動購買" },
      { id: "an_criteria", type: "textarea", label: "指定的判斷準則與出處", hint: "選填；沒填的門檻由上傳文獻找出處", rows: 3, placeholder: "例如：AVE > .50（Fornell & Larcker, 1981）" },
      ...partBoxes("an_b", "analysis", p => anParts(p))
    ],
    rules: () => R3,
    build: p => anParts(p)[0] || "", status: p => partsNote(anParts(p)),
    empty: "（請至少勾選一種分析方法）",
    next: "下一步：貼到已上傳統計方法文獻（例如 Hair et al.、Henseler et al.、Podsakoff et al.）的 NotebookLM 對話；【待補引用】請上傳原始文獻後再問一次。"
  },

  // ─── 論文撰寫：第三章 ───
  ch2plan: {
    label: "第二章架構", target: "tool", noReply: true,
    hint: "第二章依研究架構分節：理論基礎，再來是各變數一節（依變數在前，同一構念的不同面向合在同一節）。假說在各變數一節推導：每條假說歸到影響方變數的那一節，中介假說歸中介變數、調節假說歸調節變數。下方每一行是一節，格式為「節名：本節涵蓋的變數」；可以改名、合併、調整順序，左側目錄會立即更新。",
    fields: [
      { id: "ch2_plan", type: "textarea", label: "各變數的節（一行一節）", hint: "自動依架構圖產生（依變數在前）；改了之後若想回到預設，清空欄位後按「重新帶入」", rows: 6, placeholder: "衝動購買：認知型衝動購買、情感型衝動購買\n線上瀏覽：功利型瀏覽、享樂型瀏覽\n促銷傾向：促銷傾向\n社會影響從眾：社會影響從眾" },
      { id: "hy_paths", type: "textarea", label: "研究假說（一行一條，含預期方向）", hint: "與 1.2、3.4、4.3 共用同一份內容；自動依架構圖產生，請補上預期方向。每條假說會歸到其影響方變數的一節推導", rows: 6, placeholder: "H1：享樂型瀏覽 → 情感型衝動購買（正向）\nH2：功利型瀏覽中介促銷傾向與認知型衝動購買之關係\nH3：社會影響從眾 調節（享樂型瀏覽 → 情感型衝動購買）" },
      { id: "hy_renum", type: "button", label: "依章節順序重新編號", hint: "讓 H1、H2…的順序與第二章各節的出現順序一致，並把各章節論文內容中的假說編號一起改成現行編號；已經編號過也可以再按一次，用來同步論文內容", run: () => hypRenumber() },
      { id: "ch2_prev", type: "cands", label: "第二章目錄預覽", render: () => ch2PrevHtml() }
    ],
    seed: () => ({ ch2_plan: ch2Default(), hy_paths: archHyp() }), seedQuiet: ["hy_paths"], seedFrom: "架構圖", seedNote: "各變數的節與研究假說由 3.1／0.3 的架構圖自動產生",
    build: () => "", empty: "（設定完成後，到左側目錄的第二章各節撰寫）"
  },
  ch2th: {
    label: "撰寫理論基礎", target: "nlm",
    hint: "以一個統攝的理論說明各變數之間的機制，並把本研究的變數對應到理論的要素。",
    fields: [
      { id: "cv_arch", type: "textarea", label: "研究題目與研究架構", hint: "第二章各節共用；自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "th_theory", type: "text", label: "理論", hint: "選填；例如「刺激—機體—反應模型（S-O-R）」；留白則請 NotebookLM 依相近文獻建議" },
      ...partBoxes("th_b", "ch2th", p => thParts(p))
    ],
    seed: () => ({ cv_arch: bgSeed().bg_topic }), seedQuiet: ["cv_arch"], seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5、3.1／0.3 帶入",
    rules: () => ["citation", "style", "journal", "ch2"],
    build: p => thParts(p)[0] || "", status: p => partsNote(thParts(p)),
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  ch2var: {
    label: "撰寫本節", target: "nlm",
    hint: "依序撰寫本節構念的定義、面向、相關理論、前因與後果、衡量方式（概念層次）；本節分配到假說時，接著推導這些假說。",
    fields: [
      { id: "cv_title", type: "text", label: "節名", hint: "由「第二章架構」帶入" },
      { id: "cv_vars", type: "text", label: "本節涵蓋的變數", hint: "由「第二章架構」帶入；兩個以上面向會以子標題分開" },
      { id: "cv_arch", type: "textarea", label: "研究題目與研究架構", hint: "第二章各節共用；自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "cv_hyps", type: "cands", label: "本節要推導的假說", render: () => { const h = ch2SecHyps(store.sec); return h.length ? `<ol class="hlist">${h.map(x => `<li>${esc(x)}</li>`).join("")}</ol><p class="hint">假說的文字與歸屬在「第二章架構」修改。</p>` : `<p class="hint">本節沒有分配到假說，只介紹構念；前因與後果只做類別概述。假說的歸屬在「第二章架構」修改。</p>`; } },
      ...partBoxes("cv_b", "ch2var", p => cvParts(p))
    ],
    seed: () => ({ cv_arch: bgSeed().bg_topic }), seedQuiet: ["cv_arch"], seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5、3.1／0.3 帶入",
    rules: () => ["citation", "style", "journal", "ch2"],
    build: p => cvParts(p)[0] || "", status: p => partsNote(cvParts(p)),
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構，並在「第二章架構」設定本節）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話；【待補文獻】請補上傳文獻後再補寫。"
  },
  hylist: {
    label: "假說清單", target: "tool", noReply: true,
    hint: "3.1 只列出假說；假說的推導寫在第二章各變數一節。下方會從第二章各節的論文內容中取出每一條假說敘述。",
    fields: [{ id: "hl_view", type: "cands", label: "", render: () => hlView() },
      { id: "hl_put", type: "button", label: "放入本節論文內容", hint: "把上方的假說清單接在 3.1 架構說明之後；已放過時只更新假說清單，不影響前面的架構說明", run: () => hlPut() }],
    build: () => hlText(), copyLabel: "複製假說清單", empty: "（第二章各變數一節還沒有出現「H1：……」形式的假說敘述）"
  },
  hypo: {
    label: "假說推導", target: "nlm",
    hint: "依研究架構逐條撰寫假說推導：概念連結 → 理論依據 → 實證證據 → 推論至本研究情境 → 假說敘述，並檢核每條假說的文獻支持度。",
    fields: [
      { id: "hy_paths", type: "textarea", label: "研究架構", hint: "一行一條假說，含預期方向", rows: 6,
        placeholder: "H1：品牌人格 → 自我一致性（正向）\nH2：自我一致性 → 品牌依附（正向）\nH3：自我一致性中介品牌人格與品牌依附之關係" },
      { id: "hy_ctx", type: "text", label: "研究情境", hint: "選填", placeholder: "例如：台灣精釀啤酒消費者" }
    ],
    rules: () => ["citation", "evidence", "style", "verify"],
    build: (p, R) => blank(p.hy_paths) ? "" : T.hypo({ paths: p.hy_paths.trim(), ctx: p.hy_ctx }) + R,
    empty: "（請填入研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。研究架構圖可用{#m7a}畫出。"
  },
  opdef: {
    label: "操作型定義與衡量", target: "nlm",
    hint: "依第二章各節的順序，逐一交代構念的定義（摘要第二章的界定，再依研究情境提出本研究的定義）、操作型定義、量表來源與選用理由、題數與量尺、原研究信效度（一句帶過）、題項修改內容與理由，並輸出題項對照與量表彙整表。",
    fields: [
      { id: "od_list", type: "textarea", label: "構念清單", hint: "一行一個；可附上預計採用的量表", rows: 6,
        placeholder: "品牌人格｜預計採用 Aaker (1997)\n自我一致性\n品牌依附" },
      { id: "od_scale", type: "text", label: "量尺形式", hint: "選填；請寫出點數與端點文字", placeholder: "例如：Likert 七點量尺，1 為非常不同意、7 為非常同意" },
      { id: "od_defs", type: "cands", label: "要寫進 3.2 的構念與第二章的界定", render: () => odDefsView() },
      { id: "sp_pretest", type: "textarea", label: "前測", hint: "選填；有做前測（或計畫書階段預定做前測）才填，會另產生一則 Prompt，寫成本節最後一段。請寫明前測樣本是否併入正式樣本", rows: 3,
        placeholder: "例如：2026 年 2 月以網路問卷對 40 位近一年曾於蝦皮購物的消費者進行前測，前測樣本不併入正式樣本；各構念 Cronbach's α 介於 .78 至 .91；依填答者意見修改第 5 題的用語" },
      ...[2, 3, 4, 5, 6, 7].map(k => ({ id: "od_b" + k, type: "promptbox", afterOut: true, label: `第 ${k} 則 Prompt`, when: p => odParts(p).length >= k,
        hint: "上一則的回覆完成後，在同一個對話接著送出；每則回覆都貼到下方同一個「AI 回覆」欄位，接在前一則之後，不要覆蓋",
        copyLabel: `${"②③④⑤⑥⑦"[k - 2]} 複製第 ${k} 則 Prompt（同一個對話接著送出）`, build: p => odParts(p)[k - 1] || "" })),
      { id: "od_pre", type: "promptbox", afterOut: true, label: "前測段落 Prompt（最後送出）", when: p => !blank(p.sp_pretest) && odParts(p).length > 0,
        hint: "前面各則的回覆都完成後，在同一個對話最後送出；回覆接在「AI 回覆」欄位最後，不要覆蓋", copyLabel: "複製前測段落 Prompt（同一個對話最後送出）",
        build: p => blank(p.sp_pretest) ? "" : T.odpre({ pre: p.sp_pretest, plan: (store.values.sp_stage || SP_STAGE0) === "plan" }) }
    ],
    seed: () => { const F = finalSurvey(); return F ? { od_list: F.cons.map(c => c.name + (c.src ? "｜預計採用 " + c.src : "")).join("\n"), od_scale: F.scale } : {}; },
    seedFrom: "0.4「定稿問卷」", seedNote: "構念清單與量尺由 0.4「定稿問卷」帶入（未填定稿時用 0.4 的問卷預覽），各構念的中文題項與第二章的界定會一併附在 Prompt 中",
    rules: () => [...R3, "verify"],
    status: p => odParts(p).length > 1 ? `內容較長，Prompt 分成 ${odParts(p).length} 則依序送出（NotebookLM 單次輸入有字數上限）；共用規則較長時，會先送規則（NotebookLM 只回覆「已收到」）。` : "",
    build: p => odParts(p)[0] || "",
    empty: "（請填入構念清單）",
    next: "下一步：貼到已上傳量表原始文獻的 NotebookLM 對話；量表出處與信度數值請再對照原文確認。題項有修改時，修改理由要寫得出來，口試常會被問。"
  },

  // ─── 論文撰寫：第四章 ───
  stats: {
    label: "統計結果轉 APA", target: "ai",
    hint: "把統計軟體的原始輸出轉成 APA7 表格與 Results 段落；填了假說清單，會再整理假說檢定彙整表。所有數值只能來自您貼上的輸出。",
    fields: [
      { id: "st_part", type: "radio", label: "撰寫哪一節", options: [["sample", "樣本描述"], ["rel", "信效度分析"], ["hypo", "假說檢定"]], value: "hypo" },
      { id: "st_soft", type: "radio", label: "統計軟體", options: [["spss", "SPSS"], ["pls", "SmartPLS"], ["amos", "AMOS"], ["other", "其他"]], value: "spss" },
      { id: "st_raw", type: "textarea", label: "原始統計輸出", hint: "從軟體複製的純文字", rows: 10, mono: true },
      { id: "hy_paths", type: "textarea", label: "假說清單", hint: "選填；與第二章「第二章架構」共用同一份內容", rows: 4, placeholder: "H1：品牌人格 → 自我一致性（正向）" },
      { id: "an_dv", type: "textarea", label: "須特別檢驗區別效度的構念配對", hint: "選填；與 3.4 資料分析方法共用，一行一組", rows: 2, when: p => p.st_part === "rel", placeholder: "例如：促銷傾向｜認知型衝動購買" },
      { id: "sp_nrb", type: "text", label: "未回應偏差檢驗的做法", hint: "選填；有做才填。檢定的輸出一併貼在上方「原始統計輸出」", when: p => p.st_part === "sample", placeholder: "例如：比較前 25% 與後 25% 回收者在人口統計變數與各構念上的差異" }
    ],
    build: p => blank(p.st_raw) ? "" : T.stats({ part: p.st_part, soft: p.st_soft, raw: p.st_raw.trim(), hyps: (p.hy_paths || "").trim(), dv: p.st_part === "rel" ? (p.an_dv || "").trim() : "", nrb: p.st_part === "sample" ? (p.sp_nrb || "").trim() : "" }),
    empty: "（請貼上統計軟體的原始輸出）",
    next: "下一步：貼到一般 AI 對話。表格與段落中的每個數值，請再與原始輸出逐一核對；假說檢定彙整可直接帶到{#discuss}。"
  },

  // ─── 論文撰寫：第五章 ───
  discuss: {
    label: "討論、意涵與限制", target: "nlm",
    hint: "依假說檢定結果逐條對照文獻，撰寫研究發現與討論、理論意涵、實務意涵、研究限制與未來研究方向。",
    fields: [
      { id: "ds_results", type: "textarea", label: "假說檢定結果", hint: "可貼上{#stats}的假說檢定彙整", rows: 6 },
      { id: "ds_ctx", type: "text", label: "研究情境與樣本", hint: "選填", placeholder: "例如：台灣精釀啤酒消費者，有效問卷 412 份" },
      { id: "ds_secs", type: "checks", label: "要撰寫的節", options: Object.entries(DISCUSS_SECS).map(([k, v]) => [k, v[0]]), value: Object.keys(DISCUSS_SECS) }
    ],
    rules: () => ["citation", "evidence", "style", "verify"],
    build: (p, R) => (blank(p.ds_results) || !p.ds_secs.length) ? "" : T.discuss({ results: p.ds_results.trim(), ctx: p.ds_ctx, secs: p.ds_secs }) + R,
    empty: "（請貼上假說檢定結果，並至少勾選一節）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },

  // ─── 論文撰寫：各章通用 ───
  dr: {
    label: "修訂論文", target: "nlm",
    // 換到另一節時，清掉上一節帶入的「論文段落」與融合選取，避免把別節的內容送去改寫
    init: () => { const v = store.values, sid = drSid() || store.sec; if (v.dr_text_sid !== sid) { v.dr_text = ""; v.dr_ask = ""; v.dr_sel = []; v.dr_text_sid = sid; } },
    hint: "潤飾：段落已大致完成、只想修掉問題時使用，保留原句型，字數不增加，並列出修改清單。補強：段落還缺東西時使用，字數不減。精簡：內容齊全但太冗長，字數必須減少，可設定目標長度。整節統整：整節去除重複、調整段落順序與邏輯。融合：把幾段合併成一段。都會先核實引用。",
    fields: [
      { id: "dr_stage", type: "radio", top: true, label: "改寫方向", options: [["keep", "潤飾（保留原句型，只改有問題處）"], ["draft", "補強（字數不減）"], ["final", "精簡（術語查證＋字數必減）"], ["whole", "整節統整（整節去重複、調整段落順序與邏輯）"], ["merge", "融合（多段合併，討論先後邏輯）"]], value: "draft" },
      { id: "dr_hlbox", type: "cands", label: "要修改的文字", when: p => inThesisSec() && p.dr_stage !== "whole", render: () => `<p class="hint"><button type="button" class="copy" data-drhl="1">用反白的文字</button> 在下方「本節論文內容」反白要修改的文字（可跨段落，融合時反白要合併的幾段），再按這個按鈕帶入「論文段落」；改寫後按「以此取代反白的部分」，只替換那一塊。</p>` },
      { id: "dr_paras", type: "cands", label: "本節的段落", when: p => !inThesisSec() && drParas().length > 0 && p.dr_stage !== "whole", render: () => drView() },
      { id: "dr_sec", type: "radio", label: "要修訂哪一節", hint: "列出已有定稿內容的章節", when: () => !inThesisSec(),
        get options() { const ss = THESIS_SECS().filter(s => !blank(finText(s.id))); return ss.length ? ss.map(s => [s.id, `${s.no} ${s.title}`]) : [["", "（還沒有任何章節有定稿內容）"]]; } },
      { id: "dr_back", type: "cands", label: "", when: () => !inThesisSec() && !!drSid(), render: () => `<p class="hint"><button type="button" data-go="${drSid()}" data-gostep="0">← 回到 ${esc(secLabel(drSid()))}</button>　修訂結果按「以此取代」後，會直接更新該節的定稿。</p>` },
      { id: "dw_info", type: "cands", label: "", when: p => p.dr_stage === "whole", render: () => { const sid = drSid(), t = sid ? finText(sid) : "";
        if (!sid) return `<p class="note warn">請先在上方選擇要修訂的章節。</p>`;
        return t ? `<p class="note">整節統整會自動帶入「${esc(secLabel(sid))}」定稿的全文（約 ${zhCount(t)} 字），請 NotebookLM 先診斷各段重點與重複之處，再輸出修訂後的全文；只能沿用原文已有的引用。</p>` : `<p class="note warn">本節還沒有定稿內容。</p>`; } },
      { id: "dr_full", type: "checks", label: "上下文", options: [["on", "附上本節全文（要檢查與本節其他段落是否重複時勾選；全文較長時 Prompt 會分成多則）"]], value: [], when: p => inThesisSec() && (p.dr_stage === "draft" || p.dr_stage === "final" || p.dr_stage === "keep") },
      { id: "dr_len", type: "radio", label: "精簡目標", options: [["auto", "比原文少即可"], ["70", "約原文 70%"], ["50", "約原文 50%"], ["n", "指定字數"]], value: "auto", when: p => p.dr_stage === "final" || p.dr_stage === "whole" },
      { id: "dr_lenN", type: "text", label: "目標字數", placeholder: "例如 600", when: p => (p.dr_stage === "final" || p.dr_stage === "whole") && p.dr_len === "n" },
      { id: "dr_stat", type: "checks", label: "統計數據", options: [["on", "每個論點最多保留 1–2 個關鍵數字，其餘改成文字概述"]], value: ["on"], when: p => (p.dr_stage === "final" || p.dr_stage === "whole") && !drCh2() },
      { id: "dr_rules", type: "promptbox", get label() { return drCh1() ? "第一章共用規則（引用格式、文字風格、第一章寫作規範）" : drCh2() ? "第二章共用規則（含第二章寫作規範）" : drCh3() ? "第三章共用規則（含第三章寫作規範）" : "共用規則"; }, hint: "每個 NotebookLM 對話只要先送一次（NotebookLM 會回覆「已收到」），之後每一段都送下方的 Prompt 即可；避免每段都超過字數上限",
        get copyLabel() { const n = drRuleParts(valuesOf(DEFS.dr)).length; return `先送這則：複製${drCh1() ? "第一章" : drCh2() ? "第二章" : drCh3() ? "第三章" : ""}共用規則${n > 1 ? `第 1／${n} 則` : ""}（每個對話一次）`; }, build: p => drRuleParts(p)[0] || "" },
      ...[2, 3].map(k => ({ id: "dr_rules" + k, type: "promptbox", label: `共用規則第 ${k} 則`, when: p => drRuleParts(p).length >= k,
        hint: "共用規則較長，分成數則；上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出", copyLabel: `接著送：複製共用規則第 ${k} 則`, build: p => drRuleParts(p)[k - 1] || "" })),
      { id: "dr_text", type: "textarea", label: "論文段落", when: p => p.dr_stage !== "whole", get hint() { return inThesisSec() ? "按上方「用反白的文字」帶入；也可以自己貼上" : "按上方「用這一段」自動帶入；融合時按「加入融合」可選多段；也可以自己貼上"; }, rows: 8 },
      { id: "dr_ask", type: "textarea", label: "我的追問與修改意見（選填）", hint: "例如：兩個理論都必要嗎？為什麼 Yassin & Soares（2023）不算支持證據？NotebookLM 會先逐題回答，再依回答修改；反白新的文字時會自動清空", rows: 3, placeholder: "一行一個問題或意見" },
      ...[2, 3, 4, 5, 6, 7, 8].map(k => ({ id: "dw_b" + k, type: "promptbox", afterOut: true, when: p => drParts(p).length >= k,
        get label() { const n = drParts(valuesOf(DEFS.dr)).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始改寫）` : `第 ${k} 則 Prompt`; },
        hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出；最後一則送出後才會開始改寫",
        copyLabel: `${"②③④⑤⑥⑦"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => drParts(p)[k - 1] || "" }))
    ],
    variant: p => p.dr_stage,
    replyView: t => drResultView(t),
    rules: p => drCh1() ? ["citation", "style", "journal", "ch1"] : [...(p.dr_stage === "final" || p.dr_stage === "keep" ? ["citation", "style"] : ["citation", "evidence", "style"]), "journal", ...(drCh2() ? ["ch2"] : drCh3() ? ["ch3"] : [])],
    build: (p, R) => { DR_R = R || ""; return drParts(p)[0] || ""; },
    status: p => [drParts(p).length > 1 ? `內容較長，Prompt 自動分成 ${drParts(p).length} 則：前幾則是本節全文（NotebookLM 只會回覆「已收到」），最後一則才開始${p.dr_stage === "whole" ? "統整" : "改寫"}；請在同一個對話依序送出。` : "",
      (p.dr_stage === "final" || p.dr_stage === "whole") && !blank(drBase(p)) ? drLenNote(p) : ""].filter(Boolean).join("\n"),
    empty: "（請貼上論文段落）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  polish: {
    label: "潤色與去 AI 味", target: "ai",
    hint: "潤色：只修正語病與邏輯漏洞，原文通順就保留。去 AI 味：把機器味、翻譯腔重寫成自然的學術表達。不涉及查證文獻，所以貼到一般 AI 即可。",
    fields: [
      { id: "po_mode", type: "radio", label: "處理方式", options: [["suggest", "逐句修改建議（只列需要改的句子，逐句採用）"], ["polish", "潤色（輸出全文）"], ["dehai", "去 AI 味（輸出全文）"]], value: "suggest" },
      { id: "po_lang", type: "radio", label: "段落語言", options: [["zh", "中文"], ["en", "英文"]], value: "zh", when: p => p.po_mode !== "suggest" },
      { id: "po_load", type: "button", label: "帶入本節定稿", hint: "把「本節論文內容」的全文帶入下方；也可以只貼其中幾段", when: () => THESIS_SECS().some(x => x.id === store.sec),
        run: () => { const t = finText(store.sec); if (blank(t)) return "本節還沒有定稿內容。"; store.values.po_text = t; return "已帶入本節定稿。"; } },
      { id: "po_text", type: "textarea", label: "論文段落", rows: 8 }
    ],
    replyView: t => store.values.po_mode === "suggest" || !store.values.po_mode ? poView(t) : "",
    build: p => blank(p.po_text) ? "" : p.po_mode === "suggest" ? T.polish_suggest({ text: p.po_text.trim() }) : T[`${p.po_mode}_${p.po_lang}`]({ text: p.po_text.trim() }),
    empty: "（請貼上論文段落）",
    next: "下一步：貼到一般 AI 對話。若段落含引用且尚未核實，請先用{#dr}。"
  },

  // ─── 兩頁共用：小工具 ───
  ttl: {
    label: "論文題目", target: "nlm",
    get hint() { return `依${RT() === "model" ? "研究模型組" : " 0.3 檢核後的研究架構"}，請 NotebookLM 參考上傳文獻的題目寫法，提出數個中英文題目候選並比較優缺點；選定或修改後，把定稿題目填在最下方。`; },
    fields: [
      { id: "tt_n", type: "radio", label: "候選題目數", options: [["3", "3 個"], ["5", "5 個"]], value: "5" },
      { id: "tt_pref", type: "textarea", label: "題目偏好", hint: "選填；例如要不要包含研究情境、以哪個機制為主軸、字數限制", rows: 2, placeholder: "例如：要包含「蝦皮」；以雙路徑瀏覽為主軸；中文 30 字以內" },
      { id: "tt_zh", type: "text", below: true, label: "定稿題目（中文）", hint: "會成為論文草稿檔的標題", placeholder: "例如：促銷傾向與社會從眾對線上衝動購買之影響：以瀏覽動機為中介" },
      { id: "tt_en", type: "text", below: true, label: "定稿題目（英文）", hint: "選填", placeholder: "例如：The Effects of Deal Proneness and Social Influence on Online Impulse Buying" }
    ],
    rules: () => ["citation"],
    build: (p, R) => { const md = RT() === "model", t = md ? (modelText() && [modelText(), ...(pdVarText() ? ["", "研究變數：", pdVarText()] : [])].join("\n")) : f31Text() || ttlArch(); return t ? T.title({ arch: t, model: md, ctx: (store.values.as_ctx || "").trim(), n: p.tt_n, pref: (p.tt_pref || "").trim() }) + R : ""; },
    get empty() { return RT() === "model" ? "（0.2 還沒有研究模型組）" : "（0.3 還沒有研究架構）"; },
    next: "下一步：題目定稿後，到{#asp}開始撰寫第一章。"
  },
  fa31: {
    label: "研究架構圖與說明", target: "nlm",
    hint: "由 0.3 檢核後的研究架構自動帶入架構圖，可微調位置後按「下載 PNG」或「複製圖片」放進論文；再複製 Prompt，請 NotebookLM 撰寫 3.1 的架構說明（研究設計類型、各變數在架構中的角色）。第二章的假說會自動接在架構說明之後。",
    fields: [
      { id: "f31_diag", type: "diagram", label: "研究架構圖（由 0.3 帶入）", hint: "拖曳方塊調整位置；點一個方塊再點另一個方塊可加箭頭；未選方塊時點箭頭可刪除。0.3 的架構改過後，按「依文字重畫」更新",
        emptyHint: "（0.3 還沒有研究架構：請先完成 0.3 研究架構合理性檢核）",
        source: () => finalArch().vars,
        seed: () => { const { d } = finalArch(); return { sig: JSON.stringify([d.edges, d.mods].map(l => l.map(x => [x.from, x.to || x.edge]))), edges: d.edges, mods: d.mods, pos: d.pos }; } },
      { id: "f31_theory", type: "text", label: "理論基礎", hint: "由第二章 2.1 帶入；不填時由 NotebookLM 依文獻判斷", placeholder: "例如：刺激—有機體—反應（S-O-R）模式" },
      { id: "f31_scope", type: "textarea", label: "研究範圍（由 1.3 帶入）", hint: "研究設計的情境與對象依此撰寫；問卷平台、發放管道與期間寫在 3.3，不寫入 3.1", rows: 4 },
      ...partBoxes("f31_b", "fa31", p => f31Parts(p)),
      { id: "hl_view", type: "cands", below: true, label: "研究假說（自動接在架構說明之後）", render: () => hlView() },
      { id: "hl_put", type: "button", below: true, label: "更新本節論文內容中的假說清單", hint: "第二章的假說改過、或本節論文內容修改過之後，按這裡把清單換成第二章的最新版本；不影響前面的架構說明", run: () => hlPut() }
    ],
    seed: () => ({ f31_theory: (store.values.th_theory || "").trim(), f31_scope: finText("s1-3").trim() }), seedQuiet: ["f31_scope"], seedFrom: "2.1 與 1.3", seedNote: "理論基礎由第二章 2.1 的「理論」欄位帶入，研究範圍由 1.3 的論文內容帶入",
    rules: () => R3,
    build: p => f31Parts(p)[0] || "", status: p => partsNote(f31Parts(p)),
    empty: "（0.3 還沒有研究架構）",
    next: "下一步：貼到已上傳理論文獻的 NotebookLM 對話，回覆貼到下方「AI 回覆」；第二章的假說清單會自動接在架構說明之後。"
  },
  m7a: {
    label: "文字轉關係圖", target: "nlm",
    hint: "任何一段已生成的文字都可以畫成 Mermaid 關係圖，每個主題群各畫一張；也可用來畫第三章的研究架構圖。",
    fields: [{ id: "m7a_text", type: "textarea", label: "要畫成關係圖的文字", rows: 8 }],
    rules: () => [],
    build: (p, R) => blank(p.m7a_text) ? "" : T.m7a({ content: p.m7a_text }) + R,
    empty: "（請貼上要畫圖的文字）",
    next: "下一步：貼到 NotebookLM（建議在產生這段文字的同一個對話）；回覆整段複製後，到{#m7b}補好圍籬。"
  },
  abstract: {
    label: "中英文摘要", target: "ai",
    hint: "依研究目的、研究方法、主要發現、結論與意涵的順序，產生中文摘要、關鍵詞、Abstract 與 Keywords；只寫各章定稿中已有的內容，還沒有的部分直接略過。3.3 選「論文計畫書」版時，摘要以預定語氣撰寫，不寫研究發現。",
    fields: [
      { id: "ab_src", type: "textarea", label: "各章定稿（自動帶入）", hint: "帶入 1.2 研究目的、第三章研究方法、4.3 假說檢定與第五章；可自行增刪", rows: 8 },
      { id: "ab_len", type: "text", label: "中文摘要字數", hint: "選填", placeholder: "例如：500 字以內", value: "500 字以內" }
    ],
    seed: () => ({ ab_src: abSource() }), seedQuiet: ["ab_src"], seedFrom: "各章定稿", seedNote: "研究目的、研究方法、研究結果與結論由各章定稿帶入",
    build: p => blank(p.ab_src) ? "" : T.abstract({ title: (store.values.tt_zh || "").trim(), titleEn: (store.values.tt_en || "").trim(), src: p.ab_src.trim(), len: (p.ab_len || "").trim(), plan: (store.values.sp_stage || SP_STAGE0) === "plan" }),
    empty: "（第一章到第五章還沒有定稿內容）",
    next: "下一步：貼到一般 AI；回覆貼到下方「AI 回覆」，下載 Word 檔時會放進摘要與 Abstract 頁。"
  },
  fulltext: {
    label: "論文全文", target: "tool",
    hint: "依章節顯示各節定稿，也就是「研究名稱_論文.md」的內容；要修改某一節，到該節最下方的「本節論文內容」。",
    fields: [{ id: "ins_mode", type: "radio", label: "圖表編號方式", hint: "全站的表號與圖號依此自動編排，正文中的「如表 3-1 所示」也會一起改", options: [["sec", "依節（圖 3.1-1）"], ["chap", "依章（圖 3-1）"], ["all", "全文連續（圖 1）"]], value: "sec" },
      { id: "wd_student", type: "text", label: "研究生", placeholder: "例如：王大明" },
      { id: "wd_student_en", type: "text", label: "研究生英文姓名", hint: "先名後姓", placeholder: "例如：Da-Ming Wang" },
      { id: "wd_adv", type: "text", label: "指導教授", hint: "不加「博士」；兩位以上以頓號分隔", placeholder: "例如：陳靜怡" },
      { id: "wd_adv_en", type: "text", label: "指導教授英文姓名", hint: "兩位以上以分號分隔", placeholder: "例如：Ching-Yi Chen" },
      { id: "wd_ym", type: "text", label: "畢業年月（民國）", hint: "不可早於審定書", placeholder: "例如：115 年 6 月" },
      { id: "wd_dept", type: "text", label: "學系", value: "國際企業學系" },
      { id: "wd_college", type: "text", label: "學院", value: "管理學院" },
      { id: "wd_dept_en", type: "text", label: "學系英文名稱", value: "Department of International Business" },
      { id: "wd_college_en", type: "text", label: "學院英文名稱", value: "College of Management" },
      { id: "wd_go", type: "button", label: "下載 Word 檔", hint: "依暨南大學〈中文論文格式暨範本〉排版；用 Word 開啟時，按「是」更新目次與頁碼", run: () => { wordDownload(); return "正在產生 Word 檔…"; } },
      { id: "ft_view", type: "cands", label: "", render: () => fullView() }],
    build: () => thesisBody(),
    empty: "（目前還沒有任何一節有內容）",
    copyLabel: "複製論文全文（Markdown）",
    next: "【待補】標記可到「待補資料查證」填入查證內容。"
  },
  rename: {
    label: "全站用詞取代", target: "tool", noReply: true,
    hint: "把一個用詞全面換成新用詞（例如變數改名）：各章節論文內容、AI 回覆、研究假說、第二章架構、架構圖的變數名稱、題目與問卷構念都會一併更新；第二章的節名改變時，原本那一節的內容、AI 回覆與進度會一起搬到新的節名下。",
    fields: [
      { id: "rn_old", type: "text", label: "原用詞", placeholder: "例如：特惠偏好度" },
      { id: "rn_new", type: "text", label: "新用詞", placeholder: "例如：促銷傾向" },
      { id: "rn_prev", type: "cands", label: "預覽", render: p => rnPreview(p) },
      { id: "rn_go", type: "button", label: "全部取代", run: p => rnRun(p) },
      { id: "rn_undo", type: "button", label: "復原上一次取代", hint: "回到最近一次「全部取代」之前的狀態", run: () => rnUndo() }
    ],
    build: () => "", empty: "（填入原用詞與新用詞，確認預覽後按「全部取代」）"
  },
  refs: {
    label: "參考文獻", target: "tool",
    hint: "正文中每一筆引用列成一項：自動帶入的出處（黃框）請核對後修改；找不到出處的（紅框）請填入完整的 APA 參考文獻；填過的會變成綠框並保存。",
    fields: [
      { id: "rf_bulk", type: "textarea", label: "一次貼上書目（選填）", rows: 3,
        hint: "可貼 Zotero 匯出的書目，或一般 AI 整理的參考文獻清單（一行一筆）；網站依作者與年份自動配對到下方各筆引用，配到的會變成黃框，請核對。Zotero 中文文獻的英文標點會自動改成中文 APA 格式。",
        placeholder: "Zheng, X., Men, J., Yang, F., & Gong, X. (2019). Understanding impulse buying in mobile commerce…" },
      { id: "rf_ai", type: "promptbox", label: "請一般 AI 查證並整理缺少的參考文獻", when: () => !!refFillItems(),
        hint: "列出找不到出處、或格式不是 APA 的引用（網路資料會附上回覆中的網址當線索）。貼到開啟網路搜尋的一般 AI，把回覆貼到上方「一次貼上書目」。學術文獻以 Zotero 匯出較可靠。",
        copyLabel: "複製 Prompt（貼到一般 AI，需開啟網路搜尋）", build: () => (it => it ? T.ref_fill({ items: it }) : "")(refFillItems()) },
      { id: "rf_web_on", type: "checks", label: "網路文獻格式產生器", options: [["on", "填入網頁、新聞、報告的資訊，產生 APA 第七版參考文獻"]], value: [] },
      { id: "rw_type", type: "radio", label: "類型", options: [["page", "網頁／新聞"], ["report", "報告／統計資料（PDF）"]], value: "page", when: p => isOn(p.rf_web_on) },
      { id: "rw_author", type: "text", label: "作者或機構", placeholder: "例如：經濟部統計處；個人作者寫姓名", when: p => isOn(p.rf_web_on) },
      { id: "rw_date", type: "text", label: "發布日期", hint: "網頁、新聞寫到日，例如 2026/6/30；報告寫年即可；查不到留白（會寫成「無日期」）", placeholder: "2026/6/30", when: p => isOn(p.rf_web_on) },
      { id: "rw_title", type: "text", label: "標題", hint: "網頁或報告上的完整標題", when: p => isOn(p.rf_web_on) },
      { id: "rw_site", type: "text", label: "網站名稱或出版機構", hint: "與作者相同時可留白（APA 規定相同時省略）", placeholder: "例如：經濟日報", when: p => isOn(p.rf_web_on) },
      { id: "rw_url", type: "text", label: "網址", when: p => isOn(p.rf_web_on) },
      { id: "rw_prev", type: "cands", label: "", when: p => isOn(p.rf_web_on), render: p => webRefView(p) },
      { id: "rw_fill", type: "button", label: "填入對應的引用", when: p => isOn(p.rf_web_on), run: p => webRefFill(p) },
      { id: "rf_view", type: "cands", label: "", render: () => refView() }],
    build: () => refList().join("\n"),
    empty: "（正文中還沒有引用，或尚未填入任何出處）",
    copyLabel: "複製參考文獻清單",
    next: "論文.md 最後會自動附上「參考文獻」一節（只列已有出處者）。"
  },
  ch1guide: {
    label: "第一章寫作規範", target: "tool",
    hint: "供撰寫與審查第一章時參考；下方「複製」可取得精簡版規範的純文字。",
    fields: [{ id: "g1_view", type: "cands", label: "", render: () => `<div class="guide-body">${GUIDE_CH1.full}</div>` }],
    build: () => GUIDE_CH1.ai,
    copyLabel: "複製精簡版規範",
    next: "第一章各步驟的 Prompt 會自動附上精簡版規範（附加共用規則中的「第一章寫作規範」）。"
  },
  scope: {
    label: "研究範圍", target: "nlm",
    hint: "依研究題目、研究架構、研究情境與研究對象，撰寫「研究範圍」：先說明選擇此研究情境（平台）的理由，再說明研究對象與本研究聚焦的變數；只寫聚焦在哪裡，不列排除項目。",
    fields: [
      { id: "sc_topic", type: "textarea", label: "研究題目與研究架構", hint: "自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "sc_target", type: "text", label: "研究對象", hint: "自動帶入 0.4 的研究對象", placeholder: "例如：年滿 18 歲、過去半年曾在蝦皮購物的消費者" },
      { id: "sc_extra", type: "textarea", label: "範圍補充", hint: "選填；例如研究設計實際採取的篩選條件（如以篩選題排除未曾在平台購物者）", rows: 2 },
      { id: "sc_ctx", type: "textarea", label: "研究情境資料", hint: "自動帶入 1.1 定稿中提到平台的段落（用來說明選擇此平台的理由）；可自行增刪", rows: 4 },
      ...[2, 3, 4].map(k => ({ id: "sc_b" + k, type: "promptbox", afterOut: true, when: p => scParts(p).length >= k,
        get label() { const n = scParts(valuesOf(DEFS.scope)).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始撰寫）` : `第 ${k} 則 Prompt`; },
        hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出",
        copyLabel: `${"②③"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => scParts(p)[k - 1] || "" }))
    ],
    seed: () => ({ sc_topic: bgSeed().bg_topic, sc_target: (store.values.as_target || "").trim(), sc_ctx: scCtx() }),
    seedQuiet: ["sc_ctx"],
    seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5、3.1／0.3 帶入，研究對象由 0.4 帶入",
    rules: () => ["style", "ch1"],
    build: p => scParts(p)[0] || "",
    status: p => scParts(p).length > 1 ? `內容較長，Prompt 自動分成 ${scParts(p).length} 則：前幾則是參考資料（NotebookLM 只會回覆「已收到」），最後一則才開始撰寫；請在同一個對話依序送出。` : "",
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  flow: {
    label: "研究流程", target: "ai",
    hint: "依第一章到第三章（或全文）已完成的定稿，說明本研究的主要階段、各階段的目的，以及在哪一章呈現；不需要文獻，貼到一般 AI 即可。",
    fields: [
      { id: "fl_src", type: "textarea", label: "各章定稿摘要", hint: "自動帶入第一章到第五章已有定稿的各節（研究方法各節帶入較多內容）；可自行增刪", rows: 8 },
      { id: "fl_extra", type: "textarea", label: "流程補充", hint: "選填；例如前測、專家效度、資料蒐集期間等定稿中沒寫到的步驟", rows: 2 }
    ],
    seed: () => ({ fl_src: flSummary() }),
    seedFrom: "各章定稿", seedNote: "各章定稿摘要由第一章到第五章已有定稿的各節帶入",
    rules: () => ["style"],
    build: (p, R) => blank(p.fl_src) ? "" : T.flow({ src: p.fl_src.trim(), extra: (p.fl_extra || "").trim(),
      chapters: OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).map(c => c.ch + "（" + secsOf(c).map(s => s.title).join("、") + "）").join("；") }) + R,
    empty: "（第一章到第三章還沒有定稿內容；建議第三章定稿後再寫研究流程）",
    next: "下一步：貼到一般 AI（不需要上傳文獻）。"
  },
  dprep: {
    label: "panel 資料處理", target: "tool",
    hint: "上傳一列一筆交易的原始資料，依個人代碼與日期合併成一人一日一筆的寬格式資料。下方「處理紀錄」會自動存入研究存檔（.md），可展開檢視。",
    fields: [{ id: "dp_view", type: "cands", label: "", render: () => typeof dpView === "function" ? dpView() : "" }],
    build: () => typeof dpLogShown === "function" ? dpLogShown() : (store.values.dp_log || ""),
    empty: "（完成「檢查資料」後，這裡會顯示處理紀錄）",
    noCopy: true, outLabel: "處理紀錄",
    next: "panel data 研究：處理完成後到 0.2「資料結構與估計目標」，觀察單位、時間與資料欄位留白時會自動帶入。"
  },
  tbfill: {
    label: "待補資料查證", target: "tool",
    hint: "每一項列出所在章節與前後文。查證後，把正確內容（含出處）填在下方欄位；「研究名稱_論文.md」會以填入的文字直接取代【待補】標記，請寫成可以接在原句中的文字。各章回覆最後的「需要研究者查證的背景資料」有建議的查證來源與關鍵字。",
    fields: [{ id: "tb_list", type: "cands", label: "待補清單", render: () => tbView() }],
    build: () => tbText(),
    empty: "（目前沒有待補項目，或尚未填寫任何查證內容）",
    copyLabel: "複製已查證的清單（純文字）",
    next: "填入的內容只用於論文草稿檔；網頁上各步驟的 AI 回覆保持原樣。"
  },
  m7b: {
    label: "圍籬修補", target: "tool",
    hint: "貼上 NotebookLM 的回覆（有沒有圍籬都可以），自動偵測每張圖並補上 ```mermaid 圍籬；包成 subgraph 的大圖會拆成每群一張。",
    fields: [{ id: "m7b_text", type: "textarea", label: "NotebookLM 回覆", rows: 12, mono: true }],
    build: p => { if (blank(p.m7b_text)) return ""; const r = fixFences(p.m7b_text); return r.count ? r.text : ""; },
    status: p => {
      if (blank(p.m7b_text)) return "";
      const r = fixFences(p.m7b_text);
      return r.count ? `已偵測到 ${r.count} 張圖` : "沒有偵測到任何 flowchart／graph 語法，請確認貼上的內容。";
    },
    empty: "（請貼上 NotebookLM 的回覆）",
    copyLabel: "複製結果",
    next: "下一步：貼進 Obsidian 的 .md 筆記，就會自動渲染成圖。"
  },
  // ─── 0.2 路線 D：篩選中介與調節變數 ───
  amech: {
    label: "篩選中介與調節變數", target: "nlm",
    hint: "自變數與依變數已經確定時使用：依上傳文獻找出兩者之間的中介變數與調節變數候選，逐一評估證據強度、結果一致性、理論依據、情境適用性與彼此重疊，並判定建議納入、可考慮或不建議。上傳文獻中找不到時，會直接寫「未找到」，不做推論。",
    fields: [
      { id: "am_x", type: "text", label: "自變數", hint: "建議附英文原文", placeholder: "例如：從眾性（Conformity）" },
      { id: "am_y", type: "text", label: "依變數", hint: "建議附英文原文", placeholder: "例如：衝動購買意向（Impulsive Buying Intention）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填；用來判斷文獻能否類推", placeholder: "例如：蝦皮電商平台" }
    ],
    rules: () => ["citation"],
    build: (p, R) => blank(p.am_x) || blank(p.am_y) ? "" : T.ask_mech({ x: p.am_x.trim(), y: p.am_y.trim(), ctx: (p.as_ctx || "").trim() }) + R,
    empty: "（請填入自變數與依變數）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。回覆貼到下方「AI 回覆」後，到{#asmix}按「重新帶入」，依判定勾選變數、畫出路徑；不確定的變數先移到待選區。上傳文獻中找不到的機制，補上傳文獻後再問一次。"
  },
  // ─── 0.3 研究架構合理性檢核 ───
  archx: {
    label: "拆解研究架構圖", target: "ai",
    hint: "手邊只有研究架構圖、沒有文字時使用：在一般 AI 對話上傳架構圖並貼上這段 Prompt，AI 會依圖整理出變數、角色與路徑，並列出看不清楚的地方。已有變數與假說的文字清單時，可略過這一步。",
    fields: [
      { id: "ax_note", type: "textarea", label: "圖例或補充說明", hint: "選填；圖中看不出來、但會影響判讀的資訊", rows: 2, placeholder: "例如：虛線代表調節效果；小方框為構面；H4 指向 H2 的箭頭" }
    ],
    build: p => T.arch_extract({ note: (p.ax_note || "").trim() }),
    next: "下一步：在一般 AI 開新對話，先上傳架構圖再貼上這段 Prompt。把回覆整段貼到{#archchk}的研究架構欄位，在自動畫出的架構圖上核對與修正。"
  },
  archchk: {
    label: "依文獻檢核架構", target: "nlm", stack: true,
    hint: "選擇研究架構來源：「0.2 組合研究架構」會自動帶入並畫出架構圖；「自行設計或匯入」可直接畫，或從架構圖圖片、0.3 修正後的架構匯入。產生的 Prompt 貼到已上傳文獻的 NotebookLM 對話，依勾選的制式項目檢核，並可一併提出自己的問題；回覆最後會逐條路徑總結文獻支持程度，並提出文獻支持更充分的修正架構。",
    fields: [
      { id: "ac_src", type: "radio", label: "研究架構來源", options: [["mix", "0.2 組合研究架構"], ["own", "自行設計或匯入（不經 0.2）"]], value: "mix" },
      { id: "ow_mode", type: "radio", label: "開始方式", options: [["draw", "直接畫"], ["import", "從圖片或文字匯入"]], value: "draw", when: p => p.ac_src === "own" },
      { id: "ax_note", type: "textarea", label: "圖例或補充說明", hint: "選填；圖中看不出來、但會影響判讀的資訊，會加入下方的讀圖 Prompt", rows: 2, placeholder: "例如：虛線代表調節效果；小方框為構面；H4 指向 H2 的箭頭", when: p => p.ac_src === "own" && p.ow_mode === "import" },
      { id: "ax_prompt", type: "promptbox", label: "讀圖 Prompt", when: p => p.ac_src === "own" && p.ow_mode === "import",
        hint: "有架構圖圖片時：在一般 AI（Claude、ChatGPT、Gemini）開新對話，先上傳架構圖，再貼上這段 Prompt",
        copyLabel: "複製讀圖 Prompt（貼到一般 AI，並上傳架構圖）", build: p => T.arch_extract({ note: (p.ax_note || "").trim() }) },
      { id: "ow_imp", type: "textarea", label: "要匯入的架構", hint: "貼上一般 AI 讀圖的回覆，或 0.3 修正後架構的「### 變數」「### 路徑」兩節", rows: 6, mono: true, when: p => p.ac_src === "own" && p.ow_mode === "import" },
      { id: "ow_go", type: "button", label: "匯入到圖上", hint: "會取代下方目前的變數與箭頭", when: p => p.ac_src === "own" && p.ow_mode === "import",
        run: p => {
          const r = importArch(p.ow_imp || "");
          if (!r) return "沒有讀到變數，請確認貼上的內容包含「變數」與「路徑」兩節。";
          return `已匯入 ${r.n} 個變數、${r.e} 條路徑，請在下方圖上核對。` + (r.unsure.length ? `\n讀圖時無法確定之處：${r.unsure.join("；")}` : "");
        } },
      { id: "ow_vars", type: "textarea", when: p => p.ac_src === "own", label: "變數", hint: "每行一個：角色｜變數名稱（英文原文）。角色為自變數、中介變數、調節變數、依變數或控制變數；省略角色時，依圖上的箭頭判斷", rows: 6, mono: true,
        placeholder: "自變數｜演算法推薦（Algorithmic Recommendation）\n中介變數｜顧客靈感（Customer Inspiration）\n調節變數｜說服知識（Persuasion Knowledge）\n依變數｜衝動購買意圖（Impulse Buying Intention）" },
      { id: "ow_diag", type: "diagram", when: p => p.ac_src === "own", label: "研究架構圖", hint: "拖曳方塊調整位置；點一個方塊再點另一個方塊，畫出箭頭；先點調節變數再點一條箭頭，畫出調節虛線；未選方塊時點箭頭或虛線可刪除",
        emptyHint: "（輸入變數後，這裡會出現方塊）",
        tray: true, all: p => ownVars(p, true), source: p => ownVars(p),
        onRemove: k => { store.values.ow_vars = (store.values.ow_vars || "").split(/\r?\n/).filter(l => { const v = parseOwnVars(l)[0]; return !v || v.key !== k; }).join("\n"); } },
      { id: "ac_diag", type: "diagram", when: p => p.ac_src !== "own", label: "研究架構圖", hint: "依 0.2 的架構自動畫出，請核對是否正確；要修改請回到 0.2。在此圖上的修改只用於這次檢核",
        emptyHint: "（0.2 還沒有架構：請先在 0.2 勾選變數並畫出路徑）",
        source: p => parseArch(archSrcText(p)).vars,
        seed: p => { const A = parseArch(archSrcText(p)); return { sig: JSON.stringify([A.edges, A.mods].map(l => l.map(x => [x.from, x.to || x.edge]))), edges: A.edges.map(({ from, to }) => ({ from, to })), mods: A.mods.map(({ from, edge }) => ({ from, edge })) }; } },
      { id: "ac_theory", type: "text", label: "理論基礎", hint: "選填；架構圖上通常沒有，有採用特定理論時填入", placeholder: "例如：自我一致性理論（Self-Congruity Theory）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "ac_checks", type: "checks", label: "制式檢核項目", hint: "可全部取消，只問自己的問題",
        options: ARCH_CHECKS.map(c => [c.key, c.label]), value: ARCH_CHECKS.map(c => c.key) },
      { id: "ac_extra", type: "checks", label: "檢核之後", options: [["revise", "提出文獻支持更充分的修正架構"]], value: ["revise"] },
      { id: "ac_qs", type: "textarea", label: "我的問題", hint: "選填；每行一題，會與制式項目一起送出", rows: 4,
        placeholder: "我把品牌熟悉度設為調節變數，文獻中比較常把它當成調節變數、中介變數，還是前因？\n文獻支持 H2 的研究多半是哪些產品類別？" },
      { id: "ac_detail", type: "promptbox", afterOut: true, label: "第二則 Prompt：路徑依據、變數衡量、研究缺口與學術貢獻",
        hint: "第一則的回覆完成後，在同一個對話接著送出；兩則回覆依序貼到下方「AI 回覆」",
        copyLabel: "② 複製第二則 Prompt（同一個對話接著送出）",
        build: p => T.ask_detail({ target: (p.ac_extra || []).includes("revise") ? "若上一則已提出修正後的研究架構，以修正後的架構為準；否則針對下列研究架構" : "針對下列研究架構", arch: archOut(p) }) }
    ],
    replyView: t => revisedView(t) + qaView(t, splitLines(store.values.ac_qs)) + (secondMissing(t) ? secondView(t) : pathView(t) + measureView(t, "")),
    rules: () => ["citation"],
    build: (p, R) => {
      const raw = archSrcText(p).trim(), qs = splitLines(p.ac_qs);
      if (!raw || (!p.ac_checks.length && !qs.length)) return "";
      return T.arch_check({ arch: archOut(p), theory: (p.ac_theory || "").trim(), ctx: (p.as_ctx || "").trim(), checks: p.ac_checks, qs, revise: (p.ac_extra || []).includes("revise") }) + R;
    },
    status: p => {
      const src = archSrcText(p), own = p.ac_src === "own";
      if (blank(src)) return own ? "請輸入變數，或從圖片、文字匯入。" : "0.2「組合研究架構」還沒有勾選變數。";
      const A = parseArch(src);
      if (!A.edges.length) return own ? "請在下方圖上畫出路徑。" : "0.2 的架構圖還沒有畫箭頭，請回到 0.2 畫好路徑。";
      return `已讀取 ${A.vars.length} 個變數、${A.edges.length} 條路徑` + (A.mods.length ? `、${A.mods.length} 條調節路徑` : "") + "。" +
        (own ? trayNote("ow_diag") : "要修改請回到 0.2；在下方圖上的修改只用於這次檢核。");
    },
    empty: "（請提供研究架構：貼上文字，或選擇 0.2 的架構；並至少勾選一個檢核項目或填入一個問題）",
    next: "下一步：貼到已上傳文獻的 NotebookLM 對話，回覆貼到下方「AI 回覆」，網頁會畫出 AI 修正後的架構，並整理變數定義與衡量。還有疑問時，用{#archq}在同一個對話接著問。"
  },
  archq: {
    label: "追問", target: "nlm",
    hint: "讀完檢核回覆後，針對特定路徑或變數再提問。在同一個 NotebookLM 對話接續貼上，AI 會沿用前面貼過的研究架構。",
    fields: [
      { id: "aq_qs", type: "textarea", label: "我的問題", hint: "每行一題；一次問一到兩題，回答會比較深入", rows: 4,
        placeholder: "H3 的支持證據是否都來自西方樣本？有沒有亞洲或台灣的研究？\n請扮演口試委員，針對 H2 提出三個最可能被質疑的問題，每題附文獻依據。" }
    ],
    replyView: t => qaView(t, splitLines(store.values.aq_qs)),
    rules: () => ["citation"],
    build: (p, R) => { const qs = splitLines(p.aq_qs); return qs.length ? T.arch_followup({ qs, model: RT() === "model" }) + R : ""; },
    empty: "（請填入至少一個問題）",
    next: "下一步：貼到同一個 NotebookLM 對話接續提問；要換問題時，清空欄位重新填寫即可。"
  },

  // ─── 研究類型為 panel data：第零章 0.2–0.4 ───
  pdata: {
    label: "資料結構與估計目標", target: "nlm",
    hint: "在已上傳文獻的 NotebookLM 開新對話。描述手上的追蹤資料，請 AI 整理相近研究如何定義依變數與建構變數，並把研究問題收斂成解釋目標與預測目標，最後列出可由資料建構的變數清單。",
    fields: [
      { id: "pf_on", type: "checks", label: "填寫輔助", options: [["on", "不知道怎麼填：先請一般 AI 讀資料範例與變數說明，產生下列各欄的內容"]], value: [] },
      { id: "pf_prompt", type: "promptbox", label: "填寫輔助 Prompt", when: p => isOn(p.pf_on),
        hint: "在一般 AI（Claude、ChatGPT、Gemini）開新對話，先上傳資料範例（Excel 前幾十列即可）與變數說明或模型規格文件，再貼上這段 Prompt",
        copyLabel: "複製填寫輔助 Prompt（貼到一般 AI，並上傳檔案）", build: () => T.pd_fill() },
      { id: "pf_reply", type: "textarea", label: "填寫輔助的 AI 回覆", hint: "整段貼上後，會自動帶入下列各欄（研究情境、研究問題、觀察單位、時間、資料欄位、資料特性、研究目標），請逐欄核對", rows: 6, when: p => isOn(p.pf_on), auto: t => pfFill(t) },
      { id: "as_ctx", type: "text", label: "研究情境（組織或產業）", placeholder: "例如：台灣非營利組織的個人捐款" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；初稿即可，AI 會協助收斂", placeholder: "例如：勸募接觸是否提高捐款者再次捐款的機率與金額？哪些捐款者最可能再次捐款？" },
      { id: "pd_unit", type: "text", label: "觀察單位", placeholder: "例如：捐款者" },
      { id: "pd_time", type: "text", label: "時間單位與觀察期間", placeholder: "例如：以月為單位；2019 年 1 月至 2025 年 12 月" },
      { id: "pd_fields", type: "textarea", label: "現有資料欄位", hint: "每行一個或以頓號分隔；可附簡短說明", rows: 4,
        placeholder: "捐款者編號、捐款日期、捐款金額、捐款管道、勸募信寄送日期、性別、居住縣市、首次捐款日期" },
      { id: "pd_feat", type: "checks", label: "資料特性", hint: "可複選；不確定時可先不勾，AI 會依欄位判斷", options: PD_FEAT, value: [] },
      { id: "pd_goal", type: "checks", label: "研究目標", hint: "可複選；兩者並用時，解釋與預測分別以不同準則比較模型", options: PD_GOAL, value: ["exp", "pred"] },
      { id: "pd_vars", type: "textarea", below: true, label: "研究變數", hint: "每行一個：角色｜變數名稱（英文原文）｜建構方式｜依據文獻。貼上 AI 回覆後自動帶入其中的「變數清單」；可自行修改，或改貼自己整理的變數清單。0.3、0.4、0.5 以這裡為準", rows: 6, mono: true,
        placeholder: "依變數｜當日捐款金額（Donation Amount）｜ln(mtotal)｜Khodakarami et al., 2015\n自變數｜寒冷改善（Cold Relief）｜節氣常態 THI 與當日 THI 之差｜Choi et al., 2016" }
    ],
    replyView: t => mdBox(t, "閱讀整理後的回覆", false),
    autoReply: t => pdataAuto(t),
    rules: () => ["citation"],
    seed: () => { const s = seedFrom01(), d = store.values.dp_sum || {}; return { as_ctx: s.as_ctx, as_con: s.as_con, pd_unit: d.unit || "", pd_time: d.time || "", pd_fields: d.fields || "" }; }, seedFrom: "0.1「研究方向聚焦」與「panel 資料處理」",
    seedQuiet: ["pd_unit", "pd_time", "pd_fields"],
    seedNote: "研究情境與研究問題由 0.1「研究方向聚焦」的 AI 回覆帶入；觀察單位、時間與資料欄位由「常用 → panel 資料處理」的處理結果帶入；都可自行修改",
    build: (p, R) => blank(p.as_ctx) || blank(p.pd_unit) ? "" : T.pd_data({ ...pdVals(), ...{ ctx: p.as_ctx.trim(), con: (p.as_con || "").trim(), unit: p.pd_unit.trim(), time: (p.pd_time || "").trim(), fields: (p.pd_fields || "").trim(), feat: p.pd_feat, goal: p.pd_goal } }) + R,
    empty: "（請填入研究情境與觀察單位）",
    next: "下一步：回覆貼到下方「AI 回覆」，從「依變數的定義選項」選定一種，接著到{#pmodel}（同一個對話）。"
  },
  pmodel: {
    label: "候選模型與比較策略", target: "nlm",
    hint: "接在{#pdata}同一個對話。AI 提出幾個彼此只差一項關鍵設定的候選模型，說明比較的檢定或準則，以及不同比較結果代表的行為機制與策略意涵；最後建議本研究的模型組。",
    fields: [
      { id: "pm_dv", type: "text", label: "選定的依變數定義", hint: "選填；從上一步回覆的「依變數的定義選項」挑一種，可寫兩種", placeholder: "例如：下一個月是否捐款（是／否），以及捐款時的金額" },
      { id: "pm_must", type: "text", label: "必須納入的模型或設定", hint: "選填；例如指導教授指定的模型", placeholder: "例如：兩階段模型（hurdle model）；固定效果模型" },
      { id: "pd_goal", type: "checks", label: "研究目標", hint: "與步驟 1 共用；會影響比較策略，以及 0.3、0.4 是否處理預測", options: PD_GOAL, value: ["exp", "pred"] },
      { id: "pm_n", type: "radio", label: "候選模型數量", options: [["3", "3 個"], ["4", "4 個"], ["5", "5 個"]], value: "4" },
      { id: "pm_view", type: "cands", below: true, label: "選擇模型", hint: "貼上回覆後，這裡會列出每個候選模型；為每個模型選一個角色，下方「選定的研究模型組」會自動更新。預設依 AI 的建議；不需要的模型選「不採用」",
        render: () => pmView() },
      { id: "pm_final", type: "textarea", below: true, label: "選定的研究模型組", hint: "每行一個：角色｜模型名稱（英文原文）｜目的。留白時使用上方回覆的「選定模型組」；0.3 檢核後按「採用」會改寫這裡；會帶到 0.3、0.4 與 0.5", rows: 4, mono: true,
        placeholder: "主要模型｜兩階段模型（Hurdle Model）｜分別估計勸募接觸對是否捐款與捐款金額的效果\n比較模型｜固定效果線性機率模型（Fixed-Effects Linear Probability Model）｜檢驗效果是否來自捐款者本身的變化" }
    ],
    rules: () => ["citation"],
    build: (p, R) => T.pd_model({ ...pdVals(), n: p.pm_n, dv: (p.pm_dv || "").trim(), must: (p.pm_must || "").trim() }) + R,
    status: () => blank(store.values.pd_unit) ? "上一步「資料結構與估計目標」還沒有填觀察單位；這一步要接在同一個對話，請先完成上一步。" : "",
    next: "下一步：回覆貼到下方「AI 回覆」，確認或修改「選定的研究模型組」，再到 0.3 檢核模型設定。"
  },
  pdvlit: {
    label: "候選變數的文獻檢索", target: "ai",
    hint: "資料裡沒有、但可以用日期或地區串接外部資料庫，或由既有變數計算出來的變數（例如空氣品質、颱風假、連假、氣溫異常）：先請有網路搜尋的一般 AI 查證文獻支持與台灣可用的資料來源，再把找到的論文下載後上傳到 NotebookLM。",
    fields: [
      { id: "vl_vars", type: "textarea", label: "候選變數", hint: "每行一個；可附取得方式，例如「空氣品質指數（AQI）：以日期 × 縣市串接環境部空品測站」", rows: 6,
        placeholder: "空氣品質指數（AQI）：以日期 × 縣市串接環境部空氣品質監測資料\n颱風假：以日期 × 縣市串接人事行政總處停班停課公告\n氣溫異常：當日氣溫減該節氣常態氣溫" },
      { id: "vl_dv", type: "text", label: "依變數", hint: "選填；留白時取「研究變數」中的依變數", placeholder: "例如：當日捐款金額" }
    ],
    seed: () => ({ vl_vars: pdCandText() }), seedFrom: "0.2 步驟 1 回覆的「資料缺口」與 0.4 回覆的「可再考慮的變數」",
    seedNote: "候選變數由 0.2 步驟 1 回覆的「資料缺口」（可取得者）與 0.4 回覆的「可再考慮的變數」帶入，可自行增刪",
    build: p => { const vars = (p.vl_vars || "").trim(); if (!vars) return "";
      const dv = (p.vl_dv || "").trim() || ((pdVarText().split("\n").find(l => /^依變數/.test(l)) || "").split(/[｜|]/)[1] || "").trim();
      return T.pd_varlit({ ...pdVals(), vars, dv }); },
    empty: "（請填入至少一個候選變數）",
    next: "下一步：依回覆的檢索式下載論文，上傳到 NotebookLM；決定納入的變數寫進步驟 1 最下方的「研究變數」，再到 0.3 檢核（或用 0.3 的「追問」確認它對假說與模型組的影響）。"
  },
  mchk: {
    label: "依文獻檢核模型設定", target: "nlm",
    hint: "依上傳文獻逐項檢核研究模型組：內生性、未觀察異質性、樣本選擇、時間結構、代理變數、模型比較的公平性與策略意涵的推論範圍；最後提出修正後的模型組，並整理研究缺口與預期貢獻。可接在 0.2 的同一個對話，也可開新對話。",
    fields: [
      { id: "pm_final", type: "textarea", label: "研究模型組", hint: "與 0.2「選定的研究模型組」共用；留白時自動使用 0.2 回覆的「選定模型組」", rows: 4, mono: true },
      { id: "mc_dec", type: "textarea", below: true, label: "③「比較兩版並建議」的 AI 回覆", hint: "選填；只有按了上方「③ 複製『比較兩版並建議』Prompt」並送出時才需要。回覆整段貼在這裡，其中的「建議的研究模型組」會自動帶入最上方的「研究模型組」", rows: 5,
        auto: t => mchkAuto(((store.replies || {})["s0-5|mchk"] || "") + "\n\n" + t) },
      { id: "mc_conv", type: "radio", label: "對話", hint: "接在 0.2 的同一個對話時，不重複貼上資料描述與變數清單，Prompt 比較短", options: [["same", "接在 0.2 的同一個對話"], ["new", "開新對話"]], value: "same" },
      { id: "pd_goal", type: "checks", label: "研究目標", hint: "與 0.2 步驟 1 共用；取消「預測」後，本步驟不再檢核資料洩漏，0.4 也不再規劃預測的時間切分", options: PD_GOAL, value: ["exp", "pred"] },
      { id: "mc_checks", type: "checks", label: "檢核項目", hint: "可全部取消，只問自己的問題；「資料洩漏」只在研究目標含預測時送出",
        options: PD_CHECKS.map(c => [c.key, c.label]), value: PD_CHECKS.map(c => c.key) },
      { id: "mc_qs", type: "textarea", label: "我的問題", hint: "選填；每行一題，會與檢核項目一起送出", rows: 3,
        placeholder: "大多數捐款者只捐過一次，固定效果模型還適用嗎？\n請扮演口試委員，針對主要模型提出三個最可能被質疑的問題，每題附文獻依據。" },
      { id: "mc_second", type: "promptbox", afterOut: true, label: "第二則 Prompt：修正後的模型組、研究缺口與預期貢獻",
        hint: "第一則的回覆完成後，在同一個對話接著送出；兩則回覆依序貼到下方「AI 回覆」",
        copyLabel: "② 複製第二則 Prompt（同一個對話接著送出）", build: () => T.pd_check2() },
    ],
    rules: () => ["citation"],
    build: (p, R) => {
      const model = modelText(), qs = splitLines(p.mc_qs), pr = pdGoal(pdVals().goal).r;
      const checks = PD_CHECKS.filter(c => p.mc_checks.includes(c.key) && (!c.pred || pr)).map(c => c.text);
      return !model || (!checks.length && !qs.length) ? "" : T.pd_check({ ...pdVals(), model, checks, qs, same: p.mc_conv !== "new", varsEdited: !blank(store.values.pd_vars) && pmNorm(store.values.pd_vars) !== pmNorm(pdVarAI()) }) + R;
    },
    replyView: t => mchkView(t + "\n\n" + (store.values.mc_dec || "")),
    autoReply: t => mchkAuto(t + "\n\n" + (store.values.mc_dec || "")),
    status: p => blank(p.pm_final) ? (modelText() ? "「研究模型組」留白，使用 0.2 回覆中 AI 建議的模型組。" : "") : `「研究模型組」目前的內容：${pmSrc()}。`,
    empty: "（0.2 還沒有研究模型組，或請至少勾選一個檢核項目、填入一個問題）",
    next: "下一步：回覆貼到下方「AI 回覆」；同意對照表右欄時按「採用 AI 建議的模型組」。還有疑問時，用{#archq}在同一個對話接著問。"
  },
  pdict: {
    label: "資料字典與分析樣本", target: "nlm",
    hint: "接在 0.3 同一個對話。依研究模型組與資料欄位，列出每個變數的建構方式、分析樣本的納入與排除規則；研究目標含預測時，另規劃訓練期與驗證期的時間切分。",
    fields: [
      { id: "pd_goal", type: "checks", label: "研究目標", hint: "與 0.2、0.3 共用；含「預測」時才規劃預測的時間切分", options: PD_GOAL, value: ["exp", "pred"] },
      { id: "pd_vars", type: "textarea", label: "研究變數", hint: "與 0.2 步驟 1 共用；資料字典以此為準。下方回覆的「可再考慮的變數」按「加入」會寫進這裡", rows: 5, mono: true },
      { id: "dc_conv", type: "radio", label: "對話", hint: "0.2、0.3 都在同一個對話時，不重複貼上資料欄位與變數清單，Prompt 比較短", options: [["same", "接在 0.2／0.3 的同一個對話"], ["new", "開新對話"]], value: "same" },
      { id: "pd_fields", type: "textarea", label: "現有資料欄位", hint: "與 0.2 共用；選「開新對話」時才會放進 Prompt", rows: 3, when: p => p.dc_conv === "new" },
      { id: "dc_cut", type: "text", label: "預測時點與預測期間", hint: "選填；研究目標含預測時使用", placeholder: "例如：以 2024 年 12 月為預測時點，預測 2025 年上半年是否再次捐款", when: () => pdGoal(pdVals().goal).r },
      { id: "dc_dv", type: "promptbox", below: true, label: "補問 Prompt：衍生變數計算規格",
        hint: "已送出資料字典、回覆中沒有「衍生變數計算規格」時，在同一個對話接著送出；回覆接在上方「AI 回覆」原有內容的最後貼上。panel 資料處理會自動讀入這一節",
        copyLabel: "複製補問 Prompt（同一個對話接著送出）", build: () => T.pd_dv({ dpCols: dpOutCols() }) }
    ],
    rules: () => ["citation"],
    replyView: t => pdictView(t),
    build: (p, R) => { const model = modelText(); return model ? T.pd_dict({ ...pdVals(), model, cut: (p.dc_cut || "").trim(), same: p.dc_conv !== "new", dpCols: dpOutCols() }) + R : ""; },
    empty: "（0.2 還沒有研究模型組）",
    next: "下一步：依資料字典整理資料，再到{#mreport}規劃第四章要揭露的結果。"
  },
  mreport: {
    label: "實證結果揭露規劃", target: "nlm",
    hint: "接在同一個對話。規劃第四章的安排、並列各模型結果的模型比較表，以及應揭露的統計量；一般應報告但上傳文獻未報告者標示【待補文獻】。",
    fields: [
      { id: "mr_extra", type: "text", label: "補充要求", hint: "選填", placeholder: "例如：係數以平均邊際效果呈現；預測結果另做名單前 10% 的增益圖" }
    ],
    rules: () => ["citation"],
    replyView: t => mdBox(t, "閱讀整理後的回覆", true),
    build: (p, R) => { const model = modelText(); return model ? T.pd_report({ model, goal: pdVals().goal, extra: (p.mr_extra || "").trim() }) + R : ""; },
    empty: "（0.2 還沒有研究模型組）",
    next: "下一步：到 0.5 擬定論文題目。"
  }
};

// 貼上回覆後：依角色整理「變數定義與衡量」
// 分兩則送出時：回覆中還沒有第二則的內容，就提醒並附上複製按鈕
function secondMissing(text) { return !blank(text) && !parsePaths(text).length && !parseMeasures(text).length; }
function secondView(text) {
  if (!secondMissing(text)) return "";
  const m = mod(), f = m.fields.find(x => x.afterOut && x.type === "promptbox"); if (!f) return "";
  const t = f.build(valuesOf(m));
  return `<div class="needbox second"><b>第二則尚未送出</b>：回覆中還沒有「路徑的預期方向與依據」與「變數定義與衡量」。請在同一個 NotebookLM 對話送出第二則，再把回覆接在上方「AI 回覆」的最後。
    <p><button type="button" class="copy" data-copytext="${esc(t)}">② 複製第二則 Prompt</button></p></div>`;
}

function measureView(text, nextHint) {
  if (blank(text)) return "";
  const vs = parseMeasures(text);
  if (!vs.length) return `<p class="note warn">回覆中沒有找到「## 變數定義與衡量」一節（較早的 Prompt 不會產生）。可在同一個對話輸入：「請補上變數定義與衡量一節」，再把回覆接在下方。</p>` + (nextHint ? `<p class="stepnote after">${esc(nextHint)}</p>` : "");
  const known = Object.fromEntries(parseArch(store.values.cf_text || "").vars.map(v => [dgLabel(v.name)[0], v.role]));
  vs.forEach(v => { if (!v.role) v.role = known[dgLabel(v.name)[0]] || ""; });
  const groups = [["iv", "自變數"], ["med", "中介變數"], ["mod", "調節變數"], ["dv", "依變數"], ["ctrl", "控制變數"], ["", "其他"]];
  const html = groups.map(([r, label]) => {
    const g = vs.filter(v => v.role === r); if (!g.length) return "";
    return `<h4>${label}</h4>` + g.map(v => `<div class="mv"><b>${esc(v.name)}</b>
      <p><span>理論定義</span>${esc(v.def || "（回覆未提供）")}</p>
      <p><span>量表出處</span>${esc(v.scale || "（回覆未提供）")}</p>
      ${v.need ? `<p class="need"><span>補齊文獻</span>${esc(v.need)}</p>` : ""}
      <div><span>代表題項</span>${v.items.length === 1 && /未列題項/.test(v.items[0]) ? esc(v.items[0]) : v.items.length ? `<ol>${v.items.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : "（回覆未提供）"}</div></div>`).join("");
  }).join("");
  const needs = vs.filter(v => v.need && !/^無|省略/.test(v.need));
  const needBox = needs.length ? `<div class="needbox"><b>量表或題項缺失，建議補齊的文獻</b><ul>${needs.map(v => `<li><b>${esc(dgLabel(v.name)[0])}</b>：${esc(v.need)}</li>`).join("")}</ul><p class="hint">找到後上傳到同一個 Notebook，再請 AI 補上該變數的量表與題項。</p></div>` : "";
  return `<div class="mview"><h3>變數定義與衡量</h3>${needBox}${html}</div>` + (nextHint ? `<p class="stepnote after">${esc(nextHint)}</p>` : "");
}

// 貼上回覆後：每條路徑的預期方向、理論基礎與實證支持
function pathView(text) {
  if (blank(text)) return "";
  const ps = parsePaths(text);
  if (!ps.length) return `<p class="hint">（回覆中沒有找到「## 路徑的預期方向與依據」一節；可在同一個對話輸入「請依格式補上路徑的預期方向與依據」）</p>`;
  const badge = s => /負|−|-/.test(s) && !/正/.test(s.slice(0, 4)) ? ["neg", "−"] : /強化|減弱|調節/.test(s) ? ["mod", "調節"] : /正|＋|\+/.test(s) ? ["pos", "＋"] : ["", "？"];
  const qs = ps.filter(x => x.query);
  const qbox = qs.length ? `<div class="needbox"><b>理論或實證不足的路徑：到 Google Scholar Labs 補充文獻</b>
    <ol>${qs.map(x => `<li><b>${esc(x.head)}</b><br>${esc(x.query)} <button type="button" data-copytext="${esc(x.query)}">複製</button>${x.qnote ? `<br><small>${esc(x.qnote)}</small>` : ""}</li>`).join("")}</ol>
    <p class="hint">逐一複製問句，貼到 <a href="https://scholar.google.com/" target="_blank" rel="noopener">Google Scholar</a> 的 Labs；找到的文獻上傳到同一個 Notebook 後，再檢核一次。</p></div>` : "";
  return `<div class="mview pview"><h3>路徑的預期方向與依據</h3>${qbox}` + ps.map(x => {
    const [c, b] = badge(x.sign);
    return `<div class="mv"><b>${esc(x.head)}</b> <em class="sign ${c}">${b}</em>
      <p><span>預期方向</span>${esc(x.sign || "（回覆未提供）")}</p>
      <p><span>理論基礎</span>${esc(x.theory || "（回覆未提供）")}</p>
      <p class="ev"><span>實證支持</span>${esc(x.evidence || "（回覆未提供）")}</p>
      ${x.query ? `<p class="q"><span>補充檢索</span>${esc(x.query)} <button type="button" data-copytext="${esc(x.query)}">複製</button>${x.qnote ? `<br><small>${esc(x.qnote)}</small>` : ""}</p>` : ""}</div>`;
  }).join("") + `</div>`;
}

// 貼上回覆後：把「我的問題」逐題對應回答
function qaView(text, qs) {
  if (blank(text) || !qs.length) return "";
  const ans = parseAnswers(text);
  return `<div class="mview qview"><h3>我的問題與回答</h3>` + qs.map((q, i) => {
    const a = ans[i + 1];
    return `<div class="mv"><b>Q${i + 1}　${esc(q)}</b><p class="ev">${a ? esc(a) : `<span class="miss">回覆中沒有找到 Q${i + 1} 的回答</span>`}</p></div>`;
  }).join("") + `</div>`;
}

// 0.3 貼上回覆後：畫出 AI 的修正架構
function revisedView(text) {
  if (blank(text)) return "";
  if (/^\s*(以下是我提出的研究架構|## 制式檢核)/.test(text)) return `<p class="note warn">這裡貼的似乎是 Prompt 本身，不是 NotebookLM 的回覆；請貼上 AI 回答的內容。</p>`;
  const r = parseRevised(text);
  if (!r) return (store.values.ac_extra || ["revise"]).includes("revise") && /修正後的研究架構/.test(text)
    ? `<p class="hint">（回覆中的「修正後的研究架構」沒有「### 變數」「### 路徑」兩節，無法畫圖；維持原架構時可忽略）</p>` : "";
  const d = { pos: {}, edges: r.A.edges.map(({ from, to }) => ({ from, to })), mods: r.A.mods.map(({ from, edge }) => ({ from, edge })) };
  dgAutoPos(r.A.vars, d.pos, true);
  return ref(`<div class="rview"><div class="cand-head"><h3>AI 修正後的研究架構</h3><button type="button" class="copy" data-adopt="1">採用此修正架構</button></div>
    <div class="cand-svg">${dgSvg(r.A.vars, d, null, false)}</div>
    <p class="hint">採用：按「採用此修正架構」，研究架構來源會改為「自行設計或匯入」並載入此架構，可在圖上微調，再複製 Prompt 檢核一次。<br>不採用、維持原架構：不必做任何修改，原架構就是你的研究架構；檢核中指出的疑慮可用{#archq}追問，接著到{#astat}與{#asq}。</p></div>`);
}
function adoptRevised() {
  const r = parseRevised((store.replies || {})[replyKey()] || ""); if (!r) return;
  importArch(r.src); store.values.ac_src = "own"; store.values.ow_mode = "draw";
}

// ── 0.4 問卷草稿：預覽（像實際問卷）、直接修改題項、修改清單與追問 ──
const svOrig = () => deLatex((store.replies || {})["s0-6|asq"] || "");
const svRev = () => deLatex(store.values.sv_rev || "");
const hasRev = () => !!parseSurvey(svRev());
const svUseRev = () => hasRev() && store.values.sv_ver !== "orig";
const svReply = () => svUseRev() ? svRev() : svOrig();
const svEnKey = t => String(t || "").toLowerCase().replace(/[^a-z]/g, "");   // 以英文原題對照（題號可能移動）
function svOrigMap() {   // 原版各題文字，供修訂版標示差異
  const O = parseSurvey(svOrig()), m = {}; if (!O) return m;
  const q = x => x.q + (x.opts.length ? `（${x.opts.join("／")}）` : "");
  if (O.intro) m.intro = O.intro; if (O.scaleText) m.scale = O.scaleText;
  [...O.screen, ...O.manip, ...O.demo, ...O.other.flatMap(o => o.qs)].forEach(x => (m[x.id] = q(x)));
  O.other.forEach(o => { if (o.text) m["sec:" + o.head] = o.text; });
  O.constructs.forEach(c => c.items.forEach(it => { m[it.id] = it.zh; if (it.en) m["en:" + svEnKey(it.en)] = it.zh; }));
  return m;
}
function svRevPrompt() {
  const S = parseSurvey(svReply()); if (!S) return "";
  const edits = svAllItems(S).filter(it => svItemText(it) !== it.zh).map(it => ({ id: it.id, text: svItemText(it) }));
  return T.ask_svrev({ edits, manip: S.manip.length > 0 });
}
const svItemText = it => { const e = (store.values.sv_edit || {})[it.id]; return e && e.orig === it.zh ? e.text : it.zh; };
function svAllItems(S) { return S.constructs.flatMap(c => c.items.map(it => ({ ...it, con: c.name, src: c.src }))); }
// 問卷各部分（依問卷順序），作為修改意見的對象
function svParts(S) {
  const q = x => x.q + (x.opts.length ? `（${x.opts.join("／")}）` : "");
  const oth = k => S.other.filter(o => o.after === k).flatMap(o => [
    ...(o.text ? [{ key: "sec:" + o.head, label: `「${o.head}」說明`, kind: "other", text: o.text }] : []),
    ...o.qs.map(x => ({ key: x.id, label: `${x.id}（${o.head}）`, kind: "other", text: q(x) }))]);
  return [
    ...oth("start"),
    ...(S.intro ? [{ key: "intro", label: "填答說明", kind: "other", text: S.intro }] : []), ...oth("intro"),
    ...S.screen.map(x => ({ key: x.id, label: `${x.id}（篩選題）`, kind: "other", text: q(x) })), ...oth("screen"),
    ...S.manip.map(x => ({ key: x.id, label: `${x.id}（操弄檢定）`, kind: "other", text: q(x) })), ...oth("manip"),
    ...(S.scaleText ? [{ key: "scale", label: "量尺", kind: "other", text: S.scaleText }] : []), ...oth("scale"),
    ...S.constructs.flatMap((c, ci) => [{ key: "con:" + c.name, label: `構念「${c.name}」`, kind: "con", src: c.src, text: (c.stem ? `題幹：${c.stem}；` : "") + c.items.map(it => `${it.id} ${svItemText(it)}`).join("；") || c.missing },
      ...c.items.map(it => ({ key: it.id, label: it.id, kind: "item", con: c.name, src: c.src, text: svItemText(it), en: it.en })), ...oth("con" + ci)]), ...oth("con"),
    ...S.demo.map(x => ({ key: x.id, label: `${x.id}（基本資料）`, kind: "other", text: q(x) })), ...oth("demo")
  ];
}
const svNotes = () => Object.fromEntries(Object.entries(store.values.sv_fix || {}).filter(([, v]) => !blank(v)));
function svFixBox(S) {   // 下方彙整：只列有填意見的部分
  const fix = svNotes(), parts = S ? svParts(S).filter(x => x.key in fix) : [];
  if (!parts.length) return `<p class="hint">（在各部分下方的「修改意見」欄填寫後，會彙整在這裡）</p>`;
  return `<h4>修改意見彙整（${parts.length} 項）</h4>` + parts.map(x => `<div class="sv-fixrow"><b>${esc(x.label)}</b><span class="sv-orig">${esc(x.text)}</span>
      <div class="sv-notev">意見：${esc(fix[x.key])}</div><button type="button" data-svclear="${esc(x.key)}">清除</button></div>`).join("") +
    (B => B.length > 1 ? `<p class="note warn">意見較多，分成 ${B.length} 則依序送出（NotebookLM 單次輸入有字數上限）；每則回覆完成後再送下一則，所有回覆依序貼到下方「修訂建議的 AI 回覆」。</p>
      <p class="sv-btns">${B.map((b, k) => `<button type="button" class="copy" data-svfixcopy="${k + 1}">${"①②③④⑤⑥⑦⑧⑨"[k] || k + 1} 複製第 ${k + 1} 則（${b.n} 項）</button>`).join("")}</p>
      <p class="sv-btns">` : `<p class="sv-btns"><button type="button" class="copy" data-svfixcopy="1">複製修改追問 Prompt（逐條請 NotebookLM 回應）</button>`)(svFixBatches()) +
    `
      <button type="button" class="copy alt" data-svnotecopy="1">複製修改意見（純文字，可給學生）</button></p>
    <p class="sv-btns"><button type="button" data-svclear="*">清除全部意見</button></p>
    <p class="hint">AI 的修訂建議貼到下方「修訂建議的 AI 回覆」，再複製「產生修訂版問卷 Prompt」。修訂版貼上後，可清除全部意見，再對修訂版提出下一輪意見。</p>`;
}
function surveyView(text) {
  if (blank(text) && !hasRev()) return "";
  const S = parseSurvey(svReply()), rev = svUseRev(), O = rev ? svOrigMap() : {};
  const was = (key, now) => !rev ? "" : !(key in O) ? `<div class="sv-was">（修訂版新增）</div>` : O[key] !== now ? `<div class="sv-was">原：${esc(O[key])}</div>` : "";
  if (!S) return `<p class="note warn">回覆中沒有找到「## 問卷草稿」一節（較早的 Prompt 格式不同），請重新複製 Prompt 產生問卷草稿。</p>`;
  const fix = store.values.sv_fix || {}, n = S.points;
  const note = key => `<input type="text" class="sv-note${blank(fix[key]) ? "" : " filled"}" data-svnote="${esc(key)}" value="${esc(fix[key] || "")}" placeholder="修改意見（選填）">`;
  const dots = `<span class="sv-dots">${Array.from({ length: n }, (_, k) => `<i>${k + 1}</i>`).join("")}</span>`;
  const opts = q => q.opts.length ? `<div class="sv-opts">${q.opts.map(o => `<span><i class="sv-box${q.multi ? " multi" : ""}"></i>${esc(o)}</span>`).join("")}</div>` : "";
  const simple = (title, qs) => qs.length ? (title ? `<h4>${title}</h4>` : "") + qs.map(q => { const w = was(q.id, q.q + (q.opts.length ? `（${q.opts.join("／")}）` : ""));
    return `<div class="sv-q${w ? " revised" : ""}"><b>${esc(q.id)}</b> ${esc(q.q)}${opts(q)}${w}${note(q.id)}</div>`; }).join("") : "";
  const oth = k => S.other.filter(o => o.after === k).map(o => { const w = was("sec:" + o.head, o.text);
    return `<h4>${esc(o.head)}</h4>${o.text ? `<div class="${w ? "revised" : ""}"><p class="sv-intro">${esc(o.text)}</p>${w}</div>${note("sec:" + o.head)}` : ""}${simple("", o.qs)}`; }).join("");
  const cons = S.constructs.map((c, ci) => { const ck = "con:" + c.name;
    return `<div class="sv-con"><h4>${esc(c.name)}</h4><p class="hint">${esc([c.src, (d => d && !/^無$/.test(d) ? "構面：" + d : "")((c.dim || "").replace(/^(構面\s*[：:]\s*)+/, "").trim())].filter(Boolean).join("｜"))}</p>
    ${note(ck).replace('placeholder="修改意見（選填）"', 'placeholder="對整組題項的修改意見（選填）"')}
    ${c.missing ? `<p class="note warn">${esc(c.missing)}</p>` : ""}
    ${c.stem ? `<p class="sv-stem">${esc(c.stem)}${/[，,：:]$/.test(c.stem) ? "" : "……"}</p>` : ""}
    ${c.items.map(it => { const t = svItemText(it), ed = t !== it.zh, w = !it.en ? was(it.id, it.zh) : !rev ? "" : ("en:" + svEnKey(it.en)) in O ? was("en:" + svEnKey(it.en), it.zh) : `<div class="sv-was">（修訂版新增或更換的題項）</div>`;
      return `<div class="sv-item${ed ? " edited" : ""}${w ? " revised" : ""}"><b>${esc(it.id)}</b>
        <div class="sv-text"><span class="sv-zh" contenteditable="true" spellcheck="false" data-sved="${esc(it.id)}" data-orig="${esc(it.zh)}" title="也可以點一下直接修改">${esc(t)}</span>
          ${it.en ? `<small>${esc(it.en)}</small>` : ""}
          ${w}${ed ? `<span class="sv-act"><button type="button" data-svrestore="${esc(it.id)}">還原</button></span>` : ""}
          ${note(it.id)}</div>${dots}</div>`; }).join("")}</div>${oth("con" + ci)}`; }).join("");
  const scaleHead = `<div class="sv-scale"><span>${esc(S.ends[0] || "1")}</span>${dots}<span>${esc(S.ends[1] || String(n))}</span></div>${was("scale", S.scaleText)}${note("scale").replace('placeholder="修改意見（選填）"', 'placeholder="對量尺的修改意見（選填）"')}`;
  return `<div class="sview"><div class="cand-head"><h3>問卷預覽${rev ? "（修訂版）" : ""}</h3>${hasRev() ? `<span class="sv-ver"><button type="button" data-svver="rev" class="${rev ? "on" : ""}">修訂版</button><button type="button" data-svver="orig" class="${rev ? "" : "on"}">原版</button></span>` : ""}<button type="button" class="copy" data-svcopy="1">複製整份問卷</button></div>
    ${rev ? `<p class="hint">黃底是修訂版改過或新增的部分，下方標示原文；完整的修改理由見「修訂版問卷的 AI 回覆」中的「修改摘要」。</p>` : ""}
    <p class="hint">每個部分、每一題下方都有「修改意見」欄，有填寫的會彙整在問卷最下方，再一次複製請 NotebookLM 逐條回應；量表題項也可以點文字直接修改。</p>
    ${oth("start")}${S.intro ? `<h4>填答說明</h4><p class="sv-intro">${esc(S.intro)}</p>${was("intro", S.intro)}${note("intro")}` : ""}${oth("intro")}
    ${simple("篩選題", S.screen)}${oth("screen")}${simple("操弄檢定與注意力檢核", S.manip)}${oth("manip")}
    ${S.constructs.length ? `<h4>量表題項</h4>${scaleHead}` : ""}${oth("scale")}${cons}${oth("con")}
    ${simple("基本資料題", S.demo)}${oth("demo")}</div><div class="sv-fixbox" id="svfixbox">${svFixBox(S)}</div>`;
}
function svText() {   // 整份問卷的純文字（含修改）
  const S = parseSurvey(svReply()); if (!S) return "";
  const q = x => `${x.id}. ${x.q}` + (x.opts.length ? `（${x.opts.join("／")}）` : "");
  const oth = k => S.other.filter(o => o.after === k).map(o => `【${o.head}】\n` + [o.text, ...o.qs.map(q)].filter(Boolean).join("\n"));
  return [...oth("start"), S.intro && "【填答說明】\n" + S.intro, ...oth("intro"), S.screen.length && "【篩選題】\n" + S.screen.map(q).join("\n"), ...oth("screen"),
    S.manip.length && "【操弄檢定與注意力檢核】\n" + S.manip.map(q).join("\n"), ...oth("manip"),
    S.constructs.length && `【量表題項】量尺：${S.scaleText}`, ...oth("scale"),
    ...S.constructs.flatMap((c, ci) => [`〈${c.name}〉${c.src ? "（" + c.src + "）" : ""}\n` + (c.missing ? c.missing + "\n" : "") + (c.stem ? c.stem + (/[，,：:]$/.test(c.stem) ? "" : "……") + "\n" : "") + c.items.map(it => `${it.id}. ${svItemText(it)}`).join("\n"), ...oth("con" + ci)]), ...oth("con"),
    S.demo.length && "【基本資料】\n" + S.demo.map(q).join("\n"), ...oth("demo")].filter(Boolean).join("\n\n");
}
function svFixBatches() {   // 依 NotebookLM 單次輸入上限分批
  const S = parseSurvey(svReply()); if (!S) return [];
  const fix = svNotes(), LIMIT = 2600;
  const items = svParts(S).filter(x => x.key in fix).map(x => ({ ...x, note: fix[x.key] }));
  const groups = [];
  items.forEach(x => {
    const g = groups[groups.length - 1];
    if (g && T.ask_svfix({ items: [...g, x], part: groups.length, parts: 9 }).length <= LIMIT) g.push(x); else groups.push([x]);
  });
  return groups.map((g, k) => ({ n: g.length, text: T.ask_svfix({ items: g, part: k + 1, parts: groups.length }) }));
}
const svFixPrompt = (k = 1) => (svFixBatches()[k - 1] || {}).text || "";
function svNotesText() {   // 修改意見清單（純文字）
  const S = parseSurvey(svReply()); if (!S) return "";
  const fix = svNotes();
  const items = svParts(S).filter(x => x.key in fix);
  return items.length ? "【問卷修改意見】\n\n" + items.map((x, k) => `${k + 1}. ${x.label}\n原文：${x.text}\n意見：${fix[x.key] || "（未填）"}`).join("\n\n") : "";
}

// ── 定稿問卷 → 3.2 操作型定義與衡量 ──
function parseFinal(text) {   // 純文字問卷：〈構念〉（出處）、題幹、Q1. 題目
  const t = String(text || "").replace(/\r\n?/g, "\n"), cons = []; let cur = null;
  const scale = ((t.match(/量尺[：:]\s*([^\n（(]+)/) || [])[1] || "").trim();
  t.split("\n").forEach(raw => {
    const l = raw.trim(); if (!l) return;
    const h = l.match(/^〈([^〉]+)〉\s*(?:[（(](.*)[）)])?\s*$/);
    if (h) { cur = { name: h[1].trim(), src: (h[2] || "").trim(), pre: [], items: [] }; cons.push(cur); return; }
    if (/^【/.test(l)) { cur = null; return; }
    if (!cur) return;
    const q = l.match(/^(Q\d+)\s*[.．、｜|：:]?\s*(.+)$/i);
    if (q) { cur.items.push({ id: q[1].toUpperCase(), zh: q[2].trim() }); return; }
    if (!cur.items.length) cur.pre.push(l);
  });
  cons.forEach(c => { const last = c.pre[c.pre.length - 1] || "", isStem = last && !/[。.！!？?]$/.test(last);   // 句號結尾者是說明，不是題幹
    c.stem = isStem ? last : ""; c.note = (isStem ? c.pre.slice(0, -1) : c.pre).join(" "); });
  return cons.length ? { scale, cons } : null;
}
function finalSurvey() {   // 定稿問卷；未填時用問卷預覽；出處缺漏時由問卷預覽補上
  const S = parseSurvey(svReply()), F = parseFinal(store.values.sv_final) || parseFinal(svText());
  if (!F) return null;
  F.cons.forEach(c => { const m = S && S.constructs.find(x => x.name === c.name || x.name.startsWith(c.name));
    if (m) { if (!c.src) c.src = m.src; if (m.name !== c.name && /[（(]/.test(m.name)) c.name = m.name; } });
  return F;
}
// 3.2 的構念依第二章各節的順序排列（同一節依節內變數的順序），第二章沒有的構念放最後
function ch2Order(lines) {
  const plan = ch2Plan(), core = n => String(n).split(/[｜|]/)[0].replace(/\s*[（(].*$/, "").trim();
  const rank = n => { const c = core(n); for (let i = 0; i < plan.length; i++) { const vs = plan[i].vars.split(/[、，,／/]/).map(x => x.trim());
    const j = vs.findIndex(v => v && (v === c || c.startsWith(v) || v.startsWith(c))); if (j >= 0) return i * 100 + j; if (plan[i].title === c) return i * 100; } return 1e6; };
  return lines.map((l, k) => [l, rank(l), k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
}
function odBatches(p) {   // 依構念清單附上定稿題項，依字數分批
  const F = finalSurvey(); if (!F || blank(p.od_list)) return [];
  const blocks = odKeep(ch2Order(splitLines(p.od_list))).map(line => {
    const name = line.split(/[｜|]/)[0].trim(), src = (line.split(/[｜|]/)[1] || "").replace(/^預計採用\s*/, "").trim();
    const c = F.cons.find(x => x.name === name || x.name.startsWith(name) || name.startsWith(x.name));
    const df = ch2Def(name);
    return [`### ${name}${src ? "｜預計量表：" + src : ""}`, ...(df ? ["第二章的界定：" + df] : []), ...(c ? [...(c.note ? ["說明：" + c.note] : []), ...(c.stem ? ["題幹：" + c.stem] : []), ...c.items.map(it => `${it.id.replace(/^Q/i, "")}. ${it.zh}`)] : ["（尚無題項）"])].join("\n");
  });
  if (!F.cons.some(c => c.items.length)) return [];
  const scale = (p.od_scale || F.scale || "").trim(), LIMIT = 2700, groups = [];
  blocks.forEach(b => { const g = groups[groups.length - 1];
    if (g && T.opdef_items({ blocks: [...g, b], scale, part: groups.length, parts: 9 }).length <= LIMIT) g.push(b); else groups.push([b]); });
  const ctx = (store.values.as_ctx || "").trim();
  return groups.map((g, k) => T.opdef_items({ blocks: g, scale, ctx, part: k + 1, parts: groups.length }));
}

// 組合研究架構：選定架構的圖（依 cf_text 建立，保留圖上微調）
const finDiag = p => dgSeed(DEFS.asmix.fields.find(f => f.id === "fin_diag"), p);
// 候選架構卡片：每個候選畫成一張圖，附新增變數與理由
function renderCands(p) {
  if (blank(p.cf_reply)) return `<p class="hint">（貼上候選架構的 AI 回覆後，這裡會畫出每個候選架構）</p>`;
  const cs = parseCands(deLatex(p.cf_reply));
  if (!cs.length) return `<p class="note warn">沒有讀到候選架構，請確認回覆中有「## 候選架構一」以及「### 變數」「### 路徑」兩節。</p>`;
  return cs.map((c, i) => {
    const d = { pos: {}, edges: c.A.edges.map(({ from, to }) => ({ from, to })), mods: c.A.mods.map(({ from, edge }) => ({ from, edge })) };
    dgAutoPos(c.A.vars, d.pos, true);
    const on = (store.values.cf_sel ?? -1) === i && !blank(store.values.cf_text);
    return `<div class="cand${on ? " on" : ""}"><div class="cand-head"><b>${esc(c.title)}</b><button type="button" class="copy" data-cand="${i}">${on ? "已選定 ✓" : "選這個"}</button></div>
      <div class="cand-svg">${dgSvg(c.A.vars, d, null, false)}</div>
      ${c.fresh.length ? `<p class="hint">新增變數：${esc(c.fresh.join("、"))}</p>` : ""}
      <details><summary>理由與文獻支持</summary><div class="cand-reason">${esc(c.reason || "（回覆中沒有理由說明）")}</div></details></div>`;
  }).join("");
}
function chooseCand(i) {
  const c = parseCands(store.values.cf_reply)[i]; if (!c) return;
  store.values.cf_text = candText(c.A); store.values.cf_sel = i; store.values.cf_title = c.title;
  const d = dgData("fin_diag"); d.sig = null; d.pos = {};
}

// 0.3 步驟 2：架構圖資料（依文字建立，保留圖上的手動修改）與送出的架構文字
const archDiag = p => dgSeed(DEFS.archchk.fields.find(f => f.id === "ac_diag"), p);
// 3.1：0.3 檢核後的最終研究架構（自行設計時用自畫的圖，否則用 0.2 組合架構）
function finalArch() {
  const p = {}; DEFS.archchk.fields.forEach(f => { p[f.id] = store.values[f.id] ?? (Array.isArray(f.value) ? f.value.slice() : f.value ?? ""); });
  const own = p.ac_src === "own";
  const A = parseArch(archSrcText(p)), vars = own ? ownVars(p) : A.vars;
  const d = own ? dgData("ow_diag") : archDiag(p);
  return { A, vars, d: { edges: d.edges || [], mods: d.mods || [], pos: d.pos || {} } };
}
// 精簡：目標字數與統計數據規則
const zhCount = t => String(t || "").replace(/\s/g, "").length;
const drBase = p => p.dr_stage === "whole" ? finText(drSid()) : p.dr_text;   // 計算字數的原文：整節統整用本節全文
function drTarget(p) {
  const n = zhCount(drBase(p));
  return p.dr_len === "70" ? Math.round(n * 0.7) : p.dr_len === "50" ? Math.round(n * 0.5) : p.dr_len === "n" ? +(String(p.dr_lenN || "").match(/\d+/) || [0])[0] : 0;
}
function drLenNote(p) { const n = zhCount(drBase(p)), m = drTarget(p); return `原文約 ${n} 字` + (m ? `，精簡目標約 ${m} 字。` : "。"); }
function drLenReq(p) {
  const m = drTarget(p), out = [];
  if (m) out.push(`字數目標：原文約 ${zhCount(drBase(p))} 字（不含空白），改寫後請控制在約 ${m} 字（上下 10% 以內），以此取代上方${p.dr_stage === "whole" ? "「字數不得多於原文」的規定" : "第 5 點的「盡量壓縮」"}。為達到字數目標，優先刪除次要的例證、重複的論點與過多的數據，保留核心論點與其引用。`);
  if (isOn(p.dr_stat)) out.push("統計數據：每個論點最多保留 1–2 個最關鍵的數字，其餘數字改以文字概述（例如「涵蓋清潔、衣著、居家與美妝等日常商品」）；保留的數字須維持原有的引用。");
  return out.length ? "\n\n[精簡要求]\n" + out.map((x, i) => `${i + 1}. ${x}`).join("\n") : "";
}
// ── 背景與動機的寫法：把回覆中的「寫法選項」拆成可勾選的卡片 ──
function bpOptions(text) {
  // 每種寫法以「寫法一／寫法二……」開頭（可能是 ### 小標題、粗體或一般行）；其下的「1. 切入方式」等不是寫法
  const wHead = l => /^\s*(#{1,6}\s*)?[*_\-\s]*(寫法|選項|方案)\s*[一二三四五六七八九十\d]+/.test(l);
  let body = mdSection(text, ["寫法選項"]) || "";
  if (!body.split("\n").slice(1).some(wHead)) {   // 寫法用了與「寫法選項」同級的標題時，改取「寫法選項」之後的全部內容
    const t = String(text || "").replace(/\r\n?/g, "\n").replace(/\*\*/g, ""), i = t.search(/^#{1,4}\s*[0-9一二三四五六七八九十、.．\s]*寫法選項/m);
    if (i >= 0) body = t.slice(i);
  }
  const L = body.split("\n").slice(1), opts = []; let cur = null;
  const head = L.some(wHead) ? wHead : l => /^#{3,5}\s/.test(l);
  L.forEach(l => {
    if (head(l)) { cur = { title: l.replace(/^\s*#+\s*|\*\*/g, "").replace(/^[*_\-\s]+/, "").trim(), lines: [] }; opts.push(cur); }
    else if (cur) cur.lines.push(l);
  });
  return opts.map(o => ({ title: o.title, text: o.lines.join("\n").replace(/^\s*#+\s*/gm, "").trim() })).filter(o => o.text);
}
function bpView(t) {
  const os = bpOptions(t); if (!os.length) return blank(t) ? "" : `<p class="note warn">回覆中沒有找到「寫法選項」一節，請重新複製 Prompt（新版會以「### 寫法一：名稱」分開各寫法）。</p>`;
  const pick = store.values.bp_pick || [];
  return `<div class="bpview"><h3>勾選要用的寫法</h3><p class="hint">可勾多種，合併成一個大綱；勾選的內容會自動帶入下一步與步驟 3 的「選定的寫法」，帶入後也可以自己修改。</p>` +
    os.map((o, i) => `<label class="bp-opt${pick.includes(o.title) ? " on" : ""}"><span class="bp-head"><input type="checkbox" data-bppick="${i}" ${pick.includes(o.title) ? "checked" : ""}><b>${esc(o.title)}</b></span><div class="bp-body">${esc(o.text).replace(/\*\*/g, "")}</div></label>`).join("") + `</div>`;
}

// ── 行內引用與參考文獻 ──
const CJK = /[\u3400-\u9fff]/;
const CITE_YEAR = "(\\d{4}[a-z]?|無日期|n\\.d\\.)";
// 括號內「作者, 年份」：中文作者用全形逗號，英文作者用半形逗號；括號後多餘的空白去掉
function normCite(text) {
  return String(text || "").replace(/[（(]([^（）()]{2,300})[）)]/g, (all, inner) => {
    const parts = inner.split(/\s*[；;]\s*/), re = new RegExp(`^(.+?)\\s*[,，]\\s*${CITE_YEAR}$`);
    if (!parts.every(x => re.test(x.trim()))) return all;
    const fixed = parts.map(x => { const m = x.trim().match(re); return CJK.test(m[1]) ? `${m[1].trim()}，${m[2]}` : `${m[1].trim()}, ${m[2]}`; });
    return "（" + fixed.join(fixed.some(x => CJK.test(x)) ? "；" : "; ") + "）";
  }).replace(/([）)])\s+([。，、；：])/g, "$1$2");
}
const citeKey = (author, year) => (CJK.test(author) ? author.replace(/\s/g, "") : author.split(/\s|,|&/)[0]).toLowerCase() + "|" + year;
function citeScan() {   // 各節定稿中的引用：{ key, author, year, label, secs }
  const map = new Map(), re = new RegExp(`^(.+?)\\s*[,，]\\s*${CITE_YEAR}$`);
  const add = (author, year, sid) => {
    author = author.replace(/^(轉引自|引自|見|e\.g\.,?)\s*/, "").trim(); if (!author || author.length > 60) return;
    const k = citeKey(author, year), x = map.get(k) || { key: k, author, year, label: CJK.test(author) ? `${author}，${year}` : `${author}, ${year}`, secs: new Set() };
    x.secs.add(sid); map.set(k, x);
  };
  THESIS_SECS().forEach(s => {
    const t = finText(s.id);
    for (const m of t.matchAll(/[（(]([^（）()]{2,300})[）)]/g)) m[1].split(/\s*[；;]\s*/).forEach(p => { const q = p.trim().match(re); if (q) add(q[1], q[2], s.no); });
    for (const m of t.matchAll(/([A-Z][A-Za-z'’\-]+(?:\s+et al\.|\s+(?:&|and)\s+[A-Z][A-Za-z'’\-]+)?)\s*[（(](\d{4}[a-z]?)[）)]/g)) add(m[1], m[2], s.no);
  });
  return [...map.values()];
}
// 參考文獻條目的開頭：「作者（年份…）。」或「Author, A. (2019).」；作者在年份括號之前，不含句號
const REF_HEAD = /^([^。（()）]{1,150}?)\s*[（(](\d{4}[a-z]?|無日期|n\.d\.)[^（）()]{0,30}[）)]\s*([。.，,])/;
const refClean = l => l.replace(/^[\s>*•\-–]+|^\d+[.、)]\s*|\*\*/g, "").replace(/^\[引用來源\]\s*/, "").trim();
// 一行一筆；貼上時若多筆擠在同一行，在「句點或網址之後、下一位作者（Surname, A. 或 中文作者（年份））之前」切開
const refLines = t => deLatex(String(t || "")).split(/\r?\n|(?<=[.。]|https?:\/\/\S+)\s+(?=[A-Z][A-Za-z'’\-]+,\s+(?:[A-Z]\.|[A-Z][a-z]+\.)|[\u3400-\u9fff]{2,20}\.?\s*[（(]\d{4})/).map(refClean).filter(l => l.length >= 20 && l.length <= 600 && REF_HEAD.test(l));
function refCandidates() {   // 各步驟回覆中的參考文獻條目（只取「作者（年份）」開頭的行，正文段落不採用）
  const out = [];
  Object.values(store.replies || {}).concat(Object.entries(store.values || {}).filter(([k, v]) => k !== "rf_bulk" && typeof v === "string" && v.length > 200).map(([, v]) => v))
    .forEach(r => out.push(...refLines(r)));
  return [...new Set(out)];
}
const refSur = c => CJK.test(c.author) ? c.author.replace(/\s/g, "") : c.author.split(/\s|,|&/)[0];
function refAuto(c, cands, yr = c.year.replace(/^n\.d\.$/, "n.d.")) {
  const sur = refSur(c);
  const hit = cands.filter(l => { const m = l.match(REF_HEAD); return m && (yr instanceof RegExp ? yr.test(m[2]) : m[2] === yr) && (CJK.test(sur) ? m[1].replace(/\s/g, "") : m[1]).startsWith(sur); });   // 條目須以該作者開頭
  if (yr instanceof RegExp) return [...new Set(hit)];
  return hit.sort((a, b) => (/[。.]$/.test(b.match(REF_HEAD)[3]) - /[。.]$/.test(a.match(REF_HEAD)[3])) || (/https?:|doi/i.test(b) - /https?:|doi/i.test(a)) || b.length - a.length)[0] || "";
}
// 網路文獻：依填入的資訊產生 APA 第七版參考文獻
function webRef(p) {
  const A = (p.rw_author || "").trim(), T = (p.rw_title || "").trim().replace(/[。.]$/, ""), U = (p.rw_url || "").trim(); if (!A || !T) return null;
  const S = (p.rw_site || "").trim(), site = S && S !== A ? S : "", zh = CJK.test(A + T), rep = p.rw_type === "report";
  const dm = (p.rw_date || "").match(/(\d{4})(?:\s*[\/\-.年]\s*(\d{1,2})(?:\s*[\/\-.月]\s*(\d{1,2}))?)?/), y = dm ? dm[1] : "", mo = dm && !rep ? +dm[2] || 0 : 0, d = dm && mo ? +dm[3] || 0 : 0;
  if (zh) {
    const date = !y ? "無日期" : mo ? `${y} 年 ${mo} 月${d ? ` ${d} 日` : ""}` : y;   // 中文 APA：（2026 年 7 月 27 日）
    return { year: y || "無日期", text: `${A}（${date}）。${T}。${site ? site + "。" : ""}${U}`.trim() };
  }
  const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const date = !y ? "n.d." : mo ? `${y}, ${M[mo - 1]}${d ? " " + d : ""}` : y, a = /[.]$/.test(A) ? A : A + ".";
  return { year: y || "n.d.", text: `${a} (${date}). ${T}. ${site ? site + ". " : ""}${U}`.trim() };
}
function webRefTarget(p) { const r = webRef(p); return r ? refRows().find(x => x.key === citeKey((p.rw_author || "").trim(), r.year)) : null; }
function webRefView(p) {
  const r = webRef(p); if (!r) return `<p class="hint">填入作者或機構與標題後，這裡會出現格式化的參考文獻。</p>`;
  const t = webRefTarget(p);
  return `<div class="ref-item auto"><small>產生的參考文獻</small><div style="margin-top:4px">${esc(r.text)}</div></div>` +
    `<p class="note${t ? "" : " warn"}">${t ? `按下方按鈕，會填入正文引用（${esc(t.label)}）並存檔。` : `正文中找不到（${esc((p.rw_author || "").trim())}，${esc(r.year)}）這筆引用：請確認作者與年份是否與正文一致，或直接複製上方文字使用。`}</p>`;
}
function webRefFill(p) {
  const r = webRef(p), t = webRefTarget(p); if (!r) return "請先填入作者或機構與標題。"; if (!t) return "正文中沒有對應的引用，無法填入。";
  (store.values.refs ||= {})[t.key] = r.text; ["rw_author", "rw_date", "rw_title", "rw_site", "rw_url"].forEach(k => store.values[k] = "");
  return `已填入（${t.label}），欄位已清空，可以接著填下一筆。`;
}
// 同一作者同一年有多筆（2019a、2019b），正文卻只寫 2019：列出候選讓使用者選
const refAlts = (c, lines) => /^\d{4}$/.test(c.year) ? refAuto(c, lines, new RegExp(`^${c.year}[a-z]$`)) : [];
const refNoLetter = (e, y) => e.replace(new RegExp(`([（(]${y})[a-z]`), "$1");
const refApa = e => (m => !!m && /[。.]/.test(m[3]))(String(e || "").match(REF_HEAD));   // 開頭符合 APA（年份括號後接句號）
// Zotero 以 APA 輸出中文文獻時是英文標點：「陳立儀. (2026). 標題. 網站.」→「陳立儀（2026）。標題。網站。」
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const zhDate = d => d.replace(/([A-Za-z]+)\s*(\d{1,2})?/, (m, mo, day) => { const k = MONTHS.indexOf(mo.toLowerCase()) + 1; return k ? `${k} 月${day ? " " + day + " 日" : ""}` : m; });
function zhRef(e) {
  if (!CJK.test(e.charAt(0))) return e;
  return e.replace(/^([^()（）]+?)\.?\s*\((\d{4}[a-z]?|n\.d\.)(?:,\s*([^)]*))?\)\.\s*/, (m, a, y, d) => `${a.trim().replace(/,?\s*&\s*|,\s*/g, "、")}（${y === "n.d." ? "無日期" : y}${d ? " 年 " + zhDate(d) : ""}）。`)
    .replace(/([\u3400-\u9fff》〉」）])\.(\s+|$)/g, "$1。").replace(/([\u3400-\u9fff》〉」]),\s*(?=[\u3400-\u9fff\d])/g, "$1，")
    .replace(/(\d+)\((\d+)\),\s*/, "$1（$2），").replace(/(\d+[–-]\d+)\.(\s+|$)/, "$1。");
}
const refCollator = new Intl.Collator("zh-TW-u-co-stroke"), enCollator = new Intl.Collator("en");
function refRows() {
  const cites = citeScan(), cands = refCandidates(), saved = store.values.refs || {};
  const bulk = refLines([store.values.rf_bulk, ...Object.values(store.values.rf_paste || {})].join("\n"));   // 參考文獻頁與各節定稿貼上的書目
  return cites.map(c => { const b = c.key in saved ? "" : refAuto(c, bulk);
    const entry = c.key in saved ? saved[c.key] : refTidy(b ? zhRef(b) : refAuto(c, cands));
    return { ...c, saved: c.key in saved, bulk: !!b, entry, alts: entry.trim() ? [] : refAlts(c, bulk.concat(cands)).map(zhRef) }; });
}
function refFillItems(no) {   // 缺出處或格式不符 APA 的引用（no：只列該節），附上回覆中的線索（含網址的行）
  const rows = refRows().filter(r => (!no || r.secs.has(no)) && !r.alts.length && (!r.entry.trim() || (!r.saved && !refApa(r.entry))));
  if (!rows.length) return "";
  const src = Object.values(store.replies || {}).concat(THESIS_SECS().map(s => finText(s.id))).join("\n").split(/\r?\n/).map(refClean);
  return rows.map(r => {
    const sur = refSur(r), clue = r.entry.trim() ? [r.entry.trim()] : [...new Set(src.filter(l => l.includes(sur) && l.includes(r.year) && /https?:\/\//.test(l)))].slice(0, 2).map(l => l.length > 220 ? l.slice(0, 220) + "…" : l);
    return `- （${r.label}）` + (clue.length ? "\n  線索：" + clue.join("\n  線索：") : "");
  }).join("\n");
}
// AI 常把網址寫成 Markdown 連結（[文字](網址)），還會重複附上來源連結：改成純文字網址，只留一次
function refTidy(e) {
  let t = String(e || "").replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, " $2 ").replace(/<(https?:\/\/[^>\s]+)>/g, "$1");
  const seen = new Set();
  t = t.replace(/https?:\/\/[^\s，。）)】」]+/g, u => { const k = u.replace(/[.,;]+$/, ""); if (seen.has(k)) return ""; seen.add(k); return u; });
  return t.replace(/[ \t\u3000]{2,}/g, " ").replace(/。\s+(?=https?:)/g, "。").replace(/\s+$/g, "").trim();
}
function refList() {   // APA 第七版：中文在前（筆畫），英文在後（字母）
  const es = refRows().map(r => refTidy(r.entry)).filter(Boolean);
  return [...new Set(es)].sort((a, b) => (CJK.test(a[0]) ? 0 : 1) - (CJK.test(b[0]) ? 0 : 1) || (CJK.test(a[0]) ? refCollator.compare(a, b) : enCollator.compare(a, b)));
}
function refView() {
  const rows = refRows(); if (!rows.length) return `<p class="hint">各節定稿中還沒有行內引用。</p>`;
  const saved = store.values.refs || {}, cited = new Set(rows.map(r => r.key)), orphan = Object.keys(saved).filter(k => !cited.has(k));
  const n = { ok: rows.filter(r => r.saved && r.entry.trim()).length, auto: rows.filter(r => !r.saved && r.entry).length, alt: rows.filter(r => r.alts.length).length, miss: rows.filter(r => !r.entry.trim() && !r.alts.length).length };
  const altBox = r => `<div class="ref-alt"><p class="note warn">書目中有 ${r.alts.length} 筆 ${esc(refSur(r))} ${esc(r.year)}（${r.alts.map(a => esc((a.match(REF_HEAD) || [])[2] || "")).join("、")}），無法判斷正文引用的是哪一筆。請按「用這一筆」選定（年份後的字母會自動去掉）。若正文確實引用了其中兩筆以上，請到該節的「本節論文內容」把引用年份分別改成 ${esc(r.year)}a、${esc(r.year)}b，網站會各自配對。</p>` +
    r.alts.map((a, i) => `<div class="ref-altrow"><span>${esc(a)}</span> <button type="button" data-refpick="${esc(r.key)}" data-i="${i}">用這一筆</button></div>`).join("") + `</div>`;
  return `<p class="tb-count">共 ${rows.length} 筆引用：已確認 ${n.ok}、自動帶入待核對 ${n.auto}${n.alt ? `、同年多筆待選 ${n.alt}` : ""}、找不到出處 ${n.miss}</p>` +
    rows.map(r => `<div class="ref-item ${r.saved && r.entry.trim() ? "ok" : r.entry ? "auto" : "miss"}">
      <b>（${esc(r.label)}）</b><small>　出現於 ${esc([...r.secs].join("、"))}　${r.saved && r.entry.trim() ? "已確認" : r.alts.length ? "同一作者同年有多筆，請選定" : r.entry ? (r.bulk ? "由貼上的書目帶入，請核對" : "自動帶入，請核對") + (refApa(r.entry) ? "" : "（格式不是 APA，請修改或請 AI 整理）") : "找不到出處，請填入"}</small>
      ${r.alts.length ? altBox(r) : ""}<textarea data-ref="${esc(r.key)}" rows="2" placeholder="完整的 APA 第七版參考文獻，例如：經濟部統計處（2026）。報告名稱。https://……">${esc(r.entry)}</textarea></div>`).join("") +
    (orphan.length ? `<h4>正文已不再引用的出處（${orphan.length}）</h4>` + orphan.map(k => `<div class="ref-item orphan"><span>${esc(saved[k])}</span> <button type="button" data-refdel="${esc(k)}">刪除</button></div>`).join("") : "");
}

// ── 潤色：逐句修改建議，按「採用」才替換本節定稿中的那一句 ──
function poParse(text) {
  const t = deLatex(String(text || "")).replace(/\r\n?/g, "\n").replace(/\*\*/g, "");
  const strip = v => (v || "").trim().replace(/^[「『"“]|[」』"”]$/g, "").trim();
  return t.split(/^#{2,4}\s*建議\s*\d+[^\n]*$/m).slice(1).map(b => ({
    from: strip((b.match(/^\s*原句[：:]\s*(.+)$/m) || [])[1]),
    to: strip((b.match(/^\s*建議[：:]\s*(.+)$/m) || [])[1]),
    why: strip((b.match(/^\s*理由[：:]\s*(.+)$/m) || [])[1])
  })).filter(x => x.from && x.to);
}
function poView(t) {
  const ss = poParse(t); if (!ss.length) return blank(t) ? "" : `<p class="hint">（回覆中沒有找到「### 建議 1」這類格式的修改建議）</p>`;
  const fin = THESIS_SECS().some(x => x.id === store.sec) ? finText(store.sec) : null, done = store.values.po_done || {};
  return `<div class="posug"><h3>逐句修改建議（${ss.length} 句）</h3><p class="hint">按「採用」才會替換「本節論文內容」中的那一句；不採用的句子保持原樣。</p>` + ss.map((x, i) => {
    const key = store.sec + "|" + x.from, used = done[key], found = fin !== null && fin.includes(x.from);
    const mine = (store.values.po_edit || {})[key];
    return `<div class="po-item${used ? " used" : ""}"><div class="po-from"><small>原句</small>${esc(x.from)}</div><div class="po-to"><small>建議</small>${esc(x.to)}</div>
      ${x.why ? `<div class="po-why"><small>理由</small>${esc(x.why)}</div>` : ""}
      <label class="po-mine"><small>我的修改</small><span class="hint">可參考建議自行修改；按「採用」時以這裡的文字取代原句</span>
        <textarea data-poedit="${i}" rows="2">${esc(mine ?? x.to)}</textarea></label>
      <p class="fin-btns">${used ? `✓ 已採用 <button type="button" data-poadopt="${i}">以上方修改後的文字重新採用</button><button type="button" data-poundo="${i}">復原原句</button>` : fin === null ? `<span class="hint">（不在第一～五章的節內，請自行替換）</span>` : found ? `<button type="button" data-poadopt="${i}">採用</button>` : `<span class="hint">本節定稿中找不到這一句（可能已修改過）</span>`}</p></div>`;
  }).join("") + `</div>`;
}
// 採用：記下放進定稿的文字，之後可以改用新的修改句重新採用，或復原原句
function poAdopt(i) {
  const x = poParse((store.replies || {})[replyKey()] || "")[i]; if (!x) return;
  const key = store.sec + "|" + x.from, done = (store.values.po_done ||= {}), cur = typeof done[key] === "string" ? done[key] : done[key] ? x.to : null;
  const mine = (store.values.po_edit || {})[key], to = blank(mine) ? x.to : mine.trim(), t = finText(store.sec), from = cur && t.includes(cur) ? cur : x.from;
  if (!t.includes(from)) { alert("本節定稿中找不到這一句（可能已在「本節論文內容」中修改過），請到那裡直接修改。"); return; }
  setFin(store.sec, t.replace(from, to)); done[key] = to;
}
function poUndo(i) {
  const x = poParse((store.replies || {})[replyKey()] || "")[i]; if (!x) return;
  const key = store.sec + "|" + x.from, done = store.values.po_done || {}, cur = typeof done[key] === "string" ? done[key] : x.to, t = finText(store.sec);
  if (!t.includes(cur)) { alert("本節定稿中找不到採用後的句子（可能已再修改過），請到「本節論文內容」直接修改。"); return; }
  setFin(store.sec, t.replace(cur, x.from)); delete done[key];
}

// ── 本節定稿：論文.md 與網頁「本節論文內容」「論文全文」只放定稿 ──
const NOT_TEXT = new Set(["bgplan", "asp", "m7a", "m7b"]);   // 分析、查資料、畫圖的步驟，不是論文正文
const writeStep = s => { const st = stepsOf(s).filter(x => !x.finish && DEFS[x.mod].target !== "tool" && !NOT_TEXT.has(x.mod)); return st[st.length - 1]; };
function cleanBody(text) {   // 撰寫步驟的回覆 → 論文正文：去掉開場說明、查證與待補清單類小節、角標
  let t = deLatex(String(text || "")).replace(/\r\n?/g, "\n");
  t = t.replace(/^#{1,4}\s*(?:\d+[.、]\s*)?文獻中的寫法[^\n]*\n[\s\S]*?(?=^#{1,4}\s|(?![\s\S]))/gm, "");   // 寫法分析不放進正文
  // 分則送出時，各則回覆依序貼在一起：每則的查證清單只刪到下一則的「## 正文」為止，後面各則的正文保留
  for (let k = 0; k < 20; k++) { const c = t.search(VERIFY_HEAD); if (c < 0) break;
    const rest = t.slice(c + 1), nx = rest.search(/^#{1,4}\s*正文\s*$/m); t = t.slice(0, c) + (nx >= 0 ? rest.slice(nx) : ""); }
  const hasBody = /^#{1,4}\s*正文\s*$/m.test(t);
  if (hasBody) t = t.slice(t.search(/^#{1,4}\s*正文\s*$/m));   // 有「## 正文」時，第一個正文之前的說明文字都不要
  t = hasBody ? t.replace(/^#{1,4}\s*論證架構[^\n]*\n[\s\S]*?(?=^#{1,4}\s*正文\s*$)/gm, "").replace(/^#{1,4}\s*正文\s*\n/gm, "")
    : t.replace(/^#{1,4}\s*論證架構[^\n]*\n[\s\S]*?(?=^#{1,4}\s|(?![\s\S]))/m, "");   // 論證架構不放進正文
  const first = t.search(/^#{1,6}\s/m), lead = first > 0 ? t.slice(0, first) : "";   // 第一個標題前的文字：沒有引用且很短，才視為開場說明去掉
  if (!hasBody && lead && !/[（(][^（）()\n]*\d{4}[a-z]?[）)]/.test(lead) && lead.replace(/\s/g, "").length <= 200) t = t.slice(first);
  return t.split("\n").filter(l => !/^\s*-{3,}\s*$/.test(l))
    .map(l => /^#{1,6}\s/.test(l) ? "#### " + l.replace(/^#+\s*|\*\*/g, "").trim() : l.replace(/\*\*/g, "").replace(/\s?\[\d+(?:\s*[,，–-]\s*\d+)*\]/g, ""))
    .join("\n").replace(/^(#### .*)\n(?=\S)/gm, "$1\n\n").replace(/^([(（][一二三四五六七八九十]+[)）][^\n。，；]{1,30})$/gm, "\n$1\n").replace(/\n{3,}/g, "\n\n").trim();   // 小標題（含「(一)標題」）自成一段
}
function finReply(sid) {   // 由撰寫步驟的回覆產生的正文（含表格原始碼）
  const s = ALL_SECS.find(x => x.id === sid), st = s && writeStep(s);
  const t = st ? cleanBody((store.replies || {})[sid + "|" + st.mod]) : "", hs = t.match(/^#### .*$/gm) || [];
  if (hs.length === 1 && t.startsWith("#### ")) return t.replace(/^#### .*\n*/, "");   // 只有一個小標題（例如「研究背景與動機」）時去掉
  const h0 = t.startsWith("#### ") ? hs[0].slice(5).trim() : "", title = (s && s.title) || "";   // 開頭的小標題就是本節名稱時去掉
  return h0 && title && title.includes(h0) ? t.replace(/^#### .*\n*/, "") : t;   // 只有一個小標題（例如「研究背景與動機」）時去掉，正文不設小標題
}
function finRaw(sid) { const v = (store.values.fin || {})[sid]; return typeof v === "string" && v.trim() ? v : finReply(sid); }   // 定稿被清空時，改回由撰寫步驟的回覆產生

// ── 圖表：正文中的表格移到「本節表格」，原位置留下插入標記；表號與圖號依全章順序自動編號 ──
const TBL_CAP = /^(?:#{1,6}\s*)?\**\s*表\s*(\d+\s*[-－–]\s*\d+)?\s*[：:．.]?\s*(.*?)\s*\**\s*$/;
const INS_RE = /〔插入([表圖])\s*([0-9?？]+(?:\s*[.．\-－–]\s*[0-9?？]+)*)?[\s　]*([^〕]*)〕/g;
const insNorm = x => String(x || "").replace(/\s/g, "").replace(/[－–]/g, "-").replace(/．/g, ".");
const tblCells = l => l.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim().replace(/\*\*/g, "").replace(/<br\s*\/?>/gi, "\n"));
const TBL_MEMO = new Map();
function tblSplit(text) {   // { body, tables:[{ num, cap, rows, note }] }
  const key = String(text || ""); if (TBL_MEMO.has(key)) return TBL_MEMO.get(key);
  const lines = key.split("\n"), out = [], tables = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!(/^\|.*\|$/.test(l) && /^\|?\s*:?-{2,}/.test((lines[i + 1] || "").trim()))) { out.push(lines[i]); continue; }
    const rows = [tblCells(l)]; i += 2;
    while (i < lines.length && /^\|/.test(lines[i].trim())) { rows.push(tblCells(lines[i])); i++; }
    let note = ""; while (i < lines.length && !lines[i].trim()) i++;
    if (i < lines.length && /^(?:\*\*)?註[：:]/.test(lines[i].trim())) { note = lines[i].trim().replace(/\*\*/g, ""); i++; }
    i--;
    let j = out.length - 1; while (j >= 0 && !out[j].trim()) j--;
    let num = "", cap = "";
    if (j >= 0) { const c = out[j].trim(), m = c.match(TBL_CAP);
      if (m && (m[1] || /^\**\s*表/.test(c.replace(/^#+\s*/, "")))) { num = (m[1] || "").replace(/\s|[－–]/g, x => /\s/.test(x) ? "" : "-"); cap = m[2]; out.splice(j); }
      else if (/^#{1,6}\s/.test(c) && c.length <= 40) { cap = c.replace(/^#+\s*|\*\*/g, "").trim(); out.splice(j); } }
    const same = tables.find(x => x.cap === (cap || "表格") && x.rows[0].join("|") === rows[0].join("|"));
    if (same) { same.rows.push(...rows.slice(1)); if (note && !same.note) same.note = note;
      const mk = out.findIndex(x => x.startsWith("〔插入表") && x.endsWith(`${same.cap}〕`)); if (mk >= 0) { const m = out[mk]; out.splice(mk, 1); out.push("", m, ""); }   // 合併後的表移到最後一次出現的位置
      continue; }   // 分則回覆中同名的表（例如量表彙整表）合併成一張
    tables.push({ num, cap: cap || "表格", rows, note });
    out.push("", `〔插入表 ${num || "?"}　${cap || "表格"}〕`, "");
  }
  const r = { body: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), tables };
  if (TBL_MEMO.size > 200) TBL_MEMO.clear(); TBL_MEMO.set(key, r); return r;
}
const tblSkip = sid => ((store.values.tbl_skip || {})[sid] || []);
const reEsc = x => String(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function finBody(sid) {   // 正文（表格已換成插入標記）；「本節表格」取消勾選的表，標記與引導句一併移除
  let t = tblSplit(finRaw(sid)).body; const sk = tblSkip(sid); if (!sk.length) return t;
  const ms = [...t.matchAll(INS_RE)], gone = ms.filter(m => m[1] === "表" && sk.includes((m[3] || "").trim())), keep = ms.filter(m => !gone.includes(m));
  gone.forEach(m => { const old = (m[2] || "").trim();
    if (/彙整/.test(m[3] || "")) t = t.replace(/[^。\n]*彙整(?:如|於)表\s*[0-9.．\-－–]+[^。\n]*。/g, "");
    t = t.replace(new RegExp(`\\n*${reEsc(m[0])}`), "");
    if (old && !/[?？]/.test(old) && !keep.some(k => k[1] === "表" && (k[2] || "").trim() === old)) {
      const n = old.split(/[.．\-－–]/).map(reEsc).join("\\s*[.．\\-－–]\\s*");
      t = t.replace(new RegExp(`[^。\\n]*彙整(?:如|於)表\\s*${n}[^。\\n]*。`, "g"), "").replace(new RegExp(`[，,]?\\s*(?:如|見|詳見)表\\s*${n}\\s*所示`, "g"), ""); } });
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
function finTables(sid) {   // 表格來源：本節論文內容中仍有的表格；沒有時取撰寫步驟回覆中的表格
  const v = (store.values.fin || {})[sid], own = typeof v === "string" && v.trim() ? tblSplit(v).tables : [];
  const ed = (store.values.tbl_edit || {})[sid] || {};   // 在「本節表格」直接修改過的表（依表標題），優先於 AI 回覆中的表
  return (own.length ? own : tblSplit(finReply(sid)).tables).map(x => ed[x.cap] ? { ...x, rows: ed[x.cap].rows, note: ed[x.cap].note, edited: true } : x);
}
function insMap(sid) {   // 本節各插入標記的新編號：[{ type, old, num }]；編號方式依「論文全文」的設定（依章／依節／全文連續）
  const mode = store.values.ins_mode || "sec", all = THESIS_SECS(), me = all.find(x => x.id === sid); if (!me) return null;
  const chOf = x => (String(x.no).match(/^(\d+)\./) || [])[1];
  const scope = mode === "all" ? all : mode === "sec" ? [me] : all.filter(x => chOf(x) === chOf(me));
  if (mode === "chap" && !chOf(me)) return null;
  const cnt = { 表: 0, 圖: 0 }; let mine = null;
  scope.forEach(x => { const list = [];
    for (const m of finBody(x.id).matchAll(INS_RE)) { cnt[m[1]]++;
      list.push({ type: m[1], old: insNorm(m[2]), num: mode === "all" ? String(cnt[m[1]]) : mode === "sec" ? `${x.no}-${cnt[m[1]]}` : `${chOf(x)}-${cnt[m[1]]}` }); }
    if (x.id === sid) mine = list; });
  return mine;
}
function insRenum(sid, t) {   // 插入標記與正文中的「如表 3-1 所示」改成新編號；正文提到的表號對應其後最近的同號標記（分則回覆各自從 3-1 起編）
  const mp = insMap(sid); if (!mp || !mp.length) return t;
  const marks = []; let k = 0;
  for (const m of t.matchAll(INS_RE)) { const x = mp[k++] || { num: insNorm(m[2]) || "?" }; marks.push({ at: m.index, end: m.index + m[0].length, ty: m[1], old: insNorm(m[2]), num: x.num, txt: `〔插入${m[1]} ${x.num}　${m[3].trim()}〕` }); }
  const near = (ty, old, at) => (marks.find(m => m.ty === ty && m.old === old && m.at > at) || [...marks].reverse().find(m => m.ty === ty && m.old === old && m.at < at) || {}).num;
  const sum = marks.find(m => m.ty === "表" && /彙整/.test(m.txt));   // 「彙整如表 X」：對應到標題含「彙整」的表（例如沒有表號的量表彙整表）
  let out = "", last = 0;
  const refs = s => s.replace(/(彙整(?:如|於))?([表圖])\s*(\d+(?:\s*[.．\-－–]\s*\d+)*)/g, (all, sm, ty, a, off) => { const n = (sm && sum ? sum.num : "") || near(ty, insNorm(a), last + off); return n ? `${sm || ""}${ty} ${n}` : all; });
  marks.forEach(m => { out += refs(t.slice(last, m.at)) + m.txt; last = m.end; });
  return out + refs(t.slice(last));
}
function finText(sid) {
  let t = insRenum(sid, finBody(sid));
  if (sid === "s3-1" && t.trim() && !/(^|\n)H\d+[a-z]?\s*[：:]/.test(t)) {   // 3.1：架構說明之後自動接上第二章的假說清單
    const it = hlItems(); if (it.length) t = t.trim() + "\n\n" + (/如下[。：:]?\s*$/.test(t.trim()) ? "" : "依據第二章的推導，本研究提出以下假說：\n\n") + it.join("\n");
  }
  return t;
}
// 本節表格：依正文中插入標記的順序配對表格（先比對標題，再依順序）
function finTblList(sid) {
  const ts = finTables(sid), ms = [...finText(sid).matchAll(INS_RE)].filter(m => m[1] === "表"), used = new Set();
  const pick = cap => { let i = ts.findIndex((x, k) => !used.has(k) && x.cap === cap); if (i < 0) i = ts.findIndex((x, k) => !used.has(k)); if (i >= 0) used.add(i); return i >= 0 ? ts[i] : null; };
  const out = ms.map(m => ({ num: (m[2] || "?").trim(), cap: (m[3] || "").trim(), t: pick((m[3] || "").trim()) })).filter(x => x.t);
  return out;   // 正文中刪掉插入標記的表格，不再列出
}
const tblMd = x => [`表 ${x.num}　${x.cap}`, "", ...x.t.rows.map((r, i) => "| " + r.map(c => c.replace(/\n/g, "<br>")).join(" | ") + " |" + (i === 0 ? "\n|" + r.map(() => "---").join("|") + "|" : "")), ...(x.t.note ? ["", x.t.note] : [])].join("\n");
function tblHtml(x, word, k) {   // APA 三線表：表頂、欄名下方、表底三條橫線；k：網頁上第 k 張表，儲存格可直接修改
  const B = w => word ? `border:none;border-${w}` : `border-${w}`, th = word ? "solid windowtext 1.5pt" : "1.5px solid #222", tn = word ? "solid windowtext .75pt" : "1px solid #222";
  const ed = !word && k != null, ce = (r, c) => ed ? ` contenteditable="true" spellcheck="false" data-tc="${k}|${r}|${c}"` : "";
  const cell = (c, st, r, j) => `<td${ce(r, j)} style="padding:${word ? "2pt 6pt" : "4px 8px"};vertical-align:top;${st}">${esc(c).replace(/\n/g, "<br>")}</td>`;
  const n = x.t.rows.length, font = word ? "font-family:'Times New Roman',新細明體,serif;font-size:12pt;" : "";
  return `${word ? `<p style="${font}margin:0 0 4pt 0">表 ${esc(x.num)}　${esc(x.cap)}</p>` : ""}<table class="apa" style="border-collapse:collapse;${font}">` + x.t.rows.map((r, i) => `<tr>${r.map((c, j) => cell(c, i === 0 ? `${B("top")}:${th};border-bottom:${tn};${word ? "" : "font-weight:600;"}` : i === n - 1 ? `${B("bottom")}:${th};` : (word ? "border:none;" : ""), i, j)).join("")}</tr>`).join("") + `</table>` +
    (ed ? `<p class="tbl-note" contenteditable="true" spellcheck="false" data-tn="${k}" data-ph="（沒有註解；點這裡可加上「註：……」）" style="margin:4pt 0 0 0">${esc(x.t.note || "")}</p>`
      : x.t.note ? `<p style="${font}${word ? "font-size:10pt;" : ""}margin:4pt 0 0 0">${esc(x.t.note)}</p>` : "");
}
function finTblBox(sid) {
  const ls = finTblList(sid), sk = tblSkip(sid), off = finTables(sid).filter(x => sk.includes(x.cap));
  if (!ls.length && !off.length) return "";
  return `<div class="fin-tbl"><h4>本節表格</h4><p class="hint">正文中以〔插入表…〕標出位置；按「複製表格」後直接貼到 Word，就是 APA 三線表。取消「放入論文」，正文中的插入標記與引導這張表的句子會一併移除，其餘表號自動遞補。表號依「論文整理 → 論文全文」設定的編號方式自動編排。表格內容與「註：」可以直接點一下修改，自動存檔；表的標題請在正文的〔插入表…〕標記中修改。</p>` +
    ls.map((x, k) => `<div class="tblbox"><p class="tbl-cap"><label class="tbl-on"><input type="checkbox" data-tblskip="${esc(x.cap)}" checked>放入論文</label>表 ${esc(x.num)}　${esc(x.cap)}<button type="button" class="copy" data-tblcopy="${k}">複製表格（貼到 Word）</button>${x.t.edited ? `<button type="button" data-tblreset="${k}">還原為 AI 回覆的表格</button>` : ""}</p>${tblHtml(x, false, k)}</div>`).join("") +
    off.map(x => `<div class="tblbox off"><p class="tbl-cap"><label class="tbl-on"><input type="checkbox" data-tblskip="${esc(x.cap)}">放入論文</label>${esc(x.cap)}<small>（未放入論文）</small></p></div>`).join("") + `</div>`;
}
const setFin = (sid, t) => { (store.values.fin ||= {})[sid] = t; };
// 重複段落：去掉空白與標點後，以兩字片段的重疊比例判斷（一段包含另一段也算）
function blockSim(a, b) {
  const n = x => x.replace(/[\s，。、；：「」（）()【】,.;:\-—]/g, ""), A = n(a), B = n(b); if (A.length < 20 || B.length < 20) return 0;
  if (A.includes(B) || B.includes(A)) return 1;
  if (Math.min(A.length, B.length) / Math.max(A.length, B.length) < 0.6) return 0;   // 長短差很多（例如段落與其後的條列目的）不算重複
  const g = x => { const s = new Set(); for (let i = 0; i < x.length - 1; i++) s.add(x.slice(i, i + 2)); return s; }, ga = g(A), gb = g(B);
  let k = 0; ga.forEach(x => { if (gb.has(x)) k++; }); return k / Math.min(ga.size, gb.size);
}
function finDups(t) {   // [{ i, j, sim }]：第 j 段與前面的第 i 段重複或幾乎相同
  const bs = finBlocks(t), out = [];
  bs.forEach((b, j) => { for (let i = 0; i < j; i++) { const s = blockSim(bs[i], b); if (s >= 0.8) { out.push({ i, j, sim: s }); break; } } });
  return out;
}
const finBlocks = t => String(t || "").split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
const FIN_SUBHEAD = /^[(（][一二三四五六七八九十]+[)）]\s*[^。，；]{1,30}$/;   // 「(一)標題」形式的小標題
function finHtml(t, ed) {   // 定稿的簡易排版：#### 小標題、段落、【待補】標記；ed：每段可直接點擊修改
  return finBlocks(t).map((b, i) => { const a = ed ? ` contenteditable="true" spellcheck="false" data-fp="${i}"` : "";
    return (/^#{1,6}\s/.test(b) || FIN_SUBHEAD.test(b)) && !b.includes("\n")
    ? `<h4${a}>${esc(b.replace(/^#+\s*/, ""))}</h4>`
    : `<p${a}${/^〔插入[表圖][^〕]*〕$/.test(b) ? ` class="fin-ins"` : ""}>${esc(b).replace(/\n/g, "<br>").replace(/【待補[^】]*】/g, m => `<mark>${m}</mark>`).replace(/〔插入[表圖][^〕]*〕/g, m => `<span class="ins">${m}</span>`)}</p>`; }).join("");
}
function finBox() {   // 第一～五章各節：所有步驟下方的「本節論文內容」
  const s = sec(); if (!THESIS_SECS().some(x => x.id === s.id)) return "";
  const t = finText(s.id), own = typeof (store.values.fin || {})[s.id] === "string";
  const missR = t ? finRefMissRows(s) : [], miss = missR.length, dupOk = (store.values.dup_ok || {})[s.id] === idOf(t), dup = t && !dupOk ? finDups(t).length : 0;
  return `<details class="fin" id="finbox"><summary>本節論文內容（定稿）${t ? "" : "：尚未撰寫"}${miss ? `<span class="fin-refhint">　📚 尚缺 ${miss} 筆參考文獻${miss <= 3 ? "：" + missR.map(r => "（" + esc(r.label) + "）").join("") : ""}，點開到最下方「查找參考文獻」</span>` : ""}${dup ? `<span class="fin-refhint">　⚠ 有 ${dup} 組重複段落</span>` : ""}</summary>
    ${dupOk ? "" : finDupBox(t)}${finWholeNote(s, t)}${t ? `<p class="hint">直接點文字即可修改，整節連在一起，可以跨段落選取；自動存檔。按 Enter 另起一段，刪掉段落之間的分隔即合併兩段。</p>
    <div class="fin-view fin-ed" id="finview" contenteditable="true" spellcheck="false" data-fall="1">${finHtml(t)}</div>` : `<div class="fin-view" id="finview"><p class="hint">完成本節的撰寫步驟並貼上 AI 回覆後，正文會自動出現在這裡。</p></div>`}
    <p class="fin-btns">${t ? `<button type="button" class="copy" data-finrecheck="1">確認定稿</button><span class="hint">存檔、重新檢查引用與重複段落，並關閉目前的提醒；之後再修改，提醒會重新出現</span><br>` : ""}${own ? `<button type="button" data-finreset="1">重新從撰寫步驟帶入</button>` : ""}${(store.values.fin_undo || {})[s.id] ? `<button type="button" data-finundo="1">復原上一次清除或取代前的內容</button>` : ""}
    <span class="hint">論文.md 與「論文全文」只放這裡的內容</span></p>${t ? finTblBox(s.id) : ""}${finRefBox(s)}</details>`;
}
// 定稿提醒：本節內容在最近一次「整節統整」之後又改過（或從未做過），提醒先到修訂論文做整體檢查
function finWholeNote(s, t) {
  if (!t || !stepsOf(s).some(x => x.mod === "dr") || ((store.values.dr_whole_ok || {})[s.id] === idOf(t))) return "";
  return `<p class="note warn">定稿提醒：${(store.values.dr_whole_ok || {})[s.id] ? "本節在上次整節檢查之後又修改過" : "本節還沒做過整節檢查"}，定稿前請先到「修訂論文」選「整節統整」，檢查重複、段落順序與論證鏈。 <button type="button" data-gowhole="1">前往整節統整</button></p>`;
}
function finDupBox(t) {
  const ds = finDups(t); if (!ds.length) return "";
  const bs = finBlocks(t), cut = x => x.length > 40 ? x.slice(0, 40) + "…" : x;
  return `<div class="note warn fin-dup"><b>發現 ${ds.length} 組重複的段落</b>（通常是同一段被「加到本節定稿最後」或貼上了兩次）。` +
    `<p><button type="button" class="copy" data-findedup="1">一鍵清除重複段落（每組只保留最新、最後面的那一段）</button></p>` +
    `<details><summary>逐組比對、自己決定刪哪一段</summary>` +
    ds.map(d => `<div class="fin-duprow">${d.sim >= 0.999 ? "兩段相同" : "兩段幾乎相同"}
      <div>前：「${esc(cut(bs[d.i]))}」 <button type="button" data-findel="${d.i}">刪除這段</button></div>
      <div>後：「${esc(cut(bs[d.j]))}」 <button type="button" data-findel="${d.j}">刪除這段</button></div></div>`).join("") + `</details></div>`;
}
function finDedupLatest(t) {   // 重複或幾乎相同的段落：每組只保留最後面（最新）的那一段
  let bs = finBlocks(t);
  for (let k = 0; k < 200; k++) { const d = finDups(bs.join("\n\n"))[0]; if (!d) break; bs.splice(d.i, 1); }
  return bs.join("\n\n");
}
// 本節定稿下方：查找本節缺少的參考文獻 → 貼上 AI 回覆 → 自動匯入參考文獻頁
const finRefMissRows = s => refRows().filter(r => r.secs.has(s.no) && !(r.entry.trim() && (r.saved || refApa(r.entry))));   // 本節缺 APA 出處的引用
function finRefMiss(s) { return finRefMissRows(s).length; }
function finRefCount(s) {
  const rows = refRows().filter(r => r.secs.has(s.no)); if (!rows.length) return "";
  const ok = rows.filter(r => r.entry.trim() && (r.saved || refApa(r.entry))).length;
  return `本節共 ${rows.length} 筆引用，已有 APA 格式出處 ${ok} 筆${ok < rows.length ? `，尚缺 ${rows.length - ok} 筆` : "，全部齊全"}。逐筆核對在「論文整理 → 參考文獻」。`;
}
// 本節定稿：貼上的書目確認匯入（存成參考文獻頁的已確認出處），之後清空貼上欄
const FINREF_MSG = {};
function finRefImport(sid) {
  const s = ALL_SECS.find(x => x.id === sid); if (!s) return;
  const lines = refLines((store.values.rf_paste || {})[sid] || ""), refs = (store.values.refs ||= {}); let n = 0;
  refRows().filter(r => r.secs.has(s.no) && !r.saved).forEach(r => { const b = refAuto(r, lines); if (b) { refs[r.key] = refTidy(zhRef(b)); n++; } });
  delete (store.values.rf_paste || {})[sid];
  const left = finRefMissRows(s).length;
  FINREF_MSG[sid] = n ? `已匯入 ${n} 筆參考文獻${left ? `；仍缺 ${left} 筆，貼上的回覆中找不到對應的書目` : "，本節的引用都有出處了"}。` : "貼上的回覆中沒有找到對應本節引用的書目（請確認作者姓氏與年份和正文引用一致），回覆已清空。";
}
function finRefBox(s) {
  const c = finRefCount(s); if (!c) return "";
  const pasted = (store.values.rf_paste || {})[s.id] || "", need = !!refFillItems(s.no);
  const mr = finRefMissRows(s);
  const msg = FINREF_MSG[s.id] || ""; delete FINREF_MSG[s.id];
  return `<div class="fin-ref"><h4>查找參考文獻</h4>${msg ? `<p class="note">${esc(msg)}</p>` : ""}<p class="hint" id="finrefcount">${c}</p>` + (mr.length ? `<p class="note warn">尚缺出處：${mr.map(r => `（${esc(r.label)}）${r.entry.trim() ? "<small>已有出處但不是 APA 格式</small>" : ""}`).join("、")}</p>` : "") + (need || pasted ? `
    <p><b>①</b> <button type="button" data-finrefcopy="${esc(s.no)}">複製查找文獻 Prompt（貼到一般 AI）</button> <span class="hint">需開啟網路搜尋；接在查過資料的同一個對話最準</span></p>
    <label><b>②</b> 貼上 AI 回覆<textarea data-finref="${s.id}" rows="3" placeholder="貼上 AI 列出的 APA 參考文獻（一行一筆）">${esc(pasted)}</textarea></label>
    <p><b>③</b> <button type="button" class="copy" data-finrefok="${s.id}">確認匯入參考文獻</button> <span class="hint">把對應到本節引用的書目存入參考文獻，並清空上方的回覆</span></p>` : "") + `</div>`;
}
// 附錄一 研究問卷：研究者版（定稿問卷原文），附註說明實際發放版的差異
const APX_NOTE = "註：本附錄為研究者版問卷，標示各題所屬構念、量表出處與反向題；實際發放之問卷隱去構念名稱、量表出處與反向題等標註，並依作答順序全卷連續編號。";
const apxLines = () => String(store.values.sv_final || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(l => l.replace(/^Q(\d+)\s*[.．、]?\s*/i, "$1. "));
// 附錄排版：【部分】與〈構念〉為小標題；有選項的題目，選項另起一行並以 □ 標示（李克特量表題沒有選項，照原樣）
function apxBlocks() {
  const out = [];
  apxLines().forEach(l => {
    if (/^[【〈]/.test(l)) { out.push({ t: "head", text: l }); return; }
    const m = l.match(/^([A-Za-z]{0,3}\d+\.)\s*(.+)$/);
    if (!m) { out.push({ t: "text", text: l }); return; }
    const o = rvSplitOpts(m[2]);
    out.push({ t: "q", text: `${m[1]} ${o.q}`, keep: o.opts.length > 0 });
    if (o.opts.length) out.push({ t: "opt", inline: rvInline(o.opts), opts: o.opts });
  });
  return out;
}
function thesisBody() {   // 論文全文（Markdown）：題目＋各章節定稿
  const zh = (store.values.tt_zh || "").trim(), en = (store.values.tt_en || "").trim();
  const out = [`# ${zh || store.name || "論文"}`, ...(en ? ["", en] : []), ""];
  OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).forEach(c => {
    out.push(`## ${c.ch}`, "");
    secsOf(c).forEach(s => { out.push(`### ${s.no} ${s.title}`, ""); const t = normCite(tbApply(s.id, "fin", finText(s.id))); if (t) out.push(tblFill(s.id, t, tblMd), ""); });
  });
  const refs = refList(); if (refs.length) out.push("## 參考文獻", "", ...refs.flatMap(r => [r, ""]));
  const ax = apxBlocks(); if (ax.length) out.push("## 附錄", "", "### 附錄一　研究問卷", "", APX_NOTE, "",
    ...ax.flatMap(b => b.t === "head" ? [`**${b.text}**`, ""] : b.t === "opt" ? (b.inline ? [b.opts.map(o => "□ " + o).join("　"), ""] : [b.opts.map(o => "□ " + o).join("  \n"), ""]) : [b.text, ""]));
  return THESIS_SECS().some(s => finText(s.id)) ? out.join("\n") : "";
}
// 插入標記換成表格（md：論文.md；全文檢視：表格 HTML）
function tblFill(sid, t, fmt) {
  const ls = finTblList(sid); let k = 0;
  return t.replace(/^〔插入表[^〕]*〕$/gm, m => { const x = ls[k++]; return x ? fmt(x) : m; });   // 插入標記換成表格
}
const ftBlock = (b, fig) => { const m = b.match(/^\u0001(.*)\u0001$/s); if (m) { const v = JSON.parse(m[1]); return v ? `<div class="ft-tbl"><p class="tbl-cap">表 ${esc(v[1].num)}　${esc(v[1].cap)}</p>${tblHtml(v[1])}</div>` : ""; }
  return fig && /^〔插入圖[^〕]*〕$/.test(b) ? fig : finHtml(b); };   // 插入標記換成架構圖
function fullView() {
  const zh = (store.values.tt_zh || "").trim(), en = (store.values.tt_en || "").trim();
  return `<div class="fulltext"><h2 class="ft-title">${esc(zh || store.name || "論文")}</h2>${en ? `<p class="ft-en">${esc(en)}</p>` : ""}` +
    OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).map(c => `<h2>${esc(c.ch)}</h2>` + secsOf(c).map(s => {
      let fig = "";
      if (s.id === "s3-1") { try { const f = DEFS.fa31.fields[0], d = dgSeed(f, {}), v = f.source(); if (d.edges.length) { dgAutoPos(v, d.pos, false); fig = `<div class="ft-fig">${dgSvg(v, d, null, false)}<p>圖 3-1　研究架構圖</p></div>`; } } catch {} }
      const t = normCite(tbApply(s.id, "fin", finText(s.id)));
      if (fig && /〔插入圖[^〕]*〕/.test(t)) { const f = fig; fig = ""; return `<h3>${esc(s.no + " " + s.title)}</h3>` + tblFill(s.id, t, x => "\u0001" + JSON.stringify(x.t ? ["t", x] : 0) + "\u0001").split(/\n\s*\n/).map(b => ftBlock(b, f)).join(""); }
      return `<h3>${esc(s.no + " " + s.title)}</h3>${fig}${t ? tblFill(s.id, t, x => "\u0001" + JSON.stringify(["t", x]) + "\u0001").split(/\n\s*\n/).map(b => ftBlock(b, "")).join("") : `<p class="hint">（尚未撰寫）</p>`}`;
    }).join("")).join("") + (refList().length ? `<h2>參考文獻</h2>` + refList().map(r => `<p class="ref-line">${esc(r)}</p>`).join("") : "") +
      (apxLines().length ? `<h2>附錄</h2><h3>附錄一　研究問卷</h3><p class="hint">${esc(APX_NOTE)}</p><div class="rview apx">` + apxBlocks().map(b => b.t === "head" ? `<h4>${esc(b.text)}</h4>`
        : b.t === "opt" ? `<p class="rv-opts${b.inline ? "" : " col"}">${b.opts.map(o => `<span>□ ${esc(o)}</span>`).join("")}</p>` : `<p class="rv-note">${esc(b.text)}</p>`).join("") + `</div>` : "") + `</div>`;
}
// 段落核實改寫：回覆中最新一次的「## 改寫後段落」或「## 融合後的段落」
function drLatest(text) {
  const L = deLatex(String(text || "")).replace(/\r\n?/g, "\n").replace(/\*\*/g, "").split("\n");
  let start = -1, lv = 0;
  L.forEach((l, i) => { const m = l.match(/^(#{1,4})\s*(改寫後段落|融合後的段落|統整後全文)/); if (m) { start = i; lv = m[1].length; } });
  if (start < 0) return "";
  let end = L.length;
  for (let i = start + 1; i < L.length; i++) { const m = L[i].match(/^(#{1,4})\s/); if (m && m[1].length <= lv) { end = i; break; } }
  return L.slice(start + 1, end).join("\n").replace(/\s?\[\d+(?:\s*[,，–-]\s*\d+)*\]/g, "").replace(/^\s*-{3,}\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
function drResultView(t) {
  const ans = (mdSection(deLatex(String(t || "")), ["追問回覆"]) || "").split("\n").slice(1).join("\n").trim();
  const ansBox = ans ? `<details class="drres" open><summary><b>追問回覆</b></summary><div class="fin-view">${finHtml(ans)}</div></details>` : "";
  const r = drLatest(t); if (!r && ans) return ansBox + `<p class="note warn">回覆中只有追問回覆，還沒有修訂後的段落。<button type="button" class="copy" data-drfollow="1">複製接續修訂 Prompt</button> 在同一個 NotebookLM 對話送出，再把回覆接著貼在上方「AI 回覆」原有內容的後面。</p>`;
  if (!r) return ansBox + (blank(t) ? "" : `<p class="hint">（回覆中沒有找到「## 改寫後段落」或「## 融合後的段落」；新版 Prompt 會固定用這兩個標題）</p>`);
  const ps = drParas(), merge = store.values.dr_stage === "merge", whole = store.values.dr_stage === "whole", sel = (store.values.dr_sel || []).filter(k => ps.some(x => x.key === k));
  const cur = ps.findIndex(x => x.text.trim() === (store.values.dr_text || "").trim());
  const have = new Set(finBlocks(finText(drSid()))), used = finBlocks(r).every(b => have.has(b)) || finText(drSid()).includes(r.trim());   // 結果已在定稿中：不再顯示加入按鈕，避免重複加入
  const allPicked = !merge && !whole && ps.length > 1 && (store.values.dr_text || "").trim() === ps.map(x => x.text).join("\n\n").trim();   // 按過「全選」
  const btn = whole || allPicked ? `<button type="button" class="copy" data-drrep="all">以此取代本節全部內容</button>` : merge ? (sel.length ? `<button type="button" class="copy" data-drrep="merge">以此取代所選的 ${sel.length} 段（合併為一段）</button>` : "")
    : cur >= 0 ? `<button type="button" class="copy" data-drrep="one">以此取代第 ${cur + 1} 段</button>`
    : drHl() ? `<button type="button" class="copy" data-drrep="sel">以此取代反白的部分</button>` : "";
  const kind = whole ? "整節統整" : merge ? "融合" : "改寫";
  if (used) return ansBox + `<div class="drres"><details><summary>✓ 最新的${kind}結果已套用到「本節論文內容」（點開檢視）</summary><div class="fin-view">${finHtml(r)}</div></details></div>`;   // 已套用：收合，避免與定稿重複顯示
  return ansBox + `<div class="drres"><h3>${kind}結果（尚未套用）</h3><p class="hint">這是 AI 回覆的預覽，還不是論文內容；按下方「以此取代」後才會寫入「本節論文內容」。</p><div class="fin-view">${finHtml(r)}</div>
    ${`${btn ? "" : `<p class="note warn">沒有出現「以此取代」按鈕：原本選的段落已不在本節定稿中（可能已修改或刪除）。${inThesisSec() ? "請在「本節論文內容」重新反白要被取代的文字，按上方「用反白的文字」" : `請在上方「本節的段落」重新按「用這一段」${merge ? "或勾選「加入融合」" : ""}，選好要被取代的段落`}後，就會出現取代按鈕。</p>`}<p class="fin-btns">${btn}${whole || allPicked ? "" : `<button type="button" data-drrep="all">以此取代本節全部內容</button>`}<button type="button" data-drrep="append">不取代，另外加在本節最後</button>
    <span class="hint">一般請按「以此取代」；取代後會更新「本節論文內容」與論文.md</span></p>`}</div>`;
}
// 整節統整：本節全文先分則送出，最後一則才是統整任務；在「常用 → 修訂論文」使用時，由使用者選章節
const inThesisSec = () => THESIS_SECS().some(x => x.id === store.sec);
// 段落核實改寫的對象章節：在章節內就是該節；在「常用 → 修訂論文」由使用者選（或從章節點過來時帶入）
const drSid = () => inThesisSec() ? store.sec : (k => THESIS_SECS().some(x => x.id === k) ? k : "")(store.values.dr_sec || store.values.dw_sec);
const drCh1 = () => /^s1-/.test(drSid()), drCh2 = () => /^s2-/.test(drSid()), drCh3 = () => /^s3-/.test(drSid());
// 用反白的文字：「論文段落」是定稿中的一段連續文字，但不是完整的單一段落
const drHl = () => { const x = (store.values.dr_text || "").trim(), sid = drSid(); return !!x && !!sid && finText(sid).includes(store.values.dr_text) && !drParas().some(p => p.text.trim() === x); };
// 在定稿中找出反白的文字（略去空白、換行與小標題的 #），回傳定稿中的原文片段
function finFind(t, sel) {
  const skip = c => /[\s#]/.test(c), key = [...String(sel || "")].filter(c => !skip(c)).join(""); if (key.length < 2) return "";
  let s = ""; const idx = [];
  for (let i = 0; i < t.length; i++) if (!skip(t[i])) { s += t[i]; idx.push(i); }
  const k = s.indexOf(key); if (k < 0) return "";
  let a = idx[k]; const b = idx[k + key.length - 1] + 1, ls = t.lastIndexOf("\n", a - 1) + 1;
  if (/^[#\s]*$/.test(t.slice(ls, a))) a = ls;   // 從小標題開始反白時，連同 #### 一起取
  return t.slice(a, b);
}
const secLabel = sid => (s => s ? `${s.no} ${s.title}` : "")(ALL_SECS.find(x => x.id === sid));
// 修訂時以研究者目前的原文為準：保留其小標題寫法、編號與段落結構，不沿用對話中較早的版本
const drFmtNote = whole => "\n\n[以目前原文為準]\n本對話中較早出現的內容（例如撰寫本節時的 Prompt、你先前的回覆）若與我這次提供的原文不同，一律以這次的原文為準；我已自行修改過的結構、用字與編號都要保留。原文中「〔插入表…〕」「〔插入圖…〕」是圖表的插入位置，原樣保留在原段落之後，不得刪除或改寫；表號與圖號照原文。" +
  "小標題照原文的文字與編號格式輸出（例如原文寫「(一)兩種瀏覽動機」就照寫，不得改成「###」或其他格式）；" + (whole ? "若調整段落順序，小標題的編號須隨之重排。" : "段落順序與分段照原文，不得改回較早版本的結構。") + "原文中的假說敘述（例如「H1：……」）維持獨立一行，編號照原文或下方的現行假說清單。";
// 第二章修訂時一併檢查：假說敘述寫法、與本節其他段落重複、理論放錯位置
const drCh2Check = (whole, full = true) => !drCh2() ? "" : "\n\n[第二章修訂：以下問題一律直接改正在輸出的文字中，不要只提出建議]\n1. 假說敘述改成完整句子並以句號結尾（例如「H1：功利型瀏覽對認知型衝動購買有正向影響。」），刪除箭頭與「（正向）」等標記。" +
  (whole ? "\n2. 重複的內容（例如本研究採用的量表說明寫了兩次、同一定義出現兩次）只保留一處，保留引用較完整、位置較合適的版本，其餘刪除。" +
    "\n3. 解釋兩個變數之間關係的理論與實證，移到該關係的推導段落；介紹構念本身的段落（定義、面向、衡量）只談構念，不談路徑機制。移動時一併調整前後的承接句。"
  : (full ? "\n2. 對照上方本節全文：要改寫的內容若與本節其他段落重複（例如本研究採用的量表說明在別段已經寫過），就從改寫結果中刪除重複的部分；要改寫的內容本身前後重複時，合併為一處。" +
    "\n3. 要改寫的內容中，若解釋變數關係的理論或實證放在介紹構念的段落，而該關係的推導段落也在要改寫的範圍內，就直接移過去；若推導段落不在範圍內，且該處已寫過相同內容，就直接刪除。"
    : "\n2. 要改寫的內容本身前後重複時（例如同一份量表的說明寫了兩次），合併為一處。" +
    "\n3. 要改寫的內容中，若解釋變數關係的理論或實證放在介紹構念的段落，而該關係的推導段落也在要改寫的範圍內，就直接移過去。")) +
  "\n4. 小標題一律寫成「(一)標題」的形式，獨立一行。" +
  "\n5. 論證鏈：" + (whole ? "依「構念性質、構成要素、要素的心理機制、範圍取捨與本研究定義、定義與題項一致」的順序檢查全節，" : "改寫範圍內") + "每段只回答一個問題，段末要接到下一段；理論必須解釋前文提到的要素，與要素無關的內容刪除；本研究的定義必須在取捨理由之後提出。" +
  "\n改寫說明中簡要列出做了哪些改正即可。";
// 共用規則：超過 NotebookLM 單次上限時，依規則區塊分成數則
function drRuleParts(p) {
  const R = RULES.filter(r => activeRules(DEFS.dr, p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
  if (!R) return [];
  const one = T.rules_once(R); if (one.length <= 2800) return [one];
  const blocks = R.split(/\n\n(?=\[)/).map(b => b.trim()).filter(Boolean), parts = []; let cur = "";
  blocks.forEach(b => { if (cur && (cur + "\n\n" + b).length > 2500) { parts.push(cur); cur = b; } else cur = cur ? cur + "\n\n" + b : b; });
  if (cur) parts.push(cur);
  const n = parts.length;
  return parts.map((c, i) => `以下是本對話後續所有段落改寫都要遵守的共用規則（第 ${i + 1}／${n} 則）。請先記住，只回覆「已收到共用規則第 ${i + 1} 則」${i + 1 < n ? "，我會接著送下一則" : "，等我送出段落後再處理"}。\n\n` + c);
}
// 研究者的追問：先逐題回答，再依回答修訂
const drAskNote = (p, out) => blank(p.dr_ask) ? "" : `\n\n[研究者的追問與修改意見]\n${p.dr_ask.trim()}\n請依下列順序輸出（與前述步驟的順序衝突時，以此為準）：\n1.「## 追問回覆」：逐題回答，只依據上傳文獻並附引用，文獻無法回答的明確說明，不得臆測；認同我的意見時說明理由，不認同時也要說明文獻依據。\n2.「${out}」：緊接在追問回覆之後輸出修訂結果；每一項你認同或部分認同的意見，都必須實際反映在文字中，不得只回答而不修改。\n3.「## 追問對應的修改」：逐題一句話說明改了哪裡；不認同而未修改的，說明原因。\n4. 前述其他步驟（引用核實、術語查證、診斷等）放在最後，盡量精簡。\n追問與前述規則衝突時，以追問為準。`;
const DR_FOLLOW = "請依你在「追問回覆」中的結論修訂這個段落：每一項你認同或部分認同的意見，都要實際反映在文字中。修訂後的完整段落請放在「## 改寫後段落」標題之下，其後在「## 追問對應的修改」逐題說明改了哪裡。不需要重做引用核實與術語查證。";
// 第二章分到假說的節：修訂時附上現行假說清單，避免 NotebookLM 沿用對話中較早的編號
function drHypNote() {
  const h = drCh2() ? ch2SecHyps(drSid()) : []; if (!h.length) return "";
  return "\n\n[本節現行假說清單]\n" + h.join("\n") + "\n假說的編號與內容一律以此清單為準，本對話中先前出現的假說編號全部作廢；改寫後若出現假說敘述或假說編號，必須與此清單一致。清單中的箭頭只是標記，正文的假說敘述以完整句子寫成（例如「H1：功利型瀏覽對認知型衝動購買有正向影響。」）。";
}
function dwParts(p) {
  const sid = drSid(), t = sid ? finText(sid) : ""; if (blank(t)) return [];
  const s = ALL_SECS.find(x => x.id === sid) || {}, ref = (DR_R ? "\n\n請同時遵守本對話先前送出的「共用規則」。" : "") + drFmtNote(true) + drCh2Check(true) + drHypNote();
  const mat = `以下是論文「${s.no || ""} ${s.title || ""}」一節目前的全文：\n---\n${t}\n---`, task = T.dr_whole({ sec: `${s.no || ""} ${s.title || ""}`.trim(), intro: sid === "s1-1" }) + drLenReq(p) + drAskNote(p, "## 統整後全文") + ref;
  return (mat + "\n\n" + task).length <= 2800 ? [mat + "\n\n" + task] : splitForNLM(mat, task, "整節統整");
}
// 修訂論文的 Prompt：補強、精簡附上本節全文作為上下文（太長自動分則）；整節統整見 dwParts；融合為單則
function drParts(p) {
  if (p.dr_stage === "whole") return dwParts(p);
  if (blank(p.dr_text)) return [];
  const sid = drSid(), full = sid ? finText(sid) : "", s = ALL_SECS.find(x => x.id === sid) || {}, sn = `${s.no || ""} ${s.title || ""}`.trim();
  const same = zhCount(full.replace(/^#{1,6}\s.*$/gm, "")) <= zhCount(p.dr_text) + 5;   // 全選時，待改寫段落就是整節，不另附上下文
  const useFull = isOn(p.dr_full) && full && !same, at = full.indexOf(p.dr_text), local = !useFull && !same && at >= 0;
  const ref = (DR_R ? "\n\n請同時遵守本對話先前送出的「共用規則」。" : "") + drFmtNote(false) + drCh2Check(false, useFull) + drHypNote() + drAskNote(p, p.dr_stage === "merge" ? "## 融合後的段落" : "## 改寫後段落");
  if (p.dr_stage === "merge") return [T.dr_merge({ arch: bgSeed().bg_topic, text: p.dr_text }) + ref];
  const ctx = useFull ? "\n\n[上下文要求]\n上方已提供本節全文作為上下文，待改寫的段落是其中的一部分。請先在「## 段落角色」標題下，以一兩句說明待改寫段落在整節中的角色，以及與前一段、後一段的承接關係；再依此改寫：保留與前後段的銜接；不重複本節其他段落已寫過的論點、定義與數據；不刪除後文會用到的論點或術語。「## 改寫後段落」之下只放待改寫段落的改寫結果，不要改寫或輸出其他段落。"
    : local ? "\n\n[上下文要求]\n上方已提供待改寫段落的前一段與後一段（節錄）及本節小標題，只供參考：改寫時保留與前後段的銜接，「## 改寫後段落」之下只放待改寫段落的改寫結果，不要改寫或輸出前後段。" : "";
  const mk = (d, c) => p.dr_stage === "final" ? T.dr_final({ draft: d }) + drLenReq(p) + c + ref + "\n\n" + T.dr_final_tail({}) : p.dr_stage === "keep" ? T.dr_keep({ draft: d }) + c + ref : T.dr_draft({ draft: d }) + c + ref;
  const task = mk(p.dr_text, ctx);
  if (local) {   // 只附前後文：前一段、後一段（節錄）與本節小標題
    const blk = t => finBlocks(t).filter(b => !(/^#{1,6}\s/.test(b) || FIN_SUBHEAD.test(b)) || b.includes("\n"));
    const prev = blk(full.slice(0, at)).pop() || "", next = blk(full.slice(at + p.dr_text.length))[0] || "";
    const heads = finBlocks(full).filter(b => !b.includes("\n") && (/^#{1,6}\s/.test(b) || FIN_SUBHEAD.test(b))).map(b => b.replace(/^#+\s*/, ""));
    const room = Math.min(300, Math.floor((2800 - task.length - heads.join("、").length - 160) / 2));   // 依剩餘字數調整節錄長度，盡量維持單則
    const cut = (t, tail) => t.length <= room ? t : tail ? "……" + t.slice(-room) : t.slice(0, room) + "……";
    if (room < 60) return task.length <= 2800 ? [task] : splitForNLM(`以下是待改寫的論文段落（「${sn}」一節）：\n---\n${p.dr_text}\n---`, mk("（待改寫的內容即為前面分則送出的段落）", ""), "修訂論文");
    const mat = `以下是待改寫段落在論文「${sn}」一節中的位置（只供參考，不要改寫）：` + (heads.length ? `\n本節小標題：${heads.join("、")}` : "") +
      `\n前一段（節錄）：${prev ? cut(prev, true) : "（無，待改寫段落位於本節開頭）"}\n後一段（節錄）：${next ? cut(next, false) : "（無，待改寫段落位於本節結尾）"}`;
    return (mat + "\n\n" + task).length <= 2800 ? [mat + "\n\n" + task] : task.length <= 2800 ? [task] : splitForNLM(`以下是待改寫的論文段落（「${sn}」一節）：\n---\n${p.dr_text}\n---`, mk("（待改寫的內容即為前面分則送出的段落）", ""), "修訂論文");
  }
  if (!ctx) {   // 全選或沒有上下文：太長時，先分則送出待改寫的全文，最後一則只放改寫任務
    if (task.length <= 2800) return [task];
    const t2 = mk("（待改寫的內容即為前面分則送出的本節全文）", "");
    return splitForNLM(`以下是待改寫的論文段落（「${sn}」一節）：\n---\n${p.dr_text}\n---`, t2, "修訂論文");
  }
  const mat = `以下是論文「${sn}」一節目前的全文（作為上下文，只供參考）：\n---\n${full}\n---`;
  return (mat + "\n\n" + task).length <= 2800 ? [mat + "\n\n" + task] : splitForNLM(mat, task, "修訂論文");
}
function drReplace(mode) {
  const sid = drSid(), r = drLatest((store.replies || {})[replyKey()] || ""); if (!r || !sid) return;
  let t = finText(sid); const ps = drParas();
  if (mode === "all") { if (!confirm(`以這個結果取代「${secLabel(sid) || "本節"}」定稿的全部文字？（之後可在該節定稿下方按「復原上一次清除或取代前的內容」）`)) return; (store.values.fin_undo ||= {})[sid] = t; t = r; }
  else if (mode === "append") { if (finBlocks(t).some(b => blockSim(b, r) >= 0.8) && !confirm("本節定稿中已有相同或幾乎相同的段落，仍要再加到最後嗎？")) return; t = (t ? t + "\n\n" : "") + r; }
  else if (mode === "sel") { const x = store.values.dr_text || ""; if (!x.trim() || !t.includes(x)) { alert("本節定稿中找不到原本反白的文字（可能已修改過），請重新反白後再試。"); return; } t = t.replace(x, r); store.values.dr_text = r; }
  else if (mode === "one") { const p = ps.find(x => x.text.trim() === (store.values.dr_text || "").trim()); if (!p) return; t = t.replace(p.text, r); store.values.dr_text = r; }
  else { const sel = ps.filter(x => (store.values.dr_sel || []).includes(x.key)); if (!sel.length) return; t = t.replace(sel[0].text, r); sel.slice(1).forEach(x => { t = t.replace(x.text, ""); }); t = t.replace(/\n{3,}/g, "\n\n").trim(); store.values.dr_sel = []; }
  setFin(sid, t);
  if (mode === "all" && store.values.dr_stage === "whole") (store.values.dr_whole_ok ||= {})[sid] = idOf(finText(sid));   // 整節統整已套用：記下此時的內容
  const k = sid + "|" + r.replace(/\s/g, "").slice(0, 40); (store.values.dr_done ||= {})[k] = true;
}

// ── 段落核實改寫：把本節定稿拆成一段一段 ──
let DR_R = "";   // 段落核實改寫的共用規則（另成一則，每個對話送一次）
const VERIFY_HEAD = /^#{1,4}\s*(?:\d+[.、]\s*)?(待補清單|待補資料|需要研究者查證|學生原稿檢核|學生內容查證|來源核對|對應檢核|假說支持度檢核)/m;
function drParas() {
  const s = ALL_SECS.find(x => x.id === drSid()); if (!s || !s.no) return [];
  const out = []; let head = "";
  finText(s.id).split(/\n\s*\n/).forEach(b => {
    b = b.trim(); if (!b) return;
    if (/^#{1,6}\s/.test(b) && !b.includes("\n")) { head = b.replace(/^#+\s*/, ""); return; }
    if (b.replace(/\s/g, "").length >= 20) out.push({ head, text: b, key: s.id + "|" + b.replace(/\s/g, "").slice(0, 40) });
  });
  return out;
}
function drView() {
  const ps = drParas(), done = store.values.dr_done || {}, cur = (store.values.dr_text || "").trim();
  const merge = store.values.dr_stage === "merge", sel = store.values.dr_sel || [];
  return `<p class="hint">本節共 ${ps.length} 段，已完成 ${ps.filter(x => done[x.key]).length} 段。${merge ? "融合：按「加入融合」選兩段以上（依清單順序帶入），複製 Prompt 送出，AI 會先提出排序方案再寫出融合後的段落。" : "按「用這一段」帶入下方，複製 Prompt 送出；回覆貼到「AI 回覆」後，按「完成」標記，再換下一段。"}　<button type="button" data-drall="1">${merge ? "全選（全部加入融合）" : "全選（帶入本節全部段落）"}</button></p>` +
    ps.map((x, i) => `<div class="dr-para${done[x.key] ? " done" : ""}${(merge ? sel.includes(x.key) : cur === x.text.trim()) ? " cur" : ""}"><b>${i + 1}</b>
      <div class="dr-txt">${x.head ? `<small>${esc(x.head)}</small>` : ""}${x.text.length > 90
        ? `<details><summary>${esc(x.text.slice(0, 90))}……<span class="dr-more">展開全文</span></summary><div class="dr-full">${esc(x.text)}</div></details>`
        : `<span>${esc(x.text)}</span>`}</div>
      <span class="dr-btns">${merge ? `<button type="button" data-drsel="${i}" class="${sel.includes(x.key) ? "on" : ""}">${sel.includes(x.key) ? "✓ 已加入" : "加入融合"}</button>` : `<button type="button" data-drpick="${i}">${cur === x.text.trim() ? "目前這段" : "用這一段"}</button>`}
      <button type="button" data-drdone="${i}">${done[x.key] ? "✓ 已完成" : "完成"}</button></span></div>`).join("");
}

// ── 待補資料查證：第一～五章 AI 回覆中的【待補…】標記 ──
const TB_RE = /【(待補[^：:】]*)(?:[：:]([^】]*))?】/g;
const THESIS_SECS = () => OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).flatMap(c => c.secs).filter(s => !s.setup);
function secsOf(c) { return c.secs.filter(s => !s.setup); }
// 回覆中的待補標記（略過回覆最後的待補清單類小節，避免重複）；key：章節｜步驟｜標記文字｜同文字第幾次
function tbMarks(sid, mod, text) {
  const t = String(text || ""), cut = t.search(/^#{1,4}\s*(?:\d+[.、]\s*)?(待補清單|待補資料|需要研究者查證|學生原稿檢核|學生內容查證|來源核對)/m);
  const seen = {}, out = [];
  for (const m of t.matchAll(TB_RE)) {
    if (cut >= 0 && m.index > cut) break;
    const n = (seen[m[0]] = (seen[m[0]] || 0) + 1);
    const a = Math.max(t.lastIndexOf("。", m.index - 1), t.lastIndexOf("\n", m.index - 1)) + 1;
    let b = t.slice(m.index + m[0].length).search(/[。\n]/); b = b < 0 ? t.length : m.index + m[0].length + b + 1;
    out.push({ key: `${sid}|${mod}|${m[0]}|${n}`, mark: m[0], kind: m[1], need: (m[2] || "").trim(), ctx: t.slice(a, b).trim(), index: m.index });
  }
  return out;
}
function tbItems() {   // 只看各節定稿（論文正文）中的待補標記
  return THESIS_SECS().flatMap(s => tbMarks(s.id, "fin", finText(s.id)).map(x => ({ ...x, sec: `${s.no} ${s.title}`, step: "本節定稿" })));
}
// 以查證內容取代標記（論文草稿檔用）
function tbApply(sid, mod, text) {
  const fill = store.values.tb_fill || {}, ms = tbMarks(sid, mod, text).filter(x => !blank(fill[x.key]));
  let t = String(text);
  ms.sort((a, b) => b.index - a.index).forEach(x => { t = t.slice(0, x.index) + fill[x.key].trim() + t.slice(x.index + x.mark.length); });
  return t;
}
function tbView() {
  const items = tbItems(), fill = store.values.tb_fill || {};
  if (!items.length) return `<p class="hint">第一章到第五章的 AI 回覆中，目前沒有【待補】標記。</p>`;
  const done = items.filter(x => !blank(fill[x.key])).length;
  let last = "";
  return `<p class="tb-count" id="tbcount">已填 ${done}／${items.length} 項</p>` + items.map(x => {
    const head = x.sec + "｜" + x.step !== last ? `<h4>${esc(x.sec)}｜${esc(x.step)}</h4>` : ""; last = x.sec + "｜" + x.step;
    const ctx = esc(x.ctx).replace(esc(x.mark), `<mark>${esc(x.mark)}</mark>`);
    return `${head}<div class="tb-item"><p class="tb-ctx">${ctx}</p>
      <textarea class="tb-in${blank(fill[x.key]) ? "" : " filled"}" data-tbfill="${esc(x.key)}" rows="2" placeholder="查證後的內容（含出處），例如：2024 年台灣電商市場規模約……（經濟部統計處, 2025）">${esc(fill[x.key] || "")}</textarea></div>`;
  }).join("");
}
function tbText() {
  const fill = store.values.tb_fill || {}, items = tbItems().filter(x => !blank(fill[x.key]));
  return items.length ? "【待補資料查證結果】\n\n" + items.map((x, k) => `${k + 1}. ${x.sec}｜${x.step}\n原文：${x.ctx}\n查證內容：${fill[x.key].trim()}`).join("\n\n") : "";
}

// 1.1 研究背景與動機：由前面步驟帶入
function mdSection(text, names) {   // 取出「## 名稱」一節（含其下的小標題，到下一個同級或更高標題為止）；同名者取最後一次出現
  const L = String(text || "").replace(/\r\n?/g, "\n").replace(/\*\*/g, "").split("\n");
  return names.map(n => {
    let start = -1, lv = 0;
    L.forEach((l, i) => { const m = l.match(/^(#{1,4})\s*(.*)$/); if (m && m[2].replace(/^[0-9一二三四五六七八九十、.．\s]+/, "").startsWith(n)) { start = i; lv = m[1].length; } });
    if (start < 0) return "";
    let end = L.length;
    for (let i = start + 1; i < L.length; i++) { const m = L[i].match(/^(#{1,4})\s/); if (m && m[1].length <= lv) { end = i; break; } }
    const body = L.slice(start + 1, end).join("\n").trim();
    return body ? `${n}\n${body}` : "";
  }).filter(Boolean).join("\n\n");
}
let BG_R = "";   // 研究背景與動機：最近一次的共用規則文字（分則時附在最後一則）
function bgParts(p) {
  if (blank(p.bg_topic)) return [];
  const q = { topic: p.bg_topic.trim(), facts: p.bg_facts, gaps: p.bg_gaps, plan: (p.bg_plan || "").trim(), draft: (p.as_draft || "").trim() };
  const R = RULES.filter(r => activeRules(DEFS.bg, p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
  const one = T.bg_mat(q) + "\n" + T.bg_task(q) + R;
  if (one.length <= 2800) return [one];
  // 太長：撰寫規則併入前面的參考資料分則送出，最後一則只放撰寫任務
  return splitForNLM(T.bg_mat(q) + (R ? "\n\n【撰寫時須遵守的規則】" + R : ""), T.bg_task(q) + (R ? "\n\n撰寫時請遵守前面提供的「撰寫時須遵守的規則」。" : ""), "研究背景與動機");
}
function bgSeed() {
  const v = store.values, r = store.replies || {};
  const { vars, d } = finalArch(), nm = k => ((vars.find(x => x.key === k) || {}).name || k).replace(/\s*[（(][^（）()]*[）)]\s*$/, "");
  const paths = d.edges.map(e => `${nm(e.from)} → ${nm(e.to)}`).concat(d.mods.map(m => { const [a, b] = m.edge.split(">"); return `${nm(m.from)} 調節（${nm(a)} → ${nm(b)}）`; }));
  const topic = [(v.tt_zh || "").trim() && "論文題目：" + v.tt_zh.trim(), (v.as_ctx || "").trim() && "研究情境：" + v.as_ctx.trim(), paths.length && "研究架構：" + paths.join("；")].filter(Boolean).join("\n");
  return { bg_topic: topic, bg_facts: mdSection(r["s1-1|asp"], ["台灣統計資料", "研究情境", "實務問題", "實務缺口"]), bg_gaps: mdSection(r["s0-5|archchk"], ["研究缺口"]) };
}
// 共用規則讓 Prompt 超過 NotebookLM 字數上限時：規則先分則送出（只回「已收到」），最後一則才是撰寫任務
function ruleSplit(mod, p, prompt, what) {
  if (!prompt) return [];
  const R = RULES.filter(r => activeRules(DEFS[mod], p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
  return (prompt + R).length <= 2800 ? [prompt + R] : splitForNLM("【撰寫時須遵守的規則】" + R, prompt + "\n\n撰寫時請遵守前面提供的「撰寫時須遵守的規則」。", what);
}
function partsNote(ps) { return ps.length > 1 ? `內容較長，Prompt 自動分成 ${ps.length} 則：前幾則是參考資料或規則（NotebookLM 只會回覆「已收到」），最後一則才開始撰寫；請在同一個對話依序送出。` : ""; }
function partBoxes(pre, mod, fn) { return [2, 3, 4].map(k => ({ id: pre + k, type: "promptbox", afterOut: true, when: p => fn(p).length >= k,
  get label() { const n = fn(valuesOf(DEFS[mod])).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始撰寫）` : `第 ${k} 則 Prompt`; },
  hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出",
  copyLabel: `${"②③"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => fn(p)[k - 1] || "" })); }
function puParts(p) { return blank(p.hy_paths) ? [] : ruleSplit("purpose", p, T.purpose({ paths: p.hy_paths, motive: p.pu_motive }), "研究目的"); }
function scParts(p) {
  if (blank(p.sc_topic)) return [];
  const q = { topic: p.sc_topic.trim(), target: (p.sc_target || "").trim(), extra: (p.sc_extra || "").trim(), ctx: (p.sc_ctx || "").trim() };
  const R = RULES.filter(r => activeRules(DEFS.scope, p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
  const one = T.scope(q) + R;
  if (one.length <= 2800) return [one];
  return splitForNLM(T.scope_mat(q) + (R ? "\n\n【撰寫時須遵守的規則】" + R : ""), T.scope_task(q) + (R ? "\n\n撰寫時請遵守前面提供的「撰寫時須遵守的規則」。" : ""), "研究範圍");
}
// 摘要：研究目的、研究方法、研究結果與結論的定稿
function abSource() {
  const pick = ["s1-2", "s3-1", "s3-4", "s3-5", "s4-3", "s5-1", "s5-2", "s5-3"];
  return THESIS_SECS().filter(s => pick.includes(s.id)).map(s => { const t = finBlocks(finText(s.id)).filter(b => !/^#|^〔插入/.test(b)).join("\n"); return t ? `【${s.no} ${s.title}】\n${t}` : ""; }).filter(Boolean).join("\n\n");
}
// 1.4 研究流程：各章已有定稿的摘要（第三章研究方法帶入較多內容）
function flSummary() {
  return THESIS_SECS().map(s => {
    const t = finBlocks(finText(s.id)).filter(b => !/^#/.test(b)).join(" "); if (!t) return "";
    const n = /^s3-/.test(s.id) ? 500 : 120;
    return `${s.no} ${s.title}：${t.length > n ? t.slice(0, n) + "……" : t}`;
  }).filter(Boolean).join("\n");
}
// 1.3 研究範圍：1.1 定稿中描述研究情境（平台）的段落，用來說明選擇此平台的理由
function scCtx() {
  const name = (store.values.as_ctx || "").replace(/[（(].*$/, "").trim().slice(0, 4), bs = finBlocks(finText("s1-1")).filter(b => !/^#/.test(b));
  const hit = (name && bs.find(b => b.includes(name))) || bs.find(b => /平台|市集/.test(b)) || "";   // 優先取提到平台名稱的那一段
  return hit.length > 650 ? hit.slice(0, 650) + "……" : hit;
}
// 由架構圖列出假說清單（一行一條；預期方向請研究者自行補上）
function archHyp() {
  const { vars, d } = finalArch(), nm = k => ((vars.find(x => x.key === k) || {}).name || k).replace(/\s*[（(][^（）()]*[）)]\s*$/, "");
  const ls = d.edges.map(e => `${nm(e.from)} → ${nm(e.to)}`).concat(d.mods.map(m => { const [a, b] = m.edge.split(">"); return `${nm(m.from)} 調節（${nm(a)} → ${nm(b)}）`; }));
  return ls.map((l, i) => `H${i + 1}：${l}`).join("\n");
}
function ttlArch() { const { A, vars, d } = finalArch(); return vars.length && d.edges.length ? archText({ ...A, vars }, d) : ""; }
function f31Text() {
  const { A, vars } = finalArch(); if (!vars.length) return "";
  const d = dgSeed(DEFS.fa31.fields[0], {});
  if (!d.edges.length) return "";
  return archText({ ...A, vars }, d);
}
const archOut = p => { const t = archSrcText(p), A = parseArch(t); return A.edges.length ? archText(A, archDiag(p)) : t.trim(); };

// 0.2 路線 B：由 0.1「研究方向聚焦」帶入研究情境與研究問題
// 取 AI 回覆中最後一次出現的「研究情境：」「研究問題：」；沒有回覆時，研究問題改用 0.1 填寫的「感興趣的現象」
function seedFrom01() {
  const r = String((store.replies || {})["s0-1|focus"] || "").replace(/\*\*/g, "");
  const last = re => { const m = [...r.matchAll(re)]; return m.length ? m[m.length - 1][1].trim() : ""; };
  const ctx = last(/研究情境[：:]\s*(.+)/g), con = last(/研究問題[：:]\s*(.+)/g) || (store.values.f_phen || "").trim();
  const dv = last(/^\s*依變數[：:]\s*(.+)$/gm);
  return { as_ctx: ctx, as_con: con, as_dv: dv };
}

// 每行一項（去除行首的條列符號與空白）
const splitLines = s => (s || "").split(/\r?\n/).map(v => v.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean);

// 問卷草稿：選定的架構（勾選組合／候選架構編號／其他）
function archLabel(p) {
  if (p.as_archm === "num") {
    const n = (p.as_archno || "").trim();
    if (!n) return "";
    const zh = { "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六" }[n] || n;
    return `上述候選研究架構中的架構${zh}`;
  }
  if (p.as_archm === "other") return (p.as_arch || "").trim();
  const t = mixArchText();   // 0.2 選定（或勾選組合）的架構，帶入完整的變數與路徑
  return t ? "\n\n" + t.trim() + "\n\n" : "前述我自行勾選組合的研究架構";
}

// ── 論文目錄：章 → 節 → 步驟 ──
// step：{ mod, note, fixed（固定欄位值並隱藏該欄位） }；finish：每節最後的完稿步驟
const FIN_FULL = ["dr", "polish"], FIN_POLISH = ["polish"];
const R3 = ["citation", "style", "journal", "ch3"];   // 第三章各節預設的共用規則
const OUTLINE = [
  { ch: "常用", quick: true, secs: [
    { id: "q-draft", no: "", title: "修訂論文", desc: "補強：段落還缺東西時使用，字數不減。精簡：內容齊全但太冗長，字數必須減少，可設定目標長度。整節統整：整節去除重複、調整段落順序與邏輯。融合：把幾段合併成一段。都會先核實引用，任何一章都可以用。", steps: [
      { mod: "dr", note: "先在上方「改寫方向」選擇做法。補強、精簡一次一段；整節統整會自動帶入本節全文；融合可選多段。" }] },
    { id: "q-var", no: "", title: "檢索：變數與模型", desc: "步驟 1 深入了解單一變數：定義、維度、理論、操作型定義與量表、施測情境、前因與後果、相近構念。步驟 2 區辨相近變數：兩個以上的變數看起來很像時，分辨它們在研究架構上的異同。步驟 3 方法導向檢索：找特定領域中、實際使用某種統計方法的實證論文作為模仿範例，產生精準的 Google Scholar 檢索式與 Scholar Labs 問句。任何階段都可以用，各步驟可單獨使用。", steps: [
      { mod: "vdeep", note: "一次問一個變數；文獻不足時，先針對這個變數補上傳文獻再問。「施測情境」常因原文只簡短交代而標示「未提及」，請回到原文的方法章節或附錄查看。" },
      { mod: "vcomp", note: "每行填一個變數；可直接從組合研究架構的勾選區複製名稱。" },
      { mod: "smethod", note: "貼到有網路搜尋的 AI 對話，不需要上傳文獻。" }] },
    { id: "q-data", no: "", title: "panel 資料處理", desc: "把長格式的原始資料（一列一筆交易，同一人同一天可能有多筆）整理成一人一日一筆的寬格式資料：數值欄可選加總、平均、最大或最小；某個文字欄（例如基金別）的各個值可展開成欄，並可合併。合併時文字欄位的值不一致會示警，由你選擇處理方式。全部在瀏覽器處理，資料不會上傳。", steps: [
      { mod: "dprep", note: "依序上傳檔案 → 確認欄位的處理方式 → 檢查資料 → 處理不一致 → 下載。" }] }
  ] },
  { ch: "第零章 研究準備", secs: [
    { id: "s0-1", no: "0.1", title: "文獻蒐集與整理", desc: "還沒讀文獻、只有一個想研究的現象時，從這裡開始：聚焦研究問題與關鍵字 → 建立文獻比較表。步驟 3–5 為選用的「整批文獻全貌」：要先看整個研究領域的主題、理論、變數與缺口時再做。整理好之後，到 0.2 形成研究架構。", steps: [
      { mod: "focus", note: "用選擇題把現象收斂成研究問題，產生中英文關鍵字與檢索字串；檢索到的文獻存進同一個 Zotero 資料夾。", go: [{ to: "s0-1", step: 1, when: "檢索到的文獻存進 Zotero、上傳到 NotebookLM 後" }] },
      { mod: "matrix", note: "文獻上傳到 NotebookLM 後，逐篇整理成比較表；完成後加入 NotebookLM 的來源，作為後續提出與檢核研究架構的索引（做法見最下方）。", go: [{ to: "s0-4", step: 0, when: "已大致知道要研究哪些變數，或已確定自變數與依變數" }, { to: "s0-1", step: 2, when: "文獻多而分散，想先看整個領域的全貌" }],
        after: "完成後請做兩件事，後續步驟都會用到這份表：\n1. 把匯出的試算表全選複製（Ctrl+A、Ctrl+C），貼到上方「AI 回覆」保存。\n2. 回到同一個 NotebookLM，按「新增來源 → 複製的文字」貼上，再從該來源右側的選單重新命名為「00_文獻比較表（索引）」。之後 0.2「提出候選研究架構」「組合研究架構」與 0.3「依文獻檢核架構」的 Prompt，都會以它作為索引，快速對照每篇文獻的變數、理論與量表，作為提出與檢核研究架構的依據；引用仍回到各篇全文。\n\n接下來：已大致知道要研究哪些變數、指導教授已給方向，或已確定自變數與依變數 → 直接到 0.2；文獻多而分散、還看不出主流方向，想先了解整個領域的主題、理論、方法與缺口 → 繼續步驟 3–5。" },
      { mod: "m5a", note: "選用（整批文獻全貌）：開新對話，盤點主題、理論與研究方法。", go: [{ to: "s0-1", step: 3, when: "同一個對話接續" }] },
      { mod: "m5b", note: "選用（整批文獻全貌）：同一個對話接續，以文字說明各變數的定義、測量與角色，並畫關係圖；用來理解變數，挑選變數請用 0.2。", go: [{ to: "s0-1", step: 4, when: "同一個對話接續" }] },
      { mod: "m5c", note: "選用（整批文獻全貌）：同一個對話接續，從變數、理論、情境與方法四個面向，找出整個領域的研究缺口與研究主題建議。", go: [{ to: "s0-4", step: 0, when: "看完全貌、選定研究方向後" }] }] },
    { id: "s0-4", no: "0.2", title: "形成研究架構",
      mtitle: "形成研究模型", mdesc: "追蹤資料研究的重點在於估計目標與模型設定：先描述資料、收斂解釋與預測目標（步驟 1），再請 AI 提出彼此競爭的候選模型、比較策略與各種比較結果的策略意涵（步驟 2），選定研究模型組。資料裡沒有、但可串接外部資料或計算出來的變數，可用步驟 3 查證文獻支持。",
      msteps: [
      { mod: "pdata", note: "在已上傳文獻的 NotebookLM 開新對話。文獻以使用追蹤資料或紀錄資料、研究相同或相近依變數的實證研究為主。", go: [{ to: "s0-4", step: 1, when: "回覆貼上、選定依變數定義後" }] },
      { mod: "pmodel", note: "接在步驟 1 的同一個對話。", go: [{ to: "s0-5", step: 0, when: "選定研究模型組後" }, { to: "s0-4", step: 2, when: "想加入需串接外部資料或計算的變數時" }] },
      { mod: "pdvlit", note: "選用：資料裡沒有、但可串接或計算出來的變數，先查證文獻支持與資料來源。貼到有網路搜尋的一般 AI，不需上傳文獻。", go: [{ to: "s0-4", step: 0, when: "決定納入的變數寫進「研究變數」" }, { to: "s0-5", step: 0, when: "變數確定後檢核模型設定" }] }], desc: "兩種做法：有研究主題與情境時，先由 AI 提出候選架構（步驟 1），再到步驟 2 勾選變數、畫出路徑；自變數與依變數已確定時，直接到步驟 2，勾選「自變數與依變數已確定」。組合好的架構到 0.3 檢核；已有自己的架構或只有架構圖圖片，直接到 0.3 選「自行設計或匯入」。", steps: [
      { mod: "asf", note: "由 AI 提出幾個合理的研究架構，再由你挑選；已確定依變數時可填入。需要更完整的變數時，勾選最下方的「補充變數清單」。", go: [{ to: "s0-4", step: 1, when: "回覆貼到「AI 回覆」後，勾選變數、請 AI 提出候選架構" }] },
      { mod: "asmix", note: "勾選變數（同一角色可勾多個候選）→ 請 AI 提出候選架構 → 網頁畫出各候選，選定最適合者 → 到 0.3 檢核。自變數與依變數已確定時，先勾選上方的「已確定」，請 AI 建議中介與調節變數。", go: [{ to: "s0-5", step: 0, when: "選定架構後，檢核合理性並產生研究缺口與學術貢獻" }] }] },
    { id: "s0-5", no: "0.3", title: "研究架構合理性檢核",
      mtitle: "模型設定合理性檢核", mdesc: "依已上傳的文獻檢核研究模型組的設定：內生性、未觀察異質性、樣本選擇、時間結構、代理變數、模型比較的公平性與策略意涵的推論範圍；提出修正後的模型組，並整理研究缺口與預期貢獻。",
      msteps: [
      { mod: "mchk", note: "研究模型組由 0.2 帶入。可接在 0.2 的同一個 NotebookLM 對話；文獻不足時，先補上方法論文獻（例如追蹤資料計量方法的教科書章節或方法論文）。", go: [{ to: "s0-5", step: 1, when: "還有疑問時" }, { to: "s0-6", step: 0, when: "模型組確定後" }] },
      { mod: "archq", note: "接在步驟 1 的同一個對話；可重複使用。", go: [{ to: "s0-6", step: 0, when: "疑問釐清、模型組確定後" }] }], desc: "依已上傳的文獻檢核研究架構的合理性，並提出文獻支持更充分的修正架構：0.2 各路線產出的架構都在這裡檢核，也可單獨使用（例如只有一張架構圖）。NotebookLM 依制式項目與你的問題檢核 → 同一對話追問。", steps: [
      { mod: "archchk", note: "選擇研究架構來源：在 0.2 組合的架構選「0.2 組合研究架構」，會自動帶入；已有自己的架構或只有架構圖圖片，選「自行設計或匯入」。NotebookLM 需先上傳與架構相關的文獻；文獻愈完整，檢核愈有意義。", go: [{ to: "s0-5", step: 1, when: "對檢核結果還有疑問" }, { to: "s0-6", step: 0, when: "架構確定後（維持原架構或已採用修正架構並再檢核）" }] },
      { mod: "archq", note: "接在步驟 1 的同一個對話；可重複使用。", go: [{ to: "s0-6", step: 0, when: "疑問釐清、架構確定後" }] }] },
    { id: "s0-6", no: "0.4", title: "研究設計",
      mdesc: "研究模型組確定之後：建立資料字典與分析樣本規則（預測時另規劃時間切分），再規劃第四章要揭露的模型比較結果與統計量。",
      msteps: [
      { mod: "pdict", note: "接在 0.3 的同一個 NotebookLM 對話。", go: [{ to: "s0-6", step: 1, when: "資料字典完成後" }] },
      { mod: "mreport", note: "接在同一個對話。", go: [{ to: "s0-7", step: 0, when: "研究設計完成，擬定論文題目" }] }], desc: "研究架構確定之後：確認文獻用過的統計方法、本研究適用的方法與應揭露的實證結果；研究方法為問卷調查法或實驗設計法時，再產出問卷草稿。", steps: [
      { mod: "astat", note: "選定變數與資料之後：確認統計方法，以及實證結果應揭露哪些項目。可接在 0.3 檢核的同一個對話。", go: [{ to: "s0-6", step: 1, when: "研究方法為問卷調查法或實驗設計法" }, { to: "s1-1", step: 0, when: "panel data，或統計方法已確定，開始撰寫第一章" }] },
      { mod: "asq", note: "研究方法為問卷調查法或實驗設計法時使用：產出問卷草稿，並評估題數、樣本數、量表與施測風險；panel data 可跳過。", go: [{ to: "s0-7", step: 0, when: "研究設計完成，擬定論文題目" }, { to: "s3-3", step: 0, when: "正式撰寫量表與操作型定義時" }] }] },
    { id: "s0-7", no: "0.5", title: "論文題目", desc: "依確定的研究架構擬定中英文論文題目：AI 提出候選題目並比較優缺點，再由你定稿；定稿題目會成為論文草稿檔的標題。", steps: [
      { mod: "ttl", note: "可接在 0.3 或 0.4 的同一個 NotebookLM 對話；定稿題目填在最下方。", go: [{ to: "s1-1", step: 0, when: "題目定稿後，開始撰寫第一章緒論" }] }] }
  ] },
  { ch: "第一章 緒論", secs: [
    { id: "s1-1", no: "1.1", title: "研究動機", desc: "由產業與平台背景逐步收斂到研究缺口（期刊式引言）。", steps: [
      { mod: "bgplan", rules: ["citation", "ch1"], note: "先看相關文獻怎麼寫研究背景與動機：必寫的要素、要放幾點統計數據、從理論或從實務資料切入，並整理出幾種寫法供你選擇。" },
      { mod: "asp", note: "依選定的寫法查台灣的統計與實務資料：把選定寫法的段落大綱與{#archchk}的回覆交給有網路搜尋的 AI，寫成研究情境、實務問題與實務缺口，並整理台灣統計資料。" },
      { mod: "bg", rules: ["citation", "style", "verify", "ch1"], note: "依選定的寫法撰寫；研究主題、選定的寫法、背景資料與研究缺口會自動帶入。" }], finish: FIN_FULL },
    { id: "s1-2", no: "1.2", title: "研究目的", desc: "承接 1.1 的研究缺口，參考文獻的寫法說明本研究的整體目的與檢驗重點；不另寫研究問題。", steps: [
      { mod: "purpose", rules: ["citation", "style", "ch1"], note: "研究架構（假說清單）由架構圖自動帶入，請補上預期方向；研究缺口自動帶入 1.1 定稿的最後一段。貼到寫 1.1 的同一個 NotebookLM 對話。" }], finish: FIN_POLISH },
    { id: "s1-3", no: "1.3", title: "研究範圍", desc: "界定研究的情境、對象與變數邊界。", steps: [
      { mod: "scope", rules: ["citation", "style", "ch1"], note: "研究題目、研究架構、研究情境與研究對象會自動帶入；可補充要排除的範圍。" }], finish: FIN_FULL },
    { id: "s1-4", no: "1.4", title: "研究流程", desc: "說明研究的主要階段與各章安排；建議第三章定稿後再寫（碩論特有小節，投稿期刊時可整段刪除）。", steps: [
      { mod: "flow", rules: ["style"], note: "建議在第三章定稿後（或全文完成後）再寫：各章定稿摘要會自動帶入，貼到一般 AI 即可。" }], finish: FIN_FULL }
  ] },
  { ch: "第二章 文獻探討", secs: [
    // 各節由 rebuildCh2() 依「第二章架構」產生
  ] },
  { ch: "第三章 研究方法", secs: [
    { id: "s3-1", no: "3.1", title: "研究架構與假說", desc: "研究設計類型、研究架構圖、各變數在架構中的角色，最後列出研究假說（碩論特有，投稿期刊時可整節刪除）。", steps: [
      { mod: "fa31", rules: R3, note: "由 0.3 的研究架構帶入架構圖，微調後下載或複製圖片；再產生撰寫架構說明的 Prompt。第二章的假說會自動接在架構說明之後。" }], finish: FIN_FULL },
    { id: "s3-3", no: "3.2", title: "操作型定義與衡量", desc: "各構念的操作型定義、量表來源與選用理由、題數與量尺、題項修改說明；有前測時寫在最後一段。", steps: [
      { mod: "opdef", rules: [...R3, "verify"], note: "構念與題項由 0.4「定稿問卷」帶入，本研究定義由第二章各節帶入；量表原始文獻要先上傳到 NotebookLM。有做前測時填入前測欄位，前測寫成本節最後一段。" }], finish: FIN_FULL },
    { id: "s3-4", no: "3.3", title: "研究對象與抽樣", desc: "母體、抽樣方法、樣本數依據、研究倫理、資料蒐集、篩選與排除標準、回收與有效樣本。", steps: [
      { mod: "sample", rules: ["style", "ch3"], note: "先選撰寫版本（計畫書或完整論文），再準備母體、抽樣方法、樣本數依據、蒐集期間與份數；沒做或還沒有的項目留白，文中會標【待補】。前測寫在 3.2，未回應偏差檢驗寫在 4.1。" }], finish: FIN_FULL },
    { id: "s3-5", no: "3.4", title: "資料分析方法", desc: "依分析順序說明各方法的目的、做法、判斷準則與出處。", steps: [
      { mod: "analysis", rules: R3, note: "勾選要用的分析方法；統計方法與門檻的原始文獻（例如 Hair et al.、Henseler et al.）要先上傳到 NotebookLM。" }], finish: FIN_FULL }
  ] },
  { ch: "第四章 研究結果", secs: [
    { id: "s4-1", no: "4.1", title: "樣本描述", desc: "受訪者特性與主要變數的描述性統計。", steps: [
      { mod: "stats", note: "貼上人口統計次數分配與描述性統計的輸出；有做未回應偏差檢驗時，檢定輸出一併貼上。", fixed: { st_part: "sample" } }], finish: FIN_POLISH },
    { id: "s4-2", no: "4.2", title: "信效度分析", desc: "信度、收斂效度與區別效度。", steps: [
      { mod: "stats", note: "貼上信度與效度分析的輸出。", fixed: { st_part: "rel" } }], finish: FIN_POLISH },
    { id: "s4-3", no: "4.3", title: "假說檢定", desc: "路徑係數、顯著性與假說支持與否。", steps: [
      { mod: "stats", note: "貼上結構模型或迴歸的輸出；假說清單會自動帶入，產出的假說檢定彙整可直接用於第五章。", fixed: { st_part: "hypo" } }], finish: FIN_POLISH }
  ] },
  { ch: "第五章 結論與建議", secs: [
    { id: "s5-1", no: "5.1", title: "研究發現與討論", desc: "逐條假說對照文獻。", steps: [
      { mod: "discuss", note: "貼上 4.3 的假說檢定彙整。", fixed: { ds_secs: ["disc"] } }], finish: FIN_FULL },
    { id: "s5-2", no: "5.2", title: "理論意涵", desc: "本研究對理論的貢獻。", steps: [
      { mod: "discuss", note: "可接在 5.1 同一個對話。", fixed: { ds_secs: ["theory"] } }], finish: FIN_FULL },
    { id: "s5-3", no: "5.3", title: "實務意涵", desc: "依研究發現提出管理建議。", steps: [
      { mod: "discuss", note: "可接在 5.1 同一個對話。", fixed: { ds_secs: ["practice"] } }], finish: FIN_FULL },
    { id: "s5-4", no: "5.4", title: "研究限制與未來研究方向", desc: "本研究的限制與對應的後續研究。", steps: [
      { mod: "discuss", note: "可接在 5.1 同一個對話。", fixed: { ds_secs: ["limit"] } }], finish: FIN_FULL }
  ] },
  { ch: "論文整理", secs: [
    { id: "q-abs", no: "", title: "摘要", desc: "依第一章到第五章的定稿產生中英文摘要與關鍵詞；回覆會放進下載的 Word 檔。建議全文定稿後再做。", steps: [
      { mod: "abstract", note: "各章定稿會自動帶入；貼到一般 AI 即可，回覆貼到下方「AI 回覆」。" }] },
    { id: "q-full", no: "", title: "論文全文", desc: "依章節顯示各節的定稿（就是「研究名稱_論文.md」的內容）；各節的定稿可在該節最下方的「本節論文內容」查看與修改。", steps: [
      { mod: "fulltext", note: "定稿來自各節撰寫步驟的正文，修訂論文（補強、精簡、整節統整、融合）後可取代為改寫版。" }] },
    { id: "q-rename", no: "", title: "全站用詞取代", desc: "變數改名或統一譯名時使用：一次更新全站的論文內容、AI 回覆、研究假說、架構圖與第二章分節。", steps: [
      { mod: "rename", note: "取代前會先顯示各處的數量；取代後可按「復原上一次取代」。" }] },
    { id: "q-ref", no: "", title: "參考文獻", desc: "掃描各節定稿中的行內引用，從各步驟的 AI 回覆中找出完整出處；請逐筆核對或填入，論文.md 最後會附上依 APA 第七版排序的參考文獻。", steps: [
      { mod: "refs", note: "中文文獻在前（依筆畫）、英文文獻在後（依字母）。自動帶入的出處請務必核對原文。" }] },
    { id: "q-tb", no: "", title: "待補資料查證", desc: "集中列出第一章到第五章各節定稿中所有【待補資料】【待補文獻】【待補引用】【待補量表】，查證後直接填入；論文.md 會以填入的內容取代標記。", steps: [
      { mod: "tbfill", note: "可隨時回來填寫；AI 回覆更新後，清單會自動重新整理。" }] },
    { id: "q-ch1g", no: "", title: "第一章寫作規範", desc: "整理自「如何寫論文」筆記本（畢恆達、Evans et al.、Swales CARS 模型等）：第一章的組成、各節寫作邏輯、該寫與不該寫、常見錯誤與精簡版規範。精簡版會自動附在第一章各步驟的 Prompt 中。", steps: [
      { mod: "ch1guide", note: "第一章各節上方也有「本節寫作規範」可展開查看。" }] }
  ] }
];

const FINISH_NOTE = {
  dr: "先在上方「改寫方向」選擇做法。補強、精簡、融合：在「本節論文內容」反白要修改的文字（可跨段落；反白範圍內的重複會一併合併）；整節統整會自動帶入本節全文。",
  polish: "完稿：潤色語句，或去除 AI 味。"
};
THESIS_SECS().forEach(s => { s.finish = FIN_FULL; });   // 第一～五章每一節都有「修訂論文」與「潤色與去 AI 味」兩個完稿步驟
let ALL_SECS = OUTLINE.flatMap(c => c.secs);
// ── 第二章：依「第二章架構」產生各節（理論基礎 → 各變數一節；假說在影響方變數的一節推導）──
function ch2Default() {
  const { vars, d } = finalArch(); if (!vars.length || !d.edges.length) return "";
  const nm = v => (v.name || v.key).replace(/\s*[（(][^（）()]*[）)]\s*$/, "").trim();
  const outs = new Set(d.edges.map(e => e.from)), ins = new Set(d.edges.map(e => e.to)), mods = new Set(d.mods.map(m => m.from));
  const role = k => !ins.has(k) ? 2 : !outs.has(k) ? 0 : 1;   // 依變數在前（0）、中介（1）、前因與調節（2）
  const used = vars.filter(v => outs.has(v.key) || ins.has(v.key) || mods.has(v.key)), groups = [];
  used.forEach(v => { const n = nm(v), base = n.replace(/^[^型]{1,3}型/, "") || n, g = groups.find(x => x.base === base);
    if (g) g.vars.push(n); else groups.push({ base, vars: [n], role: role(v.key) }); });
  return groups.sort((a, b) => a.role - b.role).map(g => `${g.vars.length > 1 ? g.base : g.vars[0]}：${g.vars.join("、")}`).join("\n");
}
function idOf(t) { let h = 5381; for (const ch of t) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36); }
function ch2Plan() {   // [{ title, vars, names }]：第二章架構的每一行
  const ready = typeof store !== "undefined";
  return String((ready && (store.values.ch2_plan || "").trim()) || (ready ? ch2Default() : "")).split("\n")
    .map(l => l.trim()).filter(Boolean).map(l => { const [t, v] = l.split(/[：:]/); const title = t.trim(), vars = (v || t).trim();
      return { title, vars, names: [...new Set([title, ...vars.split(/[、，,／/]/)].map(x => x.trim()).filter(Boolean))] }; });
}
const hypLines = () => String((typeof store !== "undefined" && (store.values.hy_paths || "").trim()) || (typeof store !== "undefined" ? archHyp() : "")).split("\n").map(l => l.trim()).filter(Boolean);
// 假說歸屬：影響方變數所在的節。句中最早出現的變數即影響方（直接效果 X → Y、「M 中介…」、「Z 調節…」）；「X 透過 M 影響 Y」取 M
function hypHost(line, plan) {
  let body = line.replace(/^H\d+[a-z]?\s*[：:]\s*/, "");
  const via = body.match(/(?:透過|經由)(.*)$/); if (via) body = via[1];
  let best = -1, pos = Infinity, len = 0;
  plan.forEach((x, i) => x.names.forEach(n => { const k = body.indexOf(n); if (k >= 0 && (k < pos || (k === pos && n.length > len))) { best = i; pos = k; len = n.length; } }));
  return best;
}
function ch2HypMap() { const plan = ch2Plan(), by = plan.map(() => []), un = []; hypLines().forEach(l => { const h = hypHost(l, plan); (h >= 0 ? by[h] : un).push(l); }); return { plan, by, un }; }
const ch2SecHyps = sid => ((ALL_SECS.find(s => s.id === sid) || {}).hyps || []);
function hypRenumber() {
  const plan = ch2Plan(), ls = hypLines(); if (!ls.length) return "沒有研究假說可以重新編號。";
  const rows = ls.map((l, i) => ({ l, i, h: hypHost(l, plan), m: l.match(/^H(\d+)([a-z]?)\s*[：:]\s*/) }));
  if (rows.some(r => !r.m)) return "有假說不是以「H1：」的形式開頭，無法自動重新編號。";
  rows.sort((a, b) => (a.h < 0 ? 1e9 : a.h) - (b.h < 0 ? 1e9 : b.h) || a.i - b.i);
  const map = new Map(); let n = 0;
  store.values.hy_paths = rows.map(r => { if (!map.has(r.m[1])) map.set(r.m[1], ++n); return `H${map.get(r.m[1])}${r.m[2]}：${r.l.slice(r.m[0].length)}`; }).join("\n");
  // 論文內容中的假說編號一併更新：先依假說敘述的變數對照現行清單（可修正先前重新編號後仍留在正文的舊編號），其餘依本次的新舊編號對照
  const align = hypAlign(); map.forEach((w, o) => { if (!align.has(o)) align.set(o, w); });
  const moved = [...align].filter(([o, w]) => +o !== w), done = [];
  if (moved.length) THESIS_SECS().forEach(sc => {
    const t = finText(sc.id); if (!t) return;
    const u = t.replace(/(?<![A-Za-z])H(\d+)(?!\d)/g, (x, d) => align.has(d) ? "H" + align.get(d) : x);   // 單次替換，不會連鎖誤換
    if (u !== t) { setFin(sc.id, u); done.push(sc.no || sc.title); }
  });
  rebuildCh2(); if (typeof renderToc === "function") renderToc();
  return "已依章節順序重新編號；1.2、3.4、4.3 也會使用新的編號。" + (done.length ? `論文內容中的假說編號已一併更新：${done.join("、")}。` : moved.length ? "論文內容中沒有需要更新的假說編號。" : "編號原本就已依章節順序排列。");
}
// 正文中的假說敘述（Hn：……）依其中的變數與順序，對照現行假說清單，得到 舊編號 → 現行編號
function hypAlign() {
  const names = [...new Set(ch2Plan().flatMap(x => x.vars.split(/[、，,／/]/).map(v => v.trim()).filter(Boolean)))];
  const key = t => names.map(n => [t.indexOf(n), n]).filter(([k]) => k >= 0).sort((a, b) => a[0] - b[0]).map(([, n]) => n).join("|");
  const cur = new Map(); hypLines().forEach(l => { const m = l.match(/^H(\d+)[a-z]?\s*[：:]\s*(.*)$/); if (m) { const k = key(m[2]); if (k) cur.set(k, cur.has(k) ? null : +m[1]); } });
  const out = new Map(), bad = new Set(), ch = OUTLINE.find(c => /^第二章/.test(c.ch));
  (ch ? ch.secs : []).filter(x => !x.setup).forEach(sc => finText(sc.id).split("\n").forEach(l => {
    const m = l.match(/(?:^|[\s，。；：「（])H(\d+)[a-z]?\s*[：:]\s*(.+)$/); if (!m) return;
    const w = cur.get(key(m[2])); if (!w) return;
    if (out.has(m[1]) && out.get(m[1]) !== w) bad.add(m[1]); else out.set(m[1], w);
  }));
  bad.forEach(o => out.delete(o));
  return out;
}
function ch2PrevHtml() {
  const { un } = ch2HypMap(), secs = secsOf(OUTLINE.find(c => /^第二章/.test(c.ch)));
  return `<ol class="ch2prev">${secs.map(s => `<li><b>${esc(s.no)}</b> ${esc(s.title)}${(s.hyps || []).length ? `<br><small>推導：${esc(s.hyps.map(h => (h.match(/^H\d+[a-z]?/) || [h.slice(0, 12)])[0]).join("、"))}</small>` : ""}</li>`).join("")}</ol>` +
    (un.length ? `<p class="note warn">下列假說找不到對應的節（假說中的變數名稱要與上方各節的變數一致）：<br>${un.map(esc).join("<br>")}</p>` : "") +
    `<p class="hint">同一構念的不同面向會在該節以子標題分開。節名或變數改動後，原本那一節的內容會保留在研究存檔中，但不會出現在新的節名下。</p>`;
}
function rebuildCh2() {
  const ch = OUTLINE.find(c => /^第二章/.test(c.ch)); if (!ch) return;
  const { plan, by } = ch2HypMap();
  const R2 = ["citation", "style", "journal", "ch2"], seen = new Set();
  ch.secs = [
    { id: "s2-0", no: "", title: "第二章架構", setup: true, desc: "設定第二章的分節與研究假說：理論基礎、各變數一節；每條假說在其影響方變數的一節推導。", steps: [{ mod: "ch2plan" }] },
    { id: "s2-th", no: "2.1", title: "理論基礎", desc: "以統攝的理論說明各變數之間的機制。", steps: [{ mod: "ch2th", rules: R2, note: "理論可自行指定，或留白請 NotebookLM 依相近文獻建議。" }] },
    ...plan.map((x, i) => { let id = "s2-" + idOf(x.vars.replace(/\s/g, "")); while (seen.has(id)) id += "x"; seen.add(id);
      const hy = by[i], hn = hy.map(h => (h.match(/^H\d+[a-z]?/) || [""])[0]).filter(Boolean);
      return { id, no: `2.${i + 2}`, title: x.title, hyps: hy, desc: `本節涵蓋：${x.vars}。依序撰寫定義、面向、相關理論、前因與後果、衡量方式${hy.length ? `，接著推導${hn.length ? " " + hn.join("、") + " " : "本節的假說"}` : ""}。`,
        steps: [{ mod: "ch2var", rules: hy.length ? [...R2, "evidence"] : R2, preset: { cv_title: x.title, cv_vars: x.vars }, note: hy.length ? "節名、變數與本節要推導的假說由「第二章架構」帶入；研究題目與架構各節共用。" : "節名與變數由「第二章架構」帶入；本節沒有分配到假說，只介紹構念。" }] }; })
  ];
  ch.secs.forEach(s => { if (!s.setup) s.finish = FIN_FULL; });
  ALL_SECS = OUTLINE.flatMap(c => c.secs);
}
rebuildCh2();
// 第二章：理論基礎與各變數一節的 Prompt（規則過長時分則）
function thParts(p) { return blank(p.cv_arch) ? [] : ruleSplit("ch2th", p, T.ch2th({ arch: p.cv_arch.trim(), theory: (p.th_theory || "").trim(), title: (s => s ? `${s.no} ${s.title}` : "理論基礎")(sec && sec()) }), "理論基礎"); }
function cvParts(p) { return blank(p.cv_arch) || blank(p.cv_vars) ? [] : ruleSplit("ch2var", p, T.ch2var({ arch: p.cv_arch.trim(), vars: p.cv_vars.trim(), hyps: ch2SecHyps((sec && sec() || {}).id).join("\n"), items: cvItems(p.cv_vars), title: `${(sec && sec() || {}).no || ""} ${p.cv_title || ""}`.trim() }), p.cv_title || "本節"); }
// 第二章各變數一節：本節變數在 0.4 定稿問卷中的量表（出處、題數、量尺）
// 本節變數在 0.4 定稿問卷中的題項（供核對定義要素與題項是否一致；正文不列出）
function cvItems(vars) {
  const F = typeof finalSurvey === "function" ? finalSurvey() : null; if (!F) return "";
  const vs = String(vars || "").split(/[、，,／/]/).map(x => x.trim()).filter(Boolean);
  return F.cons.filter(c => c.items.length && vs.some(v => c.name === v || c.name.startsWith(v) || v.startsWith(c.name.replace(/\s*[（(].*$/, ""))))
    .map(c => `${c.name}：\n` + c.items.map(it => `  ${it.id} ${it.zh}`).join("\n")).join("\n");
}
function cvScale(vars) {
  const F = finalSurvey(); if (!F) return "";
  const vs = String(vars || "").split(/[、，,／/]/).map(x => x.trim()).filter(Boolean);
  const cs = F.cons.filter(c => vs.some(v => c.name === v || c.name.startsWith(v) || v.startsWith(c.name.replace(/\s*[（(].*$/, ""))));
  return cs.map(c => `- ${c.name}：${c.src || "出處未填"}${c.items.length ? `，${c.items.length} 題` : ""}${F.scale ? `，${F.scale}` : ""}`).join("\n");
}
// 全站用詞取代：以 JSON 字串整體取代（同時涵蓋欄位值、AI 回覆與以變數為名的鍵），再把第二章改名後的節 id 搬到新 id
const RN_UNDO = "pr-rename-undo";
const rnEsc = t => JSON.stringify(String(t)).slice(1, -1);
const rnCount = (o, w) => { const j = JSON.stringify(o ?? ""), k = rnEsc(w); return k ? j.split(k).length - 1 : 0; };
function rnPreview(p) {
  const a = (p.rn_old || "").trim(), b = (p.rn_new || "").trim();
  if (!a) return `<p class="hint">填入原用詞後，這裡會列出各處要改的數量。</p>`;
  const v = store.values, rest = Object.fromEntries(Object.entries(v).filter(([k]) => !["fin", "hy_paths", "ch2_plan", "rn_old", "rn_new", "fin_undo"].includes(k)));
  const rows = [["各章節論文內容", v.fin], ["AI 回覆", store.replies], ["研究假說", v.hy_paths], ["第二章架構", v.ch2_plan], ["架構圖、題目、問卷與其他欄位", rest], ["研究名稱", store.name]].map(([n, o]) => [n, rnCount(o, a)]);
  const total = rows.reduce((x, r) => x + r[1], 0);
  return `<table class="rn-prev"><tbody>${rows.map(([n, c]) => `<tr><td>${esc(n)}</td><td>${c} 處</td></tr>`).join("")}</tbody></table>` +
    `<p class="${total ? "note" : "note warn"}">${total ? `共 ${total} 處「${esc(a)}」${b ? `將改為「${esc(b)}」` : "（請填入新用詞）"}。` : `全站找不到「${esc(a)}」。`}${b && b.includes(a) ? "新用詞包含原用詞，取代只會進行一次，不會重複套用。" : ""}</p>`;
}
const ch2Ids = () => ((OUTLINE.find(c => /^第二章/.test(c.ch)) || { secs: [] }).secs).filter(x => !x.setup && x.id !== "s2-th").map(x => x.id);
function rnRun(p) {
  const a = (p.rn_old || "").trim(), b = (p.rn_new || "").trim();
  if (!a || !b) return "請填入原用詞與新用詞。";
  if (a === b) return "原用詞與新用詞相同。";
  const n = rnCount([store.values, store.replies, store.name], a) - rnCount([store.values.rn_old], a);
  if (!n) return `全站找不到「${a}」。`;
  if (!confirm(`將全站 ${n} 處「${a}」改為「${b}」？（之後可按「復原上一次取代」）`)) return "已取消。";
  const keep = { rn_old: store.values.rn_old, rn_new: store.values.rn_new };
  try { localStorage.setItem(RN_UNDO, JSON.stringify({ values: store.values, replies: store.replies, step: store.step, rules: store.rules, sec: store.sec, name: store.name })); } catch {}
  const before = ch2Ids(), sub = o => JSON.parse(JSON.stringify(o ?? null).split(rnEsc(a)).join(rnEsc(b)));
  store.values = sub(store.values) || {}; store.replies = sub(store.replies) || {}; store.name = sub(store.name) || "";
  Object.assign(store.values, keep);
  rebuildCh2();
  const after = ch2Ids(), moved = before.length === after.length ? before.map((o, i) => [o, after[i]]).filter(([o, w]) => o !== w) : [];
  if (moved.length) {   // 第二章節 id 隨節名改變：論文內容、AI 回覆、步驟進度、每節欄位與規則勾選一併搬移
    const re = new RegExp(`(?<![\\w-])(${moved.map(([o]) => o).join("|")})(?![\\w])`, "g"), mp = Object.fromEntries(moved);
    const mv = o => JSON.parse(JSON.stringify(o ?? null).replace(re, m => mp[m]));
    store.values = mv(store.values) || {}; store.replies = mv(store.replies) || {}; store.step = mv(store.step) || {}; store.rules = mv(store.rules) || {};
    if (mp[store.sec]) store.sec = mp[store.sec];
    rebuildCh2();
  }
  if (typeof renderToc === "function") renderToc();
  return `已將 ${n} 處「${a}」改為「${b}」${moved.length ? `，並把第二章 ${moved.length} 節的內容搬到新的節名下` : ""}。`;
}
function rnUndo() {
  let u = null; try { u = JSON.parse(localStorage.getItem(RN_UNDO) || "null"); } catch {}
  if (!u) return "沒有可以復原的取代。";
  if (!confirm("回到最近一次「全部取代」之前的狀態？之後所做的修改也會一併還原。")) return "已取消。";
  Object.assign(store, u); try { localStorage.removeItem(RN_UNDO); } catch {}
  rebuildCh2(); if (typeof renderToc === "function") renderToc();
  return "已復原。";
}
// ── 第三章：各節 Prompt 分則、第二章定義帶入、假說清單接入 3.1 ──
const ruleText = (mod, p) => RULES.filter(r => activeRules(DEFS[mod], p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
function f31Parts(p) { const t = f31Text(), v = store.values; return t ? ruleSplit("fa31", p, T.frame31({ arch: t, theory: (p.f31_theory || "").trim(), ctx: (v.as_ctx || "").trim(), scope: (p.f31_scope || "").trim(),
  design: (sq => [["資料蒐集方式（只取設計類型，平台、管道與期間不寫入 3.1）", sq.sp_collect], ["填答依據", sq.sp_basis], ["研究母體", v.sp_pop]])(spCompose(spVals())).filter(([, x]) => !blank(x)).map(([k, x]) => `- ${k}：${x.trim()}`).join("\n") }), "研究架構與假說") : []; }
function anParts(p) { return !(p.an_methods || []).length ? [] : ruleSplit("analysis", p, T.analysis({ soft: p.an_soft, boot: p.an_boot, methods: p.an_methods, paths: p.hy_paths, dv: p.an_dv, criteria: p.an_criteria }), "資料分析方法"); }
// 3.2：題項分批的 Prompt 前面加上共用規則（放不進第 1 則時，先分則送規則，NotebookLM 只回覆「已收到」）
function odParts(p) {
  if (blank(p.od_list)) return [];
  const base = odBatches(p); if (!base.length) base.push(T.opdef({ list: odKeep(ch2Order(splitLines(p.od_list))).join("\n"), scale: p.od_scale, defs: odDefsText(p), ctx: (store.values.as_ctx || "").trim() }));
  const R = ruleText("opdef", p); if (!R) return base;
  if ((base[0] + R).length <= 2800) return [base[0] + R, ...base.slice(1)];
  const blocks = R.split(/\n\n(?=\[)/).map(b => b.trim()).filter(Boolean), rs = []; let cur = "";
  blocks.forEach(b => { if (cur && (cur + "\n\n" + b).length > 2500) { rs.push(cur); cur = b; } else cur = cur ? cur + "\n\n" + b : b; });
  if (cur) rs.push(cur);
  return [...rs.map((c, i) => `以下是本對話撰寫「操作型定義與衡量」時要遵守的共用規則（第 ${i + 1}／${rs.length} 則）。請先記住，只回覆「已收到共用規則第 ${i + 1} 則」，先不要撰寫。\n\n` + c),
    base[0] + "\n\n撰寫時請遵守前面提供的共用規則。", ...base.slice(1)];
}
// 第二章各節論文內容中，界定某構念的句子：先找「本研究……定義／界定」，否則取首次界定此構念的句子與其後的說明（最多三句）
function ch2Def(name) {
  const core = String(name || "").replace(/\s*[（(].*$/, "").trim(); if (!core) return "";
  const ch = OUTLINE.find(c => /^第二章/.test(c.ch)), sents = [];
  (ch ? ch.secs : []).filter(s => !s.setup).forEach(s => String(finText(s.id) || "").split(/\n\s*\n/).forEach(p => {
    const ss = p.replace(/\n+/g, "").split(/(?<=。)/).map(x => x.trim()).filter(Boolean); sents.push(ss); }));
  for (const ss of sents) { const x = ss.find(t => t.includes(core) && /本研究/.test(t) && /定義|界定/.test(t)); if (x) return x; }
  const CUE = /反映|是指|係指|意指|指的是|定義|界定|強調|為一種|代表/;
  for (const ss of sents) { const i = ss.findIndex(t => t.includes(core) && CUE.test(t) && !/^H\d/.test(t)); if (i < 0) continue;
    const out = [ss[i]]; for (let k = i + 1; k < ss.length && out.length < 3 && !/相較|相對地|另一方面|然而/.test(ss[k]); k++) out.push(ss[k]);
    return out.join("").replace(/^(?:相較之下|相對地|另一方面|此外|然而)[，,]\s*/, ""); }
  return "";
}
const odName = l => String(l).split(/[｜|]/)[0].trim();
const odKeep = lines => lines.filter(l => !(store.values.od_skip || []).includes(odName(l)));   // 3.2：取消勾選的構念不寫進論文
const odNames = p => ch2Order(splitLines(p.od_list || "")).map(l => l.split(/[｜|]/)[0].trim()).filter(Boolean);
const odDefsText = p => odNames(p).filter(n => !(store.values.od_skip || []).includes(n)).map(n => (d => d ? `${n}：${d}` : "")(ch2Def(n))).filter(Boolean).join("\n");
function odDefsView() {
  const ns = odNames(valuesOf(DEFS.opdef)); if (!ns.length) return `<p class="hint">（填入構念清單後，這裡會列出第二章界定各構念的句子）</p>`;
  const skip = store.values.od_skip || [];
  return `<div class="od-box"><p class="hint">勾選要寫進 3.2 的構念；問卷有、但論文不討論的構念取消勾選即可。下方灰字是第二章界定此構念的句子，會帶進 Prompt。</p>${ns.map(n => { const d = ch2Def(n), on = !skip.includes(n);
    return `<div class="od-row${on ? "" : " off"}"><label><input type="checkbox" data-odskip="${esc(n)}" ${on ? "checked" : ""}><b>${esc(n)}</b>${on ? "" : `<small>不寫進 3.2</small>`}</label><div class="od-def">${d ? esc(d) : "第二章論文內容中沒有找到界定此構念的句子；將依上傳文獻撰寫"}</div></div>`; }).join("")}</div>`;
}
// 3.1：假說清單接在架構說明之後；再按一次只更新清單
function hlPut() {
  const t = hlText(); if (!t) return "沒有找到假說，請先完成第二章各變數一節的假說推導。";
  const strip = x => String(x || "").replace(/\n*依據第二章[^\n]*假說[：:][\s\S]*$/, "").replace(/(\n*H\d+[a-z]?\s*[：:][^\n]*)+\s*$/, "").trim();
  const fin = store.values.fin || {}; let base = strip(finText("s3-1"));
  if (!base && typeof fin["s3-1"] === "string") { const keep = fin["s3-1"]; delete fin["s3-1"]; base = strip(finText("s3-1")); fin["s3-1"] = keep; }   // 只有清單時，改用架構說明的回覆
  setFin("s3-1", base ? base + "\n\n" + (/如下[。：:]?$/.test(base) ? hlItems().join("\n") : t) : t);
  return base ? "已接在架構說明之後；原有的假說清單已更新。" : "已放入本節論文內容。架構說明還沒有內容：完成第一步並貼上回覆後，再按一次，清單會接在架構說明之後。";
}
// 3.1 與 3.2 合併：舊的 3.2 假說清單併入 3.1（舊存檔讀入時也會套用）
function migrateCh3() {
  const f = store.values.fin || {}, old = f["s3-2"];
  if (typeof old === "string" && old.trim()) { const cur = String(finText("s3-1") || "").trim(); if (!/(^|\n)H\d+[a-z]?\s*[：:]/.test(cur)) setFin("s3-1", cur ? cur + "\n\n" + old.trim() : old.trim()); }
  delete f["s3-2"];
  if (store.sec === "s3-2") store.sec = "s3-1";
}
// 3.1 研究假說清單：從第二章各變數一節的論文內容取出假說敘述（舊版「研究假說之推導」的回覆也一併讀取）
function hlItems() {
  const ch = OUTLINE.find(c => /^第二章/.test(c.ch)), src = (ch ? ch.secs : []).filter(s => !s.setup).map(s => finText(s.id));
  let old = deLatex(String((store.replies || {})["s2-hy|hypo"] || "")); const cut = old.search(VERIFY_HEAD); if (cut >= 0) old = old.slice(0, cut);
  const m = new Map();
  [...src, old].join("\n").replace(/\*\*/g, "").split(/\r?\n/).forEach(l => { const x = l.match(/(?:^|[\s，。；：「（])(H\d+[a-z]?)\s*[：:]\s*(.+)$/) || l.trim().replace(/^[-*•]\s*/, "").match(/^(H\d+[a-z]?)\s*[：:]\s*(.+)$/);
    if (x && !m.has(x[1])) m.set(x[1], `${x[1]}：${x[2].trim()}`); });
  const num = k => { const r = k.match(/^H(\d+)([a-z]?)/); return +r[1] * 100 + (r[2] ? r[2].charCodeAt(0) - 96 : 0); };
  return [...m.keys()].sort((a, b) => num(a) - num(b)).map(k => m.get(k));
}
function hlText() { const it = hlItems(); return it.length ? "依據第二章的推導，本研究提出以下假說：\n\n" + it.join("\n") : ""; }
function hlView() { const it = hlItems(); return it.length ? `<ol class="hlist">${it.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : `<p class="hint">第二章各變數一節還沒有出現「H1：……」形式的假說敘述。</p>`; }
const stepsOf = sec => [...((RT() === "model" && sec.msteps) || sec.steps), ...(sec.finish || []).map(m => ({ mod: m, note: FINISH_NOTE[m], finish: true }))];
// 研究類型為 panel data 時，第零章部分節改用模型導向的標題與說明
const secTitle = s => (RT() === "model" && s.mtitle) || s.title;
const secDesc = s => (RT() === "model" && s.mdesc) || s.desc;

// 說明文字中的{#id}：本節有此模組時寫成「步驟 n」，否則指出它在目錄中的位置
function fillRefs(text, sec) {
  return text.replace(/\{#(\w+)\}/g, (_, id) => {
    const label = `「${DEFS[id].label}」`;
    const i = stepsOf(sec).findIndex(s => s.mod === id);
    if (i >= 0) return `步驟 ${i + 1}${label}`;
    const home = ALL_SECS.find(s => stepsOf(s).some(st => st.mod === id)) || ALL_SECS.find(s => [...s.steps, ...(s.msteps || [])].some(st => st.mod === id));
    return home ? `${label}（${home.no ? "目錄 " + home.no + " " + secTitle(home) : "常用：" + home.title}）` : label;
  });
}
