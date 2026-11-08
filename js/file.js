// ── 研究存檔：一個研究一個 .md（可閱讀的內容＋我的筆記＋網頁讀取用的資料區塊），架構圖另存 PNG ──
// 選定資料夾後自動儲存（停止修改約 2 秒）；寫入前檢查檔案是否已在其他地方更新，避免覆蓋。
// 資料夾存取使用瀏覽器的 File System Access API（Chrome、Edge）；不支援時改用下載與上傳。

const FS_OK = "showDirectoryPicker" in window;
const DATA_TAG = "paper-data";
const NOTE_START = "<!-- 我的筆記：以下可自由編輯，網頁存檔時會保留 -->";
const NOTE_END = "<!-- 我的筆記結束 -->";
const NOTE_EMPTY = "（在這裡寫下你的筆記）";
const PNG_NAME = { f31_diag: "架構圖", ac_diag: "檢核架構圖", as_diag: "組合草圖", fin_diag: "組合架構圖", ow_diag: "自訂架構圖" };

const proj = { dir: null, dirName: "", file: "", lastMod: 0, lastPayload: "", pngSig: {}, bound: false, pending: null, busy: false, timer: 0 };

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
  const m = text.match(/<!-- paper-data[^\n]*\r?\n([\s\S]*?)\r?\n-->\s*$/) || text.match(/```json paper-data\r?\n([\s\S]*?)\r?\n```\s*$/);   // 新：隱藏的註解；舊：程式碼區塊
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
  // 從試算表全選複製時，會帶入大量空白列與空白欄：去掉全空的列，以及最右側全空的欄
  const out = rows.map(r => r.concat(Array(n - r.length).fill(""))).filter(r => r.some(v => v.trim()));
  let w = n; while (w > 1 && out.every(r => !r[w - 1].trim())) w--;
  return out.length >= 2 ? out.map(r => r.slice(0, w)) : null;
}
// 轉成 Markdown 表格：第一列為標題；儲存格內的換行改為 <br>，直線改為 \|
function mdTable(rows) {
  const c = v => v.trim().replace(/\|/g, "\\|").replace(/\n/g, "<br>") || " ";
  return [rows[0].map(c), rows[0].map(() => "---"), ...rows.slice(1).map(r => r.map(c))].map(r => "| " + r.join(" | ") + " |").join("\n");
}
// 存檔中的長文字：試算表內容轉成表格，其他文字的標題降級
// 欄位多的試算表（例如文獻比較表）改成「一列一段」：第一欄為小標題，其餘欄位列為「- **欄名**：內容」
function mdCards(rows) {
  const h = rows[0].map(v => v.trim()), c = v => v.trim().replace(/\n+/g, "<br>");
  return rows.slice(1).map(r => [`##### ${c(r[0]) || "（未命名）"}`, ...r.slice(1).map((v, i) => [h[i + 1], c(v)]).filter(([, v]) => v).map(([k, v]) => `- **${k || "欄位"}**：${v}`)].join("\n")).join("\n\n");
}
const mdText = t => { const r = parseTsv(t); return r ? (r[0].length > 6 ? mdCards(r) : mdTable(r)) : demote(t); };

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

// 論文草稿（第一章～第五章）：每節列出各步驟的 AI 回覆，尚未撰寫的節留白；另存為「研究名稱_論文.md」
function thesisText(pngs) {
  const zh = (store.values.tt_zh || "").trim(), en = (store.values.tt_en || "").trim();
  const out = ["---", `title: ${zh || (store.name || "") + "　論文草稿"}`, "source: 論文工作台", "---", "",
    `# ${zh || (store.name || "") + "　論文草稿"}`, "", ...(en ? [`**${en}**`, ""] : []),
    "> 本檔由論文工作台依各章節的 AI 回覆自動產生，每次存檔都會重新產生；要修改內容，請在網站上修改，或另存一份再編輯。", ""];
  OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).forEach(c => {
    out.push(`## ${c.ch}`, "");
    c.secs.forEach(s => {
      out.push(`### ${s.no ? s.no + " " : ""}${s.title}`, "");
      if (s.id === "s3-1") { const g = pngs.find(x => x.f.id === "f31_diag"); if (g && g.d.edges.length) out.push(`![圖 3-1 研究架構圖](<${g.file}>)`, ""); }
      stepsOf(s).forEach(st => {
        const r = (store.replies || {})[s.id + "|" + st.mod];
        if (!blank(r)) out.push(mdText(fenceMermaid(deLatex(r))), "");
      });
    });
  });
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
      if (!blank(r)) lines.push(`**AI 回覆**\n\n${mdText(fenceMermaid(deLatex(r)))}`);
      if (lines.length) blocks.push(`### ${s.no ? `步驟 ${i + 1}　` : ""}${m.label}\n\n${lines.join("\n\n")}`);
    });
    if (blocks.length) out.push(`## ${s.no ? s.no + " " : ""}${s.title}\n\n${blocks.join("\n\n")}`);
  });
  return out.join("\n\n");
}

function fileText(notes, pngs) {
  const now = new Date(), ts = now.toLocaleString("zh-TW", { hour12: false });
  return [
    "---", `title: ${store.name || ""}`, `updated: ${ts}`, "source: 論文工作台", "---", "",
    `# ${store.name || ""}`, "",
    "## 我的筆記", NOTE_START, notes || NOTE_EMPTY, NOTE_END, "",
    readable(pngs) || "（尚未填寫任何欄位）", "",
    // 資料區塊放在 HTML 註解中，Obsidian 等 Markdown 軟體閱讀時不會顯示；「>」改寫為 \u003e，避免提早結束註解
    "<!-- " + DATA_TAG + "（論文工作台讀回原始設定用，閱讀時不顯示，請勿修改）", payloadOf().replace(/>/g, "\\u003e"), "-->", ""
  ].join("\n");
}

// ── 研究與檔案的綁定 ──
// 原則：網站只寫入「開啟或建立的那一個檔案」（proj.dir＋proj.file），檔名不再由研究名稱推算。
// 寫入前核對檔案內的研究名稱；不同就停止存檔，沒有覆寫選項。
// 綁定資訊同時記在瀏覽器（store.bind：資料夾名稱、檔名、最後寫入時間），重新開啟時三者都對得上才接回。
const bindOk = () => !!(proj.dir && proj.file && proj.bound);
function setBind(dir, file, mod) {
  proj.dir = dir; proj.dirName = dir ? dir.name : ""; proj.file = file || ""; proj.lastMod = mod || 0;
  proj.bound = !!(dir && file); proj.pngSig = {};
  store.bind = proj.bound ? { dir: proj.dirName, file: proj.file, mod: proj.lastMod } : null;
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
  if (proj.bound) { kvSet("dir", dir); kvSet("file", file); }
  renderProj();
}
function unbind(msg) {
  clearTimeout(proj.timer);
  proj.bound = false; store.bind = null;
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
  renderProj();
  if (msg) pstat(msg, "warn");
}

// ── 寫入（自動儲存） ──
async function permOk(ask, dir) {
  dir = dir || proj.dir; if (!dir) return false;
  const o = { mode: "readwrite" };
  if ((await dir.queryPermission(o)) === "granted") return true;
  return ask ? (await dir.requestPermission(o)) === "granted" : false;
}

async function writeNow() {
  clearTimeout(proj.timer);
  if (!bindOk() || proj.busy) return;
  if (!(await permOk(false))) { pstat("需要重新允許存取資料夾，請按「繼續使用資料夾」。", "warn"); return; }
  proj.busy = true;
  try {
    const name = proj.file;
    const fh = await proj.dir.getFileHandle(name, { create: true });
    const pngs = diagramsToSave();   // 會補齊架構圖資料，須在比較內容之前
    const f = await fh.getFile(), old = f.size ? await f.text() : "", notes = notesOf(old), pay = payloadOf();
    if (old.trim()) {
      const d = parseFile(old);
      // 保護一：檔案不是本網頁的存檔，或屬於另一個研究 → 停止存檔
      if (!d) { unbind(`「${name}」不是論文工作台的存檔，已停止自動存檔。請按「開啟研究」。`); return; }
      if ((d.name || "") !== (store.name || "")) { unbind(`「${name}」是研究「${d.name}」的存檔，與畫面上的研究「${store.name}」不同，已停止自動存檔，檔案沒有被修改。請按「開啟研究」。`); return; }
      // 保護二：檔案在其他電腦更新過 → 自動載入檔案中的版本（畫面內容先備份，可按「復原」取回）
      const theirs = payOf(d);
      if (f.lastModified !== proj.lastMod && theirs !== pay && theirs !== proj.lastPayload) {
        applyData(d, proj.dir, name, f.lastModified);
        pstat(`「${name}」已在其他電腦更新，已自動載入最新版本；這台電腦畫面上原本的內容可按「復原載入前的內容」取回。`, "warn");
        return;
      }
    }
    for (const g of pngs) {   // 架構圖有變動才重畫 PNG
      if (proj.pngSig[g.file] === g.sig) continue;
      const blob = await diagramBlob(g.vars, g.d);
      const w = await (await proj.dir.getFileHandle(g.file, { create: true })).createWritable();
      await w.write(blob); await w.close();
      proj.pngSig[g.file] = g.sig;
    }
    try {   // 論文草稿另存一檔（內容有變才寫）
      const tt = thesisText(pngs), tn = name.replace(/\.md$/i, "") + "_論文.md";
      if (proj.thesisSig !== tn + tt) {
        const tw = await (await proj.dir.getFileHandle(tn, { create: true })).createWritable();
        await tw.write(tt); await tw.close(); proj.thesisSig = tn + tt;
      }
    } catch {}
    if (pay === proj.lastPayload && f.lastModified === proj.lastMod) { pstat(`已儲存：${proj.dirName}／${name}`); return; }
    const w = await fh.createWritable();
    await w.write(fileText(notes, pngs)); await w.close();
    proj.lastMod = (await fh.getFile()).lastModified; proj.lastPayload = pay;
    store.bind = { dir: proj.dirName, file: name, mod: proj.lastMod };
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch {}
    pstat(`已儲存 ${new Date().toLocaleTimeString("zh-TW", { hour12: false })}`);
  } catch (e) {
    pstat("存檔失敗：" + (e && e.message || e), "warn");
  } finally { proj.busy = false; }
}

window.flushSave = () => writeNow();   // 重新整理前先存檔
// app.js 每次 save() 後呼叫
window.onStoreSave = () => {
  if (!bindOk() || proj.busy) return;
  if (payloadOf() === proj.lastPayload) return;
  pstat("修改中…");
  clearTimeout(proj.timer);
  proj.timer = setTimeout(() => writeNow(), 2000);
};

// ── 讀入 ──
// 載入另一份研究前，畫面內容備份在瀏覽器裡（不寫入任何資料夾），可按「復原」取回
const BACKUP_KEY = "research-prompts-backup";
const hasContent = () => Object.values(store.values || {}).some(v => typeof v === "string" ? !blank(v) : Array.isArray(v) ? v.length : v && typeof v === "object" && Object.keys(v.edges || v.pos || {}).length)
  || Object.values(store.replies || {}).some(v => !blank(v));
function backupCurrent(d) {
  if (!hasContent() || (d && payloadOf() === payOf(d))) return;
  const now = new Date(), pad = n => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify({ stamp, data: JSON.parse(payloadOf()) })); } catch {}
  const b = $("pundo"); b.hidden = false; b.textContent = `復原載入前的內容（${stamp.slice(9, 11)}:${stamp.slice(11, 13)}）`;
}

function applyData(d, dir, fileName, lastMod) {
  backupCurrent(d);
  store.name = d.name || (fileName || "").replace(/\.md$/i, "");
  store.values = d.values || {}; store.rules = d.rules || {}; store.replies = migrateReplies(d.replies || {}); store.seeded = {};
  setBind(dir, fileName, lastMod);
  proj.lastPayload = payloadOf();
  showAll();
}

// 選資料夾（可取消；取消時什麼都不改變）
async function chooseDir() {
  try { const h = await window.showDirectoryPicker({ id: "paper-save", mode: "readwrite", startIn: proj.dir || undefined }); return (await permOk(true, h)) ? h : null; }
  catch (e) { if (e && e.name !== "AbortError") pstat("無法選擇資料夾：" + e.message, "warn"); return null; }
}

async function listFiles(dir) {
  const items = [];
  for await (const [n, h] of dir.entries()) {
    if (h.kind !== "file" || !/\.md$/i.test(n)) continue;
    const f = await h.getFile();
    if (!f.size || f.size > 3e7) continue;
    const d = parseFile(await f.text());
    if (d) items.push({ n, t: f.lastModified, name: d.name || "", bak: /_備份_\d{8}-\d{6}\.md$/i.test(n) });
  }
  return items.sort((a, b) => a.bak - b.bak || b.t - a.t);
}

// ① 開啟研究：先存好目前的研究（存回它自己的檔案）→ 選資料夾 → 列出研究 → 點選開啟
async function openResearch() {
  if (!FS_OK) { $("pupload").click(); return; }
  const dir = await chooseDir(); if (!dir) return;   // 先選資料夾（須在按下按鈕後立刻開啟）；取消時什麼都不改變
  await writeNow();
  const items = await listFiles(dir), box = $("plist");
  proj.pending = dir;
  const btn = x => `<button type="button" data-open="${esc(x.n)}"><b>${esc(x.n.replace(/\.md$/i, ""))}</b><small>${x.name && x.name + ".md" !== x.n ? "研究名稱：" + esc(x.name) + "｜" : ""}${new Date(x.t).toLocaleString("zh-TW", { hour12: false })}</small></button>`;
  const main = items.filter(x => !x.bak), bak = items.filter(x => x.bak);
  box.innerHTML = `<p class="hint">資料夾「${esc(dir.name)}」：點選要開啟的研究　<button type="button" data-act="closelist">取消</button></p>` +
    (main.length ? main.map(btn).join("") : `<p class="hint">這個資料夾沒有研究存檔。要在這裡開始新的研究，請按「新研究」。</p>`) +
    (bak.length ? `<details><summary>備份檔（${bak.length}）</summary>${bak.map(btn).join("")}</details>` : "");
  box.hidden = false;
}
async function openFromDir(name) {
  const dir = proj.pending; $("plist").hidden = true; proj.pending = null; if (!dir) return;
  try {
    const fh = await dir.getFileHandle(name), f = await fh.getFile(), d = parseFile(await f.text());
    if (!d) { pstat(`「${name}」沒有網頁的資料區塊，無法開啟。`, "warn"); return; }
    await writeNow();
    applyData(d, dir, name, f.lastModified);
    pstat(`已開啟「${store.name}」。`);
  } catch (e) { pstat("開啟失敗：" + (e && e.message || e), "warn"); }
}

// ②③ 新研究／另存新名稱：在頁面上輸入名稱 → 按鈕選資料夾 → 建立新檔（同名檔案已存在就拒絕，不做任何變更）
function nameForm(mode) {
  const box = $("plist"); proj.pending = null; proj.form = mode;
  const def = mode === "saveas" && store.name ? store.name + "_2" : "";
  box.innerHTML = `<div class="pform"><b>${mode === "new" ? "新研究" : "另存新名稱（原本的存檔保留不動）"}</b>
    <label>研究名稱 <input type="text" id="pformname" value="${esc(def)}" placeholder="例如：抖音衝動購買" autocomplete="off"></label>
    <button type="button" data-act="mkfile">${FS_OK ? "選擇存放的資料夾並建立" : "建立"}</button><button type="button" data-act="closelist">取消</button>
    <p class="hint" id="pformmsg">${mode === "new" ? "目前的研究會先存好；新研究從空白開始。" : "目前的內容會存成新檔，之後的修改都存在新檔。"}</p></div>`;
  box.hidden = false; $("pformname").focus();
}
async function makeFile() {
  const mode = proj.form, name = safeName($("pformname").value), msg = $("pformmsg");
  if (!name) { msg.textContent = "請先輸入研究名稱。"; msg.className = "hint warn"; return; }
  let dir = null;
  if (FS_OK) {
    dir = await chooseDir(); if (!dir) return;   // 取消：什麼都不改變
    if (await dir.getFileHandle(name + ".md").then(() => true, () => false)) {
      msg.textContent = `資料夾「${dir.name}」裡已經有「${name}.md」，沒有做任何變更。要繼續那份研究，請按「取消」再按「開啟研究」；要建立新的，請換一個名稱。`; msg.className = "hint warn"; return;
    }
  }
  $("plist").hidden = true;
  await writeNow();   // 目前的研究存回它自己的檔案
  if (mode === "new") { backupCurrent(null); store.values = {}; store.rules = {}; store.replies = {}; store.seeded = {}; }
  store.name = name; proj.lastPayload = "";
  if (dir) { setBind(dir, name + ".md", 0); showAll(); await writeNow(); pstat(mode === "new" ? `已建立新研究「${name}」。` : `已另存為「${name}」，之後的修改都存在這份。`); }
  else { unbind(); showAll(); if (mode === "saveas") downloadAll(); else pstat(`已建立新研究「${name}」。這個瀏覽器不支援自動存檔，請用「下載存檔」。`); }
}

// ── 介面 ──
function pstat(t, cls) { const s = $("pstat"); s.textContent = t; s.className = "pstat" + (cls ? " " + cls : ""); }

function renderProj() {
  $("pname").value = store.name || "";
  const c = $("pcur");
  c.innerHTML = bindOk() ? `目前研究的存檔：<b>${esc(proj.dirName)}／${esc(proj.file)}</b>`
    : FS_OK ? `<span class="warn">目前研究沒有連結存檔（內容只記在這個瀏覽器）。請按「開啟研究」或「新研究」。</span>`
    : `<span class="warn">這個瀏覽器不支援自動存檔，請用「下載存檔」。</span>`;
  $("pdl").hidden = FS_OK;
}

function downloadAll() {
  const pngs = diagramsToSave();
  const saveB = (blob, n) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
  if (!projName()) { pstat("請先按「新研究」取名稱。", "warn"); return; }
  saveB(new Blob([fileText("", pngs)], { type: "text/markdown" }), projName() + ".md");
  pngs.forEach(g => diagramBlob(g.vars, g.d).then(b => saveB(b, g.file)));
  pstat("已下載存檔，請手動放到雲端硬碟的存檔資料夾。");
}

$("pbar").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "pformname") { e.preventDefault(); makeFile(); } });
$("pbar").addEventListener("click", async e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.id === "popen") return openResearch();
  if (b.id === "pnew") return nameForm("new");
  if (b.id === "psaveas") return nameForm("saveas");
  if (b.dataset.act === "mkfile") return makeFile();
  if (b.id === "pdl") return downloadAll();
  if (b.dataset.act === "closelist") { $("plist").hidden = true; proj.pending = null; return; }
  if (b.dataset.open) return openFromDir(b.dataset.open);
  if (b.id === "pundo") {
    let bk = null; try { bk = JSON.parse(localStorage.getItem(BACKUP_KEY) || "null"); } catch {}
    if (!bk || !bk.data) { pstat("沒有可復原的備份。", "warn"); return; }
    if (!confirm("把畫面換回載入前的內容？\n復原的內容不會寫入任何檔案；要保存它，請按「另存新名稱」。")) return;
    await writeNow();
    const d = bk.data;
    backupCurrent(d);
    store.name = d.name || ""; store.values = d.values || {}; store.rules = d.rules || {}; store.replies = migrateReplies(d.replies || {}); store.seeded = {};
    unbind(); showAll();
    pstat("已復原載入前的內容（尚未連結存檔）。要保存，請按「另存新名稱」。", "warn");
    return;
  }
  if (b.id === "presume") { if (await resumeBind(true)) b.hidden = true; return; }
});

// 啟動或允許權限後：資料夾、檔名、檔案內的研究名稱都對得上，才接回自動存檔
async function resumeBind(ask) {
  const h = await kvGet("dir"), file = await kvGet("file"), bd = store.bind;
  if (!h || !file || !bd || bd.dir !== h.name || bd.file !== file) { unbind(); return true; }
  if (!(await permOk(ask, h))) return false;
  try {
    const f = await (await h.getFileHandle(file)).getFile(), d = parseFile(await f.text());
    if (!d || (d.name || "") !== (store.name || "")) { unbind(`上次的存檔「${file}」與畫面上的研究對不上，未接回自動存檔。請按「開啟研究」。`); return true; }
    if (f.lastModified !== bd.mod) {   // 檔案在其他電腦更新過：以檔案為準
      applyData(d, h, file, f.lastModified);
      pstat(`「${file}」已在其他電腦更新，已載入最新版本；這台電腦畫面上原本的內容可按「復原載入前的內容」取回。`, "warn");
      return true;
    }
    proj.dir = h; proj.dirName = h.name; proj.file = file; proj.lastMod = f.lastModified; proj.bound = true;
    proj.lastPayload = payOf(d); renderProj();
    pstat("已接回存檔。"); writeNow();
  } catch { unbind(`找不到上次的存檔「${file}」，未接回自動存檔。請按「開啟研究」。`); }
  return true;
}

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


$("pupload").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  const d = parseFile(await f.text());
  if (!d) { pstat(`「${f.name}」沒有網頁的資料區塊，無法讀回設定。`, "warn"); return; }
  applyData(d, null, "", 0);
  pstat(`已載入「${f.name}」。這個瀏覽器不支援自動存檔，修改後請用「下載存檔」。`);
});

// 啟動
(async () => {
  renderProj();
  if (!FS_OK) { pstat(whyNoFs(), "warn"); return; }
  if (!store.bind) { pstat(""); return; }
  if (!(await resumeBind(false))) {
    const b = $("presume"); b.hidden = false; b.textContent = `繼續使用「${store.bind.dir}／${store.bind.file}」`;
    pstat("瀏覽器重新開啟後，需要再允許一次資料夾存取。", "warn");
  }
})();
