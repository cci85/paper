// [7B] 圍籬修補：把 NotebookLM 回覆中的 Mermaid 圖補上 ```mermaid 圍籬（由 PowerShell 版移植）

// 把「一個 flowchart 裡包多個 subgraph」拆成多個獨立區塊；subgraph 以外的跨群連線捨棄
function splitSubgraphs(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^\s*subgraph\s+(\S+)(?:\s*\[(.*?)\])?\s*$/);
    if (!m) { i++; continue; }
    const label = (m[2] || m[1]).trim();
    let depth = 1; const body = []; i++;
    while (i < lines.length && depth > 0) {
      if (/^\s*subgraph\b/.test(lines[i])) { depth++; body.push(lines[i]); }
      else if (/^\s*end\s*$/.test(lines[i])) { depth--; if (depth > 0) body.push(lines[i]); }
      else body.push(lines[i]);
      i++;
    }
    out.push({ label, body: body.join("\n") });
  }
  return out;
}

// 回傳 { text, count }；沒偵測到圖時 count = 0
function fixFences(raw) {
  const F = "```";
  const lines = raw.replace(/\r\n/g, "\n").split("\n").filter(l => !/^```/.test(l.trim()));
  const start = [];
  lines.forEach((l, i) => { if (/^\s*(flowchart|graph)\s/.test(l)) start.push(i); });
  if (!start.length) return { text: "", count: 0 };

  const n = start.length;
  const rs = start.slice();
  const re = start.map((s, k) => (k + 1 < n ? start[k + 1] - 1 : lines.length - 1));
  const syntax = /(-->|---|\(|\)|\[|\]|\{|\}|%%|^end$|^subgraph\b)/;
  const labels = new Array(n).fill("");

  // 第一張圖：往前找最近的一行非空白、非語法文字當標題
  let j = start[0] - 1;
  while (j >= 0 && !lines[j].trim()) j--;
  if (j >= 0) { const c = lines[j].trim(); if (c && !syntax.test(c)) labels[0] = c; }

  // 其餘各張：上一張圖範圍的最後一行若不像語法，視為這張圖的標題
  for (let k = 1; k < n; k++) {
    let j = re[k - 1];
    while (j > rs[k - 1] && !lines[j].trim()) j--;
    if (j > rs[k - 1]) {
      const c = lines[j].trim();
      if (c && !syntax.test(c)) { labels[k] = c; re[k - 1] = j - 1; }
    }
  }

  const blocks = [];
  for (let k = 0; k < n; k++) {
    const range = lines.slice(rs[k], re[k] + 1);
    if (range.some(l => /^\s*subgraph\b/.test(l))) blocks.push(...splitSubgraphs(range));
    else blocks.push({ label: labels[k], body: range.slice(1).join("\n") });
  }
  const text = blocks.map(b =>
    (b.label ? `### ${b.label}\n\n` : "") + `${F}mermaid\nflowchart TD\n${b.body.trim()}\n${F}`).join("\n\n");
  return { text, count: blocks.length };
}
