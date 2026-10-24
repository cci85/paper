// ── 研究架構圖：勾選的變數成為方塊，可拖曳、畫箭頭與調節虛線，並下載 PNG ──
// 資料存在 store.values[欄位 id]：{ pos: {變數key: {x, y}}, edges: [{from, to}], mods: [{from, edge: "from>to"}] }
const DG = { W: 1000, H: 540, fill: "#ffffff", line: "#3a3f45", box: "#2f6f5e", sel: "#e3f0ec", mod: "#9a5b00", text: "#1f2328", sub: "#6b6f76" };
const DG_FONT = "'Noto Sans TC','Microsoft JhengHei','PingFang TC',sans-serif";

function dgData(id) {
  const d = store.values[id];
  if (d && typeof d === "object" && !Array.isArray(d)) { d.pos ||= {}; d.edges ||= []; d.mods ||= []; return d; }
  return (store.values[id] = { pos: {}, edges: [], mods: [] });
}

// 「中文（English）」拆成兩行
function dgLabel(name) {
  const m = name.match(/^(.*?)\s*[（(]([^（）()]*)[）)]\s*$/);
  return m ? [m[1].trim(), m[2].trim()] : [name.trim(), ""];
}
function dgSize(v) {
  const [cn, en] = dgLabel(v.name);
  const w = Math.min(300, Math.max(140, cn.length * 16 + 28, en.length * 6.6 + 28));
  return { w, h: en ? 54 : 40, cn, en };
}

// 依角色自動排列：自變數左、中介中、依變數右、調節上
function dgAutoPos(vars, pos, force) {
  const col = { iv: 130, med: 500, dv: 870 };
  const groups = { iv: [], med: [], dv: [], mod: [] };
  vars.forEach(v => groups[v.role].push(v));
  ["iv", "med", "dv"].forEach(r => {
    const g = groups[r], top = 150, span = DG.H - top - 40;
    g.forEach((v, i) => { if (force || !pos[v.key]) pos[v.key] = { x: col[r], y: top + span * (i + 0.5) / g.length }; });
  });
  groups.mod.forEach((v, i) => { if (force || !pos[v.key]) pos[v.key] = { x: DG.W * (i + 1) / (groups.mod.length + 1), y: 55 }; });
}

// 從中心 a 指向 b 的線段，裁切在方塊邊緣
function dgClip(a, sa, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (!dx && !dy) return { x: a.x, y: a.y };
  const t = Math.min(sa.w / 2 / Math.abs(dx || 1e-9), sa.h / 2 / Math.abs(dy || 1e-9));
  return { x: a.x + dx * Math.min(t, 1), y: a.y + dy * Math.min(t, 1) };
}

function dgPaths(vars, d) {
  const by = Object.fromEntries(vars.map(v => [v.key, v]));
  const edges = d.edges.filter(e => by[e.from] && by[e.to]);
  const ek = new Set(edges.map(e => e.from + ">" + e.to));
  const mods = d.mods.filter(m => by[m.from] && ek.has(m.edge));
  return { by, edges, mods };
}

// 給 Prompt 用的路徑文字
function diagramPathText(vars, d) {
  if (!d || typeof d !== "object") return [];
  const { by, edges, mods } = dgPaths(vars, { pos: {}, edges: d.edges || [], mods: d.mods || [] });
  const nm = k => by[k].name;
  return [
    ...edges.map(e => `${nm(e.from)} → ${nm(e.to)}`),
    ...mods.map(m => { const [f, t] = m.edge.split(">"); return `${nm(m.from)} 調節「${nm(f)} → ${nm(t)}」之關係`; })
  ];
}

function dgSvg(vars, d, sel, forExport) {
  const { edges, mods } = dgPaths(vars, d);
  const S = Object.fromEntries(vars.map(v => [v.key, dgSize(v)]));
  const P = d.pos;
  const mid = k => { const [f, t] = k.split(">"); return { x: (P[f].x + P[t].x) / 2, y: (P[f].y + P[t].y) / 2 }; };
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DG.W} ${DG.H}" width="${forExport ? DG.W * 2 : "100%"}" ${forExport ? `height="${DG.H * 2}"` : ""} font-family="${DG_FONT}">
<defs><marker id="dgA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${DG.line}"/></marker>
<marker id="dgM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${DG.mod}"/></marker></defs>
<rect width="${DG.W}" height="${DG.H}" fill="${DG.fill}"/>`;
  edges.forEach(e => {
    const a = dgClip(P[e.from], S[e.from], P[e.to]), b = dgClip(P[e.to], S[e.to], P[e.from]), k = e.from + ">" + e.to;
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${DG.line}" stroke-width="2" marker-end="url(#dgA)"/>`;
    if (!forExport) s += `<line data-edge="${esc(k)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="16" style="cursor:pointer"/>`;
  });
  mods.forEach((m, i) => {
    const t = mid(m.edge), a = dgClip(P[m.from], S[m.from], t);
    s += `<line x1="${a.x}" y1="${a.y}" x2="${t.x}" y2="${t.y}" stroke="${DG.mod}" stroke-width="2" stroke-dasharray="7 5" marker-end="url(#dgM)"/>`;
    if (!forExport) s += `<line data-mod="${i}" x1="${a.x}" y1="${a.y}" x2="${t.x}" y2="${t.y}" stroke="transparent" stroke-width="16" style="cursor:pointer"/>`;
  });
  vars.forEach(v => {
    const p = P[v.key], z = S[v.key], on = !forExport && sel === v.key;
    s += `<g ${forExport ? "" : `data-box="${esc(v.key)}" style="cursor:grab"`}>
<rect x="${p.x - z.w / 2}" y="${p.y - z.h / 2}" width="${z.w}" height="${z.h}" rx="8" fill="${on ? DG.sel : "#fff"}" stroke="${v.role === "mod" ? DG.mod : DG.box}" stroke-width="${on ? 3 : 1.6}"/>
<text x="${p.x}" y="${p.y + (z.en ? -4 : 5)}" text-anchor="middle" font-size="15" fill="${DG.text}">${esc(z.cn)}</text>` +
      (z.en ? `<text x="${p.x}" y="${p.y + 15}" text-anchor="middle" font-size="11" fill="${DG.sub}">${esc(z.en)}</text>` : "") + `</g>`;
  });
  return s + "</svg>";
}

// 繪製到欄位容器；sel 記住目前選取的方塊
const dgSel = {};
function renderDiagram(f, p) {
  const box = $("diag-" + f.id); if (!box) return;
  const vars = f.source(p), d = dgData(f.id);
  dgAutoPos(vars, d.pos, false);
  if (!vars.length) { box.innerHTML = `<p class="hint">（勾選變數後，這裡會出現方塊）</p>`; return; }
  if (dgSel[f.id] && !vars.some(v => v.key === dgSel[f.id])) dgSel[f.id] = null;
  box.innerHTML = dgSvg(vars, d, dgSel[f.id], false);
  if (box.dataset.wired) return;
  box.dataset.wired = "1";
  wireDiagram(box, f);
}

function wireDiagram(box, f) {
  let drag = null;
  const pt = e => { const svg = box.querySelector("svg"), m = svg.getScreenCTM().inverse(), q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; return q.matrixTransform(m); };
  const redraw = () => { const m = mod(); renderDiagram(f, valuesOf(m)); };
  box.addEventListener("pointerdown", e => {
    const g = e.target.closest("[data-box]"); if (!g) return;
    const k = g.dataset.box, d = dgData(f.id), q = pt(e);
    drag = { k, dx: d.pos[k].x - q.x, dy: d.pos[k].y - q.y, moved: 0, sx: e.clientX, sy: e.clientY };
    box.setPointerCapture(e.pointerId); e.preventDefault();
  });
  box.addEventListener("pointermove", e => {
    if (!drag) return;
    drag.moved = Math.max(drag.moved, Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy));
    if (drag.moved < 4) return;
    const q = pt(e), d = dgData(f.id);
    d.pos[drag.k] = { x: Math.max(20, Math.min(DG.W - 20, q.x + drag.dx)), y: Math.max(20, Math.min(DG.H - 20, q.y + drag.dy)) };
    redraw();
  });
  box.addEventListener("pointerup", e => {
    if (!drag) return;
    const { k, moved } = drag; drag = null;
    if (moved < 4) clickBox(k); else { save(); }
  });
  // 點箭頭、調節線、空白處
  box.addEventListener("click", e => {
    const d = dgData(f.id);
    const ed = e.target.closest("[data-edge]"), md = e.target.closest("[data-mod]");
    if (ed) {
      const s = dgSel[f.id], k = ed.dataset.edge;
      if (s) {   // 已選方塊 → 加上調節虛線
        if (!d.mods.some(m => m.from === s && m.edge === k) && !k.split(">").includes(s)) d.mods.push({ from: s, edge: k });
        dgSel[f.id] = null;
      } else {   // 未選方塊 → 刪除這條箭頭及其調節線
        const [a, b] = k.split(">");
        d.edges = d.edges.filter(x => !(x.from === a && x.to === b));
        d.mods = d.mods.filter(m => m.edge !== k);
      }
      update(); return;
    }
    if (md) {
      const vars = f.source(valuesOf(mod())), { mods } = dgPaths(vars, d), m = mods[+md.dataset.mod];
      d.mods = d.mods.filter(x => x !== m);
      update(); return;
    }
    if (!e.target.closest("[data-box]") && e.target.closest("svg")) { dgSel[f.id] = null; redraw(); }
  });
  function clickBox(k) {
    const d = dgData(f.id), s = dgSel[f.id];
    if (!s) dgSel[f.id] = k;
    else if (s === k) dgSel[f.id] = null;
    else {
      if (!d.edges.some(x => x.from === s && x.to === k)) d.edges.push({ from: s, to: k });
      dgSel[f.id] = null;
    }
    update();
  }
}

// 工具列按鈕
function diagramAction(f, act) {
  const d = dgData(f.id), vars = f.source(valuesOf(mod()));
  if (act === "layout") dgAutoPos(vars, d.pos, true);
  if (act === "clear") { d.edges = []; d.mods = []; dgSel[f.id] = null; }
  if (act === "png") return downloadDiagram(vars, d);
  update();
}

function downloadDiagram(vars, d) {
  if (!vars.length) return;
  const svg = dgSvg(vars, d, null, true);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas"); c.width = DG.W * 2; c.height = DG.H * 2;
    c.getContext("2d").drawImage(img, 0, 0);
    c.toBlob(b => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = "research-framework.png";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
