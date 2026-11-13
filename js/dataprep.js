// ── 資料處理：長格式原始資料（一列一筆交易）→ 一人一日一筆、加總資料、寬格式 ──
// 全部在瀏覽器處理，原始資料不會上傳，也不存進研究存檔；研究存檔只記住欄位設定（dp_cfg）與處理摘要（dp_sum）
// 讀寫 .xlsx 用網站已有的 JSZip（js/vendor/jszip.min.js），不另外載入試算表元件

const DP = { name: "", head: [], rows: [], kind: [], sheets: [], zip: null, sheet: 0, chk: null, busy: "", err: "", log: [], ext: [], extX: [], extIx: [], extStat: null };
const DP_LV = { day: "一人一日", month: "一人一月", year: "一人一年", person: "一人一筆（整個期間）" };
const DP_RES = [["near", "依前後幾天的交易判斷"], ["wt", "依某數值欄的金額決定"], ["mode", "取出現次數最多者"], ["first", "取第一筆"], ["last", "取最後一筆"]];
const DP_ROLE = { sum: "加總", mean: "平均", max: "最大", min: "最小", take: "取值（不一致時示警）", drop: "刪除（不輸出）" };
const DP_XLS_MAX = 1048575;
const DP_TW = new Set(["臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣", "基隆市", "新竹市", "嘉義市"]);   // 6 直轄市、13 縣、3 市
const dpIsTW = v => DP_TW.has(String(v).trim().replace(/台/g, "臺"));
const dpNorm = v => String(v).trim().replace(/台/g, "臺");
const DP_ISL = { island: ["澎湖縣", "金門縣", "連江縣"], km: ["金門縣", "連江縣"] };   // 離島縣、金馬
const dpUV = h => { const c = DP.head.indexOf(h); if (c < 0) return []; DP.uv ||= {}; if (DP.uv[h]) return DP.uv[h];
  const m = new Map(); for (const r of DP.rows) { const v = r[c]; if (v != null) m.set(String(v), (m.get(String(v)) || 0) + 1); }
  return (DP.uv[h] = [...m].sort((a, b) => b[1] - a[1])); };   // 欄位的各個值與次數
const dpExList = t => String(t || "").split(/[、,，;；\s]+/).map(x => x.trim()).filter(Boolean);
// 處理不一致時可採用的值：「不採用的值」（與勾選 22 縣市時的非縣市值）由當天其他的值取代；交易與金額照常計入
const dpValidFn = (cfg, h) => { const o = (cfg.valid || {})[h] || {}, ex = new Set(dpExList(o.ex)); if (!o.tw && !ex.size) return null; return v => v != null && !ex.has(String(v).trim()) && (!o.tw || dpIsTW(v)); };   // Excel 每個工作表最多 1,048,576 列（含標題列）

// ── 日期：一律換成 Excel 日期序號（1899-12-30 起算的日數），45943 = 2025/10/13 ──
const dpSerial = (y, m, d) => {
  if (!(y > 0 && m > 0 && d > 0)) return null;
  if (y < 1000) y += 1911;   // 民國年
  const t = Date.UTC(y, m - 1, d), dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(t / 864e5) + 25569;
};
const dpYMD = s => { const dt = new Date((s - 25569) * 864e5); return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()]; };
const dpFmt = s => { if (s == null) return ""; const [y, m, d] = dpYMD(s); return `${y}/${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}`; };
function dpDateVal(v) {
  if (v == null || v === "") return null;
  if (typeof v === "string") {
    const s = v.trim(); let m;
    if ((m = s.match(/^(\d{2,4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/))) return dpSerial(+m[1], +m[2], +m[3]);
    if (/^\d+(\.\d+)?$/.test(s)) return dpDateVal(+s);
    return null;
  }
  if (typeof v !== "number" || !isFinite(v)) return null;
  if (v >= 1 && v < 73052) return Math.floor(v);   // Excel 日期序號（到 2099 年）
  if (Number.isInteger(v) && v >= 19000101 && v <= 21001231) return dpSerial(Math.floor(v / 1e4), Math.floor(v / 100) % 100, v % 100);   // yyyymmdd
  if (Number.isInteger(v) && v >= 100101 && v <= 1991231) return dpSerial(Math.floor(v / 1e4), Math.floor(v / 100) % 100, v % 100);   // 民國 yyymmdd
  return null;
}
const dpNum = v => typeof v === "number" ? v : v == null || v === "" ? null : (s => /^-?[\d,]*\.?\d+$/.test(s) ? +s.replace(/,/g, "") : NaN)(String(v).trim());
const dpBlank = v => v == null || v === "" || (typeof v === "string" && !v.trim());
const dpKey = v => typeof v === "string" ? v.trim() : String(v);
const dpCmp = new Intl.Collator("zh-Hant", { numeric: true }).compare;

// ── 讀檔 ──
function dpDecode(u8) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, ""); }
  catch { return new TextDecoder("big5").decode(u8); }   // Excel 在中文 Windows 匯出的 CSV 多為 Big5
}
function dpParseCSV(text) {
  const first = text.slice(0, text.indexOf("\n") + 1 || 2000);
  const sep = [",", "\t", ";"].map(c => [c, first.split(c).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = "", q = false, i = 0; const n = text.length, S = sep.charCodeAt(0);
  while (i < n) {
    const c = text.charCodeAt(i);
    if (q) {
      if (c === 34) { if (text.charCodeAt(i + 1) === 34) { cell += '"'; i += 2; continue; } q = false; i++; continue; }
      const j = text.indexOf('"', i); if (j < 0) { cell += text.slice(i); break; } cell += text.slice(i, j); i = j; continue;
    }
    if (c === 34 && cell === "") { q = true; i++; continue; }
    if (c === S) { row.push(cell); cell = ""; i++; continue; }
    if (c === 10 || c === 13) { row.push(cell); cell = ""; if (row.length > 1 || row[0] !== "") rows.push(row); row = []; i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1; continue; }
    let j = i; while (j < n) { const d = text.charCodeAt(j); if (d === S || d === 10 || d === 13 || d === 34) break; j++; }
    if (j === i) { cell += text[i]; i++; } else { cell += text.slice(i, j); i = j; }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const dpXmlText = s => s.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-f]+|#\d+);/gi, (m, e) => ({ lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[e.toLowerCase()] ||
  String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : +e.slice(1))));
const dpSiText = si => [...si.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => dpXmlText(m[1])).join("");
const dpColIdx = ref => { let c = 0; for (let i = 0; i < ref.length; i++) { const k = ref.charCodeAt(i); if (k < 65) break; c = c * 26 + (k - 64); } return c - 1; };
function dpDateFmt(id, code) {
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58)) return true;
  if (!code) return false;
  const s = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[yde]/i.test(s) || (/m/i.test(s) && !/[hs]/i.test(s));
}
async function dpOpenXLSX(buf) {
  await loadJSZip();
  const zip = await JSZip.loadAsync(buf), rd = p => zip.file(p) ? zip.file(p).async("string") : Promise.resolve("");
  const wb = await rd("xl/workbook.xml"), rels = await rd("xl/_rels/workbook.xml.rels");
  const relT = Object.fromEntries([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(m => [(m[0].match(/\bId="([^"]+)"/) || [])[1], (m[0].match(/\bTarget="([^"]+)"/) || [])[1]]));
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => {
    const t = relT[(m[0].match(/\br:id="([^"]+)"/) || [])[1]] || "";
    return { name: dpXmlText((m[0].match(/\bname="([^"]*)"/) || [])[1] || ""), path: t.startsWith("/") ? t.slice(1) : "xl/" + t.replace(/^\.\//, "") };
  });
  const sst = [...(await rd("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => dpSiText(m[1]));
  const st = await rd("xl/styles.xml");
  const fmts = Object.fromEntries([...st.matchAll(/<numFmt\b[^>]*>/g)].map(m => [+(m[0].match(/numFmtId="(\d+)"/) || [])[1], dpXmlText((m[0].match(/formatCode="([^"]*)"/) || [])[1] || "")]));
  const xfs = ((st.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/) || [""])[0].match(/<xf\b[^>]*>/g) || []).map(x => { const id = +((x.match(/numFmtId="(\d+)"/) || [])[1] || 0); return dpDateFmt(id, fmts[id]); });
  return { zip, sheets, sst, xfs };
}
// 工作表 XML 逐段解壓與解析（大檔不必整份轉成一個字串）
async function dpReadSheet(X, k, onProg) {
  const f = X.zip.file(X.sheets[k].path); if (!f) throw new Error("找不到工作表內容");
  const u8 = await f.async("uint8array"), dec = new TextDecoder("utf-8"), rows = [], dateHit = [];
  let carry = "", rn = 0;
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  const parse = s => {
    rowRe.lastIndex = 0; let m;
    while ((m = rowRe.exec(s))) {
      const ra = (m[1].match(/\br="(\d+)"/) || [])[1]; rn = ra ? +ra - 1 : rn;
      const row = []; let cn = 0, c;
      if (m[2]) { cellRe.lastIndex = 0; while ((c = cellRe.exec(m[2]))) {
        const a = c[1], r = (a.match(/\br="([A-Z]+)\d*"/) || [])[1]; cn = r ? dpColIdx(r) : cn;
        const t = (a.match(/\bt="(\w+)"/) || [])[1], sI = +((a.match(/\bs="(\d+)"/) || [])[1] || 0), body = c[2] || "";
        let v = null; const vv = body.match(/<v>([\s\S]*?)<\/v>/);
        if (t === "s") v = vv ? X.sst[+vv[1]] : null;
        else if (t === "inlineStr") v = dpSiText(body);
        else if (t === "str") v = vv ? dpXmlText(vv[1]) : null;
        else if (t === "b") v = vv ? (vv[1] === "1" ? "TRUE" : "FALSE") : null;
        else if (t === "e") v = null;
        else if (t === "d") { v = vv ? dpDateVal(vv[1].slice(0, 10)) : null; if (v != null) dateHit[cn] = (dateHit[cn] || 0) + 1; }
        else if (vv) { v = +vv[1]; if (X.xfs[sI] && rn > 0) dateHit[cn] = (dateHit[cn] || 0) + 1; }
        if (v === "") v = null;
        row[cn] = v; cn++;
      } }
      rows[rn] = row; rn++;
    }
  };
  const CH = 8 << 20;
  for (let i = 0; i < u8.length; i += CH) {
    carry += dec.decode(u8.subarray(i, Math.min(i + CH, u8.length)), { stream: i + CH < u8.length });
    const cut = carry.lastIndexOf("</row>"); if (cut < 0) continue;
    parse(carry.slice(0, cut + 6)); carry = carry.slice(cut + 6);
    if (onProg) await onProg(Math.min(1, (i + CH) / u8.length));
  }
  parse(carry);
  return { rows: Array.from(rows, r => r || []), dateHit };
}
// 原始列（含標題列）→ { head, rows, kind }；主檔存進 DP，外部檔另存
function dpSetTable(raw, dateHit = []) { const t = dpTable(raw, dateHit); DP.head = t.head; DP.rows = t.rows; DP.kind = t.kind; DP.chk = null; DP.uv = {}; }
function dpTable(raw, dateHit = []) {
  let h = 0; while (h < raw.length && !(raw[h] || []).some(v => !dpBlank(v))) h++;
  const hdr = raw[h] || [], body = raw.slice(h + 1).filter(r => r && r.some(v => !dpBlank(v)));
  const nc = Math.max(hdr.length, ...body.slice(0, 2000).map(r => r.length)), seen = {};
  const head = Array.from({ length: nc }, (_, i) => { let s = dpBlank(hdr[i]) ? `欄${i + 1}` : String(hdr[i]).trim(); if (seen[s]) s += "_" + (++seen[s]); else seen[s] = 1; return s; });
  const kind = head.map((_, c) => {
    let num = 0, txt = 0, lead0 = false;
    for (const r of body) { const v = r[c]; if (dpBlank(v)) continue;
      if (typeof v === "number") num++;
      else { const s = String(v).trim(); if (/^-?[\d,]*\.?\d+$/.test(s)) { num++; if (/^0\d/.test(s)) lead0 = true; } else txt++; } }
    if (!num && !txt) return "text";
    if (txt || lead0) return "text";
    return (dateHit[c] || 0) > num / 2 ? "date" : "num";
  });
  body.forEach(r => { r.length = nc; for (let c = 0; c < nc; c++) { const v = r[c];
    if (dpBlank(v)) r[c] = null;
    else if (kind[c] === "text") r[c] = typeof v === "string" ? v.trim() : String(v);
    else if (typeof v !== "number") r[c] = dpNum(v); } });
  return { head, rows: body, kind };
}

// ── 欄位設定的預設值（只是建議；角色都可以改）──
function dpGuess(old) {
  const H = DP.head, K = DP.kind, idx = re => H.findIndex(h => re.test(h));
  const cfg = { id: null, dmode: "one", dcol: null, y: null, m: null, d: null, ychk: false, roles: {}, res: {}, flag: {}, agg: "person", wide: "day", from: null, to: null, coh: false, cohCol: null, excl: [], pcol: null, pval: null, pmap: {}, pcnt: false, tot: null, parts: [], actRep: "", actSrc: "", ext: [] };
  if (old && H.includes(old.id)) Object.assign(cfg, JSON.parse(JSON.stringify(old)));
  const has = c => c != null && H.includes(c);
  if (!has(cfg.id)) { const i = idx(/^(id|ID|編號|代碼|捐款人|個人代碼|會員編號)$/i); cfg.id = H[i >= 0 ? i : 0]; }
  const y = idx(/^(year|yy|yr|年)$/i), m = idx(/^(mm|month|mon|月)$/i), d = idx(/^(dd|day|日)$/i);
  if (!has(cfg.y) && y >= 0 && m >= 0 && d >= 0) { cfg.y = H[y]; cfg.m = H[m]; cfg.d = H[d]; }
  if (!has(cfg.dcol)) {
    let i = idx(/^(dno|date|日期|交易日期|捐款日期)$/i);
    if (i < 0) i = K.findIndex((k, c) => k === "date" && H[c] !== cfg.id);
    if (i >= 0) cfg.dcol = H[i]; else if (cfg.y) cfg.dmode = "ymd";
    if (cfg.dmode === "one" && cfg.y) cfg.ychk = true;
  }
  const keys = dpKeys(cfg), rows = DP.rows.slice(0, 20000), ic = H.indexOf(cfg.id), dc = H.indexOf(cfg.dcol);
  H.forEach((h, c) => {
    if (keys.has(h) || cfg.roles[h]) return;
    const sameAsDate = dc >= 0 && c !== dc && rows.every(r => r[c] == null || dpDateVal(r[c]) === dpDateVal(r[dc]));
    if (sameAsDate) { cfg.roles[h] = "drop"; return; }
    if (K[c] === "text") { cfg.roles[h] = "take"; return; }
    const per = new Map(); let fixed = true, uniq = new Set();
    for (const r of rows) { const v = r[c]; if (v == null) continue; uniq.add(v); const p = per.get(r[ic]); if (p === undefined) per.set(r[ic], v); else if (p !== v) fixed = false; }
    if (fixed || K[c] === "date") cfg.roles[h] = "take";            // 每人固定的值（例如首次捐款日）或日期
    else if (uniq.size > rows.length * 0.9 || /(no|id|編號|單號|序號|號碼|收據)$/i.test(h)) cfg.roles[h] = "drop";   // 看起來像單號
    else cfg.roles[h] = "sum";
  });
  Object.keys(cfg.res || {}).forEach(h => { if (!DP_RES.some(x => x[0] === cfg.res[h])) delete cfg.res[h]; });   // 已取消的處理方式（例如串接）需重新選擇
  Object.keys(cfg.roles).forEach(h => { if (!H.includes(h) || keys.has(h)) delete cfg.roles[h]; });
  if (cfg.pcol && !H.includes(cfg.pcol)) cfg.pcol = null;
  if (cfg.pval && !H.includes(cfg.pval)) cfg.pval = null;
  return cfg;
}
// 不參與輸出的鍵欄位：代碼、日期來源、核對用的年月日
function dpKeys(cfg) {
  const s = new Set([cfg.id]);
  if (cfg.dmode === "one") { s.add(cfg.dcol); if (cfg.ychk) [cfg.y, cfg.m, cfg.d].forEach(x => x && s.add(x)); }
  else [cfg.y, cfg.m, cfg.d].forEach(x => x && s.add(x));
  s.delete(null); return s;
}
const dpPer = (lv, day) => { if (lv === "day") return day; if (lv === "person") return 0; const [y, m] = dpYMD(day); return lv === "year" ? y : y * 100 + m; };
const dpPerTxt = (lv, p) => lv === "day" ? dpFmt(p) : lv === "month" ? `${Math.floor(p / 100)}/${String(p % 100).padStart(2, "0")}` : lv === "year" ? String(p) : "整個期間";

// ── 檢查：排除列、日期核對、總額核對、各層級的不一致 ──
function dpCheck(cfg) {
  const H = DP.head, col = h => H.indexOf(h), ic = col(cfg.id), dc = col(cfg.dcol), yc = col(cfg.y), mc = col(cfg.m), ddc = col(cfg.d);
  const n = DP.rows.length, okR = new Int32Array(n), okD = new Int32Array(n); let k = 0;
  const bad = { id: [], date: [] }, ymdBad = []; let outN = 0; const totBad = [], nonNum = {};
  const tc = col(cfg.tot), pc = (cfg.parts || []).map(col).filter(c => c >= 0);
  const numCols = H.map((h, c) => ["sum", "mean", "max", "min"].includes(cfg.roles[h]) ? c : -1).filter(c => c >= 0);
  const ymdOf = r => dpSerial(dpNum(r[yc]), dpNum(r[mc]), dpNum(r[ddc]));
  // 樣本資格：曾有某欄位為指定值之交易的人整個排除（依檔案中所有交易判斷，不受樣本期間限制）
  const rules = (cfg.excl || []).map(x => ({ col: x.col, c: col(x.col), set: new Set((x.vals || []).map(dpNorm)), vals: x.vals || [], ids: new Set() })).filter(x => x.c >= 0 && x.set.size);
  const exIds = new Set(); let exRows = 0;
  if (rules.length) for (let i = 0; i < n; i++) { const r = DP.rows[i]; if (dpBlank(r[ic])) continue;
    rules.forEach(x => { const v = r[x.c]; if (v != null && x.set.has(dpNorm(v))) { const id = dpKey(r[ic]); x.ids.add(id); exIds.add(id); } }); }
  // 首次交易篩選：先找出每個人的首次交易日（檔案中的最早交易日，或指定的日期欄），首次交易早於起日者整個人排除
  let coh = null;
  if (cfg.coh && cfg.from != null) {
    const fc = col(cfg.cohCol), fTx = new Map(), fCol = new Map(); let fileMin = Infinity;
    for (let i = 0; i < n; i++) { const r = DP.rows[i]; if (dpBlank(r[ic])) continue;
      const day = cfg.dmode === "ymd" ? ymdOf(r) : dpDateVal(r[dc]); if (day == null) continue;
      const id = dpKey(r[ic]), p = fTx.get(id); if (p === undefined || day < p) fTx.set(id, day); if (day < fileMin) fileMin = day;
      if (fc >= 0) { const v = dpDateVal(r[fc]); if (v != null) { const q = fCol.get(id); if (q === undefined || v < q) fCol.set(id, v); } } }
    const first = fc >= 0 ? new Map([...fTx].map(([id, d]) => [id, fCol.has(id) ? fCol.get(id) : d])) : fTx;
    const drop = new Set(); first.forEach((d, id) => { if (d < cfg.from && !exIds.has(id)) drop.add(id); });
    const mis = []; let misN = 0, noCol = 0;
    if (fc >= 0) fTx.forEach((d, id) => { if (!fCol.has(id)) { noCol++; return; } if (fCol.get(id) !== d) { misN++; if (mis.length < 5) mis.push([id, fCol.get(id), d]); } });
    coh = { by: fc >= 0 ? cfg.cohCol : "", fileMin, drop, dropRows: 0, ids: [...first.keys()].filter(id => !exIds.has(id)).length, misN, mis, noCol };
  }
  for (let i = 0; i < n; i++) {
    const r = DP.rows[i];
    if (dpBlank(r[ic])) { bad.id.push(i); continue; }
    if (exIds.size && exIds.has(dpKey(r[ic]))) { exRows++; continue; }
    const day = cfg.dmode === "ymd" ? ymdOf(r) : dpDateVal(r[dc]);
    if (day == null) { bad.date.push(i); continue; }
    if (coh && coh.drop.has(dpKey(r[ic]))) { coh.dropRows++; continue; }   // 首次交易早於起日的人
    if ((cfg.from != null && day < cfg.from) || (cfg.to != null && day > cfg.to)) { outN++; continue; }   // 樣本期間外
    if (cfg.dmode === "one" && cfg.ychk && yc >= 0) { const d2 = ymdOf(r); if (d2 !== day) ymdBad.push([i, day, d2]); }
    if (tc >= 0 && pc.length) { const t = dpNum(r[tc]) || 0, s = pc.reduce((a, c) => a + (dpNum(r[c]) || 0), 0); if (Math.abs(t - s) > 0.005) totBad.push([i, t, s]); }
    numCols.forEach(c => { const v = r[c]; if (v != null && typeof v !== "number") nonNum[H[c]] = (nonNum[H[c]] || 0) + 1; });
    okR[k] = i; okD[k] = day; k++;
  }
  const rIdx = okR.subarray(0, k), rDay = okD.subarray(0, k);
  let dmin = Infinity, dmax = -Infinity; for (let i = 0; i < k; i++) { if (rDay[i] < dmin) dmin = rDay[i]; if (rDay[i] > dmax) dmax = rDay[i]; }
  const take = H.filter(h => cfg.roles[h] === "take"), tci = take.map(col), conf = {}, vals = {};
  take.forEach((h, j) => { if (DP.kind[tci[j]] !== "text") return; const m = new Map(); for (let i = 0; i < k; i++) { const v = DP.rows[rIdx[i]][tci[j]]; if (v != null) m.set(v, (m.get(v) || 0) + 1); } vals[h] = [...m].sort((a, b) => b[1] - a[1]); });
  const ids = new Set(); for (let i = 0; i < k; i++) ids.add(dpKey(DP.rows[rIdx[i]][ic]));
  ["day"].forEach(lv => {
    const g = new Map(), cnt = take.map(() => 0), ex = take.map(() => []); let groups = 0, multi = 0;
    for (let i = 0; i < k; i++) {
      const r = DP.rows[rIdx[i]], key = dpKey(r[ic]) + "\u0001" + dpPer(lv, rDay[i]);
      let e = g.get(key); if (!e) { e = { n: 0, v: tci.map(() => null), b: tci.map(() => false) }; g.set(key, e); groups++; }
      if (++e.n === 2) multi++;
      tci.forEach((c, j) => { const v = r[c]; if (v == null || e.b[j]) return; if (e.v[j] === null) e.v[j] = v; else if (e.v[j] !== v) { e.b[j] = true; cnt[j]++; if (ex[j].length < 5) ex[j].push(key); } });
    }
    conf[lv] = { groups, multi, cols: Object.fromEntries(take.map((h, j) => [h, { n: cnt[j], ex: ex[j] }])) };
  });
  // 不一致的例子：列出每個值與次數
  const want = new Map(); Object.entries(conf).forEach(([lv, o]) => Object.entries(o.cols).forEach(([h, x]) => x.ex.forEach(key => want.set(lv + "\u0002" + h + "\u0002" + key, new Map()))));
  if (want.size) for (let i = 0; i < k; i++) {
    const r = DP.rows[rIdx[i]], id = dpKey(r[ic]);
    ["day"].forEach(lv => take.forEach((h, j) => { const m = want.get(lv + "\u0002" + h + "\u0002" + id + "\u0001" + dpPer(lv, rDay[i])); if (m && r[tci[j]] != null) m.set(r[tci[j]], (m.get(r[tci[j]]) || 0) + 1); }));
  }
  Object.entries(conf).forEach(([lv, o]) => Object.entries(o.cols).forEach(([h, x]) => { x.ex = x.ex.map(key => { const [id, p] = key.split("\u0001"); return { id, per: dpPerTxt(lv, +p), vals: [...want.get(lv + "\u0002" + h + "\u0002" + key)] }; }); }));
  if (coh) { coh.dropIds = coh.drop.size; delete coh.drop; }
  const excl = rules.length ? { ids: exIds.size, rows: exRows, rules: rules.map(x => ({ col: x.col, vals: x.vals, n: x.ids.size })) } : null;
  return { rows: n, k, rIdx, rDay, bad, outN, coh, excl, ymdBad, totBad, nonNum, dmin, dmax, ids: ids.size, take, conf, vals };
}
// 展開欄位的各個值（次數與數值合計），供合併設定
function dpPivotVals(cfg, chk) {
  const pc = DP.head.indexOf(cfg.pcol), vc = DP.head.indexOf(cfg.pval); if (pc < 0) return [];
  const m = new Map();
  for (let i = 0; i < chk.k; i++) { const r = DP.rows[chk.rIdx[i]], v = r[pc] == null ? "" : String(r[pc]); const e = m.get(v) || { n: 0, s: 0 }; e.n++; e.s += vc >= 0 ? (dpNum(r[vc]) || 0) : 0; m.set(v, e); }
  return [...m].map(([v, e]) => ({ v, n: e.n, s: e.s })).sort((a, b) => b.n - a.n);
}
// 尚未選擇處理方式、但在用到的層級有不一致的文字欄位
const dpLevels = () => ["day"];   // 只輸出一人一日（寬格式）
const dpNeed = (cfg, chk) => chk.take.filter(h => cfg.roles[h] === "take" && dpLevels(cfg).some(lv => chk.conf[lv].cols[h].n) && !cfg.res[h]);
// 展開後的欄名：依合併設定的順序；全部是「名稱＋編號」（例如 money1–money5）時依編號排列
const dpTargets = cfg => { const t = new Set(); Object.values(cfg.pmap || {}).forEach(x => { x = (x || "").trim(); if (x) t.add(x); }); const a = [...t]; return a.every(x => /\d$/.test(x)) ? a.sort(dpCmp) : a; };

// ── 合併成指定層級的資料 ──
function dpResolve(vals, how) {
  const v = vals.filter(x => x != null); if (!v.length) return null;
  if (how === "first") return v[0];
  if (how === "last") return v[v.length - 1];
  if (how === "uniq") { const u = [...new Set(v)]; return u.length === 1 ? u[0] : u.join("、"); }
  if (how === "all") return v.length === 1 ? v[0] : v.join("、");
  const c = new Map(); v.forEach(x => c.set(x, (c.get(x) || 0) + 1));
  let best = v[0], bn = 0; c.forEach((n, x) => { if (n > bn) { best = x; bn = n; } }); return best;   // 次數相同時取先出現者
}
function dpBuild(cfg, chk, lv, pivot) {
  const H = DP.head, col = h => H.indexOf(h), ic = col(cfg.id);
  const out = H.map((h, c) => ({ h, c, role: cfg.roles[h] })).filter(o => o.role && o.role !== "drop" && !dpKeys(cfg).has(o.h));
  const num = out.filter(o => o.role !== "take"), take = out.filter(o => o.role === "take");
  const pc = pivot ? col(cfg.pcol) : -1, vc = pivot ? col(cfg.pval) : -1, tg = pivot && pc >= 0 ? dpTargets(cfg) : [], tix = new Map(tg.map((t, i) => [t, i]));
  const g = new Map();
  // 「依前後幾天的交易判斷」：記下每個人在這些欄位的每筆交易（日期、值）
  const vfn = take.map(o => dpValidFn(cfg, o.h));
  const wtC = take.map(o => cfg.res[o.h] === "wt" ? col((cfg.wt || {})[o.h] || (DP.head.includes("money") ? "money" : "")) : -1);   // 依金額決定：用來比較的數值欄
  const nearJ = take.map((o, j) => cfg.res[o.h] === "near" ? j : -1).filter(j => j >= 0), hist = new Map();
  for (let i = 0; i < chk.k; i++) {
    const r = DP.rows[chk.rIdx[i]], day = chk.rDay[i], id = dpKey(r[ic]), p = dpPer(lv, day), key = id + "\u0001" + p;
    nearJ.forEach(j => { const v = r[take[j].c]; if (v == null) return; const hk = j + "\u0001" + id; let a = hist.get(hk); if (!a) hist.set(hk, a = []); a.push([day, v]); });
    let e = g.get(key);
    if (!e) { e = { id, idv: r[ic], p, n: 0, d0: day, d1: day, days: lv === "day" ? null : new Set(), s: num.map(() => 0), c: num.map(() => 0), mx: num.map(() => -Infinity), mn: num.map(() => Infinity), t: take.map(() => []), w: take.map(() => []), pv: tg.map(() => 0), pn: tg.map(() => 0) }; g.set(key, e); }
    e.n++; if (day < e.d0) e.d0 = day; if (day > e.d1) e.d1 = day; if (e.days) e.days.add(day);
    num.forEach((o, j) => { const v = r[o.c]; if (typeof v !== "number") return; e.s[j] += v; e.c[j]++; if (v > e.mx[j]) e.mx[j] = v; if (v < e.mn[j]) e.mn[j] = v; });
    take.forEach((o, j) => { e.t[j].push(r[o.c]); if (wtC[j] >= 0) e.w[j].push(dpNum(r[wtC[j]]) || 0); });
    if (pc >= 0) { const t = tix.get(((cfg.pmap || {})[r[pc] == null ? "" : String(r[pc])] || "").trim()); if (t != null) { e.pv[t] += vc >= 0 ? (dpNum(r[vc]) || 0) : 1; e.pn[t]++; } }
  }
  hist.forEach(a => a.sort((x, y) => x[0] - y[0]));
  // 候選值：當天出現過的值；計分：前 N 天＋當天＋後 N 天的出現次數；同分依序比前 N 天次數、當天之前最近一筆的值、當天第一筆
  const near = (j, id, day, vals) => {
    const cand = [...new Set(vals.filter(x => x != null))]; if (cand.length < 2) return cand[0] ?? null;
    const N = Math.max(0, +((cfg.near || {})[take[j].h] ?? 30) || 0), a = hist.get(j + "\u0001" + id) || [];
    let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m][0] < day - N) lo = m + 1; else hi = m; }
    const tot = new Map(cand.map(v => [v, 0])), pre = new Map(cand.map(v => [v, 0])); let prev = null;
    for (let i = 0; i < a.length && a[i][0] < day; i++) prev = a[i][1];
    for (let i = lo; i < a.length && a[i][0] <= day + N; i++) { const [d, v] = a[i]; if (!tot.has(v)) continue; tot.set(v, tot.get(v) + 1); if (d < day) pre.set(v, pre.get(v) + 1); }
    return cand.slice().sort((x, y) => (tot.get(y) - tot.get(x)) || (pre.get(y) - pre.get(x)) || ((y === prev) - (x === prev)))[0];
  };
  const head = [cfg.id], dateCol = new Set();
  if (lv === "day") { head.push("date", "year", "month", "day"); dateCol.add(1); }
  else if (lv === "month") head.push("year", "month");
  else if (lv === "year") head.push("year");
  head.push("n_tx"); if (lv !== "day") head.push("n_days");
  if (lv === "person") { head.push("first_date", "last_date"); dateCol.add(head.length - 2).add(head.length - 1); }
  num.forEach(o => { if (DP.kind[o.c] === "date" && o.role !== "sum" && o.role !== "mean") dateCol.add(head.length); head.push(o.h); });
  take.forEach(o => { if (DP.kind[o.c] === "date" && cfg.res[o.h] !== "uniq" && cfg.res[o.h] !== "all") dateCol.add(head.length); head.push(o.h); });
  const flags = [];   // 旗標欄已取消 flags.forEach(o => head.push(o.h + "_conflict"));
  tg.forEach(t => head.push(t)); if (cfg.pcnt) tg.forEach(t => head.push(t + "_n"));
  const seen = new Set(); head.forEach((h, i) => { let x = h; while (seen.has(x)) x += "_原"; seen.add(x); head[i] = x; });   // 與產生的欄名（date、year…）同名時加「_原」
  const rows = [...g.values()].sort((a, b) => dpCmp(a.id, b.id) || a.p - b.p).map(e => {
    const row = [e.idv];
    if (lv === "day") { const [y, m, d] = dpYMD(e.p); row.push(e.p, y, m, d); }
    else if (lv === "month") row.push(Math.floor(e.p / 100), e.p % 100);
    else if (lv === "year") row.push(e.p);
    row.push(e.n); if (lv !== "day") row.push(e.days.size);
    if (lv === "person") row.push(e.d0, e.d1);
    num.forEach((o, j) => row.push(!e.c[j] ? null : o.role === "sum" ? e.s[j] : o.role === "mean" ? e.s[j] / e.c[j] : o.role === "max" ? e.mx[j] : e.mn[j]));
    // 依金額決定：每個值加總其交易的金額，取合計最大者；相同時取先出現者
    const okIdx = j => { const f = vfn[j], all = e.t[j].map((_, i) => i); if (!f || new Set(e.t[j].filter(x => x != null)).size < 2) return all; const ok = all.filter(i => f(e.t[j][i])); return ok.length ? ok : all; };   // 只在不一致時，以當天其他的值取代不採用的值；全部都不採用時保留原值
    const wtPick = j => { const m = new Map(); okIdx(j).forEach(i => { const v = e.t[j][i]; if (v != null) m.set(v, (m.get(v) || 0) + e.w[j][i]); }); let best = null, bw = -Infinity; m.forEach((w, v) => { if (w > bw) { best = v; bw = w; } }); return best; };
    take.forEach((o, j) => { const tv = okIdx(j).map(i => e.t[j][i]);
      row.push(wtC[j] >= 0 ? wtPick(j) : cfg.res[o.h] === "near" && lv === "day" ? near(j, e.id, e.p, tv) : dpResolve(tv, cfg.res[o.h] === "near" ? "mode" : cfg.res[o.h] || "first")); });
    flags.forEach(o => { const j = take.indexOf(o); row.push(new Set(e.t[j].filter(x => x != null)).size > 1 ? 1 : 0); });
    tg.forEach((_, t) => row.push(e.pv[t])); if (cfg.pcnt) tg.forEach((_, t) => row.push(e.pn[t]));
    return row;
  });
  return { head, rows, dateCol };
}

// ── 活動期間與外部資料：附加在一人一日的資料之後 ──
// 縣市名稱只為串接而統一：台→臺、舊縣名→現行縣市、唯一的兩字簡稱補全（新竹、嘉義有縣與市，不補）
const DP_OLDC = { "臺北縣": "新北市", "桃園縣": "桃園市", "臺中縣": "臺中市", "臺南縣": "臺南市", "高雄縣": "高雄市" };
const dpCty = v => { if (v == null) return ""; const s = dpNorm(v).replace(/\s+/g, ""); if (DP_OLDC[s]) return DP_OLDC[s]; if (DP_TW.has(s)) return s;
  if (s.length === 2) { const m = [...DP_TW].filter(x => x.startsWith(s)); if (m.length === 1) return m[0]; } return s; };
// 各縣市政府所在地（約略經緯度），用來找距離最近的縣市；離島縣不找鄰近縣市
const DP_SEAT = { "臺北市": [25.0375, 121.5637], "新北市": [25.0120, 121.4650], "桃園市": [24.9937, 121.3010], "臺中市": [24.1618, 120.6467], "臺南市": [22.9925, 120.1850], "高雄市": [22.6205, 120.3120],
  "新竹縣": [24.8270, 121.0130], "苗栗縣": [24.5650, 120.8205], "彰化縣": [24.0760, 120.5420], "南投縣": [23.9025, 120.6900], "雲林縣": [23.6990, 120.5260], "嘉義縣": [23.4590, 120.2930],
  "屏東縣": [22.6830, 120.4880], "宜蘭縣": [24.7300, 121.7630], "花蓮縣": [23.9910, 121.6110], "臺東縣": [22.7560, 121.1440], "基隆市": [25.1310, 121.7440], "新竹市": [24.8040, 120.9680], "嘉義市": [23.4800, 120.4490] };
const DP_NEAR = (() => { const km = ([a, b], [c, d]) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return 6371 * Math.hypot(x, y); }, o = {};
  Object.keys(DP_SEAT).forEach(k => { o[k] = Object.keys(DP_SEAT).filter(x => x !== k).sort((x, y) => km(DP_SEAT[k], DP_SEAT[x]) - km(DP_SEAT[k], DP_SEAT[y]))[0]; }); return o; })();
const DP_DRE = /(\d{2,4})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?/g;
// 活動整理 Prompt：交給一般 AI，把活動資料整理成固定格式後貼回
const dpActPrompt = () => [
  "以下是我整理的活動資料（可能是表格、條列或一般文字）。請找出其中每一個活動及其舉辦期間，整理成每行一個活動，格式為：",
  "活動名稱｜簡稱｜起日｜迄日｜說明",
  "",
  "規則：",
  "0. 「簡稱」為 2 至 6 個中文字，用於表格與圖中辨識活動，各活動的簡稱不得重複（同一活動分成多行時，在簡稱後加 1、2 區分）。",
  "1. 日期一律寫成西元 YYYY/MM/DD；原文為民國年時換算成西元年。",
  "2. 單日活動的起日與迄日相同；起迄日都包含在活動期間內。",
  "3. 同一活動有多個不連續的期間時，分成多行，並在活動名稱後加（1）（2）區分。",
  "4. 「說明」寫活動內容的簡短摘要（一句話），原文沒有時留白。",
  "5. 原文沒有寫明年份、日期不完整或無法確定者，不得推測，改列在最後的「## 無法確定」一節，每行寫出原文與原因。",
  "6. 只輸出上述內容，不加其他文字、不使用表格。",
  "", "活動資料：", "---", "（請在這裡貼上活動資料）", "---"
].join("\n");
function dpActs(cfg) {
  const list = [], bad = [], txt = String(cfg.actRep || "").replace(/\*\*/g, ""), cut = txt.search(/^#{1,3}\s*無法確定/m);
  const body = cut >= 0 ? txt.slice(0, cut) : txt, unsure = cut >= 0 ? txt.slice(cut).split(/\r?\n/).slice(1).map(l => l.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean) : [];
  body.split(/\r?\n/).forEach(l => {
    const t = l.replace(/^[\s\-*•]+/, "").trim(); if (!t || /^[-|｜:\s]+$/.test(t) || /^#/.test(t)) return;
    const cells = t.replace(/^\||\|$/g, "").split(/[｜|\t]/).map(x => x.trim());
    if (/^活動名稱$/.test(cells[0])) return;   // 標題列
    const ds = [...t.matchAll(DP_DRE)].map(m => dpSerial(+m[1], +m[2], +m[3]));
    if (!ds.length || ds.some(x => x == null)) { bad.push(t); return; }
    const isD = x => new RegExp(DP_DRE.source).test(x), name = cells.find(x => x && !isD(x)) || "";
    const ab2 = cells.length >= 4 && !isD(cells[0]) && !isD(cells[1]);   // 新格式：活動名稱｜簡稱｜起日｜迄日｜說明
    const from = Math.min(ds[0], ds[1] ?? ds[0]), to = Math.max(ds[0], ds[1] ?? ds[0]), a = { name, from, to };
    const ab0 = ab2 ? cells[1] : "", ov = (cfg.actAb || {})[dpAeKeyOf(a)];
    list.push({ ...a, ab0, ab: ov != null ? ov : ab0, note: cells.length > (ab2 ? 4 : 3) ? cells.slice(ab2 ? 4 : 3).join("｜") : "", v: `act${list.length + 1}` });
  });
  return { list, bad, unsure };
}
// 外部檔：猜日期欄、縣市欄；欄名有 3 個以上是縣市時視為寬格式（一個縣市一欄）
const dpExtWide = (e, t) => e.ccol ? [] : t.head.map((h, c) => h !== e.dcol && DP_TW.has(dpCty(h)) ? c : -1).filter(c => c >= 0);
function dpExtGuess(e, t) {
  const H = t.head, smp = t.rows.slice(0, 500), share = (c, f) => { let n = 0, k = 0; smp.forEach(r => { if (r[c] != null) { n++; if (f(r[c])) k++; } }); return n ? k / n : 0; };
  if (!H.includes(e.dcol)) { let i = H.findIndex(h => /日期|date|yyyymmdd|觀測時間/i.test(h)); if (i < 0) i = H.findIndex((h, c) => share(c, v => dpDateVal(v) != null) > 0.9); e.dcol = i >= 0 ? H[i] : null; }
  if (e.ccol && !H.includes(e.ccol)) e.ccol = null;
  if (e.ccol === undefined) { const i = H.findIndex((h, c) => h !== e.dcol && share(c, v => DP_TW.has(dpCty(v))) > 0.8); e.ccol = i >= 0 ? H[i] : null; }
  e.use ||= []; e.vars ||= {}; e.use = e.use.filter(h => H.includes(h));
  if (!e.wv) e.wv = "x";
  if (!e.key || !DP.head.includes(e.key)) e.key = dpCtyCols()[0] || null;
}
// 本資料中可作為縣市鍵的欄位：取值的文字欄，依縣市值的比例排序
const dpCtyCols = () => { const c = DP.cfg; if (!c) return [];
  return DP.head.filter((h, i) => DP.kind[i] === "text" && c.roles[h] === "take" && h !== c.pcol).map(h => { const u = dpUV(h), n = u.reduce((a, x) => a + x[1], 0) || 1;
    return [h, u.filter(([v]) => DP_TW.has(dpCty(v))).reduce((a, x) => a + x[1], 0) / n]; }).filter(x => x[1] > 0.5).sort((a, b) => b[1] - a[1]).map(x => x[0]); };
// 外部檔整理成「日期（＋縣市）→ 各變數的值」：同一鍵多筆時數值取平均（X 不列入）；T（微量）視為 0；全部為 X 時以距離最近的縣市同一天的值取代
function dpExtIndex(e, t) {
  const H = t.head, dc = H.indexOf(e.dcol), cc = e.ccol ? H.indexOf(e.ccol) : -1, wc = dpExtWide(e, t), wide = wc.length >= 3;
  const vars = wide ? [{ c: -1, h: "（各縣市欄）", v: (e.wv || "x").trim() }] : (e.use || []).filter(h => H.includes(h)).map(h => ({ c: H.indexOf(h), h, v: ((e.vars || {})[h] || h).trim() }));
  const st = { rows: t.rows.length, badDate: 0, dmin: Infinity, dmax: -Infinity, unk: new Map(), T: 0, X: 0, other: new Map(), filled: 0, fillBy: new Map(), gaps: [], wide, by: cc >= 0 || wide, ctys: new Set() };
  const acc = new Map();
  const put = (key, j, v) => {
    let a = acc.get(key); if (!a) acc.set(key, a = vars.map(() => ({ s: 0, n: 0, x: 0, t: null })));
    if (v == null) return; const o = a[j];
    if (typeof v === "number") { if (isFinite(v)) { o.s += v; o.n++; } return; }
    const s = String(v).trim(); if (!s) return;
    if (/^T$/i.test(s)) { o.n++; st.T++; return; }   // 微量：視為 0
    if (/^X$/i.test(s)) { o.x++; st.X++; return; }
    const n = dpNum(s); if (!isNaN(n) && n != null) { o.s += n; o.n++; return; }
    if (o.t == null) o.t = s; o.tn = (o.tn || 0) + 1;
  };
  if (dc >= 0 && vars.length) for (const r of t.rows) {
    const d = dpDateVal(r[dc]); if (d == null) { st.badDate++; continue; }
    if (d < st.dmin) st.dmin = d; if (d > st.dmax) st.dmax = d;
    if (wide) wc.forEach(c => { const k = dpCty(t.head[c]); st.ctys.add(k); put(d + "\u0001" + k, 0, r[c]); });
    else { let k = ""; if (cc >= 0) { k = dpCty(r[cc]); if (!DP_TW.has(k)) { st.unk.set(String(r[cc] ?? "（空白）"), (st.unk.get(String(r[cc] ?? "（空白）")) || 0) + 1); continue; } st.ctys.add(k); }
      vars.forEach((o, j) => put(d + "\u0001" + k, j, r[o.c])); }
  }
  // 各變數是數值或文字：數值多於文字者視為數值，其餘文字代碼（T、X 以外）記為缺漏並列出
  const num = vars.map((_, j) => { let n = 0, tx = 0; acc.forEach(a => { n += a[j].n + a[j].x; tx += a[j].tn || 0; }); return n >= tx; });
  acc.forEach(a => vars.forEach((_, j) => { if (num[j] && a[j].tn) { const k = a[j].t; st.other.set(k, (st.other.get(k) || 0) + a[j].tn); } }));
  const map = new Map(); acc.forEach((a, key) => map.set(key, a.map((o, j) => num[j] ? (o.n ? o.s / o.n : o.x ? "X" : null) : o.t)));
  // X：該縣市當天全部為 X 時，以距離最近的 1 個縣市同一天的值取代；最近的縣市當天也沒有有效值、離島縣或全國資料，維持缺漏
  const miss = [], orig = new Map(); map.forEach((v, key) => orig.set(key, v.slice()));
  map.forEach((vals, key) => { const [d, k] = key.split("\u0001");
    vals.forEach((v, j) => { if (v !== "X") return;
      const nb = k ? DP_NEAR[k] : null, w = nb ? orig.get(d + "\u0001" + nb) : null;
      if (w && typeof w[j] === "number") { st.filled++; st.fillBy.set(k, nb); vals[j] = w[j]; }
      else miss.push([k, j, +d]); }); });
  // 再把取代值與缺漏分開：取代值只取鄰近縣市的原始有效值（不連鎖取代）
  miss.forEach(([k, j, d]) => { map.get(d + "\u0001" + k)[j] = null; });
  miss.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1] || x[2] - y[2]);
  miss.forEach(([k, j, d]) => { const g = st.gaps[st.gaps.length - 1];
    if (g && g.k0 === k && g.j === j && g.to === d - 1) { g.to = d; g.days++; }
    else st.gaps.push({ k0: k, k: k || "全國", j, v: vars[j].v, from: d, to: d, days: 1, why: !k ? "全國資料" : !DP_NEAR[k] ? "離島縣" : `${DP_NEAR[k]}當天也沒有有效值` }); });
  if (st.dmin === Infinity) st.dmin = st.dmax = null;
  return { map, vars, num, st };
}
const dpExtIx = i => { const t = DP.ext[i], e = DP.cfg.ext[i]; if (!t) return null; return DP.extIx[i] ||= dpExtIndex(e, t); };
// 輸出前必須完成的設定
function dpBlock(cfg, chk) {
  const m = []; const A = dpActs(cfg);
  if (chk) dpDvParse(dpDvText(cfg), dpHead0(cfg, chk)).items.forEach((it, q) => { if (it.err) m.push(`衍生變數 ${it.name || `第 ${q + 1} 行`}：${it.err}`); });
  if (A.list.length && !String(cfg.actSrc || "").trim()) m.push("活動期間：請填寫資料來源");
  if (A.bad.length) m.push(`活動期間：有 ${A.bad.length} 行讀不出日期，請修正或刪除`);
  (cfg.ext || []).forEach((e, i) => { const t = `外部資料 ${i + 1}${e.file ? `（${e.file}）` : ""}`;
    if (!DP.ext[i]) m.push(`${t}：請${e.file ? "重新" : ""}上傳檔案`); else {
      if (!e.dcol) m.push(`${t}：請選擇日期欄`);
      const ix = dpExtIx(i); if (ix && !ix.vars.length) m.push(`${t}：請勾選要帶入的變數`);
      if (ix && ix.st.by && !e.key) m.push(`${t}：請選擇本資料中對應的縣市欄`); }
    ["src", "url", "got"].forEach(k => { if (!String(e[k] || "").trim()) m.push(`${t}：請填寫${{ src: "資料來源", url: "網址或取得方式", got: "取得日期" }[k]}`); }); });
  return m;
}
// ── 模型用的事件變數（依文獻）──
// 共同：time（線性時間趨勢）、dow（星期幾）；短期：起日前後各週指示變數；長期：起日後階梯、起日後天數，已結束者另加結束後階梯與天數
const dpEvKind = (c, a) => { const o = dpAeCfg(c), k = dpAeKeyOf(a); return o.kind[k] || (a.to - a.from + 1 <= o.cut ? "s" : "l"); };
const dpEvActs = c => { const L = dpActs(c).list, o = dpAeCfg(c), K = L.filter(a => o.keep[dpAeKeyOf(a)]); return K.length ? K : L; };
function dpEvSpec(c, dmin, dmax) {
  const o = dpAeCfg(c), cols = [["time", "線性時間趨勢：樣本第一天為 1，逐日加 1"], ["dow", "星期幾：1＝星期一，7＝星期日"]];
  dpEvActs(c).forEach(a => { const nmA = `「${a.name}」`;
    if (dpEvKind(c, a) === "s") {
      for (let w = o.ewb; w >= 1; w--) cols.push([`${a.v}_b${w}`, `活動${nmA}起日前第 ${w} 週（起日前 ${w * 7} 至 ${w * 7 - 6} 天）為 1，其餘為 0`, a, "s", -w]);
      for (let w = 0; w <= o.ewa; w++) cols.push([`${a.v}_a${w}`, `活動${nmA}起日後第 ${w} 週（起日後 ${w * 7} 至 ${w * 7 + 6} 天，起日為第 0 天）為 1，其餘為 0`, a, "s", w]);
    } else {
      cols.push([`${a.v}_s`, `活動${nmA}起日（${dpFmt(a.from)}）起每天為 1，之前為 0（水準變化）`, a, "ls"], [`${a.v}_t`, `活動${nmA}起日後經過的天數，起日為 0、之前為 0（斜率變化）`, a, "lt"]);
      if (dmax == null || a.to < dmax) cols.push([`${a.v}_e`, `活動${nmA}迄日（${dpFmt(a.to)}）之後每天為 1，之前為 0（結束後的變化）`, a, "le"], [`${a.v}_et`, `活動${nmA}迄日之後經過的天數，迄日次日為 1、之前為 0`, a, "let"]);
    } });
  return cols;
}
function dpEvAdd(head, rows, di, desc, nm, cfg) {
  let dmin = DP.chk && DP.chk.dmin, dmax = DP.chk && DP.chk.dmax;
  if (dmin == null) rows.forEach(r => { if (dmin == null || r[di] < dmin) dmin = r[di]; });
  dpEvSpec(cfg, dmin, dmax).forEach(([h, d, a, t, w]) => { const v = nm(h); head.push(v); desc[v] = d;
    rows.forEach(r => { const x = r[di]; let y;
      if (h === "time") y = x - dmin + 1;
      else if (h === "dow") y = ((new Date((x - 25569) * 864e5).getUTCDay() + 6) % 7) + 1;
      else if (t === "s") y = Math.floor((x - a.from) / 7) === w ? 1 : 0;
      else if (t === "ls") y = x >= a.from ? 1 : 0;
      else if (t === "lt") y = x >= a.from ? x - a.from : 0;
      else if (t === "le") y = x > a.to ? 1 : 0;
      else y = x > a.to ? x - a.to : 0;
      r.push(y); }); });
}
const DP_EVREF = {
  s: "短期活動依 Garthwaite（2014）彙總時間序列的設定，放入起日前後各週的指示變數，以呈現事前趨勢與事後各週的動態效果，並控制年份、一年中的週別與線性時間趨勢；窗口前後各 8 週亦依該研究的彙總分析（另見 Sheng & Astvansh, 2026 取前後 3 週）",
  l: "長期活動依斷點時間序列（Cornelsen et al., 2017）與代言銷售研究（Elberse & Verleun, 2012）以起日後的階梯變數估計水準變化，並依 Miller（2023）的分段設定以起日後經過期數估計斜率變化；事件結束後的變化依 Sheng & Astvansh（2026）另設結束後的變數",
  t: "所有單位同時發生、又沒有對照單位的長期事件，與年份等日曆時間固定效果完全共線（Miller, 2023），因此含長期活動的模型改以線性時間趨勢 time 加季節虛擬變數控制時間，不放年份固定效果（Cornelsen et al., 2017 用季別虛擬變數）；只含短期活動的模型可依 Garthwaite（2014）同時控制年份"
};
function dpEvView(c) {
  if (!dpActs(c).list.length) return "";
  const o = dpAeCfg(c), L = dpEvActs(c), S = L.filter(a => dpEvKind(c, a) === "s"), G = L.filter(a => dpEvKind(c, a) === "l");
  const nm = a => `${a.v}${a.ab ? " " + esc(a.ab) : ""}`;
  return `<div class="dpsub"><b>模型用的事件變數</b>
    <p class="hint">依活動初步評估表一的「短期／長期」分類產生；表一有勾選保留時只處理保留的活動。所有輸出另加 time（線性時間趨勢）與 dow（星期幾）。</p>
    <ul class="hint"><li><b>短期</b>（${S.length ? S.map(nm).join("、") : "無"}）：起日前各週 _b${o.ewb}…_b1、起日後各週 _a0…_a${o.ewa}（每 7 天一週，起日為第 0 週）。${esc(DP_EVREF.s)}。</li>
      <li><b>長期</b>（${G.length ? G.map(nm).join("、") : "無"}）：_s 起日後為 1（水準變化）、_t 起日後天數（斜率變化）；迄日早於資料最後一天者另加 _e 迄日後為 1、_et 迄日後天數。${esc(DP_EVREF.l)}。</li>
      <li><b>時間控制</b>：${esc(DP_EVREF.t)}。原本的期間 0/1 變數（act1…）等於 _s 減 _e，不要與 _s、_e 同時放入模型。</li></ul>
    <div class="dprow"><label>短期活動：起日前 <input type="number" min="1" step="1" data-dpae="ewb" value="${o.ewb}" style="width:4em"> 週</label><label>起日後 <input type="number" min="0" step="1" data-dpae="ewa" value="${o.ewa}" style="width:4em"> 週</label></div></div>`;
}
// 一人一日的資料 → 加上活動期間（act1…）與外部資料的欄位
function dpExtend(T, cfg) {
  const head = T.head.slice(), rows = T.rows, di = head.indexOf("date"), desc = {}, st = { ext: [] };
  const seen = new Set(head), nm = h => { let x = h, k = 2; while (seen.has(x)) x = `${h}_${k++}`; seen.add(x); return x; };
  const A = dpActs(cfg);
  A.list.forEach(a => { const v = nm(a.v); head.push(v); desc[v] = `活動「${a.name}」期間（${dpFmt(a.from)} 至 ${dpFmt(a.to)}）為 1，其餘為 0`; rows.forEach(r => r.push(r[di] >= a.from && r[di] <= a.to ? 1 : 0)); });
  if (A.list.length) dpEvAdd(head, rows, di, desc, nm, cfg);
  (cfg.ext || []).forEach((e, i) => {
    const ix = DP.ext[i] ? dpExtIx(i) : null, vars = ix ? ix.vars : [], s = { ok: 0, miss: 0, noC: 0, out: 0, keys: new Map() };
    const names = vars.map(o => { const v = nm(o.v); head.push(v); desc[v] = `${e.src || "外部資料"}的 ${o.h === "（各縣市欄）" ? "各縣市資料" : o.h}（依日期${ix && ix.st.by ? `與 ${e.key} 的縣市` : ""}串接）`; return v; });
    if (!ix) return st.ext.push(s);
    let kc = ix.st.by ? head.indexOf(e.key) : -1; if (ix.st.by && kc < 0) kc = head.indexOf(e.key + "_原");
    rows.forEach(r => { let k = "";
      if (ix.st.by) { k = dpCty(r[kc]); if (!k) { s.noC++; vars.forEach(() => r.push(null)); return; } }
      const v = ix.map.get(r[di] + "\u0001" + k);
      if (v) { s.ok++; vars.forEach((_, j) => r.push(v[j] === "X" ? null : v[j])); }
      else { if (ix.st.dmin == null || r[di] < ix.st.dmin || r[di] > ix.st.dmax) s.out++; else { s.miss++; const kk = k || dpFmt(r[di]); s.keys.set(kk, (s.keys.get(kk) || 0) + 1); } vars.forEach(() => r.push(null)); }
    });
    st.ext.push(s);
  });
  return { head, rows, dateCol: T.dateCol, desc, st };
}
// ── 衍生變數：依 0.4 回覆的「## 衍生變數計算規格」計算（每行「變數名稱｜類型｜來源欄｜參數｜說明」），附加在最後 ──
// 類型名稱與 js/prompts-new.js 的 DV_TYPES 對應
const DV_NAMES = ["星期", "對數", "分散度", "組內", "組間", "距上次交易天數", "過去N天交易次數", "過去N天合計", "過去N天平均", "年資", "首次交易", "首次交易值", "落後k期", "等於某值", "非零項目數", "無法計算"];
const DV_SRC = { "星期": [0, 1], "對數": [1, 1], "分散度": [2, 99], "組內": [1, 1], "組間": [1, 1], "距上次交易天數": [0, 0], "過去N天交易次數": [0, 0], "過去N天合計": [1, 1], "過去N天平均": [1, 1],
  "年資": [0, 1], "首次交易": [0, 0], "首次交易值": [1, 1], "落後k期": [1, 1], "等於某值": [1, 1], "非零項目數": [1, 99] };
const DV_WIN = new Set(["過去N天交易次數", "過去N天合計", "過去N天平均"]);
// 取最後一次出現的「## 標題」一節（補問的回覆接在原回覆之後，以後面的為準）
function dpSecLast(text, head) {
  const L = String(text || "").replace(/\*\*/g, "").split(/\r?\n/); let i = -1;
  L.forEach((l, k) => { if (new RegExp("^#{2,3}\\s*" + head).test(l.trim())) i = k; });
  if (i < 0) return ""; const out = []; for (let k = i + 1; k < L.length && !/^#{1,2}\s/.test(L[k].trim()); k++) out.push(L[k]);
  return out.join("\n").trim();
}
const dpDv04 = () => dpSecLast(((typeof store !== "undefined" && store.replies) || {})["s0-6|pdict"], "衍生變數計算規格");
const dpDvText = cfg => cfg && cfg.dvTxt != null ? cfg.dvTxt : dpDv04();
const dpDvBlank = s => /^[\s\-—–－無（）()留白不需要]*$/.test(s || "");
// 來源欄：以頓號等分隔；「money1–money5」展開為 money1、money2…money5
const dpDvCols = s => dpDvBlank(s) ? [] : String(s).split(/[、,，;；]+/).map(x => x.trim()).filter(x => x && !dpDvBlank(x)).flatMap(x => {
  const m = x.match(/^(.*?)(\d+)\s*[–—\-~～至到]+\s*(.*?)(\d+)$/);
  if (m && (!m[3] || m[3] === m[1]) && +m[4] > +m[2] && +m[4] - +m[2] < 100) return Array.from({ length: +m[4] - +m[2] + 1 }, (_, k) => m[1] + (+m[2] + k));
  return [x]; });
function dpDvParse(text, head) {
  const items = [], have = new Set(head), names = new Map();
  String(text || "").replace(/\*\*/g, "").split(/\r?\n/).map(l => l.replace(/^[\s\-*•]+/, "").trim()).filter(l => /[｜|]/.test(l) && !/^[-|｜:\s]+$/.test(l)).forEach(l => {
    const c = l.replace(/^[|｜]\s*|\s*[|｜]$/g, "").split(/\s*[｜|]\s*/);
    if (/^變數名稱$/.test(c[0])) return;   // 標題列
    const it = { name: (c[0] || "").replace(/`/g, ""), raw: c[1] || "", src: dpDvCols((c[2] || "").replace(/`/g, "")), param: dpDvBlank(c[3]) ? "" : (c[3] || "").trim(), note: c.slice(4).join("｜").trim(), err: "" };
    let t = it.raw.replace(/\s+/g, "").replace(/^過去[nN]天/, "過去N天").replace(/^落後[kK]期$/, "落後k期"), m;
    if ((m = t.match(/^過去(\d+)天(交易次數|合計|平均)$/))) { t = "過去N天" + m[2]; if (!it.param) it.param = m[1]; }
    else if ((m = t.match(/^落後(\d+)期$/))) { t = "落後k期"; if (!it.param) it.param = m[1]; }
    else if (t === "前一期" || t === "落後一期") { t = "落後k期"; if (!it.param) it.param = "1"; }
    it.type = t; items.push(it);
  });
  items.forEach((it, q) => {
    if (it.type === "無法計算") { it.skip = true; return; }
    if (!it.name) { it.err = "變數名稱空白"; return; }
    if (have.has(it.name)) { it.err = "與輸出欄位同名"; return; }
    if (names.has(it.name)) { it.err = `與第 ${names.get(it.name) + 1} 行的變數同名`; return; }
    names.set(it.name, q);
    if (!DV_SRC[it.type]) { it.err = `類型「${it.raw}」不在可用的類型中`; return; }
    const [lo, hi] = DV_SRC[it.type], n = it.src.length;
    if (n < lo || n > hi) { it.err = hi === 0 ? "此類型不需要來源欄" + (it.type === "過去N天交易次數" ? "（要加總 n_tx 時改用「過去N天合計」）" : "") : lo === hi ? `來源欄須為 ${lo} 個` : `來源欄至少 ${lo} 個`; return; }
    const N = it.param.match(/\d+/);
    if (DV_WIN.has(it.type)) { if (!N || +N[0] < 1) { it.err = "參數須填天數 N（正整數）"; return; } it.N = +N[0]; }
    if (it.type === "落後k期") { it.k = N ? +N[0] : 1; if (it.k < 1) { it.err = "參數 k 須為正整數"; return; } }
    if (it.type === "對數") { if (it.param && !/\+\s*1\b/.test(it.param) && !/^ln\(?x\)?$/i.test(it.param)) { it.err = "參數只能留白（ln(x)）或填「+1」（ln(x+1)）"; return; } it.p1 = /\+\s*1\b/.test(it.param); }
    if (it.type === "年資") { const u = !it.param ? "年" : /天|日/.test(it.param) ? "天" : /月/.test(it.param) ? "月" : /年/.test(it.param) ? "年" : ""; if (!u) { it.err = "參數須填「天」「月」或「年」"; return; } it.unit = u; it.unitDef = !it.param; }
    if (it.type === "等於某值") { it.vals = it.param.replace(/^[「『"]|[」』"]$/g, "").split(/[」』"]?\s*[、,，]\s*[「『"]?/).map(x => dpNorm(x)).filter(Boolean); if (!it.vals.length) { it.err = "參數須填要比對的值"; return; } }
  });
  // 計算順序：來源欄都已存在（輸出欄位或已排好的變數）才排入；來源欄有錯或互相引用者標錯
  const order = [], done = new Set(head), byName = new Map(items.filter(x => !x.err && !x.skip).map(x => [x.name, x]));
  let left = [...byName.values()], prog = true;
  while (left.length && prog) { prog = false;
    left = left.filter(it => { const miss = it.src.filter(x => !done.has(x));
      if (!miss.length) { order.push(it); done.add(it.name); prog = true; return false; }
      const bad = miss.find(x => !byName.has(x) || byName.get(x).err);
      if (bad) { it.err = byName.has(bad) ? `來源欄 ${bad} 有錯誤` : `來源欄 ${bad} 不在輸出欄位中`; prog = true; return false; }
      return true; }); }
  left.forEach(it => { it.err = "來源欄互相引用，無法決定計算順序"; });
  items.forEach(it => { if (!it.err && !it.skip && it.src.some(x => !done.has(x))) it.err = `來源欄 ${it.src.find(x => !done.has(x))} 不在輸出欄位中`; });
  return { items, order: order.filter(it => !it.err) };
}
// 規則的文字說明（處理紀錄、0.2 資料欄位）
function dpDvRule(it) {
  const s = it.src.join("、"), N = it.N;
  return { "星期": `${s || "date"} 的星期（一＝1…日＝7）`, "對數": `ln(${s}${it.p1 ? "+1" : ""})`, "分散度": `${s} 的熵（−Σ S_j ln S_j，S_j 為各欄占合計的比例）`,
    "組內": `${s} 減去個人平均`, "組間": `${s} 的個人平均`, "距上次交易天數": "距前一次交易日的天數", "過去N天交易次數": `前 ${N} 天內（不含當天）的交易日數`,
    "過去N天合計": `前 ${N} 天內（不含當天）${s} 的合計`, "過去N天平均": `前 ${N} 天內（不含當天）各交易日 ${s} 的平均`,
    "年資": `距首次交易日（${s ? s + " 欄" : "輸出資料中該人第一個交易日"}）的${it.unit}數${it.unitDef ? "（參數留白，預設為年）" : ""}`, "首次交易": "該人第一個交易日為 1，其餘為 0",
    "首次交易值": `該人第一個交易日的 ${s}`, "落後k期": `前 ${it.k} 次交易日的 ${s}`, "等於某值": `${s} 為「${(it.vals || []).join("、")}」時為 1，否則為 0`, "非零項目數": `${s} 中非 0、非空白的欄數` }[it.type] || it.type;
}
// 計算：輸出資料已依個人代碼、日期排序，一人一日一列
function dpDerive(T, cfg) {
  const head = T.head, rows = T.rows, n = rows.length, di = head.indexOf("date"), base = head.slice(), desc = { ...(T.desc || {}) };
  const sp = dpDvParse(dpDvText(cfg), base), st = { items: [], trunc: [] };
  const gs = new Int32Array(n), D = new Float64Array(n); let dmin = Infinity;
  for (let i = 0, s0 = 0; i < n; i++) { if (i && dpKey(rows[i][0]) !== dpKey(rows[i - 1][0])) s0 = i; gs[i] = s0; D[i] = rows[i][di]; if (D[i] < dmin) dmin = D[i]; }
  sp.order.forEach(it => {
    const cs = it.src.map(x => head.indexOf(x)), c = cs[0], out = new Array(n).fill(null), o = { name: it.name, nonNum: 0, neg: 0 };
    const num = v => { if (v == null || v === "") return null; if (typeof v === "number") return isFinite(v) ? v : null; const x = dpNum(v); if (x == null || isNaN(x)) { o.nonNum++; return null; } return x; };
    const T_ = it.type;
    if (T_ === "星期") for (let i = 0; i < n; i++) { const v = c >= 0 ? rows[i][c] : D[i], d = typeof v === "number" ? Math.floor(v) : dpDateVal(v); if (d != null) out[i] = (new Date((d - 25569) * 864e5).getUTCDay() + 6) % 7 + 1; }
    else if (T_ === "對數") for (let i = 0; i < n; i++) { let x = num(rows[i][c]); if (x == null) continue; if (it.p1) x += 1; out[i] = x > 0 ? Math.log(x) : null; }
    else if (T_ === "分散度") for (let i = 0; i < n; i++) { const v = cs.map(k => num(rows[i][k])); if (v.every(x => x == null) || v.some(x => x != null && x < 0)) continue;
      const t = v.reduce((a, x) => a + (x || 0), 0); if (!(t > 0)) continue; let h = 0; v.forEach(x => { if (x > 0) { const p = x / t; h -= p * Math.log(p); } }); out[i] = h; }
    else if (T_ === "組內" || T_ === "組間") for (let i = 0; i < n; ) { let j = i, s = 0, k = 0; while (j < n && gs[j] === i) { const x = num(rows[j][c]); if (x != null) { s += x; k++; } j++; }
      const m = k ? s / k : null; for (let q = i; q < j; q++) { if (T_ === "組間") out[q] = m; else { const x = num(rows[q][c]); out[q] = x == null || m == null ? null : x - m; } } i = j; }
    else if (T_ === "距上次交易天數") for (let i = 0; i < n; i++) out[i] = i > gs[i] ? D[i] - D[i - 1] : null;
    else if (DV_WIN.has(T_)) { const ps = new Float64Array(n + 1), pc = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) { const x = c >= 0 ? num(rows[i][c]) : null; ps[i + 1] = ps[i] + (x || 0); pc[i + 1] = pc[i] + (x != null ? 1 : 0); }
      let lo = 0, tr = 0;
      for (let i = 0; i < n; i++) { if (gs[i] > lo) lo = gs[i]; while (lo < i && D[lo] < D[i] - it.N) lo++;
        if (D[i] - it.N < dmin) tr++;
        out[i] = T_ === "過去N天交易次數" ? i - lo : T_ === "過去N天合計" ? ps[i] - ps[lo] : (pc[i] - pc[lo] ? (ps[i] - ps[lo]) / (pc[i] - pc[lo]) : null); }
      if (tr) st.trunc.push([it.name, it.N, tr]); }
    else if (T_ === "年資") { const div = { "天": 1, "月": 365.25 / 12, "年": 365.25 }[it.unit];
      for (let i = 0; i < n; i++) { let f = D[gs[i]]; if (c >= 0) { const v = rows[i][c], d = typeof v === "number" ? Math.floor(v) : dpDateVal(v); if (d != null) f = d; }
        const x = D[i] - f; if (x < 0) o.neg++; out[i] = div === 1 ? x : Math.round(x / div * 1e4) / 1e4; } }
    else if (T_ === "首次交易") for (let i = 0; i < n; i++) out[i] = i === gs[i] ? 1 : 0;
    else if (T_ === "首次交易值") for (let i = 0; i < n; i++) out[i] = rows[gs[i]][c];
    else if (T_ === "落後k期") for (let i = 0; i < n; i++) out[i] = i - it.k >= gs[i] ? rows[i - it.k][c] : null;
    else if (T_ === "等於某值") { const set = new Set(it.vals); for (let i = 0; i < n; i++) { const v = rows[i][c]; if (v != null && v !== "") out[i] = set.has(dpNorm(String(v))) ? 1 : 0; } }
    else if (T_ === "非零項目數") for (let i = 0; i < n; i++) out[i] = cs.reduce((a, k) => { const v = rows[i][k]; return a + (v != null && v !== "" && v !== 0 && v !== "0" ? 1 : 0); }, 0);
    head.push(it.name); for (let i = 0; i < n; i++) rows[i].push(out[i]);
    desc[it.name] = `${it.note ? it.note + "；" : ""}${dpDvRule(it)}`;
    if (T_ === "首次交易值" && T.dateCol && T.dateCol.has(c)) T.dateCol.add(head.length - 1);
    if (T_ === "落後k期" && T.dateCol && T.dateCol.has(c)) T.dateCol.add(head.length - 1);
    st.items.push(o);
  });
  const S = { ...(T.st || {}), dv: st };
  return { ...T, head, rows, desc, st: S, base, dv: sp };
}
const dpTable2 = (cfg, chk) => dpDerive(dpExtend(dpBuild(cfg, chk, "day", true), cfg), cfg);
const dpHead0 = (cfg, chk) => dpExtend(dpBuild(cfg, { ...chk, k: Math.min(chk.k, 1) }, "day", true), cfg).head;   // 衍生變數之前的輸出欄位
function dpDvLog(cfg) {
  const L = [], sp = dpDvParse(dpDvText(cfg), DP.chk ? dpHead0(cfg, DP.chk) : []), S = DP.extStat && DP.extStat.dv, fmtN = x => x.toLocaleString("en-US");
  if (!sp.items.length) return L;
  L.push(`衍生變數（依 0.4「資料字典與分析樣本」的衍生變數計算規格${cfg.dvTxt != null ? "，並在 panel 資料處理修改" : ""}）：` + sp.order.map(it => `${it.name}＝${dpDvRule(it)}`).join("；"));
  L.push("　過去與落後類變數一律不含當天；資料只含有交易的日子，「前一期」為前一次交易日，「過去 N 天」以日曆天計算；組內、組間的個人平均以輸出資料中該人所有交易日計算，空白不列入");
  if (S) {
    if (S.trunc.length) L.push(cfg.coh ? "　時間窗：樣本只含首次交易在起日之後的人，起日之前沒有交易，時間窗不受觀察期間起日影響"
      : "　時間窗涵蓋觀察期間起日之前（起日之前的交易不在資料中，以下各筆的過去期間不完整）：" + S.trunc.map(([v, N, k]) => `${v}（${N} 天）${fmtN(k)} 筆`).join("、"));
    S.items.filter(o => o.nonNum).forEach(o => L.push(`　${o.name}：來源欄有 ${fmtN(o.nonNum)} 個非數值的內容，視為空白`));
    S.items.filter(o => o.neg).forEach(o => L.push(`　${o.name}：首次交易日晚於交易日 ${fmtN(o.neg)} 筆（年資為負值）`));
  }
  const sk = sp.items.filter(it => it.skip); if (sk.length) L.push("　無法計算、未產生：" + sk.map(it => `${it.name || "（未命名）"}${it.note ? `（${it.note}）` : ""}`).join("；"));
  return L;
}

// ── 處理紀錄（文字）──
function dpLogLines(cfg, chk) {
  const L = [], fmtN = x => x.toLocaleString("en-US");
  L.push(`原始檔案：${DP.name}${DP.sheets.length > 1 ? `（工作表：${DP.sheets[DP.sheet].name}）` : ""}`);
  if (cfg.from != null || cfg.to != null) L.push(`樣本期間：${cfg.from != null ? dpFmt(cfg.from) + " 起" : ""}${cfg.from != null && cfg.to != null ? "，" : ""}${cfg.to != null ? "至 " + dpFmt(cfg.to) + " 止" : ""}`);
  if (chk.excl) L.push(`樣本資格：排除 ${fmtN(chk.excl.ids)} 人（` + chk.excl.rules.map(x => `${x.col} 曾為「${x.vals.join("、")}」${fmtN(x.n)} 人`).join("；") + "；依檔案中所有交易判斷）");
  if (chk.coh) L.push(`樣本對象：首次交易在 ${dpFmt(cfg.from)}（含）之後的人（首次交易依據：${chk.coh.by ? chk.coh.by + " 欄" : `檔案中最早的交易日，檔案自 ${dpFmt(chk.coh.fileMin)} 起`}）；排除 ${fmtN(chk.coh.dropIds)} 人`);
  L.push(`讀入 ${fmtN(chk.rows)} 列；排除 ${fmtN(chk.bad.id.length + chk.bad.date.length + (chk.outN || 0) + (chk.excl ? chk.excl.rows : 0) + (chk.coh ? chk.coh.dropRows : 0))} 列（缺少代碼 ${fmtN(chk.bad.id.length)}、日期無法解析 ${fmtN(chk.bad.date.length)}${chk.excl ? `、樣本資格排除者 ${fmtN(chk.excl.rows)}` : ""}${chk.coh ? `、首次交易早於起日者 ${fmtN(chk.coh.dropRows)}` : ""}${chk.outN ? `、樣本期間外 ${fmtN(chk.outN)}` : ""}）；納入 ${fmtN(chk.k)} 列，${fmtN(chk.ids)} 人`);
  L.push(`觀察期間：${dpFmt(chk.dmin)} 至 ${dpFmt(chk.dmax)}`);
  L.push(`代碼欄：${cfg.id}；日期：${cfg.dmode === "one" ? `${cfg.dcol}${cfg.ychk ? `（以 ${cfg.y}／${cfg.m}／${cfg.d} 核對，不一致 ${fmtN(chk.ymdBad.length)} 列）` : ""}` : `${cfg.y}／${cfg.m}／${cfg.d}`}`);
  if (cfg.tot && cfg.parts.length) L.push(`總額核對：${cfg.tot} ＝ ${cfg.parts.join("＋")}，不一致 ${fmtN(chk.totBad.length)} 列`);
  const vNote = h => { const o = (cfg.valid || {})[h], ex = o ? dpExList(o.ex) : []; if (cfg.roles[h] !== "take" || !cfg.res[h] || !o || (!o.tw && !ex.length)) return "";
    return `（不一致時，${[o.tw ? "不在台灣 22 縣市內的值" : "", ex.length ? "「" + ex.join("、") + "」" : ""].filter(Boolean).join("與")}由當天其他的值取代，交易與金額照常計入）`; };
  L.push("欄位處理：" + DP.head.filter(h => cfg.roles[h]).map(h => `${h}＝${cfg.roles[h] === "take" ? (cfg.res[h] === "wt" ? `依 ${(cfg.wt || {})[h] || "money"} 的金額決定（取當天金額合計最大的值）` : cfg.res[h] === "near" ? `依前後 ${(cfg.near || {})[h] ?? 30} 天的交易判斷（取前後期間出現次數最多的值）` : cfg.res[h] ? DP_RES.find(x => x[0] === cfg.res[h])[1] : "取值（無不一致）") : DP_ROLE[cfg.roles[h]]}${vNote(h)}`).join("；"));
  dpLevels(cfg).forEach(lv => { const o = chk.conf[lv], c = Object.entries(o.cols).filter(([h, x]) => x.n && cfg.roles[h] === "take");
    L.push(`${DP_LV[lv]}：${fmtN(o.groups)} 筆（含多筆交易者 ${fmtN(o.multi)} 筆）${c.length ? "；不一致：" + c.map(([h, x]) => `${h} ${fmtN(x.n)} 筆`).join("、") : ""}`); });
  if (cfg.pcol) { const tg = dpTargets(cfg);
    L.push(`寬格式展開：${cfg.pcol} 的各個值 → ${cfg.pval ? cfg.pval + " 加總" : "筆數"}；` + tg.map(t => `${t}＝${Object.keys(cfg.pmap).filter(v => (cfg.pmap[v] || "").trim() === t).map(v => v || "（空白）").join("＋")}`).join("；"));
    const skip = Object.keys(cfg.pmap).filter(v => !(cfg.pmap[v] || "").trim()); if (skip.length) L.push(`未納入寬格式：${skip.map(v => v || "（空白）").join("、")}`); }
  dpExtLog(cfg).forEach(x => L.push(x));
  dpDvLog(cfg).forEach(x => L.push(x));
  return L;
}
function dpExtLog(cfg) {
  const L = [], fmtN = x => x.toLocaleString("en-US"), A = dpActs(cfg), S = DP.extStat;
  if (A.list.length) L.push(`活動期間（來源：${cfg.actSrc || "未填"}；全國一致，起迄日都包含在內）：` + A.list.map(a => `${a.v}＝${a.name}${a.ab ? "（簡稱：" + a.ab + "）" : ""}（${dpFmt(a.from)} 至 ${dpFmt(a.to)}）`).join("；"));
  if (A.list.length) { const o = dpAeCfg(cfg), EA = dpEvActs(cfg), S = EA.filter(a => dpEvKind(cfg, a) === "s").map(a => a.v), G = EA.filter(a => dpEvKind(cfg, a) === "l").map(a => a.v);
    if (S.length) L.push(`模型用的事件變數（短期：${S.join("、")}）：起日前 ${o.ewb} 週至起日後 ${o.ewa} 週，每週一個指示變數（每 7 天一週，起日為第 0 週）。${DP_EVREF.s}`);
    if (G.length) L.push(`模型用的事件變數（長期：${G.join("、")}）：_s 起日後為 1、_t 起日後天數；迄日早於資料最後一天者另加 _e 迄日後為 1、_et 迄日後天數。${DP_EVREF.l}`);
    L.push(`時間控制：輸出含 time（線性時間趨勢，樣本第一天為 1）與 dow（星期幾）。${DP_EVREF.t}`); }
  if (A.list.length && DP.chk) { const o = dpAeCfg(cfg), kp = dpAeScreen(cfg, DP.chk).filter(r => r.keep);
    if (kp.length) L.push(`活動初步評估：以起日為事件日，比較起日前後同樣天數的窗口（天數 ${o.cut} 天以內預設為短期，前後各 ${o.short} 天；長期各 ${o.long} 天）；前一年同期為 ${DP_LY} 天前的同一段日期（星期幾一致）；保留的活動依日期資訊篩選，不看捐款資料：` +
      kp.map(r => `${r.a.v}（${r.kind === "s" ? "短期" : "長期"}${r.cty ? "，" + r.cty : ""}${r.exact ? "" : "，起日未確定"}）`).join("、") + `；Y 以每日彙總計算（Y1＝${dpAeYlab(cfg)}的每日合計，Y2＝每日捐款人數，另列首次捐款人數），沒有交易的日子為 0${kp.some(r => r.cty) ? "；地區活動比較該縣市與其他縣市" : ""}`); }
  (cfg.ext || []).forEach((e, i) => {
    const ix = DP.ext[i] ? dpExtIx(i) : null; if (!ix) { if (e.file) L.push(`外部資料 ${i + 1}：${e.file}（本次未上傳，以下串接結果不含此檔）`); return; }
    const o = ix.st, by = o.by ? `依日期與縣市（本資料的 ${e.key} 欄）串接` : "依日期串接（全國一致）";
    L.push(`外部資料 ${i + 1}：${e.file}；來源：${e.src}（${e.url}，取得日期 ${String(e.got || "").replace(/-/g, "/")}）；${by}；` +
      `${o.wide ? `寬格式（各縣市一欄）→ ${ix.vars[0].v}` : ix.vars.map(v => `${v.v}＝${v.h}`).join("、")}；外部檔日期 ${dpFmt(o.dmin)} 至 ${dpFmt(o.dmax)}` +
      `${o.by ? "；縣市名稱統一台／臺，舊縣名換為現行縣市（如臺北縣→新北市）" : ""}；同一日期${o.by ? "與縣市" : ""}有多筆時數值取平均`);
    if (o.T) L.push(`　「T」（微量）${fmtN(o.T)} 筆，視為 0`);
    if (o.X) L.push(`　「X」（儀器故障）${fmtN(o.X)} 筆：同一${o.by ? "縣市" : "日期"}當天有其他有效值時取有效值的平均；${o.by ? `某縣市當天全部為 X 時，以距離最近的縣市（依縣市政府所在地的距離）同一天的值取代（${fmtN(o.filled)} 筆${o.fillBy.size ? "；" + [...o.fillBy].map(([a, b]) => `${a}以${b}取代`).join("、") : ""}）；` : ""}其餘 ${fmtN(o.gaps.length)} 段維持缺漏` +
      (o.gaps.length ? "，例：" + o.gaps.slice(0, 5).map(g => `${g.k} ${g.v} ${dpFmt(g.from)}–${dpFmt(g.to)}（${g.days} 天，${g.why}）`).join("；") + "（完整清單見「檢查明細」工作表）" : ""));
    if (o.other.size) L.push(`　其他非數值代碼視為缺漏：` + [...o.other].map(([k, n]) => `「${k}」${fmtN(n)} 筆`).join("、"));
    if (o.unk.size) L.push(`　縣市名稱無法對應、未納入：` + [...o.unk].slice(0, 10).map(([k, n]) => `${k} ×${fmtN(n)}`).join("、"));
    const r = S && S.ext[i]; if (r) L.push(`　串接結果：對上 ${fmtN(r.ok)} 筆；外部檔日期範圍外 ${fmtN(r.out)} 筆${o.by ? `；當天沒有縣市 ${fmtN(r.noC)} 筆` : ""}；範圍內但對不上 ${fmtN(r.miss)} 筆（以上皆為缺漏）` +
      (r.keys.size ? "，例：" + [...r.keys].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => `${k} ×${fmtN(n)}`).join("、") : ""));
  });
  return L;
}
function dpDetailRows(cfg, chk) {
  const rows = [["類別", "層級", "代碼", "期間或列號", "欄位", "內容"]];
  dpLevels(cfg).forEach(lv => Object.entries(chk.conf[lv].cols).filter(([h]) => cfg.roles[h] === "take").forEach(([h, x]) => x.ex.forEach(e => rows.push(["文字不一致（例）", DP_LV[lv], e.id, e.per, h, e.vals.map(([v, n]) => `${v} ×${n}`).join("、")]))));
  const xr = i => i + 2;   // Excel 列號（第 1 列是標題）
  chk.bad.id.slice(0, 2000).forEach(i => rows.push(["排除：缺少代碼", "", "", xr(i), cfg.id, ""]));
  chk.bad.date.slice(0, 2000).forEach(i => rows.push(["排除：日期無法解析", "", String(DP.rows[i][DP.head.indexOf(cfg.id)] ?? ""), xr(i), cfg.dmode === "one" ? cfg.dcol : "年月日", String(cfg.dmode === "one" ? DP.rows[i][DP.head.indexOf(cfg.dcol)] ?? "" : "")]));
  chk.ymdBad.slice(0, 2000).forEach(([i, a, b]) => rows.push(["日期與年月日不一致", "", String(DP.rows[i][DP.head.indexOf(cfg.id)]), xr(i), `${cfg.dcol}／${cfg.y}${cfg.m}${cfg.d}`, `${dpFmt(a)}／${b == null ? "無效日期" : dpFmt(b)}`]));
  (cfg.ext || []).forEach((e, i) => { const ix = DP.ext[i] ? dpExtIx(i) : null; if (ix) ix.st.gaps.forEach(g => rows.push(["外部資料：X 維持缺漏", "", g.k, `${dpFmt(g.from)}–${dpFmt(g.to)}`, g.v, `${e.file}，${g.days} 天，${g.why}`])); });
  chk.totBad.slice(0, 2000).forEach(([i, t, s]) => rows.push(["總額不一致", "", String(DP.rows[i][DP.head.indexOf(cfg.id)]), xr(i), cfg.tot, `${cfg.tot}＝${t}；細項合計＝${s}`]));
  return rows;
}

// ── 輸出：xlsx（共用字串、日期格式、凍結標題列）與 CSV（UTF-8 BOM）──
const dpCL = c => { let s = ""; c++; while (c) { const r = (c - 1) % 26; s = String.fromCharCode(65 + r) + s; c = Math.floor((c - 1) / 26); } return s; };
const dpX = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
// 壓縮成 zip：用瀏覽器內建的 CompressionStream 邊產生邊壓縮（大檔快很多，也不必把整份 XML 留在記憶體）
const DP_CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const dpCrc = (crc, u8) => { let c = crc ^ -1; for (let i = 0; i < u8.length; i++) c = DP_CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return c ^ -1; };
async function dpZipFile(name, gen) {   // gen(push)：逐段送出字串
  const enc = new TextEncoder(), cs = new CompressionStream("deflate-raw"), w = cs.writer || cs.writable.getWriter(), got = new Response(cs.readable).arrayBuffer();
  let crc = 0, size = 0, buf = "";
  const flush = async () => { if (!buf) return; const u = enc.encode(buf); buf = ""; crc = dpCrc(crc, u); size += u.length; await w.write(u); };
  await gen(async s => { buf += s; if (buf.length > 1 << 20) await flush(); });
  await flush(); await w.close();
  return { name, crc: crc >>> 0, size, data: new Uint8Array(await got) };
}
function dpZipPack(files) {
  const enc = new TextEncoder(), out = [], cd = []; let off = 0;
  const h = (n, b) => { const a = new Uint8Array(b); const v = new DataView(a.buffer); return [a, v]; };
  files.forEach(f => {
    const nm = enc.encode(f.name), [L, v] = h(0, 30);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, 8, true); v.setUint16(12, 0x21, true);
    v.setUint32(14, f.crc, true); v.setUint32(18, f.data.length, true); v.setUint32(22, f.size, true); v.setUint16(26, nm.length, true);
    out.push(L, nm, f.data);
    const [C, c] = h(0, 46);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 8, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, f.crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.size, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cd.push(C, nm); off += 30 + nm.length + f.data.length;
  });
  const cdSize = cd.reduce((a, x) => a + x.length, 0), [E, e] = h(0, 22);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return [...out, ...cd, E];
}
async function dpXlsx(sheets, onProg) {
  const sst = new Map(), sid = s => { let i = sst.get(s); if (i === undefined) { i = sst.size; sst.set(s, i); } return i; };
  const X = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n', NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"', R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships", PK = "http://schemas.openxmlformats.org/package/2006/relationships";
  const files = [], total = sheets.reduce((a, s) => a + s.rows.length, 0) || 1; let done = 0;
  for (let k = 0; k < sheets.length; k++) {
    const sh = sheets[k], L = sh.head.map((_, c) => dpCL(c)), dc = sh.head.map((_, c) => !!(sh.dateCol && sh.dateCol.has(c)));
    files.push(await dpZipFile(`xl/worksheets/sheet${k + 1}.xml`, async push => {
      await push(`${X}<worksheet ${NS}><sheetViews><sheetView workbookViewId="0"${k ? "" : ' tabSelected="1"'}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetData>`);
      await push(`<row r="1">${sh.head.map((h, c) => `<c r="${L[c]}1" t="s" s="2"><v>${sid(String(h))}</v></c>`).join("")}</row>`);
      for (let i = 0; i < sh.rows.length; i++) {
        const r = sh.rows[i], n = i + 2; let s = `<row r="${n}">`;
        for (let c = 0; c < r.length; c++) { const v = r[c]; if (v == null || v === "") continue;
          if (typeof v === "number") { if (isFinite(v)) s += dc[c] ? `<c r="${L[c]}${n}" s="1"><v>${v}</v></c>` : `<c r="${L[c]}${n}"><v>${v}</v></c>`; }
          else s += `<c r="${L[c]}${n}" t="s"><v>${sid(String(v))}</v></c>`; }
        await push(s + "</row>");
        if (onProg && ++done % 20000 === 0) await onProg(done / total);
      }
      await push("</sheetData></worksheet>");
    }));
  }
  const one = (name, text) => dpZipFile(name, push => push(text));
  files.push(await dpZipFile("xl/sharedStrings.xml", async push => { await push(`${X}<sst ${NS} count="${sst.size}" uniqueCount="${sst.size}">`); for (const s of sst.keys()) await push(`<si><t xml:space="preserve">${dpX(s)}</t></si>`); await push("</sst>"); }));
  files.push(await one("[Content_Types].xml", `${X}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>${sheets.map((_, k) => `<Override PartName="/xl/worksheets/sheet${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`));
  files.push(await one("_rels/.rels", `${X}<Relationships xmlns="${PK}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`));
  files.push(await one("xl/workbook.xml", `${X}<workbook ${NS} xmlns:r="${R}"><sheets>${sheets.map((s, k) => `<sheet name="${dpX(s.name.replace(/[\\\/?*\[\]:]/g, "_").slice(0, 31))}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join("")}</sheets></workbook>`));
  files.push(await one("xl/_rels/workbook.xml.rels", `${X}<Relationships xmlns="${PK}">${sheets.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${R}/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rId${sheets.length + 2}" Type="${R}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`));
  files.push(await one("xl/styles.xml", `${X}<styleSheet ${NS}><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy/mm/dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`));
  return new Blob(dpZipPack(files), { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function dpCSV(t) {
  const q = v => { if (v == null) return ""; const s = String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const parts = ["﻿" + t.head.map(q).join(",") + "\r\n"]; let buf = "";
  t.rows.forEach(r => { buf += r.map((v, c) => t.dateCol.has(c) && typeof v === "number" ? dpFmt(v) : q(v)).join(",") + "\r\n"; if (buf.length > 1 << 20) { parts.push(buf); buf = ""; } });
  parts.push(buf);
  return typeof Blob !== "undefined" ? new Blob(parts, { type: "text/csv;charset=utf-8" }) : parts.join("");
}

// ── 0.2 panel data：觀察單位、時間與資料欄位的帶入內容 ──
function dpSummary(cfg, chk) {
  const H = DP.head, dayX = dpDerive(dpExtend(dpBuild(cfg, { ...chk, k: Math.min(chk.k, 1) }, "day", true), cfg), cfg), dayT = dayX.head;
  const desc = h => {
    if (h === cfg.id) return `${h}：個人代碼`;
    if (dayX.desc[h]) return `${h}：${dayX.desc[h]}`;
    const o = { date: "date：日期", year: "year：年", month: "month：月", day: "day：日", n_tx: "n_tx：當日交易筆數" }[h]; if (o) return o;
    if (h.endsWith("_conflict")) return `${h}：${h.slice(0, -9)} 當日是否有不一致的值（0／1）`;
    const r = cfg.roles[h];
    if (r === "take") return `${h}：${DP.kind[H.indexOf(h)] === "text" ? "文字" : DP.kind[H.indexOf(h)] === "date" ? "日期" : "數值"}${cfg.res[h] ? `（同一天不一致時${DP_RES.find(x => x[0] === cfg.res[h])[1]}）` : ""}`;
    if (r) return `${h}：當日${DP_ROLE[r]}`;
    if (h.endsWith("_n")) return `${h}：當日 ${h.slice(0, -2)} 的交易筆數`;
    return `${h}：當日 ${cfg.pcol}＝${Object.keys(cfg.pmap).filter(v => (cfg.pmap[v] || "").trim() === h).join("＋")} 的 ${cfg.pval || "筆數"} 加總`;
  };
  return {
    unit: `個人（代碼欄 ${cfg.id}，共 ${chk.ids.toLocaleString("en-US")} 人${chk.excl ? `；已排除 ${chk.excl.rules.map(x => `${x.col} 曾為「${x.vals.join("、")}」`).join("或")}的人` : ""}${chk.coh ? `；只含首次交易在 ${dpFmt(cfg.from)} 之後的人` : ""}）`,
    time: `以日為單位，一人一日一筆（${chk.conf.day.groups.toLocaleString("en-US")} 筆，只含有交易的日子）；觀察期間 ${dpFmt(chk.dmin)} 至 ${dpFmt(chk.dmax)}`,
    fields: dayT.map(desc).join("\n"),
    base: dayX.base
  };
}


// ═══ 畫面 ═══
const dpTick = () => new Promise(r => setTimeout(r, 0));
const dpN = x => Number(x).toLocaleString("en-US");
const dpLvShort = { day: "人日", month: "人月", year: "人年", person: "人" };
const dpOpt = (list, cur, blankLabel) => (blankLabel != null ? `<option value="">${esc(blankLabel)}</option>` : "") + list.map(h => `<option value="${esc(h)}"${h === cur ? " selected" : ""}>${esc(h)}</option>`).join("");
const dpBase = () => DP.name.replace(/\.[^.]+$/, "") || "資料";
function dpBusy(t) { DP.busy = t; const el = document.getElementById("dpbusy"); if (el) { el.textContent = t; el.hidden = !t; } }
function dpCommit(recheck) {   // 設定變更：存進研究存檔（只有設定與摘要），必要時清除檢查結果
  if (recheck) DP.chk = null;
  if (DP.cfg && DP.cfg.pcol) DP.cfg.roles[DP.cfg.pcol] = "drop";   // 展開成寬格式的欄位不再當作「取值」欄，不檢查不一致
  store.values.dp_cfg = DP.cfg;
  if (DP.chk && !dpNeed(DP.cfg, DP.chk).length) store.values.dp_sum = dpSummary(DP.cfg, DP.chk);
  if (DP.chk) store.values.dp_log = dpLogText();   // 處理紀錄存進研究存檔，下次開啟不必重新處理也看得到
  setTimeout(update, 0);   // 等目前的事件結束再重畫，避免輸入框失去焦點時重複重畫
}
function dpView() {
  const c = DP.cfg, H = DP.head, K = DP.kind;
  let h = `<div class="dp"><fieldset class="struct"><legend>1. 上傳原始資料</legend>
    <p class="hint">支援 .xlsx 與 .csv（UTF-8 或 Big5 皆可），一列一筆交易的長格式資料。資料只在這台電腦的瀏覽器處理，不會上傳；研究存檔只記住欄位設定與處理摘要，下次上傳同樣欄位的檔案會自動套用。建議大小：xlsx 約 50 MB、CSV 約 200 MB 以內；.xls 請先在 Excel 另存為 .xlsx 或 CSV。</p>
    <input type="file" data-dp="file" accept=".xlsx,.xlsm,.csv,.txt">
    <div class="note" id="dpbusy"${DP.busy ? "" : " hidden"}>${esc(DP.busy)}</div>${DP.err ? `<div class="note warn">${esc(DP.err)}</div>` : ""}${DP.msg ? `<div class="note">${esc(DP.msg)}</div>` : ""}
    ${!H.length && store.values.dp_log ? `<p class="hint">這份研究上次的處理紀錄在本頁最下方，可展開檢視；要重新輸出資料，請再上傳原始檔案（欄位設定會自動套用）。</p>` : ""}
    ${H.length ? `<p class="dpinfo">已讀入 <b>${esc(DP.name)}</b>${DP.sheets.length > 1 ? `，工作表 <select data-dp="sheet">${DP.sheets.map((x, k) => `<option value="${k}"${k === DP.sheet ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}：${dpN(DP.rows.length)} 列、${H.length} 欄</p>` : ""}</fieldset>`;
  if (!H.length || !c) return h + "</div>";
  const keys = dpKeys(c), numH = H.filter((_, i) => K[i] !== "text"), ex = i => { const u = []; for (const r of DP.rows) { const v = r[i]; if (v != null && !u.includes(v)) u.push(v); if (u.length >= 3) break; } return u.map(v => K[i] === "date" && typeof v === "number" ? dpFmt(v) : String(v)).join("、"); };
  const kindT = { text: "文字", num: "數值", date: "日期" };
  h += `<fieldset class="struct"><legend>2. 欄位設定</legend>
    <div class="dprow"><label>個人代碼欄 <select data-dp="id">${dpOpt(H, c.id)}</select></label></div>
    <div class="dprow"><span>日期</span>
      <label class="chip"><input type="radio" name="dpdm" data-dp="dmode" value="one"${c.dmode === "one" ? " checked" : ""}>單一欄位</label>
      <select data-dp="dcol"${c.dmode === "one" ? "" : " disabled"}>${dpOpt(H, c.dcol, "（請選擇）")}</select>
      <label class="chip"><input type="radio" name="dpdm" data-dp="dmode" value="ymd"${c.dmode === "ymd" ? " checked" : ""}>年、月、日三欄</label>
      <select data-dp="y">${dpOpt(H, c.y, "年")}</select><select data-dp="m">${dpOpt(H, c.m, "月")}</select><select data-dp="d">${dpOpt(H, c.d, "日")}</select>
      ${c.dmode === "one" && c.y && c.m && c.d ? `<label class="chip"><input type="checkbox" data-dp="ychk"${c.ychk ? " checked" : ""}>以年、月、日三欄核對日期</label>` : ""}</div>
    <div class="dprow"><span>樣本期間</span><label>起 <input type="date" data-dp="from" value="${c.from != null ? dpFmt(c.from).replace(/\//g, "-") : ""}"></label><label>迄 <input type="date" data-dp="to" value="${c.to != null ? dpFmt(c.to).replace(/\//g, "-") : ""}"></label>
      ${c.from != null ? `<label class="chip"><input type="checkbox" data-dp="coh"${c.coh ? " checked" : ""}>只保留首次交易在起日（含）之後的人</label>
      ${c.coh ? `<label>首次交易依據 <select data-dp="cohCol"><option value="">檔案中最早的交易日</option>${H.filter((x, i) => K[i] === "date" && !keys.has(x)).map(x => `<option value="${esc(x)}"${x === c.cohCol ? " selected" : ""}>${esc(x)} 欄</option>`).join("")}</select></label>` : ""}` : ""}</div>
    <p class="hint">樣本期間留白表示不限。期間外的交易不納入，也不用於「依前後幾天的交易判斷」。勾選「只保留首次交易在起日（含）之後的人」時，首次交易早於起日的人整個排除（包括他們在起日之後的交易）；首次交易日可依檔案中每人最早的交易日判斷，或依資料裡的日期欄（例如首次捐款日）判斷，該欄空白時改用最早交易日。日期可以是 Excel 日期序號（例如 45943＝2025/10/13）、日期格式的儲存格、20251013、114/10/13 或 2025/10/13；年份小於 1000 視為民國年。</p>
    ${(() => { const tx = H.filter((x, i) => K[i] === "text" && !keys.has(x)), ex = c.excl || [];
      return `<details class="dpsub"${ex.length ? " open" : ""}><summary>樣本資格：排除特定的人（選用）</summary>
      <p class="hint">只要曾有一筆交易的某個欄位是勾選的值，這個人的所有交易都排除（例如：排除曾在離島或金馬捐款的人）。依檔案中所有交易判斷，不受樣本期間限制；台、臺 視為相同。可新增多個條件，符合任一條件即排除。</p>
      ${ex.map((x, q) => { const uv = dpUV(x.col), tw = uv.some(([v]) => dpIsTW(v)), on = new Set(x.vals || []);
        return `<div class="dpconf"><div class="dprow"><label>排除曾有 <select data-dpexcol="${q}">${dpOpt(tx, x.col, "（請選擇欄位）")}</select> 為下列值之交易的人</label>
          ${tw ? `<button type="button" data-dpexq="${q}|island">勾選離島（澎湖、金門、連江）</button><button type="button" data-dpexq="${q}|km">勾選金馬（金門、連江）</button>` : ""}
          <button type="button" data-dpexdel="${q}">刪除這個條件</button></div>
          ${x.col ? `<div class="chips">${uv.slice(0, 120).map(([v, n]) => `<label class="chip"><input type="checkbox" data-dpexv="${q}" value="${esc(v)}"${on.has(v) ? " checked" : ""}>${esc(v)} <small>×${dpN(n)}</small></label>`).join("")}</div>${uv.length > 120 ? `<p class="hint">值超過 120 種，只列出次數最多的 120 種。</p>` : ""}` : ""}</div>`; }).join("")}
      <p><button type="button" data-dpexadd="1">新增排除條件</button></p></details>`; })()}
    <table class="dptbl"><thead><tr><th>欄位</th><th>型態</th><th>前幾個值</th><th>同一人同一天有多筆時的計算方式</th></tr></thead><tbody>${H.map((x, i) => `<tr${keys.has(x) ? ' class="key"' : ""}><td>${esc(x)}</td><td>${kindT[K[i]]}</td><td class="ex">${esc(ex(i))}</td><td>${keys.has(x) ? (x === c.id ? "個人代碼" : c.dmode === "one" && x !== c.dcol ? "核對日期用" : "日期") : x === c.pcol ? "展開成寬格式（見步驟 3）" :
      `<select data-dprole="${esc(x)}">${Object.entries(DP_ROLE).filter(([r]) => K[i] === "text" ? ["take", "drop"].includes(r) : true).map(([r, t]) => `<option value="${r}"${c.roles[x] === r ? " selected" : ""}>${t}</option>`).join("")}</select>`}</td></tr>`).join("")}</tbody></table>
    <p class="hint">輸出為一人一日一筆：同一人同一天有多筆交易時，數值欄依這裡的設定加總、平均或取最大、最小值。預設值只是建議：數值欄預設加總；每人固定不變的欄位（例如首次捐款日）與文字欄預設「取值」，同一期間出現不同的值時會示警，由你選擇處理方式；看起來像單號的欄位預設刪除；不需要的變數也設為「刪除（不輸出）」。</p>
    <details class="dpsub"${c.tot ? " open" : ""}><summary>總額核對（選用）</summary><p class="hint">原始資料已有總額與細項（例如 mtotal 與 money1–money5）時，逐列核對總額是否等於細項合計，不一致時示警。</p>
      <label>總額欄 <select data-dp="tot">${dpOpt(numH, c.tot, "（不核對）")}</select></label>
      ${c.tot ? `<div class="chips">${numH.filter(x => x !== c.tot).map(x => `<label class="chip"><input type="checkbox" data-dppart="${esc(x)}"${c.parts.includes(x) ? " checked" : ""}>${esc(x)}</label>`).join("")}</div>` : ""}</details>
    ${DP.chk ? `<p><button type="button" class="copy" data-dp="check">重新檢查資料</button></p>` : ""}</fieldset>`;
  const k = DP.chk;
  if (!k) return h + `<p class="note">設定欄位後，按「檢查資料」。</p><p><button type="button" class="copy" data-dp="check">檢查資料</button></p></div>`;
  const w = [];
  if (k.bad.id.length) w.push(`缺少個人代碼 ${dpN(k.bad.id.length)} 列，已排除（Excel 列號：${k.bad.id.slice(0, 8).map(i => i + 2).join("、")}${k.bad.id.length > 8 ? "…" : ""}）`);
  if (k.excl) w.push(`樣本資格：排除 ${dpN(k.excl.ids)} 人（${dpN(k.excl.rows)} 列）。` + k.excl.rules.map(x => `${x.col} 曾為「${x.vals.join("、")}」：${dpN(x.n)} 人`).join("；"));
  if (k.coh) { const o = k.coh;
    w.push(`首次交易早於 ${dpFmt(c.from)} 的 ${dpN(o.dropIds)} 人（${dpN(o.dropRows)} 列）已整個排除；首次交易在 ${dpFmt(c.from)} 之後的有 ${dpN(o.ids - o.dropIds)} 人（依據：${o.by ? o.by + " 欄" : "檔案中最早的交易日"}）`);
    if (!o.by && o.fileMin >= c.from) w.push(`檔案最早的交易日是 ${dpFmt(o.fileMin)}，不早於起日，無法分辨誰在起日之前已有交易，所有人都會被保留`);
    else if (!o.by) w.push(`檔案最早的交易日是 ${dpFmt(o.fileMin)}：首次交易在起日之後，指的是 ${dpFmt(o.fileMin)} 起的檔案中沒有更早的交易；更早以前是否捐過，這份檔案無法判斷`);
    if (o.by && o.misN) w.push(`${o.by} 與檔案中最早的交易日不同 ${dpN(o.misN)} 人（以 ${o.by} 為準），例：` + o.mis.map(([id, a, b]) => `${id} ${dpFmt(a)}／${dpFmt(b)}`).join("；"));
    if (o.by && o.noCol) w.push(`${o.by} 空白 ${dpN(o.noCol)} 人，改用檔案中最早的交易日`); }
  if (k.outN) w.push(`樣本期間（${c.from != null ? dpFmt(c.from) : "不限"} 至 ${c.to != null ? dpFmt(c.to) : "不限"}）外 ${dpN(k.outN)} 列，未納入`);
  if (k.bad.date.length) w.push(`日期無法解析 ${dpN(k.bad.date.length)} 列，已排除（Excel 列號：${k.bad.date.slice(0, 8).map(i => i + 2).join("、")}${k.bad.date.length > 8 ? "…" : ""}）`);
  if (k.ymdBad.length) w.push(`${c.dcol} 與年、月、日三欄不一致 ${dpN(k.ymdBad.length)} 列（以 ${c.dcol} 為準），例：` + k.ymdBad.slice(0, 3).map(([i, a, b]) => `第 ${i + 2} 列 ${dpFmt(a)}／${b == null ? "無效日期" : dpFmt(b)}`).join("；"));
  if (k.totBad.length) w.push(`${c.tot} 不等於細項合計 ${dpN(k.totBad.length)} 列，例：` + k.totBad.slice(0, 3).map(([i, t, s]) => `第 ${i + 2} 列 ${dpN(t)}／${dpN(s)}`).join("；"));
  Object.entries(k.nonNum).forEach(([x, n]) => w.push(`${x} 有 ${dpN(n)} 個非數值的內容，計算時視為空白`));
  h += `<fieldset class="struct"><legend>3. 檢查結果與處理方式</legend>
    <p>納入 ${dpN(k.k)} 列交易、${dpN(k.ids)} 人，期間 ${dpFmt(k.dmin)} 至 ${dpFmt(k.dmax)}；一人一日 ${dpN(k.conf.day.groups)} 筆，其中 ${dpN(k.conf.day.multi)} 筆由同一天的多筆交易合併。</p>
    ${w.length ? `<div class="note warn">${w.map(esc).join("\n")}</div>` : `<p class="hint">代碼與日期都沒有問題。</p>`}
`;
  // 寬格式：展開文字欄的各個值
  const textH = H.filter((x, i) => K[i] === "text" && !keys.has(x));
  h += `<div class="dpsub"><b>寬格式展開（選用）</b><div class="dprow"><label>展開欄位 <select data-dp="pcol">${dpOpt(textH, c.pcol, "（不展開）")}</select></label>
      ${c.pcol ? `<label>數值 <select data-dp="pval">${dpOpt(numH.filter(x => !keys.has(x)), c.pval, "（只計筆數）")}</select></label><label class="chip"><input type="checkbox" data-dp="pcnt"${c.pcnt ? " checked" : ""}>同時輸出各欄的交易筆數</label>` : ""}</div>`;
  if (c.pcol) {
    const pv = DP.pv || [];
    h += `<p class="hint">每個值展開成一欄，內容為當天${c.pval ? ` ${esc(c.pval)} 的加總` : "的筆數"}。要合併的值填相同的欄名（例如「長照基金50」填「長照基金」）；欄名留白則不納入寬格式。欄名全部以數字結尾（例如 money1–money5）時依編號排列，否則依下表順序。</p>
      <table class="dptbl"><thead><tr><th>${esc(c.pcol)} 的值</th><th>筆數</th>${c.pval ? `<th>${esc(c.pval)} 合計</th>` : ""}<th>寬格式欄名<br><small>要合併的值填相同名稱；留白則不納入</small></th></tr></thead><tbody>${pv.map(x => `<tr><td>${esc(x.v || "（空白）")}</td><td class="r">${dpN(x.n)}</td>${c.pval ? `<td class="r">${dpN(x.s)}</td>` : ""}<td><input type="text" data-dpmap="${esc(x.v)}" value="${esc((c.pmap || {})[x.v] ?? "")}"></td></tr>`).join("")}</tbody></table>
      <p class="hint" id="dptg">展開後的欄位：${esc(dpTargets(c).join("、") || "（無）")}</p>`;
  }
  h += `</div>`;
  // 不一致的文字欄位
  const lvs = dpLevels(c), cc = k.take.filter(x => c.roles[x] === "take" && lvs.some(lv => k.conf[lv].cols[x].n));
  h += `<div class="dpsub"><b>同一天的值不一致</b>` + (!cc.length ? `<p class="hint">設為「取值」的欄位，同一人同一天的值都一致。</p>` :
    `<p class="hint">以下欄位在同一人同一天出現不同的值，請逐一選擇處理方式（空白不列入比較）；選好之後才能輸出。「依前後幾天的交易判斷」適合居住地區這類會維持一段期間的欄位：從當天出現的值中，取這個人前後 N 天（含當天）交易裡出現次數最多者；同分時取前 N 天出現較多者，再相同則取當天之前最近一筆交易的值。「依某數值欄的金額決定」適合付款方式這類欄位：每個值加總當天該值各筆交易的金額，取合計最大者；相同時取當天第一筆。文字欄可勾選「只採用台灣 22 縣市」或填「不採用的值」（例如：其他）：同一天的值不一致時，這些值由當天其他的值取代，也就是只在其他的值之中依上方的處理方式判斷；這些交易與金額照常計入，不會刪除。當天只有不採用的值、沒有其他的值可取代時，保留原值。</p>` + cc.map(x => {
      const exs = lvs.flatMap(lv => k.conf[lv].cols[x].ex.slice(0, 5).map(e => `${e.id}｜${e.per}：${e.vals.map(([v, n]) => `${K[H.indexOf(x)] === "date" && typeof v === "number" ? dpFmt(v) : v} ×${n}`).join("、")}`));
      return `<div class="dpconf${c.res[x] ? "" : " todo"}"><div><b>${esc(x)}</b>　${dpN(k.conf.day.cols[x].n)} 個人日不一致</div>
        <div class="ex">${exs.map(esc).join("<br>")}</div>
        <div class="chips">${DP_RES.map(([r, t]) => `<label class="chip"><input type="radio" name="dpres-${esc(x)}" data-dpres="${esc(x)}" value="${r}"${c.res[x] === r ? " checked" : ""}>${t}</label>`).join("")}
        ${c.res[x] === "wt" ? `<label class="chip">數值欄 <select data-dpwt="${esc(x)}">${dpOpt(numH.filter(z => !keys.has(z)), (c.wt || {})[x] || (H.includes("money") ? "money" : ""), "（請選擇）")}</select></label>` : ""}
        ${c.res[x] === "near" ? `<label class="chip">前後 <input type="number" min="0" max="3650" step="1" data-dpnear="${esc(x)}" value="${esc((c.near || {})[x] ?? 30)}" style="width:5em"> 天</label>` : ""}
        <button type="button" data-dpdrop="${esc(x)}">刪除這個變數</button></div>
        ${K[H.indexOf(x)] === "text" ? (() => { const o = (c.valid || {})[x] || {}, bad = o.tw ? (k.vals[x] || []).filter(([v]) => !dpIsTW(v)) : [];
          return `<div class="chips"><label class="chip"><input type="checkbox" data-dptw="${esc(x)}"${o.tw ? " checked" : ""}>只採用台灣 22 縣市</label>
          <label class="chip">不採用的值 <input type="text" data-dpex="${esc(x)}" value="${esc(o.ex || "")}" placeholder="例如：其他" style="width:10em"></label></div>
          ${o.tw ? `<div class="ex">${bad.length ? "不在 22 縣市內的值：" + bad.slice(0, 20).map(([v, n]) => `${esc(v)} ×${dpN(n)}`).join("、") + (bad.length > 20 ? "…" : "") : "所有值都是 22 縣市之一（台／臺 視為相同）。"}</div>` : ""}`; })() : ""}</div>`;
    }).join("")) + `</div></fieldset>`;
  h += dpExtView(c, k);
  h += dpDvView(c, k);
  // 輸出
  const need = dpNeed(c, k), blk = dpBlock(c, k);
  h += `<fieldset class="struct"><legend>6. 輸出</legend>`;
  if (need.length) h += `<div class="note warn">請先在上方選擇這些欄位的處理方式：${need.map(esc).join("、")}</div>`;
  if (blk.length) h += `<div class="note warn">${blk.map(esc).join("\n")}</div>`;
  h += `<p class="hint">輸出一人一日一筆的寬格式資料：每列含 id、date（Excel 日期格式）、year、month、day、n_tx（當天合併的交易筆數）、各欄位依上方設定計算的值${c.pcol ? "，以及展開後的欄位" : ""}${dpActs(c).list.length || (c.ext || []).length ? "，以及第 4 部分的活動期間與外部資料欄位" : ""}${dpDvParse(dpDvText(c), []).items.some(it => !it.skip) ? "，最後是第 5 部分的衍生變數" : ""}。只輸出有交易的日子，沒有交易的日子不補列。Excel 檔另含「處理紀錄」與「檢查明細」工作表；CSV 為 UTF-8（含 BOM），Excel、Stata、R、SPSS 都能讀取。已開啟研究資料夾時，檔案直接存進該資料夾（檔名前加研究名稱）；沒有開啟時下載到瀏覽器的下載資料夾。</p>
    <p class="dpbtns"><button type="button" class="copy" data-dpout="xlsx"${need.length || blk.length ? " disabled" : ""}>下載 Excel</button>
    <button type="button" data-dpout="wide"${need.length || blk.length ? " disabled" : ""}>下載 CSV</button></p>
    ${RT() === "model" ? `<p class="hint">0.2「資料結構與估計目標」的觀察單位、時間與資料欄位留白時，會自動帶入這裡的處理結果。</p>` : ""}</fieldset></div>`;
  return h;
}
// ── 活動初步評估：表一篩選（只用日期資訊，不看捐款資料）；表二 Y 比較與事件時間圖（只算保留的活動）──
const DP_LY = 364;   // 前一年同期：往前 52 週，星期幾一致
const dpAeCfg = c => { const o = c.ae ||= {}; o.short ??= 28; o.long ??= 182; o.cut ??= 90; o.ewb ??= 8; o.ewa ??= 8; o.keep ||= {}; o.kind ||= {}; o.exact ||= {}; o.cty ||= {}; o.cy ||= 0; return o; };
const dpAeKeyOf = a => a.name + "|" + dpFmt(a.from);
// 簡稱：AI 回覆的「簡稱」欄，可在活動清單修改（存於 actAb）；表二結果是計算當時的快照，簡稱改讀目前設定
const dpAbNow = a => { const o = (DP.cfg && DP.cfg.actAb) || {}, k = dpAeKeyOf(a); return k in o ? o[k] : (a.ab || ""); };
const dpAeCtyGuess = name => { for (const m of String(name).matchAll(/[（(]([^）)]+)[）)]/g)) { const k = dpCty(m[1]); if (DP_TW.has(k)) return k; } return ""; };
const DP_AEM = ["Y1 捐款總金額", "Y2 捐款人數", "首次捐款人數"];
function dpAeScreen(c, k) {
  const o = dpAeCfg(c);
  const rows = dpActs(c).list.map(a => { const key = dpAeKeyOf(a), days = a.to - a.from + 1, kind = o.kind[key] || (days <= o.cut ? "s" : "l"), W = kind === "s" ? o.short : o.long, dd = dpYMD(a.from)[2];
    return { a, key, days, kind, W, w0: a.from - W, w1: a.from + W - 1, rough: dd === 1, exact: key in o.exact ? !!o.exact[key] : dd !== 1,
      preOK: a.from - W >= k.dmin, postOK: a.from + W - 1 <= k.dmax, toEnd: a.to >= k.dmax, cty: key in o.cty ? o.cty[key] : dpAeCtyGuess(a.name), keep: !!o.keep[key] }; });
  rows.forEach(r => { r.ov = rows.filter(x => x !== r).map(x => [x.a.v, Math.min(r.w1, x.w1) - Math.max(r.w0, x.w0) + 1]).filter(x => x[1] > 0); });
  return rows;
}
// Y1 的來源：數值欄（加總、平均、最大、最小）或展開後各欄的合計
const dpAeYopts = c => [...(c.pcol ? [["__pv", `展開後各欄合計（${dpTargets(c).join("＋") || "無"}）`]] : []), ...DP.head.filter(h => ["sum", "mean", "max", "min"].includes(c.roles[h])).map(h => [h, h])];
const dpAeY = c => { const o = dpAeCfg(c), opt = dpAeYopts(c); if (opt.some(x => x[0] === o.y1)) return o.y1;
  const t = opt.find(x => x[0] !== "__pv" && /total|合計|總|金額|amount/i.test(x[0])); return (t || opt[0] || [null])[0]; };
const dpAeYlab = c => { const y = dpAeY(c); return y === "__pv" ? "展開後各欄合計" : y || "（未選）"; };
const dpAeStateKey = (c, k) => { const o = dpAeCfg(c); return JSON.stringify([o.short, o.long, o.cut, o.keep, o.kind, o.cty, dpAeY(c), o.ccol || dpCtyCols()[0] || "", dpActs(c).list, k.k, k.dmin, k.dmax]); };
function dpAeRun(c, k, T) {
  const o = dpAeCfg(c), H = T.head, rows = T.rows, di = H.indexOf("date"), yv = dpAeY(c), ccol = o.ccol || dpCtyCols()[0] || "";
  const yc = yv === "__pv" ? dpTargets(c).map(t => H.indexOf(t)).filter(x => x >= 0) : [H.indexOf(yv)].filter(x => x >= 0);
  let ci = H.indexOf(ccol); if (ci < 0 && ccol) ci = H.indexOf(ccol + "_原");
  const all = new Map(), byC = new Map(), add = (m, key, y, f) => { let e = m.get(key); if (!e) m.set(key, e = [0, 0, 0]); e[0] += y; e[1]++; e[2] += f; };
  for (let i = 0; i < rows.length; i++) { const r = rows[i], d = r[di], f = i === 0 || dpKey(r[0]) !== dpKey(rows[i - 1][0]) ? 1 : 0;
    const y = yc.reduce((a, j) => a + (typeof r[j] === "number" && isFinite(r[j]) ? r[j] : 0), 0);
    add(all, d, y, f); if (ci >= 0) { const q = dpCty(r[ci]); if (DP_TW.has(q)) { add(byC, d + "\u0001" + q, y, f); add(byC, d + "\u0001*", y, f); } } }
  const getAll = d => all.get(d), getC = q => d => byC.get(d + "\u0001" + q), getO = q => d => { const t = byC.get(d + "\u0001*"); if (!t) return null; const x = byC.get(d + "\u0001" + q) || [0, 0, 0]; return t.map((v, j) => v - x[j]); };
  const win = (g, s, e, W) => { if (s < k.dmin || e > k.dmax) return null; const t = [0, 0, 0]; for (let d = s; d <= e; d++) { const v = g(d); if (v) for (let j = 0; j < 3; j++) t[j] += v[j]; } return t.map(x => x / W); };
  const stat = (g, a0, W) => { const pre = win(g, a0 - W, a0 - 1, W), post = win(g, a0, a0 + W - 1, W), lpre = win(g, a0 - W - DP_LY, a0 - 1 - DP_LY, W), lpost = win(g, a0 - DP_LY, a0 + W - 1 - DP_LY, W);
    return [0, 1, 2].map(j => { const p = pre && pre[j], q = post && post[j], lp = lpre && lpre[j], lq = lpost && lpost[j], r1 = p > 0 && q != null ? q / p : null, r0 = lp > 0 && lq != null ? lq / lp : null;
      return { p, q, lp, lq, r1, r0, rr: r1 != null && r0 > 0 ? r1 / r0 : null }; }); };
  // 單日最高值（Y1）：今年與前一年同期的事前、事後窗口，各列最高 3 天與占窗口合計的比例
  const tops = (g, a0, W) => { const one = (s0, sh) => { const L = []; let tot = 0; for (let u = 0; u < W; u++) { const d = a0 + s0 + u - sh; if (d < k.dmin || d > k.dmax) return null; const v = g(d), y = v ? v[0] : 0; tot += y; L.push([s0 + u, y]); }
      return { tot, top: L.sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, y]) => ({ t, y, sh: tot > 0 ? y / tot : null })) }; };
    return { pre: one(-W, 0), post: one(0, 0), lpre: one(-W, DP_LY), lpost: one(0, DP_LY) }; };
  // 事件時間圖：短期逐日，長期每 7 天一點（每日平均）；今年與 364 天前同一段日期
  const series = (g, a0, W, step) => { const one = sh => { const out = []; for (let t = -W; t < W; t += step) { let s = [0, 0, 0], n = 0;
      for (let u = t; u < Math.min(t + step, W); u++) { const d = a0 + u - sh; if (d < k.dmin || d > k.dmax) { n = -1; break; } const v = g(d); if (v) for (let j = 0; j < 3; j++) s[j] += v[j]; n++; }
      out.push({ t, v: n > 0 ? s.map(x => x / n) : null }); } return out; }; return { cur: one(0), ly: one(DP_LY) }; };
  const res = dpAeScreen(c, k).filter(r => r.keep).map(r => { const a0 = r.a.from, step = r.kind === "s" ? 1 : 7;
    const scopes = r.cty ? [[r.cty, getC(r.cty)], ["其他縣市", getO(r.cty)]] : [["全國", getAll]];
    return { r, step, scopes: scopes.map(([nm, g]) => ({ nm, st: stat(g, a0, r.W), se: series(g, a0, r.W, step), top: tops(g, a0, r.W) })) }; });
  DP.ae = { key: dpAeStateKey(c, k), res, ylab: dpAeYlab(c), ccol: ci >= 0 ? ccol : "" };
  return DP.ae;
}
// 文獻寫法 Prompt（NotebookLM）：文獻如何解讀事件時間圖與事件前後比較
const DP_AELIT = [
  "請依據上傳文獻，整理文獻如何解讀「事件時間圖」（事件前後各期的數值或係數圖）與「事件前後窗口的比較」，作為我解讀描述性數據時的寫法依據。只能依據上傳文獻，未提及者寫「上傳文獻未提及」。",
  "",
  "請逐項說明，每項附出處（作者, 年份），並摘錄文獻中代表性的解讀句型（以中文轉述）：",
  "1. 解讀的順序：文獻先看什麼、再看什麼（例如事前是否平穩、事件當期的跳升、事後的持續或衰退、結束後的變化）。",
  "2. 事前期間：如何判斷事前沒有異常趨勢或提前反應，以及出現事前變化時如何描述。",
  "3. 效果的時間型態：如何描述效果集中在事件當期、持續一段時間、逐漸衰退、延遲出現，或回到原水準。",
  "4. 季節與時間趨勢：如何以前一年同期、對照組或時間趨勢說明變化是否來自季節或既有趨勢。",
  "5. 極端值：如何處理或描述少數幾期造成的高點（例如剔除、取對數、另外說明）。",
  "6. 描述性結果與正式估計的分際：文獻如何在圖形或前後比較的描述中避免因果用語，以及用哪些措辭。",
  "",
  "規則：以條列撰寫，不使用表格；用詞一律使用「變數」，不得使用「變項」。"
].join("\n");
// 解讀 Prompt（一般 AI）：表二、分段平均與單日最高值；回覆依「### act1 …」分節，顯示在各圖下方
function dpAeIntPrompt(c, ae) {
  const F = (x, d = 1) => x == null ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d }), P = x => x == null ? "—" : (x * 100).toFixed(1) + "%";
  const out = [
    "以下是一份捐款資料中，各活動起日前後的描述性數據。請依數據解讀每個活動前後的變化，供研究者判斷活動是否可能有效果。解讀的寫法必須依照最後「文獻的解讀寫法」：依其中的判讀項目、順序與用語撰寫，文獻未涵蓋的項目才依下方格式補充。",
    "",
    "數據說明：",
    `- Y1＝${ae.ylab}的每日合計；Y2＝每日捐款人數；首次捐款人數＝當天為此人在資料中第一個交易日的人數。沒有交易的日子為 0。`,
    "- 每個活動以起日為第 0 天，比較起日前與起日後同樣天數的窗口；「事前」「事後」為窗口內的每日平均。",
    `- 前一年同期為 ${DP_LY} 天前的同一段日期（星期幾一致），用來對照季節；「比值÷去年比值」大於 1 表示今年起日前後的變化大於去年同一段日期。`,
    "- 「分段平均」從起日往前、往後，每隔固定天數切成一段（各段不重疊，也不跨越起日；最前面一段可能較短），每段計算「該段每天捐款合計的平均」，也就是該段的每日平均，並列今年／前一年同期；不是移動平均。用來看變化集中在起日附近、持續，或延遲出現。",
    "- 「單日最高」列出 Y1 在窗口內最高的 3 天與占該窗口合計的比例，用來判斷變化是否主要來自少數幾天。",
    "- 樣本只含首次交易在樣本起日之後的人時，捐款人數會隨時間累積，事後÷事前會因此偏高，窗口越長越明顯。",
    "- 「—」表示窗口超出觀察期間或分母為 0。", ""];
  ae.res.forEach(x => x.scopes.forEach(sc => { const r = x.r, W = r.W, g = r.kind === "s" ? 7 : 28, ab = dpAbNow(r.a);
    out.push(`## ${r.a.v}${ab ? " " + ab : ""}｜${r.a.name}｜${dpFmt(r.a.from)} 至 ${dpFmt(r.a.to)}｜${r.kind === "s" ? "短期" : "長期"}，前後各 ${W} 天｜範圍：${sc.nm}`);
    sc.st.forEach((s, j) => out.push(`${DP_AEM[j]}：事前 ${F(s.p)}、事後 ${F(s.q)}、事後÷事前 ${F(s.r1, 2)}；去年事前 ${F(s.lp)}、去年事後 ${F(s.lq)}、去年比值 ${F(s.r0, 2)}；比值÷去年比值 ${F(s.rr, 2)}`));
    // 分段：從起日往前、往後各自切段（不跨越起日），最前面一段可能不足 g 天
    const Bd = []; for (let e = -1; e >= -W; e -= g) Bd.unshift([Math.max(e - g + 1, -W), e]); for (let t = 0; t < W; t += g) Bd.push([t, Math.min(t + g, W) - 1]);
    const seg = (arr, m) => Bd.map(([a, b]) => { const pts = arr.filter(p => p.t >= a && p.t <= b); if (!pts.length || pts.some(p => !p.v)) return "—";
      return F(pts.reduce((x, p) => x + p.v[m], 0) / pts.length); });
    const lab = Bd.map(([a, b]) => `${a}~${b}`);
    out.push(`分段平均（每 ${g} 天一段，第 ${lab.join("、")} 天；負數為起日前）：`);
    [0, 1, 2].forEach(m => { const a = seg(sc.se.cur, m), b = seg(sc.se.ly, m); out.push(`- ${DP_AEM[m]}：` + a.map((v, i) => `${v}／${b[i]}`).join("、")); });
    const tp = sc.top, T = (o, n) => o ? `${n}合計 ${F(o.tot, 0)}，最高：` + o.top.map(z => `第 ${z.t} 天 ${F(z.y, 0)}（${P(z.sh)}）`).join("、") : `${n}：—`;
    if (tp) out.push(`單日最高（Y1）：${T(tp.pre, "事前")}；${T(tp.post, "事後")}；${T(tp.lpre, "去年事前")}；${T(tp.lpost, "去年事後")}`);
    out.push(""); }));
  out.push("請依下列格式回覆，每個活動一節，標題照抄「### 變數與簡稱」（例如「### act1 淑麗代言」），同一活動有多個範圍時寫在同一節。",
    "每個活動依文獻的判讀順序分點，每一點固定寫三句，依序為：",
    "（1）檢查什麼：一句話說明這一點要回答的問題（例如「活動開始前，捐款本來就在變嗎？」）。",
    "（2）結果：先用白話寫出數據呈現的意義，再在句末括號內附上支持這個意義的關鍵數字；只附最能說明的 2 至 3 個數字（例如起點、高點、終點，或今年與去年的比值），不逐一列出每一段的數值；引用分段平均時寫出是起日前或後第幾天至第幾天，並寫成「平均每天約 X 萬元」。金額以「約 X 萬元」表示，保留兩位有效數字；比值換算成增減百分比（例如 1.08 寫成「增加約 8%」）。",
    "（3）代表什麼：這個結果對判斷活動效果是有利的跡象、不利的跡象，還是使比較較不可靠，以一句白話說明。",
    "",
    "每個活動最後加「整體判斷」，從下列三者擇一並說明理由：",
    "- 有增加的跡象：起日後的增加超過去年同期，且不是只來自一兩天，事前也大致平穩。",
    "- 看不出效果：起日後的增加不超過去年同期，或主要來自一兩天，或事前起伏過大而無法判斷。",
    "- 表現不如去年同期：起日後的變化明顯小於去年同期，或主要變數下降。",
    "整體判斷後加一句：這是描述性比較，正式結論以模型估計為準。",
    "",
    "寫法範例（僅示範句型，數字不得照抄）：",
    "「活動開始前，捐款本來就在變嗎？活動前的捐款金額並不平穩，起日前約 4 個月曾出現一段高峰後才回落（起日前第 168 至 141 天平均每天約 3 萬元，第 112 至 85 天升至平均每天約 18 萬元，第 28 至 1 天降至平均每天約 5 萬元）。這表示活動前的比較基準起伏很大，前後比較的結果要保守看待。」",
    "",
    "所有活動之後加一節「### 整體」，以同樣先意義、後數字的寫法比較各活動的型態異同。",
    "", "文獻的解讀寫法（由 NotebookLM 依研究者上傳的文獻整理）：", "---", String(c.aeLit || "").trim(), "---", "",
    "規則：解讀依上方文獻的寫法；引用文獻寫法時附上其中的出處，不得自行新增文獻；只能依據上列數據，不得推測數據以外的原因（例如媒體報導、特定捐款人）；這些是描述性比較，不得寫成活動造成、證實有效等因果結論；除上述四捨五入與百分比換算外，不自行計算未提供的數值；以繁體中文、一般讀者看得懂的文字撰寫，避免使用「基線」「識別」等術語，必要時以括號說明，不使用表格；用詞一律使用「變數」，不得使用「變項」。");
  return out.join("\n");
}
const dpAeIntParse = txt => { const o = {}; let cur = null; String(txt || "").replace(/\*\*/g, "").split(/\r?\n/).forEach(l => {
    const m = l.match(/^#{1,4}\s*(act\d+|整體)/); if (m) { cur = m[1] === "整體" ? "_all" : m[1]; o[cur] = ""; return; }
    if (cur) o[cur] += (o[cur] ? "\n" : "") + l; });
  Object.keys(o).forEach(k => o[k] = o[k].trim()); return o; };
const dpAeF = (x, d = 1) => x == null ? "—" : Number(x).toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
function dpAeChart(sc, W, step, m) {
  const w = 640, h = 200, L = 64, R = 14, T = 12, B = 34, X = t => L + (t + W) / (2 * W) * (w - L - R);
  const pts = [...sc.se.cur, ...sc.se.ly].map(p => p.v && p.v[m]).filter(v => v != null), top = Math.max(...pts, 0);
  const nice = v => { if (v <= 0) return 1; const e = 10 ** Math.floor(Math.log10(v)), f = v / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }, yt = nice(top / 4), mx = yt * Math.max(1, Math.ceil(top / yt)), Y = v => T + (1 - v / mx) * (h - T - B);
  const path = arr => { let s = "", pen = false; arr.forEach(p => { const v = p.v && p.v[m]; if (v == null) { pen = false; return; } s += `${pen ? "L" : "M"}${(X(p.t + (step - 1) / 2)).toFixed(1)},${Y(v).toFixed(1)}`; pen = true; }); return s; };
  let g = ""; for (let v = 0; v <= mx + 1e-9; v += yt) g += `<line x1="${L}" x2="${w - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--muted)">${dpAeF(v, v < 10 && yt < 1 ? 1 : 0)}</text>`;
  [-W, -W / 2, 0, W / 2, W].forEach(t => { g += `<text x="${X(t).toFixed(1)}" y="${h - B + 16}" text-anchor="middle" font-size="11" fill="var(--muted)">${t > 0 ? "+" + t : t}</text>`; });
  g += `<line x1="${X(0)}" x2="${X(0)}" y1="${T}" y2="${h - B}" stroke="var(--muted)" stroke-width="1"/><text x="${X(0) + 4}" y="${T + 10}" font-size="11" fill="var(--muted)">起日</text>`;
  g += `<text x="${(L + w - R) / 2}" y="${h - 4}" text-anchor="middle" font-size="11" fill="var(--muted)">距起日天數${step > 1 ? "（每 7 天一點，取每日平均）" : ""}</text>`;
  const hit = sc.se.cur.map((p, i) => { const q = sc.se.ly[i], x0 = X(p.t), x1 = X(Math.min(p.t + step, W));
    return `<rect x="${x0.toFixed(1)}" y="${T}" width="${Math.max(1, x1 - x0).toFixed(1)}" height="${h - T - B}" fill="transparent"><title>${step > 1 ? `第 ${p.t} 至 ${Math.min(p.t + step, W) - 1} 天` : `第 ${p.t} 天`}\n今年：${dpAeF(p.v && p.v[m])}\n前一年同期：${dpAeF(q.v && q.v[m])}</title></rect>`; }).join("");
  return `<svg viewBox="0 0 ${w} ${h}" class="dpaech" role="img" aria-label="${esc(DP_AEM[m])}事件時間圖">${g}<path d="${path(sc.se.ly)}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/><path d="${path(sc.se.cur)}" fill="none" stroke="var(--accent)" stroke-width="2"/>${hit}</svg>`;
}
// 表格列（畫面與 Excel 共用）
const DP_AEH2 = ["活動", "變數", "簡稱", "類型", "窗口天數", "範圍", "指標", "事前", "事後", "事後÷事前", "去年事前", "去年事後", "去年比值", "比值÷去年比值"];
const dpAeRows2 = ae => ae.res.flatMap(x => x.scopes.flatMap(sc => sc.st.map((s, j) => [x.r.a.name, x.r.a.v, dpAbNow(x.r.a), x.r.kind === "s" ? "短期" : "長期", x.r.W, sc.nm, DP_AEM[j], s.p, s.q, s.r1, s.lp, s.lq, s.r0, s.rr])));
const DP_AEH1 = ["變數", "簡稱", "活動名稱", "起日", "迄日", "天數", "類型", "窗口天數", "起日確定", "事前窗口完整", "事後窗口完整", "延續到截止日", "窗口重疊", "地區", "保留"];
const dpAeRows1 = (c, k) => dpAeScreen(c, k).map(r => [r.a.v, r.a.ab || "", r.a.name, dpFmt(r.a.from), dpFmt(r.a.to), r.days, r.kind === "s" ? "短期" : "長期", r.W, r.exact ? "是" : "否", r.preOK ? "是" : "否", r.postOK ? "是" : "否", r.toEnd ? "是" : "否", r.ov.map(([v, n]) => `${v} ${n} 天`).join("、"), r.cty || "全國", r.keep ? "是" : "否"]);
// 方法說明：描述性比較各工具在檢查什麼、對應模型中的哪一種變數（文獻依據）
const DP_AEDOC = `<details class="dpdoc"><summary>方法說明：這些表與圖在檢查什麼、和模型的關係</summary>
  <p><b>整體流程</b></p>
  <ul><li>先用描述性比較看活動前後的型態（表一、表二、事件時間圖、分段平均、單日最高）。</li>
    <li>再用模型估計活動效果（第 4 部分「模型用的事件變數」）。</li>
    <li>最後依文獻的寫法解讀（「圖形與數據解讀」）。</li></ul>
  <p>描述性比較沒有控制時間趨勢、季節與其他同時進行的活動，只能看出型態與需要留意之處；活動是否有效果，以模型估計為準。</p>
  <p><b>表一：只看日期</b></p>
  <ul><li>檢查：活動天數、起日是否確定、前後窗口是否完整、與其他活動的窗口是否重疊。</li>
    <li>用途：決定保留哪些活動、分為短期或長期；先決定再看捐款數據，避免依結果挑選活動。</li></ul>
  <p>窗口重疊時，前後的變化可能混入其他活動；文獻對重疊事件的處理是剔除，或在模型中同時放入各事件的變數（Garthwaite, 2014；Miller, 2023）。</p>
  <p><b>表二：起日前後各一個平均</b></p>
  <ul><li>檢查：起日後的每日平均比起日前高或低多少（事後÷事前），以及去年同一段日期是否也有同樣的變化（比值÷去年比值）。</li>
    <li>對應模型：長期活動的階梯變數 _s（起日後為 1），估計起日後整體水準的變化（Cornelsen et al., 2017；Elberse &amp; Verleun, 2012）。</li></ul>
  <p>前一年同期（${DP_LY} 天前，星期幾一致）是季節的描述性對照；模型中對應的是季節控制，例如一年中的週別（Garthwaite, 2014）或 52 週的季節項（Elberse &amp; Verleun, 2012）。</p>
  <p><b>事件時間圖與分段平均：起日前後一段一段看</b></p>
  <ul><li>檢查：變化發生在哪幾段、是集中在起日附近、持續一段時間，還是逐漸消退；起日前是否已有變化。</li>
    <li>分段平均的算法：從起日往前、往後，每隔固定天數切成一段（不重疊、不跨越起日），每段算平均每天的捐款；不是移動平均。</li>
    <li>對應模型：事件時間各期變數（短期活動的 _b、_a），每一段估計一個值（Garthwaite, 2014；Miller, 2023）。把相鄰的期數合成一段，文獻稱為 binning（Miller, 2023）。</li></ul>
  <p>起日前各段若有明顯起伏，表示活動前捐款本來就在變，前後比較要保守看待；文獻以事前各期是否平穩，檢查是否有既有趨勢或提前反應（Garthwaite, 2014；Miller, 2023）。</p>
  <p><b>單日最高：變化是否只來自少數幾天</b></p>
  <ul><li>檢查：窗口內最高的 3 天占該窗口合計的比例。</li>
    <li>用途：比例很高時，事後÷事前主要由這幾天決定，平均會被拉高。</li></ul>
  <p>文獻以對數轉換降低少數高值的影響（Garthwaite, 2014 使用對數銷售量）。</p>
  <p><b>長期活動的其他設定</b></p>
  <ul><li>起日後天數 _t：起日後成長速度是否改變（Miller, 2023）。</li>
    <li>結束後 _e、_et：活動結束後是否回落（Sheng &amp; Astvansh, 2026）。</li>
    <li>所有人同時受影響、又沒有對照單位時，長期活動與年份固定效果完全重疊，因此改以時間趨勢 time 加季節控制（Miller, 2023；Cornelsen et al., 2017）。</li></ul>
  <p>樣本只含首次交易在樣本起日之後的人時，捐款人數會隨時間累積，事後÷事前會偏高；文獻以每人平均（Cornelsen et al., 2017 以來客數標準化）或對數轉換處理規模的變化。</p>
</details>`;
function dpAeView(c, k) {
  if (!k || !dpActs(c).list.length) return "";
  const o = dpAeCfg(c), S = dpAeScreen(c, k), ctys = [...DP_TW], yo = dpAeYopts(c), y = dpAeY(c), cc = dpCtyCols(), YN = (b, warn) => b ? "是" : `<span class="${warn ? "warn" : ""}">否</span>`;
  let h = `<div class="dpsub"><b>活動初步評估</b>${DP_AEDOC}
    <p class="hint">分兩段進行。表一只用日期資訊（天數、起日、窗口是否完整、重疊），不看捐款資料，請依此先決定要保留的活動與分類；表二才比較保留活動的 Y，只用於描述，不用來挑選活動。每個活動以起日（對外公開日）為事件日，比較起日前後同樣天數的窗口；前一年同期為 ${DP_LY} 天前的同一段日期（星期幾一致），用來對照季節性。</p>
    <div class="dprow"><label>短期窗口 <input type="number" min="1" step="1" data-dpae="short" value="${o.short}" style="width:5em"> 天</label><label>長期窗口 <input type="number" min="1" step="1" data-dpae="long" value="${o.long}" style="width:5em"> 天</label><label>天數 <input type="number" min="1" step="1" data-dpae="cut" value="${o.cut}" style="width:5em"> 天以內預設為短期</label></div>
    <table class="dptbl"><thead><tr><th>保留</th><th>變數</th><th>簡稱</th><th>活動名稱</th><th>起日</th><th>天數</th><th>類型</th><th>起日確定</th><th>事前窗口</th><th>事後窗口</th><th>延續到截止日</th><th>窗口重疊</th><th>地區</th></tr></thead><tbody>${S.map(r => `<tr>
      <td><input type="checkbox" data-dpaekeep="${esc(r.key)}"${r.keep ? " checked" : ""}></td><td>${r.a.v}</td><td>${esc(r.a.ab || "")}</td><td>${esc(r.a.name)}</td><td>${dpFmt(r.a.from)}</td><td class="r">${r.days}</td>
      <td><select data-dpaekind="${esc(r.key)}"><option value="s"${r.kind === "s" ? " selected" : ""}>短期</option><option value="l"${r.kind === "l" ? " selected" : ""}>長期</option></select> <small>${r.W} 天</small></td>
      <td><label class="chip"><input type="checkbox" data-dpaeex="${esc(r.key)}"${r.exact ? " checked" : ""}>${r.rough ? "<small>月初，可能為概估</small>" : "確定"}</label></td>
      <td>${YN(r.preOK, 1)}</td><td>${YN(r.postOK, 1)}</td><td>${r.toEnd ? `<span class="warn">是</span>` : "否"}</td>
      <td>${r.ov.length ? `<span class="warn">${r.ov.map(([v, n]) => `${v} ${n} 天`).join("、")}</span>` : "無"}</td>
      <td><select data-dpaecty="${esc(r.key)}"><option value="">全國</option>${ctys.map(x => `<option${x === r.cty ? " selected" : ""}>${x}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table>
    <p class="hint">事前、事後窗口「否」表示窗口超出觀察期間（${dpFmt(k.dmin)} 至 ${dpFmt(k.dmax)}），該段不計算。起日落在月初者可能是以年或月登錄的概估日期，查證後再勾選「起日確定」。窗口重疊列出與其他活動窗口重疊的天數（含未保留的活動）。延續到截止日、或長達數年的活動屬於長期結構轉變，以起日前後的變化描述。地區活動（名稱中的縣市會自動判斷）比較該縣市與其他縣市。</p>`;
  const keep = S.filter(r => r.keep);
  if (!keep.length) return h + `<p class="note">勾選要保留的活動後，可計算表二。</p></div>`;
  const anyC = keep.some(r => r.cty);
  h += `<div class="dprow"><label>Y1 的金額欄 <select data-dpae="y1">${yo.map(([v, t]) => `<option value="${esc(v)}"${v === y ? " selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
    ${anyC ? `<label>縣市欄 <select data-dpae="ccol">${dpOpt(cc, o.ccol || cc[0] || "", cc.length ? null : "（沒有縣市欄）")}</select></label>` : ""}
    <button type="button" class="copy" data-dpaerun="1">${DP.ae ? "重新計算表二" : "計算表二（Y 比較）"}</button></div>`;
  const ae = DP.ae;
  if (!ae) return h + `<p class="hint">表二以每日彙總計算：Y1＝當天所有捐款人的金額合計，Y2＝當天有捐款的人數，首次捐款人數＝當天為此人在輸出資料中第一個交易日的人數；沒有交易的日子為 0，事前、事後的值都是窗口內的每日平均。計算需要整理全部資料，按鈕按下後稍候。</p></div>`;
  if (ae.key !== dpAeStateKey(c, k)) h += `<div class="note warn">設定或資料已變更，請按「重新計算表二」。</div>`;
  if (anyC && !ae.ccol) h += `<div class="note warn">沒有可用的縣市欄，地區活動無法分縣市比較。</div>`;
  h += `<p class="hint">Y1＝${esc(ae.ylab)}的每日合計；比值大於 1 表示事後高於事前。「比值÷去年比值」扣除季節性：大於 1 表示今年起日前後的變化大於去年同一段日期。樣本只含首次交易在起日之後的人時，捐款人數會隨時間累積，事後÷事前會因此偏高，窗口越長越明顯，請一併看去年比值。「—」表示窗口超出觀察期間或事前為 0。</p>
    <table class="dptbl"><thead><tr>${DP_AEH2.slice(1).map(x => `<th>${x}</th>`).join("")}</tr></thead><tbody>${dpAeRows2(ae).map(r => `<tr><td>${r[1]}</td><td>${esc(r[2])}</td><td>${r[3]}</td><td class="r">${r[4]}</td><td>${esc(r[5])}</td><td>${r[6]}</td>${r.slice(7).map((v, i) => `<td class="r">${dpAeF(v, [2, 5, 6].includes(i) ? 2 : 1)}</td>`).join("")}</tr>`).join("")}</tbody></table>
    <div class="dprow"><span>事件時間圖</span>${DP_AEM.map((t, m) => `<label class="chip"><input type="radio" name="dpaecy" data-dpae="cy" value="${m}"${+o.cy === m ? " checked" : ""}>${t}</label>`).join("")}</div>
    <p class="dplg"><span class="ln"></span>活動當年 <span class="ln ly"></span>前一年同期（${DP_LY} 天前）　<small>滑鼠移到圖上可看數值</small></p>`;
  const IT = dpAeIntParse(c.aeInt);
  ae.res.forEach(x => x.scopes.forEach((sc, si) => { const it = si === x.scopes.length - 1 ? IT[x.r.a.v] : "";
    h += `<div class="dpaebox"><b>${x.r.a.v}${dpAbNow(x.r.a) ? " " + esc(dpAbNow(x.r.a)) : ""}｜${esc(x.r.a.name)}</b>　<small>${dpFmt(x.r.a.from)} 起，${x.r.kind === "s" ? "短期" : "長期"}，前後各 ${x.r.W} 天；${esc(sc.nm)}</small>${dpAeChart(sc, x.r.W, x.step, +o.cy)}${it ? `<div class="note dpaeint">${esc(it)}</div>` : ""}</div>`; }));
  h += `<div class="dpsub"><b>圖形與數據解讀</b>
    <p class="hint">分兩步。① 按「複製文獻寫法 Prompt」，貼到已上傳事件效果文獻的 NotebookLM 對話，請它整理文獻如何解讀事件時間圖與事件前後的比較，回覆貼到第一個欄位。② 按「複製解讀 Prompt」，貼到一般 AI（Claude、ChatGPT、Gemini）；Prompt 已含表二與各活動前後的數據，並要求依 ① 的文獻寫法解讀。AI 的回覆貼到第二個欄位，各活動的解讀會顯示在對應的圖下方，並存入研究存檔。設定或資料變更後請重新計算表二，再重新產生解讀。</p>
    <p><button type="button" data-dpcopy="aelit">① 複製文獻寫法 Prompt（貼到 NotebookLM）</button> <span class="hint" id="dpcopymsg3"></span></p>
    <textarea data-dp="aeLit" class="mono" style="min-height:72px" placeholder="NotebookLM 的回覆貼在這裡">${esc(c.aeLit || "")}</textarea>
    <p><button type="button" data-dpcopy="aeint"${String(c.aeLit || "").trim() ? "" : " disabled"}>② 複製解讀 Prompt（貼到一般 AI）</button> <span class="hint" id="dpcopymsg2">${String(c.aeLit || "").trim() ? "" : "請先貼上 ① 的回覆。"}</span></p>
    <textarea data-dp="aeInt" class="mono" style="min-height:96px" placeholder="AI 的回覆貼在這裡（每個活動一節，標題為「### act1 …」）">${esc(c.aeInt || "")}</textarea>
    ${IT._all ? `<div class="note dpaeint">${esc(IT._all)}</div>` : ""}</div>`;
  return h + `</div>`;
}
// 4. 活動期間與外部資料
function dpExtView(c, k) {
  const A = dpActs(c), N = dpN;
  let h = `<fieldset class="struct"><legend>4. 活動期間與外部資料（選用）</legend>
    <div class="dpsub"><b>活動期間</b>
    <p class="hint">活動資料（表格、條列或文字都可以）先交給一般 AI 整理：按「複製活動整理 Prompt」，貼到一般 AI（Claude、ChatGPT、Gemini），在 Prompt 最後的位置貼上活動資料；AI 的回覆整段貼到下方。每個活動產生一個 0/1 變數（act1、act2…），活動期間內（含起迄日）為 1，其餘為 0；活動視為全國一致。</p>
    <p><button type="button" data-dpcopy="act">複製活動整理 Prompt</button> <span class="hint" id="dpcopymsg"></span></p>
    <textarea data-dp="actRep" class="mono" style="min-height:96px" placeholder="AI 的回覆貼在這裡，例如：
年終感恩募款｜年終募款｜2023/12/01｜2023/12/31｜年底募款信與電話勸募">${esc(c.actRep || "")}</textarea>
    <div class="dprow"><label>資料來源 <input type="text" data-dp="actSrc" value="${esc(c.actSrc || "")}" placeholder="例如：本機構 2013–2025 年活動紀錄" style="width:22em"></label></div>`;
  if (A.list.length) h += `<table class="dptbl"><thead><tr><th>變數</th><th>簡稱</th><th>活動名稱</th><th>起日</th><th>迄日</th><th>天數</th><th>說明</th></tr></thead><tbody>${A.list.map(a => `<tr><td>${a.v}</td><td><input type="text" data-dpab="${esc(dpAeKeyOf(a))}" value="${esc(a.ab)}" placeholder="（未填）" style="width:7em"></td><td>${esc(a.name)}</td><td>${dpFmt(a.from)}</td><td>${dpFmt(a.to)}</td><td class="r">${a.to - a.from + 1}</td><td>${esc(a.note)}</td></tr>`).join("")}</tbody></table>`;
  if (A.bad.length) h += `<div class="note warn">讀不出日期的行（請修正或刪除）：\n${A.bad.map(esc).join("\n")}</div>`;
  if (A.unsure.length) h += `<div class="note warn">AI 列為無法確定的活動（未納入；確認日期後，依「活動名稱｜簡稱｜起日｜迄日｜說明」補進上方）：\n${A.unsure.map(esc).join("\n")}</div>`;
  h += dpAeView(c, k) + dpEvView(c);
  h += `</div><div class="dpsub"><b>外部資料</b>
    <p class="hint">依日期串接的資料（例如連假、全國性的颱風假），或依日期與縣市串接的資料（例如天氣、空氣品質、各縣市的颱風假）。上傳 .xlsx 或 .csv：長格式為一列一個日期（或日期 × 縣市）；欄名有 3 個以上是縣市名稱時，視為一個縣市一欄的寬格式。縣市以本資料當天處理後的縣市欄串接（已套用不一致的處理與 22 縣市篩選）；台／臺視為相同，舊縣名換為現行縣市。數值中的「T」（微量）視為 0；「X」（儀器故障）不列入平均，某縣市當天全部為 X 時，以距離最近的縣市（依縣市政府所在地的距離）同一天的值取代；最近的縣市當天也沒有有效值、離島縣，或依日期串接的全國資料，維持缺漏並列出。研究存檔只記住串接設定，外部檔要與原始資料一起重新上傳。資料來源、網址與取得日期須填寫，會寫進處理紀錄，供論文說明資料來源與查核。</p>`;
  (c.ext || []).forEach((e, i) => {
    const t = DP.ext[i], ix = t ? dpExtIx(i) : null, o = ix && ix.st, H = t ? t.head : [];
    const smp = col => { const u = []; for (const r of t.rows) { const v = r[H.indexOf(col)]; if (v != null && !u.includes(v)) u.push(v); if (u.length >= 3) break; } return u.map(String).join("、"); };
    h += `<div class="dpconf"><div><b>外部資料 ${i + 1}</b>　<input type="file" data-dpextf="${i}" accept=".xlsx,.xlsm,.csv,.txt"> ${t ? `已讀入 <b>${esc(e.file)}</b>：${N(t.rows.length)} 列` : e.file ? `<span class="warn">請重新上傳「${esc(e.file)}」</span>` : ""}
      <button type="button" data-dpextdel="${i}">移除</button></div>
      <div class="dprow"><label>資料來源 <input type="text" data-dpexts="src" data-i="${i}" value="${esc(e.src || "")}" placeholder="例如：交通部中央氣象署 CODiS 氣候觀測資料查詢服務" style="width:24em"></label>
      <label>網址或取得方式 <input type="text" data-dpexts="url" data-i="${i}" value="${esc(e.url || "")}" placeholder="https://…" style="width:18em"></label>
      <label>取得日期 <input type="date" data-dpexts="got" data-i="${i}" value="${esc(e.got || "")}"></label></div>`;
    if (t) {
      const wide = o.wide;
      h += `<div class="dprow"><label>日期欄 <select data-dpexts="dcol" data-i="${i}">${dpOpt(H, e.dcol, "（請選擇）")}</select></label>
        <label>縣市欄 <select data-dpexts="ccol" data-i="${i}"><option value="">${wide ? "（寬格式：各縣市一欄）" : "（無：依日期串接，全國一致）"}</option>${H.filter(x => x !== e.dcol).map(x => `<option value="${esc(x)}"${x === e.ccol ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        ${o.by ? `<label>對應本資料的縣市欄 <select data-dpexts="key" data-i="${i}">${dpOpt(dpCtyCols(), e.key, "（請選擇）")}</select></label>` : ""}
</div>`;
      if (wide) h += `<div class="dprow"><span>寬格式：${o.ctys.size} 個縣市欄</span><label>變數名稱 <input type="text" data-dpexts="wv" data-i="${i}" value="${esc(e.wv || "")}" style="width:10em"></label></div>`;
      else h += `<table class="dptbl"><thead><tr><th>帶入</th><th>欄位</th><th>前幾個值</th><th>變數名稱</th></tr></thead><tbody>${H.filter(x => x !== e.dcol && x !== e.ccol).map(x => { const on = (e.use || []).includes(x);
        return `<tr><td><input type="checkbox" data-dpextc="${esc(x)}" data-i="${i}"${on ? " checked" : ""}></td><td>${esc(x)}</td><td class="ex">${esc(smp(x))}</td><td>${on ? `<input type="text" data-dpextv="${esc(x)}" data-i="${i}" value="${esc((e.vars || {})[x] || x)}" style="width:10em">` : ""}</td></tr>`; }).join("")}</tbody></table>`;
      const w = [];
      if (o.dmin != null) w.push(`外部檔日期 ${dpFmt(o.dmin)} 至 ${dpFmt(o.dmax)}${o.by ? `，${o.ctys.size} 個縣市` : ""}` + (k && (o.dmin > k.dmin || o.dmax < k.dmax) ? `；未涵蓋整個觀察期間（${dpFmt(k.dmin)} 至 ${dpFmt(k.dmax)}），涵蓋不到的日子為缺漏` : ""));
      if (o.badDate) w.push(`日期無法解析 ${N(o.badDate)} 列，未納入`);
      if (o.unk.size) w.push(`縣市名稱無法對應 ${o.unk.size} 種，未納入：` + [...o.unk].slice(0, 10).map(([x, n]) => `${x} ×${N(n)}`).join("、"));
      if (o.T) w.push(`「T」（微量）${N(o.T)} 筆，視為 0`);
      if (o.X) w.push(`「X」（儀器故障）${N(o.X)} 筆：以最近縣市同一天的值取代 ${N(o.filled)} 筆${o.fillBy.size ? "（" + [...o.fillBy].map(([a, b]) => `${a}←${b}`).join("、") + "）" : ""}；維持缺漏的有 ${o.gaps.length} 段` + (o.gaps.length ? "：\n" + o.gaps.slice(0, 20).map(g => `${g.k}　${g.v}　${dpFmt(g.from)}–${dpFmt(g.to)}（${g.days} 天；${g.why}）`).join("\n") + (o.gaps.length > 20 ? "\n…（完整清單見 Excel 檔的「檢查明細」工作表）" : "") : ""));
      if (o.other.size) w.push(`其他非數值代碼視為缺漏：` + [...o.other].map(([x, n]) => `「${x}」${N(n)} 筆`).join("、"));
      if (w.length) h += `<div class="note${o.gaps.length || o.unk.size || o.badDate ? " warn" : ""}">${w.map(esc).join("\n")}</div>`;
    }
    h += `</div>`;
  });
  h += `<details class="dpsub"><summary>最近縣市對照（「X」的取代依據）</summary><p class="hint">依各縣市政府所在地的直線距離，取距離最近的 1 個縣市；澎湖縣、金門縣、連江縣不取代。</p><p class="ex">${Object.entries(DP_NEAR).map(([a, b]) => `${a}←${b}`).join("、")}</p></details>
    <p><button type="button" data-dpextadd="1">新增外部資料</button></p></div></fieldset>`;
  return h;
}
// 5. 衍生變數
function dpDvView(c, k) {
  const src = dpDv04(), txt = dpDvText(c), H0 = dpHead0(c, k), sp = dpDvParse(txt, H0);
  let h = `<fieldset class="struct"><legend>5. 衍生變數</legend>
    <p class="hint">自動讀入 0.4「資料字典與分析樣本」AI 回覆中的「## 衍生變數計算規格」，每行「變數名稱｜類型｜來源欄｜參數｜說明」，依序附加在輸出資料的最後；後面的變數可以用前面的變數當來源欄。可直接在下方修改，輸出以這裡的內容為準；清空即改回 0.4 的內容。過去與落後類變數一律不含當天；資料只含有交易的日子，「前一期」為前一次交易日。</p>`;
  if (!src && c.dvTxt == null) h += `<div class="note">0.4 的回覆中還沒有「衍生變數計算規格」：到 0.4「資料字典與分析樣本」，在同一個對話送出「補問 Prompt」，回覆接在原回覆的最後貼上；也可以直接在下方輸入。</div>`;
  else if (c.dvTxt != null) h += `<div class="note">${src ? "已修改，與 0.4 回覆的內容不同；輸出以這裡為準，清空即改回 0.4 的內容。" : "0.4 的回覆中沒有這一節，使用這裡輸入的內容。"}</div>`;
  h += `<textarea data-dp="dv" class="mono" style="min-height:120px" placeholder="例如：
weekday｜星期｜date｜｜交易日的星期
breadth｜分散度｜money1、money2、money3、money4、money5｜｜捐款廣度
breadth_w｜組內｜breadth｜｜捐款廣度的組內成分">${esc(txt)}</textarea>`;
  if (sp.items.length) h += `<table class="dptbl"><thead><tr><th>變數</th><th>類型</th><th>來源欄</th><th>參數</th><th>計算方式</th><th>狀態</th></tr></thead><tbody>${sp.items.map(it =>
    `<tr${it.err ? ' class="bad"' : ""}><td>${esc(it.name)}</td><td>${esc(it.raw)}</td><td>${esc(it.src.join("、"))}</td><td>${esc(it.param)}</td><td>${it.skip ? esc(it.note) : it.err ? "" : esc(dpDvRule(it))}</td><td>${it.skip ? "無法計算，不產生" : it.err ? `<span class="warn">${esc(it.err)}</span>` : "可計算"}</td></tr>`).join("")}</tbody></table>`;
  else if (!dpDvBlank(txt)) h += `<div class="note warn">讀不到「變數名稱｜類型｜來源欄｜參數｜說明」格式的行。</div>`;
  h += `<details class="dpsub"><summary>可用的類型</summary><ul class="hint">${(typeof DV_TYPES !== "undefined" ? DV_TYPES : DV_NAMES.map(x => [x, ""])).map(([a, b]) => `<li><b>${esc(a)}</b>${b ? "：" + esc(b) : ""}</li>`).join("")}</ul></details>
    <p class="hint">可作為來源欄的輸出欄位：${esc(H0.join("、"))}</p></fieldset>`;
  return h;
}
function dpLogText() { return DP.chk && DP.cfg ? dpLogLines(DP.cfg, DP.chk).join("\n") : ""; }
const dpLogShown = () => dpLogText() || (typeof store !== "undefined" && store.values.dp_log) || "";
async function dpLoad(file) {
  DP.err = ""; DP.msg = ""; DP.name = file.name; DP.head = []; DP.rows = []; DP.chk = null; DP.sheets = []; DP.X = null; DP.sheet = 0;
  dpBusy("讀取中…"); update(); await dpTick();
  try {
    const buf = await file.arrayBuffer();
    if (/\.(csv|txt)$/i.test(file.name)) { dpSetTable(dpParseCSV(dpDecode(new Uint8Array(buf)))); }
    else if (/\.(xlsx|xlsm)$/i.test(file.name)) {
      DP.X = await dpOpenXLSX(buf); DP.sheets = DP.X.sheets; await dpLoadSheet(0, false);
    } else throw new Error("只支援 .xlsx 與 .csv；.xls 請先在 Excel 另存為 .xlsx 或 CSV。");
    if (!DP.rows.length) throw new Error("檔案裡沒有資料列（第一個非空白列視為欄位名稱）。");
    DP.cfg = dpGuess(store.values.dp_cfg); DP.pv = null;
  } catch (e) { DP.err = "讀取失敗：" + (e && e.message || e); DP.head = []; DP.rows = []; }
  dpBusy(""); dpCommit(true);
}
async function dpLoadSheet(k, refresh = true) {
  DP.sheet = k; dpBusy(`讀取工作表「${DP.sheets[k].name}」…`); await dpTick();
  const { rows, dateHit } = await dpReadSheet(DP.X, k, async f => { dpBusy(`讀取中… ${Math.round(f * 100)}%`); await dpTick(); });
  dpSetTable(rows, dateHit);
  if (refresh) { DP.cfg = dpGuess(store.values.dp_cfg); dpBusy(""); dpCommit(true); }
}
async function dpExtLoad(i, file) {
  const e = DP.cfg.ext[i]; DP.err = ""; dpBusy(`讀取外部資料「${file.name}」…`); await dpTick();
  try {
    const buf = await file.arrayBuffer(); let t;
    if (/\.(csv|txt)$/i.test(file.name)) t = dpTable(dpParseCSV(dpDecode(new Uint8Array(buf))));
    else if (/\.(xlsx|xlsm)$/i.test(file.name)) { const X = await dpOpenXLSX(buf), r = await dpReadSheet(X, 0); t = dpTable(r.rows, r.dateHit); }
    else throw new Error("只支援 .xlsx 與 .csv");
    if (!t.rows.length) throw new Error("檔案裡沒有資料列");
    if (e.file && e.file !== file.name) { e.dcol = null; e.ccol = undefined; e.use = []; e.vars = {}; }   // 換了不同的檔案：重新判斷欄位
    e.file = file.name; DP.ext[i] = t; DP.extIx[i] = null; dpExtGuess(e, t);
  } catch (x) { DP.err = "外部資料讀取失敗：" + (x && x.message || x); }
  DP.extStat = null; dpBusy(""); dpCommit(false);
}
async function dpRunCheck() {
  dpBusy("檢查中…"); await dpTick();
  try { DP.chk = dpCheck(DP.cfg); DP.pv = DP.cfg.pcol ? dpPivotVals(DP.cfg, DP.chk) : null; if (DP.pv) DP.pv.forEach(x => { if (!(x.v in (DP.cfg.pmap ||= {}))) DP.cfg.pmap[x.v] = x.v; }); }
  catch (e) { DP.err = "檢查失敗：" + (e && e.message || e); DP.chk = null; }
  dpBusy(""); dpCommit(false);
}
function dpPivotInit() {
  const c = DP.cfg; DP.pv = c.pcol && DP.chk ? dpPivotVals(c, DP.chk) : null;
  if (DP.pv) { const keep = c.pmap || {}; c.pmap = {}; DP.pv.forEach(x => c.pmap[x.v] = x.v in keep && c.pcolWas === c.pcol ? keep[x.v] : x.v); }
  c.pcolWas = c.pcol;
}
// 已開啟研究資料夾：直接存進該資料夾（檔名前加研究名稱）；否則下載到瀏覽器的下載資料夾
async function dpSaveFile(blob, name) {
  const pre = (store.name || "").replace(/[\\/:*?"<>|\r\n]+/g, "").trim();
  let at = null;
  try { at = window.saveToProjDir ? await window.saveToProjDir(pre ? `${pre}_${name}` : name, blob) : null; }
  catch (e) { DP.err = "存入研究資料夾失敗，改為下載：" + (e && e.message || e); }
  if (at) { DP.msg = `已存入研究資料夾：${at}`; return; }
  dpDownload(blob, name); DP.msg = `已下載「${name}」到瀏覽器的下載資料夾（目前沒有開啟研究資料夾）。`;
}
function dpDownload(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
async function dpAeGo() {
  DP.err = ""; dpBusy("計算活動評估…"); await dpTick();
  try { dpAeRun(DP.cfg, DP.chk, dpExtend(dpBuild(DP.cfg, DP.chk, "day", true), DP.cfg)); }
  catch (e) { DP.err = "活動評估計算失敗：" + (e && e.message || e); DP.ae = null; }
  dpBusy(""); dpCommit(false);
}
async function dpOutput(what) {
  const c = DP.cfg, k = DP.chk; if (!k || dpNeed(c, k).length || dpBlock(c, k).length) return;
  DP.err = ""; DP.msg = ""; dpBusy("整理資料中…"); await dpTick();
  try {
    const wide = () => { const t = dpTable2(c, k); DP.extStat = t.st; return t; };
    if (what === "xlsx") {
      const sh = [{ name: "一人一日", ...wide() }];
      const big = sh.filter(x => x.rows.length > DP_XLS_MAX);
      const det = dpDetailRows(c, k);
      store.values.dp_log = dpLogText();
      sh.push({ name: "處理紀錄", head: ["處理紀錄"], rows: dpLogLines(c, k).map(x => [x]), dateCol: new Set() }, { name: "檢查明細", head: det[0], rows: det.slice(1), dateCol: new Set() });
      if (dpActs(c).list.length) { sh.push({ name: "活動篩選", head: DP_AEH1, rows: dpAeRows1(c, k), dateCol: new Set() });
        if (dpAeScreen(c, k).some(r => r.keep)) sh.push({ name: "活動Y比較", head: DP_AEH2, rows: dpAeRows2(dpAeRun(c, k, sh[0])).map(r => r.map(v => typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v)), dateCol: new Set() }); }
      dpBusy("寫入 Excel 檔…"); await dpTick();
      const blob = await dpXlsx(sh.filter(x => x.rows.length <= DP_XLS_MAX), async f => { dpBusy(`寫入 Excel 檔… ${Math.round(f * 100)}%`); await dpTick(); });
      await dpSaveFile(blob, `${dpBase()}_處理後.xlsx`);
      if (big.length) DP.err = `${big.map(x => x.name).join("、")} 超過 Excel 的 1,048,576 列上限，未放入 Excel 檔，請改下載 CSV。`;
    } else {
      await dpSaveFile(dpCSV(wide()), `${dpBase()}_一人一日.csv`); store.values.dp_log = dpLogText();
    }
  } catch (e) { DP.err = "輸出失敗：" + (e && e.message || e); }
  dpBusy(""); update();
}
if (typeof document !== "undefined" && document.getElementById("pane")) {
  const pane = document.getElementById("pane");
  pane.addEventListener("change", e => {
    const t = e.target; if (!t.closest || !t.closest(".dp") || !DP) return;
    const c = DP.cfg, d = t.dataset;
    if (d.dp === "file") { if (t.files && t.files[0]) dpLoad(t.files[0]); return; }
    if (d.dp === "sheet") { dpLoadSheet(+t.value); return; }
    if (!c) return;
    if (["id", "dcol", "y", "m", "d"].includes(d.dp)) { c[d.dp] = t.value || null; DP.cfg = dpGuess(c); return dpCommit(true); }
    if (d.dp === "dmode") { c.dmode = t.value; if (c.dmode === "ymd") c.ychk = false; DP.cfg = dpGuess(c); return dpCommit(true); }
    if (d.dpexcol != null) { const x = c.excl[+d.dpexcol]; x.col = t.value || null; x.vals = []; return dpCommit(true); }
    if (d.dpexv != null) { const x = c.excl[+d.dpexv]; x.vals = t.checked ? [...new Set([...(x.vals || []), t.value])] : (x.vals || []).filter(v => v !== t.value); return dpCommit(true); }
    if (d.dp === "coh") { c.coh = t.checked; return dpCommit(true); }
    if (d.dp === "cohCol") { c.cohCol = t.value || null; return dpCommit(true); }
    if (d.dp === "from" || d.dp === "to") { c[d.dp] = t.value ? dpDateVal(t.value) : null; return dpCommit(true); }
    if (d.dp === "ychk") { c.ychk = t.checked; DP.cfg = dpGuess(c); return dpCommit(true); }
    if (d.dprole != null) { const was = c.roles[d.dprole]; c.roles[d.dprole] = t.value;
      return dpCommit(t.value === "take" && was !== "take" && !(DP.chk && DP.chk.take.includes(d.dprole))); }   // 改成「取值」且先前沒檢查過不一致時，需要重新檢查
    if (d.dp === "tot") { c.tot = t.value || null; c.parts = []; return dpCommit(true); }
    if (d.dppart != null) { c.parts = t.checked ? [...new Set([...c.parts, d.dppart])] : c.parts.filter(x => x !== d.dppart); return dpCommit(true); }
    if (d.dp === "pcol") { c.pcol = t.value || null; if (c.pcol && c.roles[c.pcol] === "take") c.roles[c.pcol] = "drop"; dpPivotInit(); return dpCommit(false); }
    if (d.dp === "pval") { c.pval = t.value || null; DP.pv = DP.chk ? dpPivotVals(c, DP.chk) : null; return dpCommit(false); }
    if (d.dp === "pcnt") { c.pcnt = t.checked; return dpCommit(false); }
    if (d.dpmap != null) {   // 欄名：只更新相關文字，不重畫（保留游標，方便連續填寫）
      (c.pmap ||= {})[d.dpmap] = t.value.trim(); store.values.dp_cfg = c;
      if (DP.chk && !dpNeed(c, DP.chk).length) store.values.dp_sum = dpSummary(c, DP.chk);
      save(); const g = document.getElementById("dptg"); if (g) g.textContent = "展開後的欄位：" + (dpTargets(c).join("、") || "（無）");
      store.values.dp_log = dpLogText(); save(); document.getElementById("out").textContent = dpLogText(); return;
    }
    if (d.dpres != null) { c.res[d.dpres] = t.value; return dpCommit(false); }
    if (d.dptw != null) { ((c.valid ||= {})[d.dptw] ||= {}).tw = t.checked; return dpCommit(false); }
    if (d.dpex != null) { ((c.valid ||= {})[d.dpex] ||= {}).ex = t.value; return dpCommit(false); }
    if (d.dpwt != null) { (c.wt ||= {})[d.dpwt] = t.value || null; return dpCommit(false); }
    if (d.dpnear != null) { (c.near ||= {})[d.dpnear] = Math.max(0, Math.round(+t.value || 0)); return dpCommit(false); }
    if (d.dpae != null) { const o = dpAeCfg(c); o[d.dpae] = ["short", "long", "cut", "ewb", "ewa"].includes(d.dpae) ? Math.max(1, Math.round(+t.value || 1)) : d.dpae === "cy" ? +t.value : t.value || null; return dpCommit(false); }
    if (d.dpaekeep != null) { dpAeCfg(c).keep[d.dpaekeep] = t.checked; return dpCommit(false); }
    if (d.dpaekind != null) { dpAeCfg(c).kind[d.dpaekind] = t.value; return dpCommit(false); }
    if (d.dpaeex != null) { dpAeCfg(c).exact[d.dpaeex] = t.checked; return dpCommit(false); }
    if (d.dpab != null) { const o = c.actAb ||= {}, a = dpActs({ ...c, actAb: {} }).list.find(x => dpAeKeyOf(x) === d.dpab), v = t.value.trim();
      if (a && v === a.ab0) delete o[d.dpab]; else o[d.dpab] = v; return dpCommit(false); }
    if (d.dpaecty != null) { dpAeCfg(c).cty[d.dpaecty] = t.value; return dpCommit(false); }
    if (d.dp === "dv") { const v = t.value; c.dvTxt = !v.trim() || v.trim() === dpDv04().trim() ? null : v; DP.extStat = null; return dpCommit(false); }
    if (d.dp === "aeInt" || d.dp === "aeLit") { c[d.dp] = t.value; return dpCommit(false); }
    if (d.dp === "actRep" || d.dp === "actSrc") { c[d.dp] = t.value; DP.extStat = null; return dpCommit(false); }
    if (d.dpextf != null) { if (t.files && t.files[0]) dpExtLoad(+d.dpextf, t.files[0]); return; }
    if (d.dpexts != null || d.dpextc != null || d.dpextv != null) { const i = +d.i, e = c.ext[i];
      if (d.dpexts) e[d.dpexts] = (t.value || (d.dpexts === "ccol" || d.dpexts === "dcol" || d.dpexts === "key" ? null : ""));
      if (d.dpexts === "dcol" || d.dpexts === "ccol") { e.use = (e.use || []).filter(x => x !== e.dcol && x !== e.ccol); }
      if (d.dpextc != null) e.use = t.checked ? [...new Set([...(e.use || []), d.dpextc])] : (e.use || []).filter(x => x !== d.dpextc);
      if (d.dpextv != null) (e.vars ||= {})[d.dpextv] = t.value.trim();
      if (!["src", "url", "got"].includes(d.dpexts)) DP.extIx[i] = null;
      DP.extStat = null; return dpCommit(false); }
    if (d.dpflag != null) { c.flag[d.dpflag] = t.checked; return dpCommit(false); }
  });
  pane.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest(".dp button"); if (!b || b.disabled || DP.busy) return;
    if (b.dataset.dp === "check") dpRunCheck();
    else if (b.dataset.dpexadd) { const tx = DP.head.filter((x, i) => DP.kind[i] === "text" && !dpKeys(DP.cfg).has(x)); (DP.cfg.excl ||= []).push({ col: tx.find(h => dpUV(h).some(([v]) => dpIsTW(v))) || null, vals: [] }); dpCommit(true); }
    else if (b.dataset.dpexdel != null) { DP.cfg.excl.splice(+b.dataset.dpexdel, 1); dpCommit(true); }
    else if (b.dataset.dpexq) { const [q, w] = b.dataset.dpexq.split("|"), x = DP.cfg.excl[+q], want = new Set(DP_ISL[w]);
      x.vals = [...new Set([...(x.vals || []), ...dpUV(x.col).map(([v]) => v).filter(v => want.has(dpNorm(v)))])]; dpCommit(true); }
    else if (b.dataset.dpdrop != null) { DP.cfg.roles[b.dataset.dpdrop] = "drop"; dpCommit(false); }   // 刪除：改為不輸出（可在欄位設定改回）
    else if (b.dataset.dpout) dpOutput(b.dataset.dpout);
    else if (b.dataset.dpaerun) dpAeGo();
    else if (b.dataset.dpcopy === "act") { const m = document.getElementById("dpcopymsg");
      navigator.clipboard.writeText(dpActPrompt()).then(() => { if (m) m.textContent = "已複製；貼到一般 AI，再於最後貼上活動資料。"; }, () => { if (m) m.textContent = "無法複製，請改用 Chrome。"; }); }
    else if (b.dataset.dpcopy === "aelit") { const m = document.getElementById("dpcopymsg3");
      navigator.clipboard.writeText(DP_AELIT).then(() => { if (m) m.textContent = "已複製；貼到 NotebookLM。"; }, () => { if (m) m.textContent = "無法複製，請改用 Chrome。"; }); }
    else if (b.dataset.dpcopy === "aeint") { const m = document.getElementById("dpcopymsg2"), t = DP.ae ? dpAeIntPrompt(DP.cfg, DP.ae) : "";
      if (!t) { if (m) m.textContent = "請先計算表二。"; } else navigator.clipboard.writeText(t).then(() => { if (m) m.textContent = "已複製；貼到一般 AI。"; }, () => { if (m) m.textContent = "無法複製，請改用 Chrome。"; }); }
    else if (b.dataset.dpextadd) { (DP.cfg.ext ||= []).push({ src: "", url: "", got: "", use: [], vars: {}, wv: "x" }); dpCommit(false); }
    else if (b.dataset.dpextdel != null) { const i = +b.dataset.dpextdel; DP.cfg.ext.splice(i, 1); DP.ext.splice(i, 1); DP.extIx.splice(i, 1); DP.extStat = null; dpCommit(false); }
  });
}

if (typeof module !== "undefined") module.exports = { DP_NEAR, dpAeScreen, dpAeRun, dpAeRows1, dpAeRows2, dpAeChart, dpAeView, dpDerive, dpDvParse, dpDvLog, dpTable2, dpHead0, dpSecLast, DP, dpTable, dpActs, dpActPrompt, dpExtGuess, dpExtIndex, dpExtend, dpExtLog, dpBlock, dpCty, dpSetTable, dpParseCSV, dpDecode, dpGuess, dpCheck, dpBuild, dpPivotVals, dpNeed, dpTargets, dpLogLines, dpDetailRows, dpXlsx, dpCSV, dpOpenXLSX, dpReadSheet, dpDateVal, dpFmt, dpSummary };
