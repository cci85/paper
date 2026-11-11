// ── 下載 Word 檔：依暨南大學〈中文論文格式暨範本〉（2023 年修訂）排版 ──
// 封面、審定書（無頁碼）→ 摘要、Abstract、目次、表目次、圖目次（小寫羅馬數字）→ 正文、參考文獻、附錄（阿拉伯數字）
// 目次、表目次、圖目次與摘要頁的頁數使用 Word 功能變數，開啟時由 Word 更新
function loadJSZip() {
  if (window.JSZip) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "js/vendor/jszip.min.js"; s.onload = res; s.onerror = () => rej(new Error("無法載入壓縮元件")); document.head.appendChild(s); });
}
const WX = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const WD_ZHNUM = n => { const d = "零一二三四五六七八九"; if (n <= 10) return n === 10 ? "十" : d[n]; if (n < 20) return "十" + d[n - 10]; return d[Math.floor(n / 10)] + "十" + (n % 10 ? d[n % 10] : ""); };
// 文字段落：** 粗體標記去掉；換行用 <w:br/>
function wRun(text, o = {}) {
  const rp = [o.b ? "<w:b/>" : "", o.i ? "<w:i/>" : "", o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ""].join("");
  return String(text).split("\n").map((t, k) => `<w:r>${rp ? `<w:rPr>${rp}</w:rPr>` : ""}${k ? "<w:br/>" : ""}<w:t xml:space="preserve">${WX(t)}</w:t></w:r>`).join("");
}
function wPara(content, o = {}) {
  const pp = [o.style ? `<w:pStyle w:val="${o.style}"/>` : "", o.keep ? "<w:keepNext/>" : "", o.pb ? "<w:pageBreakBefore/>" : "",
    o.after != null || o.before != null ? `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ""}${o.after != null ? ` w:after="${o.after}"` : ""}/>` : "",
    o.noInd ? `<w:ind w:firstLine="0" w:firstLineChars="0"/>` : "", o.jc ? `<w:jc w:val="${o.jc}"/>` : "", o.sect || ""].join("");
  return `<w:p>${pp ? `<w:pPr>${pp}</w:pPr>` : ""}${o.bm ? `<w:bookmarkStart w:id="0" w:name="${o.bm}"/>` : ""}${typeof content === "string" ? content : ""}${o.bm ? `<w:bookmarkEnd w:id="0"/>` : ""}</w:p>`;
}
const wText = (t, o = {}) => wPara(wRun(String(t).replace(/\*\*/g, ""), o.run || {}), o);
const wField = (instr, shown) => `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ${WX(instr)} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${wRun(shown)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
const wPageBreak = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
// APA 三線表
function wTable(rows) {
  const nc = Math.max(...rows.map(r => r.length)); rows = rows.map(r => [...r, ...Array(nc - r.length).fill("")]);
  const n = rows.length, TOP = `<w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/>`, MID = `<w:bottom w:val="single" w:sz="6" w:space="0" w:color="000000"/>`, BOT = `<w:bottom w:val="single" w:sz="12" w:space="0" w:color="000000"/>`;
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="autofit"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${rows[0].map(() => `<w:gridCol w:w="${Math.floor(8504 / rows[0].length)}"/>`).join("")}</w:tblGrid>` +
    rows.map((r, i) => `<w:tr>${i === 0 ? "<w:trPr><w:tblHeader/></w:trPr>" : ""}${r.map(c => `<w:tc><w:tcPr><w:tcBorders>${i === 0 ? TOP + MID : i === n - 1 ? BOT : ""}</w:tcBorders></w:tcPr>${wPara(wRun(c, i === 0 ? { b: true } : {}), { style: "TableText" })}</w:tc>`).join("")}</w:tr>`).join("") + `</w:tbl>`;
}
// 無框線排版表格（封面、摘要頁首）
function wLayout(rows, widths, o = {}) {
  return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
    rows.map(r => `<w:tr>${r.h ? `<w:trPr><w:trHeight w:val="${r.h}" w:hRule="exact"/></w:trPr>` : ""}${r.cells.map((c, k) => `<w:tc><w:tcPr><w:tcW w:w="${widths[k]}" w:type="dxa"/>${r.v ? `<w:vAlign w:val="${r.v}"/>` : ""}</w:tcPr>${c || wPara("")}</w:tc>`).join("")}</w:tr>`).join("") + `</w:tbl>`;
}
function wImage(rid, cx, cy) {
  return `<w:p><w:pPr><w:pStyle w:val="Figure"/><w:keepNext/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="研究架構圖"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="framework.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
// 摘要回覆：## 摘要／## 關鍵詞／## Abstract／## Keywords
function abParse(t) {
  const s = deLatex(String(t || "")).replace(/\r\n?/g, "\n"), get = re => { const m = s.match(new RegExp(`^#{1,4}\\s*\\**(?:${re})\\**\\s*[：:]?\\s*$([\\s\\S]*?)(?=^#{1,4}\\s|(?![\\s\\S]))`, "mi")); return m ? m[1].replace(/\*\*/g, "").trim() : ""; };
  return { zh: get("中文摘要|摘要"), kw: get("關鍵詞|關鍵字").replace(/^關鍵[詞字][：:]\s*/, ""), en: get("Abstract"), kwEn: get("Keywords?|Key words").replace(/^Key\s*words?:\s*/i, "") };
}
const wdV = k => (store.values[k] ?? (DEFS.fulltext.fields.find(f => f.id === k) || {}).value ?? "").toString().trim();
function wdYm() { const m = wdV("wd_ym").match(/(\d+)\D+(\d+)/); return m ? { zh: `中華民國 ${m[1]} 年 ${m[2]} 月`, en: `${String(m[2]).padStart(2, "0")}/${+m[1] + 1911}` } : { zh: "中華民國【待補】年【待補】月", en: "【待補】" }; }

async function wordDownload() {
  try {
    await loadJSZip();
    const zip = new JSZip(), v = store.values, need = x => x || "【待補】";
    const title = need((v.tt_zh || "").trim()), titleEn = need((v.tt_en || "").trim()), ym = wdYm();
    const dept = wdV("wd_dept"), college = wdV("wd_college"), deptEn = wdV("wd_dept_en"), collegeEn = wdV("wd_college_en");
    const advs = wdV("wd_adv").split(/[、，,;；]/).map(x => x.trim()).filter(Boolean), advsEn = wdV("wd_adv_en").split(/[;；]/).map(x => x.trim()).filter(Boolean);
    const stu = need(wdV("wd_student")), stuEn = need(wdV("wd_student_en"));
    const W = 11906 - 1701 * 2;   // A4 寬減去左右 3 公分邊界（twips）
    const body = [];
    // ── 封面（置頂：學系與碩士論文；置中：中英文題目；置底：指導教授、研究生、日期），審定書頁 ──
    const cov = t => wText(t, { style: "Cover" });
    const advLines = (advs.length ? advs : ["【待補】"]).map((a, k) => (k ? "　　　　　" : "指導教授：") + a + "博士");
    body.push(wLayout([
      { h: 2600, v: "top", cells: [cov(`國立暨南國際大學${dept}`) + cov("碩士論文")] },
      { h: 6600, v: "center", cells: [cov(title) + cov(titleEn)] },
      { h: 3800, v: "bottom", cells: [[...advLines, `研究生：${stu}`, ym.zh].map(cov).join("")] }
    ], [W]));
    body.push(wPara("", { pb: false }), wPageBreak());
    body.push(wText("（請將掃描的學位考試委員會審定書置於此頁；系上要求的學術倫理聲明書或論文比對結果報告置於審定書後一頁）", { style: "Center", sect: sectXml("none") }));
    // ── 摘要與 Abstract ──
    const ab = abParse((store.replies || {})["q-abs|abstract"]);
    const head = (rows, w) => wLayout(rows.map(r => ({ cells: r.map(c => wPara(c, { style: "HeadInfo" })) })), w);
    body.push(head([
      [wRun(`論文名稱：${title}`), ""],
      [wRun(`校院系：國立暨南國際大學${college}${dept}`), wRun("頁數：") + wField("PAGEREF LastPage \\h", "（更新後顯示）")],
      [wRun(`畢業時間：${ym.zh}`), wRun("學位別：碩士")],
      [wRun(`研究生：${stu}`), wRun(`指導教授：${advLines.map(l => l.replace(/^指導教授：|^　+/, "")).join("\n　　　　　")}`)]
    ], [Math.round(W * 0.64), W - Math.round(W * 0.64)]));
    body.push(wPara(""), wText("摘要", { style: "Heading1" }));
    (ab.zh || "【待補：中文摘要，請到「論文整理 → 摘要」產生】").split(/\n\s*\n|\n/).filter(x => x.trim()).forEach(x => body.push(wText(x.trim(), { style: "Body" })));
    body.push(wPara(""), wText(`關鍵詞：${ab.kw || "【待補】"}`, { style: "NoIndent" }));
    body.push(wPageBreak());
    body.push(head([
      [wRun(`Title of Thesis: ${titleEn}`), ""],
      [wRun(`Name of Institute: ${deptEn}, ${collegeEn}, National Chi Nan University`), wRun("Pages: ") + wField("PAGEREF LastPage \\h", "(update)")],
      [wRun(`Graduation Time: ${ym.en}`), wRun("Degree: Master")],
      [wRun(`Student Name: ${stuEn}`), wRun(`Advisor Name: ${(advsEn.length ? advsEn : ["【待補】"]).map(a => "Dr. " + a).join("\n")}`)]
    ], [Math.round(W * 0.64), W - Math.round(W * 0.64)]));
    body.push(wPara(""), wText("Abstract", { style: "Heading1" }));
    (ab.en || "【待補：英文摘要】").split(/\n\s*\n|\n/).filter(x => x.trim()).forEach(x => body.push(wText(x.trim(), { style: "BodyEn" })));
    body.push(wPara(""), wText(`Keywords: ${ab.kwEn || "【待補】"}`, { style: "NoIndent" }));
    // ── 目次、表目次、圖目次 ──
    const secs = THESIS_SECS(), allT = secs.flatMap(s => finTblList(s.id)), hasFig = secs.some(s => /〔插入圖/.test(finText(s.id)));
    body.push(wText("目次", { style: "Heading1", pb: true }), wPara(wField('TOC \\o "1-2" \\h \\z \\u', "（請在 Word 中按 F9 更新目次）")));
    if (allT.length) body.push(wText("表目次", { style: "Heading1", pb: true }), wPara(wField('TOC \\h \\z \\t "TblCaption,1"', "（請在 Word 中按 F9 更新表目次）")));
    if (hasFig) body.push(wText("圖目次", { style: "Heading1", pb: true }), wPara(wField('TOC \\h \\z \\t "FigCaption,1"', "（請在 Word 中按 F9 更新圖目次）")));
    body.push(wPara("", { sect: sectXml("lowerRoman") }));
    // ── 正文 ──
    const rels = []; let figDone = false;
    const chs = OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch));
    for (const [ci, c] of chs.entries()) {
      body.push(wText(c.ch.replace(/^(第.+?章)\s*/, "$1　"), { style: "Heading1", pb: ci > 0 }));
      for (const [si, s] of secsOf(c).entries()) {
        body.push(wText(`第${WD_ZHNUM(si + 1)}節　${s.title}`, { style: "Heading2" }));
        const t = normCite(tbApply(s.id, "fin", finText(s.id))), tl = finTblList(s.id); let k = 0;
        if (!t.trim()) { body.push(wText("【待補：本節尚未撰寫】", { style: "Body" })); continue; }
        for (const b of finBlocks(t)) {
          const mt = b.match(/^〔插入表\s*([^\s　〕]*)[\s　]*([^〕]*)〕$/), mf = b.match(/^〔插入圖\s*([^\s　〕]*)[\s　]*([^〕]*)〕$/);
          if (mt) { const x = tl[k++]; body.push(wText(`表 ${mt[1]}　${mt[2]}`, { style: "TblCaption" }));
            if (x) { body.push(wTable(x.t.rows)); if (x.t.note) body.push(wText(x.t.note, { style: "Source" })); } else body.push(wText("（請在此插入表格）", { style: "Center" }));
            body.push(wPara("", { style: "NoIndent" })); continue; }
          if (mf) {
            if (s.id === "s3-1" && !figDone) { const png = await wdFramework(); if (png) { zip.file("word/media/framework.png", png.blob); rels.push(`<Relationship Id="rIdImg1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/framework.png"/>`); const cx = 5400000, cy = Math.round(cx * png.h / png.w); body.push(wImage("rIdImg1", cx, cy)); figDone = true; } else body.push(wText("（請在此插入圖）", { style: "Figure" })); }
            else body.push(wText("（請在此插入圖）", { style: "Figure" }));
            body.push(wText(`圖 ${mf[1]}　${mf[2]}`, { style: "FigCaption" })); continue; }
          if ((/^#{1,6}\s/.test(b) || FIN_SUBHEAD.test(b)) && !b.includes("\n")) { body.push(wText(b.replace(/^#+\s*/, ""), { style: "Heading3" })); continue; }
          b.split("\n").map(l => l.replace(/^\s*[-*•]\s+/, "").trim()).filter(Boolean).forEach(l => body.push(wText(l, { style: /^H\d+[a-z]?\s*[：:]/.test(l) ? "Hyp" : "Body" })));
        }
      }
    }
    // ── 參考文獻 ──
    const refs = refList();
    if (refs.length) {
      body.push(wText("參考文獻", { style: "Heading1", pb: true }));
      const zh = refs.filter(r => CJK.test(r.slice(0, 4))), en = refs.filter(r => !CJK.test(r.slice(0, 4)));
      const put = l => l.forEach(r => body.push(wText(r.replace(/\*/g, ""), { style: "Ref" })));
      if (zh.length && en.length) { body.push(wText("一、中文部分", { style: "Heading2" })); put(zh); body.push(wText("二、英文部分", { style: "Heading2" })); put(en); } else put(refs);
    }
    // ── 附錄：研究問卷 ──
    const sv = String(v.sv_final || "").trim();
    if (sv) {
      body.push(wText("附錄", { style: "Heading1", pb: true }), wText("附錄一　研究問卷", { style: "Heading2" }));
      sv.split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(l => body.push(wText(l.replace(/^Q(\d+)\s*[.．、]?\s*/i, "$1. "), { style: "NoIndent" })));
    }
    body.push(wPara("", { bm: "LastPage" }));
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join("")}${sectXml("decimal", true)}</w:body></w:document>`;
    zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`);
    zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
    zip.file("word/_rels/document.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${rels.join("")}</Relationships>`);
    zip.file("word/settings.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:defaultTabStop w:val="480"/><w:characterSpacingControl w:val="compressPunctuation"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`);
    zip.file("word/footer1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${wField("PAGE", "1")}</w:p></w:ftr>`);
    zip.file("word/styles.xml", WD_STYLES);
    zip.file("word/document.xml", doc);
    const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${(v.tt_zh || store.name || "論文").trim().slice(0, 40)}.docx`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { alert("產生 Word 檔失敗：" + e.message); }
}
// 節設定：A4、上下左右 3 公分；none＝不編頁碼（封面、審定書）
function sectXml(fmt, last) {
  const ft = fmt === "none" ? "" : `<w:footerReference w:type="default" r:id="rIdFooter"/>`;
  const pg = fmt === "none" ? "" : `<w:pgNumType w:fmt="${fmt}" w:start="1"/>`;
  return `<w:sectPr${last ? "" : ""}>${ft}<w:type w:val="nextPage"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1701" w:bottom="1701" w:left="1701" w:header="851" w:footer="851" w:gutter="0"/>${pg}<w:docGrid w:type="lines" w:linePitch="360"/></w:sectPr>`;
}
// 研究架構圖 PNG（0.3／3.1 的架構圖）
async function wdFramework() {
  try { const f = DEFS.fa31.fields[0], d = dgSeed(f, {}), vs = f.source(); if (!d.edges.length) return null; dgAutoPos(vs, d.pos, false);
    const blob = await diagramBlob(vs, d); return { blob, w: DG.W, h: DG.H }; } catch { return null; }
}
const WD_FONT = `<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="標楷體" w:cs="Times New Roman"/>`;
const wdStyle = (id, name, ppr, rpr, extra = "") => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
const WD_TAB = `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="8504"/></w:tabs>`;
const WD_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${WD_FONT}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${wdStyle("Body", "論文內文", `<w:ind w:firstLineChars="200" w:firstLine="480"/><w:jc w:val="both"/>`, "")}
${wdStyle("BodyEn", "Abstract Text", `<w:ind w:firstLine="480"/><w:jc w:val="both"/>`, "")}
${wdStyle("NoIndent", "無縮排內文", `<w:jc w:val="left"/>`, "")}
${wdStyle("Hyp", "假說", `<w:ind w:left="480"/>`, "")}
${wdStyle("Center", "置中", `<w:jc w:val="center"/>`, "")}
${wdStyle("Cover", "封面", `<w:spacing w:line="480" w:lineRule="auto"/><w:jc w:val="center"/>`, `<w:sz w:val="36"/><w:szCs w:val="36"/>`)}
${wdStyle("HeadInfo", "摘要頁首", `<w:spacing w:line="300" w:lineRule="auto"/>`, "")}
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="360"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/></w:rPr></w:style>
${wdStyle("TOC1", "toc 1", WD_TAB, "", `<w:next w:val="Normal"/><w:uiPriority w:val="39"/>`)}
${wdStyle("TOC2", "toc 2", WD_TAB + `<w:ind w:left="480"/>`, "", `<w:next w:val="Normal"/><w:uiPriority w:val="39"/>`)}
${wdStyle("TblCaption", "TblCaption", `<w:keepNext/><w:spacing w:before="120" w:after="60"/><w:jc w:val="left"/>`, "")}
${wdStyle("FigCaption", "FigCaption", `<w:spacing w:before="60" w:after="240"/><w:jc w:val="center"/>`, "")}
${wdStyle("Figure", "圖", `<w:keepNext/><w:spacing w:before="120"/><w:jc w:val="center"/>`, "")}
${wdStyle("TableText", "表格內文", `<w:spacing w:line="240" w:lineRule="auto" w:before="40" w:after="40"/>`, `<w:sz w:val="22"/><w:szCs w:val="22"/>`)}
${wdStyle("Source", "資料來源與註", `<w:spacing w:before="40"/>`, `<w:sz w:val="20"/><w:szCs w:val="20"/>`)}
${wdStyle("Ref", "參考文獻", `<w:ind w:left="480" w:hanging="480"/><w:jc w:val="left"/>`, "")}
</w:styles>`;
