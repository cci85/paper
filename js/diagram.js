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

// 從方塊內的點 a 沿方向朝 b，求與方塊邊界的交點
function dgRectHit(c, sz, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, x0 = c.x - sz.w / 2, x1 = c.x + sz.w / 2, y0 = c.y - sz.h / 2, y1 = c.y + sz.h / 2;
  let t = 1;
  if (dx > 0) t = Math.min(t, (x1 - a.x) / dx); else if (dx < 0) t = Math.min(t, (x0 - a.x) / dx);
  if (dy > 0) t = Math.min(t, (y1 - a.y) / dy); else if (dy < 0) t = Math.min(t, (y0 - a.y) / dy);
  return { x: a.x + dx * Math.max(0, t), y: a.y + dy * Math.max(0, t) };
}

// 箭頭露在兩個方塊之外的區段（以中心連線的比例表示），接點只能落在這段之內
function dgRange(f, t, P, S) {
  const A = P[f], B = P[t], L = Math.hypot(B.x - A.x, B.y - A.y) || 1;
  const a = dgClip(A, S[f], B), b = dgClip(B, S[t], A);
  const ta = Math.hypot(a.x - A.x, a.y - A.y) / L, tb = Math.hypot(b.x - A.x, b.y - A.y) / L, span = Math.max(tb - ta, 0.01);
  return [ta + span * 0.08, tb - span * 0.14];
}

// 調節虛線的位置：同一條箭頭上、或同一個調節變數的多條虛線自動錯開；拖曳過的（m.t）以手動位置為準
function dgModGeom(mods, P, S) {
  const byEdge = {}, byFrom = {};
  mods.forEach(m => { (byEdge[m.edge] ||= []).push(m); (byFrom[m.from] ||= []).push(m); });
  return mods.map(m => {
    const [f, t] = m.edge.split(">");
    const ie = byEdge[m.edge].indexOf(m), ne = byEdge[m.edge].length;
    const im = byFrom[m.from].indexOf(m), nm = byFrom[m.from].length;
    const auto = 0.5 + (ie - (ne - 1) / 2) * 0.18 + (im - (nm - 1) / 2) * 0.16;
    const [lo, hi] = dgRange(f, t, P, S);
    const r = typeof m.t === "number" ? Math.max(lo, Math.min(hi, m.t)) : lo + (hi - lo) * Math.max(0.1, Math.min(0.9, auto));
    const end = { x: P[f].x + (P[t].x - P[f].x) * r, y: P[f].y + (P[t].y - P[f].y) * r };
    const z = S[m.from], off = nm > 1 ? (im - (nm - 1) / 2) * Math.min(z.w * 0.7 / (nm - 1), 70) : 0;
    const anchor = { x: P[m.from].x + off, y: P[m.from].y };
    return { m, end, start: dgRectHit(P[m.from], z, anchor, end), f, t };
  });
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
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DG.W} ${DG.H}" width="${forExport ? DG.W * 2 : "100%"}" ${forExport ? `height="${DG.H * 2}"` : ""} font-family="${DG_FONT}">
<defs><marker id="dgA" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${DG.line}"/></marker>
<marker id="dgM" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${DG.mod}"/></marker></defs>
<rect width="${DG.W}" height="${DG.H}" fill="${DG.fill}"/>`;
  edges.forEach(e => {
    const a = dgClip(P[e.from], S[e.from], P[e.to]), b = dgClip(P[e.to], S[e.to], P[e.from]), k = e.from + ">" + e.to;
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${DG.line}" stroke-width="2" marker-end="url(#dgA)"/>`;
    if (!forExport) s += `<line data-edge="${esc(k)}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="16" style="cursor:pointer"/>`;
  });
  const MG = dgModGeom(mods, P, S);
  MG.forEach(({ start: a, end: t }, i) => {
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
  if (!forExport) MG.forEach(({ end: t }, i) => {
    s += `<circle data-modh="${i}" cx="${t.x}" cy="${t.y}" r="8" fill="${DG.mod}" fill-opacity="0.18" stroke="${DG.mod}" stroke-width="1" style="cursor:ew-resize"><title>拖曳以調整接點位置</title></circle>`;
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
    const h = e.target.closest("[data-modh]");
    if (h) {   // 拖曳調節虛線的接點，沿著被調節的箭頭移動
      const vars = f.source(valuesOf(mod())), d = dgData(f.id), { mods } = dgPaths(vars, d);
      drag = { mod: mods[+h.dataset.modh], moved: 0, sx: e.clientX, sy: e.clientY };
      box.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
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
    if (drag.mod) {
      const [a, b] = drag.mod.edge.split(">"), A = d.pos[a], B = d.pos[b];
      const vx = B.x - A.x, vy = B.y - A.y, L = vx * vx + vy * vy || 1;
      const S = Object.fromEntries(f.source(valuesOf(mod())).map(v => [v.key, dgSize(v)]));
      const [lo, hi] = dgRange(a, b, d.pos, S);
      drag.mod.t = Math.max(lo, Math.min(hi, ((q.x - A.x) * vx + (q.y - A.y) * vy) / L));
      redraw(); return;
    }
    d.pos[drag.k] = { x: Math.max(20, Math.min(DG.W - 20, q.x + drag.dx)), y: Math.max(20, Math.min(DG.H - 20, q.y + drag.dy)) };
    redraw();
  });
  box.addEventListener("pointerup", e => {
    if (!drag) return;
    const { k, moved, mod: dm } = drag; drag = null;
    if (dm) { if (moved >= 4) save(); return; }   // 點接點不刪除；要刪除請點虛線
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
