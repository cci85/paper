// ── 資料處理：長格式原始資料（一列一筆交易）→ 一人一日一筆、加總資料、寬格式 ──
// 全部在瀏覽器處理，原始資料不會上傳，也不存進研究存檔；研究存檔只記住欄位設定（dp_cfg）與處理摘要（dp_sum）
// 讀寫 .xlsx 用網站已有的 JSZip（js/vendor/jszip.min.js），不另外載入試算表元件

const DP = { name: "", head: [], rows: [], kind: [], sheets: [], zip: null, sheet: 0, chk: null, busy: "", err: "", log: [] };
const DP_LV = { day: "一人一日", month: "一人一月", year: "一人一年", person: "一人一筆（整個期間）" };
const DP_RES = [["near", "依前後幾天的交易判斷"], ["wt", "依某數值欄的金額決定"], ["mode", "取出現次數最多者"], ["first", "取第一筆"], ["last", "取最後一筆"]];
const DP_ROLE = { sum: "加總", mean: "平均", max: "最大", min: "最小", take: "取值（不一致時示警）", drop: "刪除（不輸出）" };
const DP_XLS_MAX = 1048575;   // Excel 每個工作表最多 1,048,576 列（含標題列）

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
// 原始列（含標題列）→ DP.head／rows／kind
function dpSetTable(raw, dateHit = []) {
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
  DP.head = head; DP.rows = body; DP.kind = kind; DP.chk = null;
}

// ── 欄位設定的預設值（只是建議；角色都可以改）──
function dpGuess(old) {
  const H = DP.head, K = DP.kind, idx = re => H.findIndex(h => re.test(h));
  const cfg = { id: null, dmode: "one", dcol: null, y: null, m: null, d: null, ychk: false, roles: {}, res: {}, flag: {}, agg: "person", wide: "day", pcol: null, pval: null, pmap: {}, pcnt: false, tot: null, parts: [] };
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
  const bad = { id: [], date: [] }, ymdBad = [], totBad = [], nonNum = {};
  const tc = col(cfg.tot), pc = (cfg.parts || []).map(col).filter(c => c >= 0);
  const numCols = H.map((h, c) => ["sum", "mean", "max", "min"].includes(cfg.roles[h]) ? c : -1).filter(c => c >= 0);
  const ymdOf = r => dpSerial(dpNum(r[yc]), dpNum(r[mc]), dpNum(r[ddc]));
  for (let i = 0; i < n; i++) {
    const r = DP.rows[i];
    if (dpBlank(r[ic])) { bad.id.push(i); continue; }
    const day = cfg.dmode === "ymd" ? ymdOf(r) : dpDateVal(r[dc]);
    if (day == null) { bad.date.push(i); continue; }
    if (cfg.dmode === "one" && cfg.ychk && yc >= 0) { const d2 = ymdOf(r); if (d2 !== day) ymdBad.push([i, day, d2]); }
    if (tc >= 0 && pc.length) { const t = dpNum(r[tc]) || 0, s = pc.reduce((a, c) => a + (dpNum(r[c]) || 0), 0); if (Math.abs(t - s) > 0.005) totBad.push([i, t, s]); }
    numCols.forEach(c => { const v = r[c]; if (v != null && typeof v !== "number") nonNum[H[c]] = (nonNum[H[c]] || 0) + 1; });
    okR[k] = i; okD[k] = day; k++;
  }
  const rIdx = okR.subarray(0, k), rDay = okD.subarray(0, k);
  let dmin = Infinity, dmax = -Infinity; for (let i = 0; i < k; i++) { if (rDay[i] < dmin) dmin = rDay[i]; if (rDay[i] > dmax) dmax = rDay[i]; }
  const take = H.filter(h => cfg.roles[h] === "take"), tci = take.map(col), conf = {};
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
  return { rows: n, k, rIdx, rDay, bad, ymdBad, totBad, nonNum, dmin, dmax, ids: ids.size, take, conf };
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
    const wtPick = j => { const m = new Map(); e.t[j].forEach((v, i) => { if (v != null) m.set(v, (m.get(v) || 0) + e.w[j][i]); }); let best = null, bw = -Infinity; m.forEach((w, v) => { if (w > bw) { best = v; bw = w; } }); return best; };
    take.forEach((o, j) => row.push(wtC[j] >= 0 ? wtPick(j) : cfg.res[o.h] === "near" && lv === "day" ? near(j, e.id, e.p, e.t[j]) : dpResolve(e.t[j], cfg.res[o.h] === "near" ? "mode" : cfg.res[o.h] || "first")));
    flags.forEach(o => { const j = take.indexOf(o); row.push(new Set(e.t[j].filter(x => x != null)).size > 1 ? 1 : 0); });
    tg.forEach((_, t) => row.push(e.pv[t])); if (cfg.pcnt) tg.forEach((_, t) => row.push(e.pn[t]));
    return row;
  });
  return { head, rows, dateCol };
}

// ── 處理紀錄（文字）──
function dpLogLines(cfg, chk) {
  const L = [], fmtN = x => x.toLocaleString("en-US");
  L.push(`原始檔案：${DP.name}${DP.sheets.length > 1 ? `（工作表：${DP.sheets[DP.sheet].name}）` : ""}`);
  L.push(`讀入 ${fmtN(chk.rows)} 列；排除 ${fmtN(chk.bad.id.length + chk.bad.date.length)} 列（缺少代碼 ${fmtN(chk.bad.id.length)}、日期無法解析 ${fmtN(chk.bad.date.length)}）；納入 ${fmtN(chk.k)} 列，${fmtN(chk.ids)} 人`);
  L.push(`觀察期間：${dpFmt(chk.dmin)} 至 ${dpFmt(chk.dmax)}`);
  L.push(`代碼欄：${cfg.id}；日期：${cfg.dmode === "one" ? `${cfg.dcol}${cfg.ychk ? `（以 ${cfg.y}／${cfg.m}／${cfg.d} 核對，不一致 ${fmtN(chk.ymdBad.length)} 列）` : ""}` : `${cfg.y}／${cfg.m}／${cfg.d}`}`);
  if (cfg.tot && cfg.parts.length) L.push(`總額核對：${cfg.tot} ＝ ${cfg.parts.join("＋")}，不一致 ${fmtN(chk.totBad.length)} 列`);
  L.push("欄位處理：" + DP.head.filter(h => cfg.roles[h]).map(h => `${h}＝${cfg.roles[h] === "take" ? (cfg.res[h] === "wt" ? `依 ${(cfg.wt || {})[h] || "money"} 的金額決定（取當天金額合計最大的值）` : cfg.res[h] === "near" ? `依前後 ${(cfg.near || {})[h] ?? 30} 天的交易判斷（取前後期間出現次數最多的值）` : cfg.res[h] ? DP_RES.find(x => x[0] === cfg.res[h])[1] : "取值（無不一致）") : DP_ROLE[cfg.roles[h]]}`).join("；"));
  dpLevels(cfg).forEach(lv => { const o = chk.conf[lv], c = Object.entries(o.cols).filter(([h, x]) => x.n && cfg.roles[h] === "take");
    L.push(`${DP_LV[lv]}：${fmtN(o.groups)} 筆（含多筆交易者 ${fmtN(o.multi)} 筆）${c.length ? "；不一致：" + c.map(([h, x]) => `${h} ${fmtN(x.n)} 筆`).join("、") : ""}`); });
  if (cfg.pcol) { const tg = dpTargets(cfg);
    L.push(`寬格式展開：${cfg.pcol} 的各個值 → ${cfg.pval ? cfg.pval + " 加總" : "筆數"}；` + tg.map(t => `${t}＝${Object.keys(cfg.pmap).filter(v => (cfg.pmap[v] || "").trim() === t).map(v => v || "（空白）").join("＋")}`).join("；"));
    const skip = Object.keys(cfg.pmap).filter(v => !(cfg.pmap[v] || "").trim()); if (skip.length) L.push(`未納入寬格式：${skip.map(v => v || "（空白）").join("、")}`); }
  return L;
}
function dpDetailRows(cfg, chk) {
  const rows = [["類別", "層級", "代碼", "期間或列號", "欄位", "內容"]];
  dpLevels(cfg).forEach(lv => Object.entries(chk.conf[lv].cols).filter(([h]) => cfg.roles[h] === "take").forEach(([h, x]) => x.ex.forEach(e => rows.push(["文字不一致（例）", DP_LV[lv], e.id, e.per, h, e.vals.map(([v, n]) => `${v} ×${n}`).join("、")]))));
  const xr = i => i + 2;   // Excel 列號（第 1 列是標題）
  chk.bad.id.slice(0, 2000).forEach(i => rows.push(["排除：缺少代碼", "", "", xr(i), cfg.id, ""]));
  chk.bad.date.slice(0, 2000).forEach(i => rows.push(["排除：日期無法解析", "", String(DP.rows[i][DP.head.indexOf(cfg.id)] ?? ""), xr(i), cfg.dmode === "one" ? cfg.dcol : "年月日", String(cfg.dmode === "one" ? DP.rows[i][DP.head.indexOf(cfg.dcol)] ?? "" : "")]));
  chk.ymdBad.slice(0, 2000).forEach(([i, a, b]) => rows.push(["日期與年月日不一致", "", String(DP.rows[i][DP.head.indexOf(cfg.id)]), xr(i), `${cfg.dcol}／${cfg.y}${cfg.m}${cfg.d}`, `${dpFmt(a)}／${b == null ? "無效日期" : dpFmt(b)}`]));
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
  const H = DP.head, dayT = dpBuild(cfg, { ...chk, k: Math.min(chk.k, 1) }, "day", true).head;
  const desc = h => {
    if (h === cfg.id) return `${h}：個人代碼`;
    const o = { date: "date：日期", year: "year：年", month: "month：月", day: "day：日", n_tx: "n_tx：當日交易筆數" }[h]; if (o) return o;
    if (h.endsWith("_conflict")) return `${h}：${h.slice(0, -9)} 當日是否有不一致的值（0／1）`;
    const r = cfg.roles[h];
    if (r === "take") return `${h}：${DP.kind[H.indexOf(h)] === "text" ? "文字" : DP.kind[H.indexOf(h)] === "date" ? "日期" : "數值"}${cfg.res[h] ? `（同一天不一致時${DP_RES.find(x => x[0] === cfg.res[h])[1]}）` : ""}`;
    if (r) return `${h}：當日${DP_ROLE[r]}`;
    if (h.endsWith("_n")) return `${h}：當日 ${h.slice(0, -2)} 的交易筆數`;
    return `${h}：當日 ${cfg.pcol}＝${Object.keys(cfg.pmap).filter(v => (cfg.pmap[v] || "").trim() === h).join("＋")} 的 ${cfg.pval || "筆數"} 加總`;
  };
  return {
    unit: `個人（代碼欄 ${cfg.id}，共 ${chk.ids.toLocaleString("en-US")} 人）`,
    time: `以日為單位，一人一日一筆（${chk.conf.day.groups.toLocaleString("en-US")} 筆，只含有交易的日子）；觀察期間 ${dpFmt(chk.dmin)} 至 ${dpFmt(chk.dmax)}`,
    fields: dayT.map(desc).join("\n")
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
    ${!H.length && store.values.dp_log ? `<p class="hint">這份研究上次的處理紀錄在本頁最下方，可直接複製；要重新輸出資料，請再上傳原始檔案（欄位設定會自動套用）。</p>` : ""}
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
    <p class="hint">日期可以是 Excel 日期序號（例如 45943＝2025/10/13）、日期格式的儲存格、20251013、114/10/13 或 2025/10/13；年份小於 1000 視為民國年。</p>
    <table class="dptbl"><thead><tr><th>欄位</th><th>型態</th><th>前幾個值</th><th>同一人同一天有多筆時的計算方式</th></tr></thead><tbody>${H.map((x, i) => `<tr${keys.has(x) ? ' class="key"' : ""}><td>${esc(x)}</td><td>${kindT[K[i]]}</td><td class="ex">${esc(ex(i))}</td><td>${keys.has(x) ? (x === c.id ? "個人代碼" : c.dmode === "one" && x !== c.dcol ? "核對日期用" : "日期") :
      `<select data-dprole="${esc(x)}">${Object.entries(DP_ROLE).filter(([r]) => K[i] === "text" ? ["take", "drop"].includes(r) : true).map(([r, t]) => `<option value="${r}"${c.roles[x] === r ? " selected" : ""}>${t}</option>`).join("")}</select>`}</td></tr>`).join("")}</tbody></table>
    <p class="hint">輸出為一人一日一筆：同一人同一天有多筆交易時，數值欄依這裡的設定加總、平均或取最大、最小值。預設值只是建議：數值欄預設加總；每人固定不變的欄位（例如首次捐款日）與文字欄預設「取值」，同一期間出現不同的值時會示警，由你選擇處理方式；看起來像單號的欄位預設刪除；不需要的變數也設為「刪除（不輸出）」。</p>
    <details class="dpsub"${c.tot ? " open" : ""}><summary>總額核對（選用）</summary><p class="hint">原始資料已有總額與細項（例如 mtotal 與 money1–money5）時，逐列核對總額是否等於細項合計，不一致時示警。</p>
      <label>總額欄 <select data-dp="tot">${dpOpt(numH, c.tot, "（不核對）")}</select></label>
      ${c.tot ? `<div class="chips">${numH.filter(x => x !== c.tot).map(x => `<label class="chip"><input type="checkbox" data-dppart="${esc(x)}"${c.parts.includes(x) ? " checked" : ""}>${esc(x)}</label>`).join("")}</div>` : ""}</details>
    <p><button type="button" class="copy" data-dp="check">${DP.chk ? "重新檢查資料" : "檢查資料"}</button></p></fieldset>`;
  const k = DP.chk;
  if (!k) return h + `<p class="note">設定欄位後，按「檢查資料」。</p></div>`;
  const w = [];
  if (k.bad.id.length) w.push(`缺少個人代碼 ${dpN(k.bad.id.length)} 列，已排除（Excel 列號：${k.bad.id.slice(0, 8).map(i => i + 2).join("、")}${k.bad.id.length > 8 ? "…" : ""}）`);
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
    `<p class="hint">以下欄位在同一人同一天出現不同的值，請逐一選擇處理方式（空白不列入比較）；選好之後才能輸出。「依前後幾天的交易判斷」適合居住地區這類會維持一段期間的欄位：從當天出現的值中，取這個人前後 N 天（含當天）交易裡出現次數最多者；同分時取前 N 天出現較多者，再相同則取當天之前最近一筆交易的值。「依某數值欄的金額決定」適合付款方式這類欄位：每個值加總當天該值各筆交易的金額，取合計最大者；相同時取當天第一筆。</p>` + cc.map(x => {
      const exs = lvs.flatMap(lv => k.conf[lv].cols[x].ex.slice(0, 5).map(e => `${e.id}｜${e.per}：${e.vals.map(([v, n]) => `${K[H.indexOf(x)] === "date" && typeof v === "number" ? dpFmt(v) : v} ×${n}`).join("、")}`));
      return `<div class="dpconf${c.res[x] ? "" : " todo"}"><div><b>${esc(x)}</b>　${dpN(k.conf.day.cols[x].n)} 個人日不一致</div>
        <div class="ex">${exs.map(esc).join("<br>")}</div>
        <div class="chips">${DP_RES.map(([r, t]) => `<label class="chip"><input type="radio" name="dpres-${esc(x)}" data-dpres="${esc(x)}" value="${r}"${c.res[x] === r ? " checked" : ""}>${t}</label>`).join("")}
        ${c.res[x] === "wt" ? `<label class="chip">數值欄 <select data-dpwt="${esc(x)}">${dpOpt(numH.filter(z => !keys.has(z)), (c.wt || {})[x] || (H.includes("money") ? "money" : ""), "（請選擇）")}</select></label>` : ""}
        ${c.res[x] === "near" ? `<label class="chip">前後 <input type="number" min="0" max="3650" step="1" data-dpnear="${esc(x)}" value="${esc((c.near || {})[x] ?? 30)}" style="width:5em"> 天</label>` : ""}
        <button type="button" data-dpdrop="${esc(x)}">刪除這個變數</button></div></div>`;
    }).join("")) + `</div></fieldset>`;
  // 輸出
  const need = dpNeed(c, k);
  h += `<fieldset class="struct"><legend>4. 輸出</legend>`;
  if (need.length) h += `<div class="note warn">請先在上方選擇這些欄位的處理方式：${need.map(esc).join("、")}</div>`;
  h += `<p class="hint">輸出一人一日一筆的寬格式資料：每列含 id、date（Excel 日期格式）、year、month、day、n_tx（當天合併的交易筆數）、各欄位依上方設定計算的值${c.pcol ? "，以及展開後的欄位" : ""}。只輸出有交易的日子，沒有交易的日子不補列。Excel 檔另含「處理紀錄」與「檢查明細」工作表；CSV 為 UTF-8（含 BOM），Excel、Stata、R、SPSS 都能讀取。已開啟研究資料夾時，檔案直接存進該資料夾（檔名前加研究名稱）；沒有開啟時下載到瀏覽器的下載資料夾。</p>
    <p class="dpbtns"><button type="button" class="copy" data-dpout="xlsx"${need.length ? " disabled" : ""}>下載 Excel</button>
    <button type="button" data-dpout="wide"${need.length ? " disabled" : ""}>下載 CSV</button></p>
    ${RT() === "model" ? `<p class="hint">0.2「資料結構與估計目標」的觀察單位、時間與資料欄位留白時，會自動帶入這裡的處理結果。</p>` : ""}</fieldset></div>`;
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
async function dpOutput(what) {
  const c = DP.cfg, k = DP.chk; if (!k || dpNeed(c, k).length) return;
  DP.err = ""; DP.msg = ""; dpBusy("整理資料中…"); await dpTick();
  try {
    const wide = () => dpBuild(c, k, "day", true);
    if (what === "xlsx") {
      const sh = [{ name: "一人一日", ...wide() }];
      const big = sh.filter(x => x.rows.length > DP_XLS_MAX);
      const det = dpDetailRows(c, k);
      sh.push({ name: "處理紀錄", head: ["處理紀錄"], rows: dpLogLines(c, k).map(x => [x]), dateCol: new Set() }, { name: "檢查明細", head: det[0], rows: det.slice(1), dateCol: new Set() });
      dpBusy("寫入 Excel 檔…"); await dpTick();
      const blob = await dpXlsx(sh.filter(x => x.rows.length <= DP_XLS_MAX), async f => { dpBusy(`寫入 Excel 檔… ${Math.round(f * 100)}%`); await dpTick(); });
      await dpSaveFile(blob, `${dpBase()}_處理後.xlsx`);
      if (big.length) DP.err = `${big.map(x => x.name).join("、")} 超過 Excel 的 1,048,576 列上限，未放入 Excel 檔，請改下載 CSV。`;
    } else {
      await dpSaveFile(dpCSV(wide()), `${dpBase()}_一人一日.csv`);
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
    if (d.dpwt != null) { (c.wt ||= {})[d.dpwt] = t.value || null; return dpCommit(false); }
    if (d.dpnear != null) { (c.near ||= {})[d.dpnear] = Math.max(0, Math.round(+t.value || 0)); return dpCommit(false); }
    if (d.dpflag != null) { c.flag[d.dpflag] = t.checked; return dpCommit(false); }
  });
  pane.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest(".dp button"); if (!b || b.disabled || DP.busy) return;
    if (b.dataset.dp === "check") dpRunCheck();
    else if (b.dataset.dpdrop != null) { DP.cfg.roles[b.dataset.dpdrop] = "drop"; dpCommit(false); }   // 刪除：改為不輸出（可在欄位設定改回）
    else if (b.dataset.dpout) dpOutput(b.dataset.dpout);
  });
}

if (typeof module !== "undefined") module.exports = { DP, dpSetTable, dpParseCSV, dpDecode, dpGuess, dpCheck, dpBuild, dpPivotVals, dpNeed, dpTargets, dpLogLines, dpDetailRows, dpXlsx, dpCSV, dpOpenXLSX, dpReadSheet, dpDateVal, dpFmt, dpSummary };
