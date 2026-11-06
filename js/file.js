// ── 研究存檔：一個研究一個 .md（可閱讀的內容＋我的筆記＋網頁讀取用的資料區塊），架構圖另存 PNG ──
// 選定資料夾後自動儲存（停止修改約 2 秒）；寫入前檢查檔案是否已在其他地方更新，避免覆蓋。
// 資料夾存取使用瀏覽器的 File System Access API（Chrome、Edge）；不支援時改用下載與上傳。

const FS_OK = "showDirectoryPicker" in window;
const DATA_TAG = "paper-data";
const NOTE_START = "<!-- 我的筆記：以下可自由編輯，網頁存檔時會保留 -->";
const NOTE_END = "<!-- 我的筆記結束 -->";
const NOTE_EMPTY = "（在這裡寫下你的筆記）";
const PNG_NAME = { ac_diag: "架構圖", as_diag: "組合草圖", fin_diag: "組合架構圖", ow_diag: "自訂架構圖" };

const proj = { dir: null, dirName: "", file: "", lastMod: 0, lastPayload: "", pngSig: {}, conflict: false, busy: false, timer: 0 };

// ── IndexedDB：記住選過的資料夾與目前的存檔 ──
function idb(mode, fn) {
  return new Promise((res, rej) => {
    const r = indexedDB.open("paper-prompt", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const tx = r.result.transaction("kv", mode), q = fn(tx.objectStore("kv"));
      tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error);
    };
  });
}
const kvGet = k => idb("readonly", s => s.get(k)).catch(() => null);
const kvSet = (k, v) => idb("readwrite", s => s.put(v, k)).catch(() => {});

// ── 檔名與資料 ──
const safeName = s => (s || "").replace(/[\\/:*?"<>|\r\n]+/g, "").trim().slice(0, 80);
const projName = () => safeName(store.name);
const payOf = d => JSON.stringify({ app: "paper-prompt", v: 1, name: d.name || "", values: d.values || {}, rules: d.rules || {}, replies: d.replies || {} });
const payloadOf = () => payOf(store);

function parseFile(text) {
  const m = text.match(/```json paper-data\r?\n([\s\S]*?)\r?\n```\s*$/);
  if (!m) return null;
  try { const d = JSON.parse(m[1]); return d && d.app === "paper-prompt" ? d : null; } catch { return null; }
}
function notesOf(text) {
  const a = text.indexOf(NOTE_START), b = text.indexOf(NOTE_END);
  return a >= 0 && b > a ? text.slice(a + NOTE_START.length, b).replace(/^\r?\n|\r?\n$/g, "") : "";
}

// 欄位值（不經過目前步驟；給存檔與架構圖用）
function modVals(m) {
  const p = {};
  m.fields.forEach(f => { p[f.id] = store.values[f.id] ?? (Array.isArray(f.value) ? f.value.slice() : f.value ?? ""); });
  return p;
}
function diagramsToSave() {
  return Object.values(DEFS).flatMap(m => m.fields.filter(f => f.type === "diagram" && PNG_NAME[f.id]).map(f => {
    const p = modVals(m), vars = f.source(p), d = dgSeed(f, p);
    dgAutoPos(vars, d.pos, false);   // 從未在畫面上出現過的變數也要有位置，否則無法畫成 PNG
    return { f, vars, d, file: `${projName()}_${PNG_NAME[f.id]}.png`, sig: JSON.stringify([vars, d.pos, d.edges, d.mods]) };
  })).filter(x => x.vars.length && x.d.edges.length);
}

// 貼上的內容若有標題，降三級，避免打亂存檔的章節結構
const demote = t => String(t).trim().replace(/^(#{1,6})(\s)/gm, (_, h, sp) => "#".repeat(Math.min(6, h.length + 3)) + sp);

// 從試算表複製的內容（以 Tab 分隔；含換行的儲存格以雙引號包住）→ 每列一個陣列；不像表格時回傳 null
function parseTsv(text) {
  const t = String(text).replace(/\r\n?/g, "\n").replace(/\n+$/, "");
  if (!t.includes("\t")) return null;
  const rows = []; let row = [], cell = "", i = 0, q = false;
  while (i < t.length) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (c === '"') { q = false; i++; continue; }
      cell += c; i++; continue;
    }
    if (c === '"' && cell === "") { q = true; i++; continue; }
    if (c === "\t") { row.push(cell); cell = ""; i++; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; continue; }
    cell += c; i++;
  }
  row.push(cell); rows.push(row);
  const n = Math.max(...rows.map(r => r.length));
  const full = rows.filter(r => r.length === n).length;
  if (rows.length < 2 || n < 2 || full < rows.length * 0.8) return null;
  return rows.map(r => r.concat(Array(n - r.length).fill("")));
}
// 轉成 Markdown 表格：第一列為標題；儲存格內的換行改為 <br>，直線改為 \|
function mdTable(rows) {
  const c = v => v.trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>") || " ";
  return [rows[0].map(c), rows[0].map(() => "---"), ...rows.slice(1).map(r => r.map(c))].map(r => "| " + r.join(" | ") + " |").join("\n");
}
// 存檔中的長文字：試算表內容轉成表格，其他文字的標題降級
const mdText = t => { const r = parseTsv(t); return r ? mdTable(r) : demote(t); };

// AI 回覆中沒有圍籬的 Mermaid 圖：就地補上 ```mermaid 圍籬（包成 subgraph 的大圖拆成每群一張），其餘文字不動
const MM_LINE = /-->|---|-\.->|==>|^\s*(subgraph|end|classDef|class|style|linkStyle|direction|%%)\b|^\s*[A-Za-z_][\w-]*\s*[\[\(\{]/;
function fenceMermaid(text) {
  const t = String(text);
  if (/```\s*mermaid/i.test(t)) return t;   // 已有圍籬
  const L = t.replace(/\r\n?/g, "\n").split("\n"), out = [];
  for (let i = 0; i < L.length; i++) {
    if (!/^\s*(flowchart|graph)\s/.test(L[i])) { out.push(L[i]); continue; }
    let j = i + 1, last = i;
    while (j < L.length && (!L[j].trim() || MM_LINE.test(L[j]))) { if (L[j].trim()) last = j; j++; }
    const r = fixFences(L.slice(i, last + 1).join("\n"));
    if (r.count) out.push(r.text); else out.push(...L.slice(i, last + 1));
    i = last;
  }
  return out.join("\n");
}

// 可閱讀的內容：依目錄列出有填寫的欄位與 AI 回覆；同一欄位只在第一次出現時列出
function readable(pngs) {
  const shown = new Set(), out = [];
  const fmt = (f, v) => {
    if (f.type === "radio") return (f.options.find(o => o[0] === v) || [, v])[1];
    if (f.type === "checks") return f.options.filter(o => o[2] || v.includes(o[0])).map(o => o[1]).join("、");
    return String(v);
  };
  ALL_SECS.forEach(s => {
    const blocks = [];
    stepsOf(s).forEach((st, i) => {
      const m = DEFS[st.mod], lines = [], fixed = st.fixed || {};
      m.fields.forEach(f => {
        if (f.id in fixed || shown.has(f.id) || f.type === "picker") return;
        if (f.type === "diagram") {
          const g = pngs.find(x => x.f.id === f.id);
          if (g) { shown.add(f.id); lines.push(`**${f.label}**\n\n![${f.label}](<${g.file}>)`); }
          return;
        }
        const v = store.values[f.id];
        if (v === undefined || blank(Array.isArray(v) ? v.join("") : v)) return;
        if (JSON.stringify(v) === JSON.stringify(f.value ?? "")) return;   // 與預設值相同者不列
        shown.add(f.id);
        const t = fmt(f, v);
        lines.push(f.type === "textarea" ? `**${f.label}**\n\n${mdText(t)}` : `**${f.label}**：${t}`);
      });
      const r = (store.replies || {})[s.id + "|" + st.mod];
      if (!blank(r)) lines.push(`**AI 回覆**\n\n${mdText(fenceMermaid(r))}`);
      if (lines.length) blocks.push(`### ${s.no ? `步驟 ${i + 1}　` : ""}${m.label}\n\n${lines.join("\n\n")}`);
    });
    if (blocks.length) out.push(`## ${s.no ? s.no + " " : ""}${s.title}\n\n${blocks.join("\n\n")}`);
  });
  return out.join("\n\n");
}

function fileText(notes, pngs) {
  const now = new Date(), ts = now.toLocaleString("zh-TW", { hour12: false });
  return [
    "---", `title: ${store.name || ""}`, `updated: ${ts}`, "source: 論文 Prompt 產生器", "---", "",
    `# ${store.name || ""}`, "",
    "## 我的筆記", NOTE_START, notes || NOTE_EMPTY, NOTE_END, "",
    readable(pngs) || "（尚未填寫任何欄位）", "",
    "---", "以下資料區塊供論文 Prompt 產生器讀回原始設定，請勿修改。", "",
    "```json " + DATA_TAG, payloadOf(), "```", ""
  ].join("\n");
}

// ── 寫入（自動儲存） ──
async function permOk(ask) {
  if (!proj.dir) return false;
  const o = { mode: "readwrite" };
  if ((await proj.dir.queryPermission(o)) === "granted") return true;
  return ask ? (await proj.dir.requestPermission(o)) === "granted" : false;
}

async function writeNow(force) {
  clearTimeout(proj.timer);
  if (!proj.dir || !projName() || proj.busy) return;
  if (proj.conflict && !force) return;
  if (!(await permOk(false))) { pstat("需要重新允許存取資料夾，請按「繼續使用資料夾」。", "warn"); return; }
  proj.busy = true;
  try {
    const name = projName() + ".md";
    if (proj.file !== name) { proj.file = name; proj.lastMod = 0; proj.lastPayload = ""; proj.pngSig = {}; }
    const fh = await proj.dir.getFileHandle(name, { create: true });
    const pngs = diagramsToSave();   // 會補齊架構圖資料，須在比較內容之前
    const f = await fh.getFile(), old = f.size ? await f.text() : "", notes = notesOf(old), pay = payloadOf();
    // 檔案在上次讀寫之後被改過：
    //   資料區塊與網頁相同 → 視為已同步；只有筆記被改 → 保留新筆記照常儲存；
    //   資料區塊不同（另一台電腦的網頁存過）或不是本網頁的檔案 → 暫停自動儲存，由使用者決定
    if (f.size && f.lastModified !== proj.lastMod) {
      const d = parseFile(old), theirs = d ? payOf(d) : null;
      if (theirs === pay) { proj.lastMod = f.lastModified; proj.lastPayload = pay; }
      else if (!force && (theirs === null ? !!old.trim() : theirs !== proj.lastPayload)) { proj.conflict = true; showConflict(d); return; }
    }
    for (const g of pngs) {   // 架構圖有變動才重畫 PNG
      if (proj.pngSig[g.file] === g.sig) continue;
      const blob = await diagramBlob(g.vars, g.d);
      const w = await (await proj.dir.getFileHandle(g.file, { create: true })).createWritable();
      await w.write(blob); await w.close();
      proj.pngSig[g.file] = g.sig;
    }
    if (pay === proj.lastPayload && f.lastModified === proj.lastMod) { pstat(`已儲存：${proj.dirName}／${name}`); return; }
    const w = await fh.createWritable();
    await w.write(fileText(notes, pngs)); await w.close();
    proj.lastMod = (await fh.getFile()).lastModified; proj.lastPayload = pay; proj.conflict = false;
    hideConflict();
    kvSet("file", name);
    pstat(`已儲存 ${new Date().toLocaleTimeString("zh-TW", { hour12: false })}：${proj.dirName}／${name}`);
  } catch (e) {
    pstat("存檔失敗：" + (e && e.message || e), "warn");
  } finally { proj.busy = false; }
}

// app.js 每次 save() 後呼叫
window.onStoreSave = () => {
  if (!proj.dir || proj.busy) return;
  if (!projName()) { pstat("請輸入研究名稱，才會自動存檔。", "warn"); return; }
  if (payloadOf() === proj.lastPayload) return;
  pstat("修改中…");
  clearTimeout(proj.timer);
  proj.timer = setTimeout(() => writeNow(false), 2000);
};

// ── 讀入 ──
// 載入檔案前，先備份畫面上的內容（瀏覽器內一份；有存檔資料夾時另存「研究名稱_備份_時間.md」），可按「復原」取回
const BACKUP_KEY = "research-prompts-backup";
const hasContent = () => Object.values(store.values || {}).some(v => typeof v === "string" ? !blank(v) : Array.isArray(v) ? v.length : v && typeof v === "object" && Object.keys(v.edges || v.pos || {}).length)
  || Object.values(store.replies || {}).some(v => !blank(v));
function backupCurrent(d) {
  if (!hasContent() || payloadOf() === payOf(d)) return;
  const now = new Date(), pad = n => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const data = JSON.parse(payloadOf()), text = fileText("", []);
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ stamp, data })); } catch {}
  if (proj.dir) {
    const n = `${projName() || "未命名"}_備份_${stamp}.md`;
    proj.dir.getFileHandle(n, { create: true }).then(h => h.createWritable()).then(async w => { await w.write(text); await w.close(); }).catch(() => {});
    proj.backupFile = n;
  } else proj.backupFile = "";
  showUndo(stamp);
}
function showUndo(stamp) {
  const b = $("pundo"); b.hidden = false; b.textContent = `復原載入前的內容（${stamp.slice(9, 11)}:${stamp.slice(11, 13)}）`;
}

function applyData(d, fileName, lastMod) {
  backupCurrent(d);
  store.name = d.name || (fileName || "").replace(/\.md$/i, "");
  store.values = d.values || {}; store.rules = d.rules || {}; store.replies = migrateReplies(d.replies || {}); store.seeded = {};
  proj.file = fileName || ""; proj.lastMod = lastMod || 0; proj.lastPayload = payloadOf(); proj.pngSig = {}; proj.conflict = false;
  hideConflict();
  $("pname").value = store.name;
  showAll();
}

async function openFromDir(name) {
  try {
    const fh = await proj.dir.getFileHandle(name), f = await fh.getFile(), d = parseFile(await f.text());
    if (!d) { pstat(`「${name}」沒有網頁的資料區塊，無法讀回設定。`, "warn"); return; }
    await writeNow(false);   // 先存好目前的研究
    applyData(d, name, f.lastModified);
    kvSet("file", name);
    pstat(`已開啟：${proj.dirName}／${name}`);
  } catch (e) { pstat("開啟失敗：" + (e && e.message || e), "warn"); }
}

async function listFiles() {
  const items = [];
  for await (const [n, h] of proj.dir.entries()) {
    if (h.kind !== "file" || !/\.md$/i.test(n)) continue;
    const f = await h.getFile();
    if (!f.size || f.size > 5e6) continue;
    if (parseFile(await f.text())) items.push({ n, t: f.lastModified });
  }
  return items.sort((a, b) => b.t - a.t);
}

async function showList() {
  const box = $("plist");
  if (!box.hidden) { box.hidden = true; return; }
  if (!proj.dir) {   // 沒有選資料夾：從檔案開啟（不會自動儲存）
    $("pupload").click(); return;
  }
  if (!(await permOk(true))) { pstat("沒有取得資料夾的存取權限。", "warn"); return; }
  const items = await listFiles();
  box.innerHTML = items.length
    ? items.map(x => `<button type="button" data-open="${esc(x.n)}"><b>${esc(x.n.replace(/\.md$/i, ""))}</b><small>${new Date(x.t).toLocaleString("zh-TW", { hour12: false })}</small></button>`).join("")
    : `<p class="hint">這個資料夾還沒有存檔。</p>`;
  box.hidden = false;
}

// ── 衝突處理 ──
function showConflict(d, msg) {
  const c = $("pconflict");
  c.innerHTML = `${msg || `「${esc(proj.file)}」已在其他地方更新（例如另一台電腦）。自動儲存已暫停。`}
    <button type="button" data-act="reload">載入檔案中的版本</button><button type="button" data-act="overwrite">以這個網頁的內容覆寫</button>`;
  c.hidden = false;
  c.dataset.has = d ? "1" : "";
  pstat("自動儲存已暫停，請確認要使用哪一個版本。", "warn");
}
function hideConflict() { const c = $("pconflict"); c.hidden = true; c.innerHTML = ""; }

// ── 介面 ──
function pstat(t, cls) { const s = $("pstat"); s.textContent = t; s.className = "pstat" + (cls ? " " + cls : ""); }

function renderProj() {
  $("pname").value = store.name || "";
  $("pdir").textContent = proj.dir ? `存檔資料夾：${proj.dirName}` : (FS_OK ? "選擇存檔資料夾" : "下載存檔");
  $("pdir").dataset.mode = proj.dir ? "change" : (FS_OK ? "pick" : "download");
}

async function pickDir() {
  try {
    const h = await window.showDirectoryPicker({ id: "paper-save", mode: "readwrite" });
    proj.dir = h; proj.dirName = h.name; proj.file = ""; proj.lastMod = 0; proj.lastPayload = ""; proj.pngSig = {};
    await kvSet("dir", h); await kvSet("file", "");
    renderProj();
    if (projName()) {
      const exists = await h.getFileHandle(projName() + ".md").then(() => true, () => false);
      if (exists) {   // 同名檔案已存在：不自動覆寫，請研究者選擇
        proj.file = projName() + ".md"; proj.conflict = true;
        showConflict(null, `資料夾中已有「${esc(proj.file)}」。要用哪一個版本？（兩份都想留，請改研究名稱）`);
      }
      else writeNow(false);
    } else pstat("請輸入研究名稱，才會自動存檔。", "warn");
  } catch (e) { if (e && e.name !== "AbortError") pstat("無法選擇資料夾：" + e.message, "warn"); }
}

function downloadAll() {
  const pngs = diagramsToSave();
  const save = (blob, n) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  store.name = $("pname").value.trim();
  if (!projName()) { pstat("請先輸入研究名稱。", "warn"); return; }
  save(new Blob([fileText("", pngs)], { type: "text/markdown" }), projName() + ".md");
  pngs.forEach(g => diagramBlob(g.vars, g.d).then(b => save(b, g.file)));
  pstat("已下載存檔。這個瀏覽器不支援直接存入資料夾，請手動放到雲端硬碟的存檔資料夾。");
}

function newProject() {
  if (!confirm("開始新的研究？目前的內容" + (proj.dir && projName() ? "已存檔，" : "若未存檔將會清除，") + "欄位會全部清空。")) return;
  writeNow(false).finally(() => {
    store.name = ""; store.values = {}; store.rules = {}; store.replies = {}; store.seeded = {};
    proj.file = ""; proj.lastMod = 0; proj.lastPayload = ""; proj.pngSig = {}; proj.conflict = false;
    hideConflict(); kvSet("file", ""); showAll(); renderProj();
    pstat("請輸入新研究的名稱。");
    $("pname").focus();
  });
}

$("pbar").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "pdir") return b.dataset.mode === "download" ? downloadAll() : pickDir();
  if (b.id === "popen") return showList();
  if (b.id === "pnew") return newProject();
  if (b.id === "pundo") {
    let bk = null; try { bk = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null"); } catch {}
    if (!bk || !bk.data) { pstat("沒有可復原的備份。", "warn"); return; }
    if (!confirm("以載入前備份的內容取代目前畫面？目前畫面的內容也會先備份。")) return;
    const keepFile = proj.file, keepMod = proj.lastMod;
    applyData(bk.data, keepFile, keepMod);
    proj.lastPayload = "";   // 讓自動儲存把復原的內容寫回檔案
    pstat("已復原載入前的內容" + (proj.dir ? "，稍後會自動存回檔案。" : "。"));
    save(); return;
  }
  if (b.id === "presume") { if (await permOk(true)) { b.hidden = true; pstat(`已連接資料夾：${proj.dirName}`); writeNow(false); } return; }
  if (b.dataset.open) { $("plist").hidden = true; return openFromDir(b.dataset.open); }
  if (b.dataset.act === "reload") {
    const fh = await proj.dir.getFileHandle(proj.file), f = await fh.getFile(), d = parseFile(await f.text());
    if (d) applyData(d, proj.file, f.lastModified); else pstat("檔案中沒有可讀回的資料。", "warn");
    pstat(`已載入檔案中的版本：${proj.file}`);
    return;
  }
  if (b.dataset.act === "overwrite") { proj.conflict = false; hideConflict(); return writeNow(true); }
});

// 不支援資料夾存取的原因（狀態列說明）
function whyNoFs() {
  const ua = navigator.userAgent, tail = "目前只能用「下載存檔」與「開啟存檔」。";
  if (navigator.brave) return "Brave 預設關閉資料夾存取：在網址列輸入 brave://flags/#file-system-access-api，改為 Enabled 並重新啟動瀏覽器；或改用 Chrome、Edge 開啟。" + tail;
  if (window.self !== window.top) return "網頁被嵌在其他頁面裡，無法存取資料夾，請直接在 Chrome 的分頁開啟本網址。" + tail;
  if (/Android|iPhone|iPad|Mobile/i.test(ua)) return "手機與平板的瀏覽器不支援資料夾存取，請在電腦版 Chrome 或 Edge 開啟。" + tail;
  if (/Line\/|FBAN|FBAV|Instagram|Obsidian|Electron/i.test(ua)) return "網頁開在其他程式的內建瀏覽器裡，請複製網址，改在 Chrome 或 Edge 開啟。" + tail;
  if (/Firefox\//.test(ua)) return "Firefox 不支援資料夾存取，請改用 Chrome 或 Edge 開啟。" + tail;
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari 不支援資料夾存取，請改用 Chrome 或 Edge 開啟。" + tail;
  if (!window.isSecureContext) return "網頁不是以 https 開啟，無法存取資料夾，請使用 https://cci85.github.io/paper/。" + tail;
  return "這個瀏覽器不支援資料夾存取，請改用電腦版 Chrome 或 Edge 開啟。" + tail;
}

// 研究名稱：邊打邊記，不必等游標離開
$("pname").addEventListener("input", () => { store.name = $("pname").value.trim(); });
$("pname").addEventListener("change", () => {
  const old = projName();
  store.name = $("pname").value.trim();
  if (proj.dir && old && projName() && old !== projName()) pstat(`將另存為「${projName()}.md」，原本的「${old}.md」會保留。`);
  save();
});

$("pupload").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const d = parseFile(await f.text());
  if (!d) { pstat(`「${f.name}」沒有網頁的資料區塊，無法讀回設定。`, "warn"); return; }
  applyData(d, "", 0);
  pstat(proj.dir ? `已載入「${f.name}」，之後會存到 ${proj.dirName}。` : `已載入「${f.name}」。`);
  if (proj.dir) writeNow(false);
});

// 啟動：接回上次的資料夾與存檔
(async () => {
  renderProj();
  if (!FS_OK) { pstat(whyNoFs(), "warn"); return; }
  const h = await kvGet("dir");
  if (!h) { pstat("尚未選擇存檔資料夾：目前內容只記在這個瀏覽器。"); return; }
  proj.dir = h; proj.dirName = h.name; renderProj();
  if (await permOk(false)) { pstat(`已連接資料夾：${proj.dirName}`); return writeNow(false); }
  const b = $("presume"); b.hidden = false; b.textContent = `繼續使用資料夾「${proj.dirName}」`;
  pstat("瀏覽器重新開啟後，需要再允許一次資料夾存取。", "warn");
})();
