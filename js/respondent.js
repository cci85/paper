// ── 0.4 受訪者版問卷：由定稿問卷產生紙本問卷（不顯示量表出處、反向題等研究者資訊），網頁預覽與 Word 下載 ──
// 順序：問卷標題、填答說明、知情同意確認 → 資格題 → 第一部分 熱身題 → 其他部分（量表題組以構念命名）→ 基本資料；題號全卷連續（從知情同意起算）
const RV_ZH = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const rvZh = n => n <= 10 ? RV_ZH[n] : n < 20 ? "十" + RV_ZH[n - 10] : RV_ZH[Math.floor(n / 10)] + "十" + RV_ZH[n % 10];
const rvSrc = () => String(store.values.sv_final || "").trim() || svText();   // 定稿問卷；未填時用問卷預覽
const rvTitle = () => (store.values.rv_title || "").trim() || `${spCtx() === "研究情境" ? "" : spCtx()}購物經驗調查問卷`;
function rvSplitOpts(s) {   // 題目最後一組（可巢狀的）全形括號且含「／」者為選項
  s = s.trim(); if (!/[）)]$/.test(s)) return { q: s, opts: [] };
  let d = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s[i]; if (c === "）" || c === ")") d++; else if (c === "（" || c === "(") { d--; if (d === 0) {
      const inner = s.slice(i + 1, -1); if (!/[／/]/.test(inner)) return { q: s, opts: [] };
      const opts = []; let cur = "", k = 0;
      for (const ch of inner) { if (ch === "（" || ch === "(") k++; if (ch === "）" || ch === ")") k--; if ((ch === "／" || ch === "/") && k === 0) { opts.push(cur.trim()); cur = ""; } else cur += ch; }
      opts.push(cur.trim());
      return { q: s.slice(0, i).trim(), opts: opts.filter(Boolean) };
    } }
  }
  return { q: s, opts: [] };
}
function rvParse(text) {   // 純文字定稿問卷 → [{ kind, head, text[], qs[], scale }]
  const blocks = []; let cur = null;
  const push = b => { blocks.push(b); cur = b; };
  String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach(raw => {
    const l = raw.trim(); if (!l) return;
    const h = l.match(/^【([^】]+)】\s*(.*)$/);
    if (h) { const head = h[1].trim(), rest = h[2].trim();
      const kind = /填答說明/.test(head) ? "intro" : /知情同意/.test(head) ? "consent" : /篩選|資格/.test(head) ? "screen" : /基本資料/.test(head) ? "demo" : /量表題項/.test(head) ? "scale" : "other";
      push({ kind, head, text: [], qs: [], scale: kind === "scale" ? rest.replace(/^量尺[：:]\s*/, "") : "" }); if (kind !== "scale" && rest) cur.text.push(rest); return; }
    const c = l.match(/^〈([^〉]+)〉/);
    if (c) { push({ kind: "con", head: c[1].replace(/\s*[（(][^（）()]*[A-Za-z][^（）()]*[）)]\s*$/, "").trim(), text: [], qs: [] }); return; }
    if (!cur) return;
    const q = l.match(/^([A-Za-z]{0,3}\d+)\s*[.．、]\s*(.+)$/);
    if (q && cur.kind !== "intro") { const o = rvSplitOpts(q[2]); cur.qs.push({ id: q[1].toUpperCase(), q: o.q, opts: o.opts }); return; }
    if (cur.kind === "scale" && /量尺/.test(l)) { cur.scale = l.replace(/^.*量尺[：:]\s*/, ""); return; }
    cur.text.push(l.replace(/……$/, ""));
  });
  return blocks;
}
function rvModel() {   // { title, intro, parts:[{ title, notes[], qs:[{ n, q, opts, multi, likert }] }] }
  const B = rvParse(rvSrc()); if (!B.length) return null;
  if (!B.some(b => b.kind === "consent"))   // 定稿問卷是較早貼上的、沒有知情同意時，補上固定的 3 題
    B.splice(Math.max(0, B.findIndex(b => b.kind !== "intro")), 0, { kind: "consent", head: "知情同意", text: [], qs: SV_CONSENT.map(x => ({ id: x.id, q: x.q, opts: x.opts.slice() })) });
  const sc = (B.find(b => b.kind === "scale") || {}).scale || "", nums = [...sc.matchAll(/(\d+)\s*[＝=]/g)].map(x => +x[1]);
  const pts = nums.length ? Math.max(...nums) : /七點/.test(sc) ? 7 : 5;
  const end = k => ((sc.match(new RegExp(k + "\\s*[＝=]\\s*([^／/、,，；;（(]+)")) || [])[1] || "").trim();
  const likNote = `本部分採李克特${rvZh(pts)}點尺度，1 代表${end(1) || "非常不同意"}，${pts} 代表${end(pts) || "非常同意"}。`;
  let intro = B.filter(b => b.kind === "intro").flatMap(b => b.text).join("\n");
  if (!/僅供學術研究使用/.test(intro)) intro = intro ? intro + "\n" + SV_PRIVACY : SV_PRIVACY;
  const parts = [], idMap = {}; let n = 0, pending = [], warm = false;
  const clean = s => s.replace(/[（(]\s*反向(?:題|計分)?\s*[）)]/g, "").replace(/\s+$/, "");
  const addQs = (b, likert) => b.qs.map(x => { n++; idMap[x.id] = n; idMap["Q" + x.id.replace(/^Q/, "")] = idMap["Q" + x.id.replace(/^Q/, "")] || (likert ? n : undefined);
    return { n, id: x.id, q: clean(x.q), opts: x.opts, multi: /複選|多選/.test(x.q), likert }; });
  B.forEach(b => {
    if (b.kind === "intro" || b.kind === "scale") return;
    if (b.kind === "other" && !b.qs.length) { pending.push(...b.text); return; }   // 只有引導文字的部分：併入下一部分的開頭
    let title, part;
    if (b.kind === "consent") title = "知情同意確認";
    else if (b.kind === "screen") title = "資格題";
    else if (b.kind === "con") {
      title = b.head;
      part = { title, numbered: true, notes: [likNote, ...pending, ...b.text], qs: addQs(b, true) };
    }
    else if (b.kind === "demo") title = "基本資料";
    else if (!warm) { title = "熱身題"; warm = true; }
    else title = "";
    if (!part) part = { title, numbered: !/^(知情同意確認|資格題)$/.test(title), notes: [...pending, ...b.text], qs: addQs(b, false) };
    pending = []; parts.push(part);
  });
  let k = 0; parts.forEach(p => { if (p.numbered) p.label = `第${rvZh(++k)}部分` + (p.title ? `　${p.title}` : ""); else p.label = p.title; });
  // 題目與說明中引用內部題號（例如「即 W6 所選類別」）→ 受訪者看到的題號
  const ref = s => s.replace(/(^|[^A-Za-z0-9])\s?([A-Z]{1,2}\d+)(?![0-9A-Za-z])\s?/g, (all, pre, id) => idMap[id] ? `${pre}第 ${idMap[id]} 題` : all);
  parts.forEach(p => { p.notes = p.notes.map(ref); p.qs.forEach(x => { x.q = ref(x.q); x.opts = x.opts.map(ref);
    if (x.opts.length && !/單選|複選|多選/.test(x.q)) x.q += "（單選）"; }); });
  return { title: rvTitle(), intro, parts, scale: { pts, lo: end(1) || "非常不同意", hi: end(pts) || "非常同意" } };
}
const rvInline = opts => opts.length <= 5 && opts.join("").length <= 36;
function rvView() {
  const M = rvModel(); if (!M) return `<p class="hint">（「定稿問卷」或問卷預覽有內容後，這裡會顯示受訪者版問卷）</p>`;
  const q = x => `<div class="rv-q"><p>${x.n}. ${esc(x.q)}</p>${x.opts.length ? `<p class="rv-opts${rvInline(x.opts) ? "" : " col"}">${x.opts.map(o => `<span>□ ${esc(o)}</span>`).join("")}</p>` : ""}</div>`;
  return `<div class="rview"><h3 class="rv-title">${esc(M.title)}</h3>${M.intro ? `<p class="rv-intro">${esc(M.intro).replace(/\n/g, "<br>")}</p>` : ""}` +
    M.parts.map(p => `<h4>${esc(p.label)}</h4>${p.notes.map(t => `<p class="rv-note">${esc(t)}</p>`).join("")}${p.qs.map(q).join("")}`).join("") +
    `<p class="rv-end">問卷到此結束，感謝您的填答。</p></div>`;
}
async function rvWord() {
  const M = rvModel(); if (!M) return "沒有可產生的問卷：請先完成「定稿問卷」。";
  try {
    await loadJSZip();
    const zip = new JSZip(), body = [];
    body.push(wText(M.title, { style: "Heading1" }));
    if (M.intro) M.intro.split("\n").forEach(t => body.push(wText(t, { style: "Body" })));
    M.parts.forEach(p => {
      body.push(wText(p.label, { style: "Heading2" }));
      p.notes.forEach(t => body.push(wText(t, { style: "NoIndent" })));
      p.qs.forEach(x => {
        body.push(wText(`${x.n}. ${x.q}`, { style: "RvQ", keep: x.opts.length > 0 }));
        if (!x.opts.length) return;   // 選項短：排成一行；選項多或長：一個選項一行（□ 與文字不斷行）
        if (rvInline(x.opts)) body.push(wText(x.opts.map(o => "□\u00a0" + o.replace(/ /g, "\u00a0")).join("　　"), { style: "RvOpt" }));
        else x.opts.forEach((o, i) => body.push(wText("□\u00a0" + o, { style: "RvOpt", keep: i < x.opts.length - 1 })));
      });
    });
    body.push(wText("問卷到此結束，感謝您的填答。", { style: "Center", before: 360 }));
    const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="851" w:footer="851" w:gutter="0"/></w:sectPr>`;
    const styles = WD_STYLES.replace("</w:styles>", wdStyle("RvQ", "問卷題目", `<w:spacing w:before="120"/><w:ind w:left="360" w:hanging="360"/>`, "") +
      wdStyle("RvOpt", "問卷選項", `<w:ind w:left="720" w:hanging="360"/><w:spacing w:line="320" w:lineRule="auto"/>`, "") + "</w:styles>").replace(/w:eastAsia="標楷體"/, 'w:eastAsia="新細明體"');
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file("word/styles.xml", styles);
    zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}${sect}</w:body></w:document>`);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${M.title.slice(0, 40)}.docx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return "已下載受訪者版問卷 Word 檔。";
  } catch (e) { return "產生 Word 檔失敗：" + e.message; }
}

// ── 常用「問卷資料處理」：一份研究可有多份問卷；目前選定的問卷欄位就在 store.values（0.4、3.2 讀的是同一份），其他問卷存在 __svq.list ──
const SVQ_F = ["sv_url", "sv_final", "rv_title", "gf_req"];
const svqSt = () => { const v = store.values, q = v.__svq && typeof v.__svq === "object" ? v.__svq : (v.__svq = { cur: "問卷一", list: {} }); q.list ||= {}; q.cur ||= "問卷一"; return q; };
const svqNames = () => { const q = svqSt(); return [...new Set([...Object.keys(q.list), q.cur])]; };
const svqPack = () => Object.fromEntries(SVQ_F.map(f => [f, store.values[f] ?? (f === "gf_req" ? ["on"] : "")]));
function svqUse(name) {   // 存下目前問卷，換成另一份（不存在時為空白的新問卷）
  const q = svqSt(); q.list[q.cur] = svqPack();
  const d = q.list[name] || {}; SVQ_F.forEach(f => { store.values[f] = d[f] ?? (f === "gf_req" ? ["on"] : ""); });
  q.cur = name; q.list[name] = svqPack();
}
function svqAll() {   // 研究存檔用：每份問卷的欄位（目前問卷取現值）
  const q = svqSt(); return svqNames().map(n => ({ name: n, v: n === q.cur ? svqPack() : q.list[n] || {} }));
}
function svqBar() {
  const q = svqSt(), names = svqNames();
  return `<div class="dprow"><label>問卷（${names.length} 份） <select data-svq="sel">${names.map(n => `<option value="${esc(n)}"${n === q.cur ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    <button type="button" data-svq="new">新增問卷</button> <button type="button" data-svq="ren">改名</button> <button type="button" data-svq="del">刪除這份問卷</button></div>`;
}
const svqRedraw = () => { save(); renderPane(); update(); };
document.getElementById("pane").addEventListener("change", e => {
  const t = e.target; if (!t || !t.dataset || t.dataset.svq !== "sel") return;
  svqUse(t.value); svqRedraw();
});
document.getElementById("pane").addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button[data-svq]"); if (!b) return;
  const q = svqSt(), names = svqNames(), act = b.dataset.svq;
  const ask = (msg, def) => { const n = (prompt(msg, def) || "").trim(); if (!n) return ""; if (names.includes(n)) { alert(`已有名為「${n}」的問卷。`); return ""; } return n; };
  if (act === "new") { let k = names.length + 1; while (names.includes("問卷" + rvZh(k))) k++;
    const n = ask("新問卷的名稱（例如：前測問卷、研究二）", "問卷" + rvZh(k)); if (!n) return; svqUse(n); }
  else if (act === "ren") { const n = ask("問卷的新名稱", q.cur); if (!n) return; delete q.list[q.cur]; q.cur = n; q.list[n] = svqPack(); }
  else if (act === "del") {
    if (!confirm(`刪除問卷「${q.cur}」？這份問卷的連結、定稿問卷與標題都會刪除。`)) return;
    const old = q.cur, rest = names.filter(n => n !== old); delete q.list[old];
    if (rest.length) { q.cur = rest[0]; const d = q.list[q.cur] || {}; SVQ_F.forEach(f => { store.values[f] = d[f] ?? (f === "gf_req" ? ["on"] : ""); }); }
    else { SVQ_F.forEach(f => { store.values[f] = f === "gf_req" ? ["on"] : ""; }); q.cur = "問卷一"; }
  }
  svqRedraw();
});

// 由定稿問卷產生建立 Google 表單的 Apps Script（FormApp）：各部分分頁；量表題為線性刻度；知情同意與資格題中否定的選項設為提交表單
function gfScript(p) {
  const M = rvModel(); if (!M) return "";
  const stop = /^(不|否|非|未滿|沒有|無)|不同意|不符合|不是/;
  const D = { title: M.title, intro: M.intro, req: isOn(p.gf_req), pts: M.scale.pts, lo: M.scale.lo, hi: M.scale.hi,
    parts: M.parts.map(x => { const gate = /^(知情同意確認|資格題)$/.test(x.title);
      return { label: x.label, notes: x.notes, gate, qs: x.qs.map(q => ({ t: `${q.n}. ${q.q}`, opts: q.opts, multi: q.multi, likert: q.likert,
        stop: gate && !q.multi ? q.opts.map((o, i) => stop.test(o.trim()) ? i : -1).filter(i => i >= 0) : [] })) }; }) };
  return `// 由「你論了嗎」依定稿問卷產生：${M.title}
// 使用方式：script.google.com → 新專案 → 刪除預設內容後貼上 → 儲存 → 選擇 createForm 執行（第一次需授權）
// 完成後，「執行記錄」會顯示表單的編輯網址與填答網址；表單建在你的 Google 雲端硬碟
function createForm() {
  var D = ${JSON.stringify(D, null, 1)};
  var form = FormApp.create(D.title);
  form.setDescription(D.intro).setProgressBar(true).setConfirmationMessage("問卷到此結束，感謝您的填答。");
  D.parts.forEach(function (p, i) {
    var help = p.notes.join("\\n");
    if (i === 0) form.addSectionHeaderItem().setTitle(p.label).setHelpText(help);
    else form.addPageBreakItem().setTitle(p.label).setHelpText(help);
    p.qs.forEach(function (x, j) {
      if (p.gate && j > 0) form.addPageBreakItem().setTitle(p.label);   // 依答案結束填答的題目，一頁只放一題
      var it;
      if (x.likert) it = form.addScaleItem().setTitle(x.t).setBounds(1, D.pts).setLabels(D.lo, D.hi);
      else if (x.opts.length && x.multi) it = form.addCheckboxItem().setTitle(x.t).setChoiceValues(x.opts);
      else if (x.opts.length) {
        it = form.addMultipleChoiceItem().setTitle(x.t);
        if (x.stop.length) it.setChoices(x.opts.map(function (o, k) {
          return it.createChoice(o, x.stop.indexOf(k) >= 0 ? FormApp.PageNavigationType.SUBMIT : FormApp.PageNavigationType.CONTINUE); }));
        else it.setChoiceValues(x.opts);
      }
      else it = form.addTextItem().setTitle(x.t);
      it.setRequired(D.req);
    });
  });
  Logger.log("編輯網址：" + form.getEditUrl());
  Logger.log("填答網址：" + form.getPublishedUrl());
}`;
}
