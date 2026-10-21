// ── 共用規則（可在每個模組勾選；預設值沿用原本 PowerShell 版的組合） ──
const RULES = [
  { key: "citation", label: "引用格式規範", text: T.citation },
  { key: "evidence", label: "實證結果與引用分散", text: T.evidence },
  { key: "style", label: "文字風格規範", text: T.style },
  { key: "verify", label: "完成後自我核對", text: T.verify }
];

const SAME = "下一步：回到同一個 NotebookLM 對話貼上（不要開新對話）。";

// ── 分組 ──
const GROUPS = [
  { id: "write", label: "文獻探討寫作" },
  { id: "map", label: "文獻地圖" },
  { id: "deep", label: "主題群深化" },
  { id: "tools", label: "小工具" }
];

// ── 模組定義 ──
// fields：type = text | textarea | radio；rules(p) 回傳預設勾選的共用規則
// variant(p)：同一模組內不同選項的規則勾選分開記憶
const MODULES = [
  {
    id: "lr", group: "write", code: "1", label: "文獻回顧",
    hint: "由研究主題或具體問題出發，AI 先展開成學術問題，再整合上傳文獻撰寫回顧並自我驗證引用。",
    fields: [
      { id: "lr_start", type: "radio", label: "從哪裡出發", options: [["topic", "研究主題"], ["question", "具體問題"]], value: "topic" },
      { id: "lr_text", type: "text", label: "研究主題或問題", placeholder: "主題例：科技接受度模型；問題例：中介變數 C 在 A 與 B 之間的角色為何？" }
    ],
    variant: p => p.lr_start,
    rules: () => ["citation", "evidence", "style", "verify"],
    build: (p, R) => {
      if (blank(p.lr_text)) return "";
      return (p.lr_start === "question" ? T.lr_question({ question: p.lr_text }) : T.lr_topic({ topic: p.lr_text })) + R;
    },
    empty: "（請輸入研究主題或問題）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  {
    id: "dr", group: "write", code: "2", label: "段落核實改寫",
    hint: "核實論文段落中的引用，再改寫。草稿階段保留內容、字數不減；定稿階段多做術語查證，並且必須精簡。",
    fields: [
      { id: "dr_stage", type: "radio", label: "段落階段", options: [["draft", "半完成草稿（字數不減）"], ["final", "接近完稿（術語查證＋字數必減）"]], value: "draft" },
      { id: "dr_text", type: "textarea", label: "論文段落", rows: 8 }
    ],
    variant: p => p.dr_stage,
    rules: p => p.dr_stage === "final" ? ["citation", "style"] : ["citation", "evidence", "style"],
    build: (p, R) => {
      if (blank(p.dr_text)) return "";
      return p.dr_stage === "final"
        ? T.dr_final({ draft: p.dr_text }) + R + "\n\n" + T.dr_final_tail({})
        : T.dr_draft({ draft: p.dr_text }) + R;
    },
    empty: "（請貼上論文段落）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  {
    id: "m5a", group: "map", code: "3", label: "主題地圖・理論・方法",
    hint: "先把整批文獻上傳到同一個 Notebook 並開新對話。這一輪只做主題地圖、理論框架與研究方法趨勢盤點。",
    fields: [{ id: "m5a_kw", type: "text", label: "搜尋這批文獻時用的關鍵字", hint: "可留空", placeholder: "例如：品牌人格、自我一致性" }],
    rules: () => [],
    build: (p, R) => T.m5a({ sourceDesc: blank(p.m5a_kw) ? "這批上傳的文獻" : `這批用關鍵字「${p.m5a_kw}」搜尋到的文獻` }) + R,
    next: "下一步：貼到 NotebookLM 新對話；回覆完成後切到 [4]，在同一個對話接續貼上（不要開新對話）。"
  },
  {
    id: "m5b", group: "map", code: "4", label: "變數結構化與關係圖",
    hint: "接在 [3] 同一個對話，不需要重貼文獻。關係圖採用與 [10] 相同的規則：每個主題群各畫一張。",
    fields: [],
    rules: () => [],
    build: (p, R) => T.m5b({}) + R,
    next: "下一步：回到 [3] 那個對話貼上。回覆整段複製後，到「小工具 → [11] 圍籬修補」補好圍籬再貼進 Obsidian；接著切到 [5]。"
  },
  {
    id: "m5c", group: "map", code: "5", label: "研究缺口與主題建議",
    hint: "接在 [3]、[4] 同一個對話。",
    fields: [],
    rules: () => [],
    build: (p, R) => T.m5c({}) + R,
    next: SAME
  },
  {
    id: "m6a", group: "deep", code: "6", label: "主題群展開",
    hint: "把單一主題群的表格式摘要（例如 [3]、[4] 的其中一群）展開成完整的文獻探討小節。一次只貼一群。",
    fields: [{ id: "m6a_text", type: "textarea", label: "單一主題群摘要", rows: 8 }],
    rules: () => ["citation", "style", "verify"],
    build: (p, R) => blank(p.m6a_text) ? "" : T.m6a({ cluster: p.m6a_text }) + R,
    empty: "（請貼上一個主題群的摘要）",
    next: "下一步：建議貼到產生過這份主題地圖的同一個對話；回覆完成後切到 [7] 接續貼上。"
  },
  {
    id: "m6b", group: "deep", code: "7", label: "代表文獻深入分析",
    hint: "接在 [6] 同一個對話，挑出該主題群最具代表性的一篇文獻深入分析。",
    fields: [],
    rules: () => [],
    build: (p, R) => T.m6b({}) + R,
    next: "下一步：回到 [6] 那個對話貼上（不要開新對話）。"
  },
  {
    id: "m8", group: "deep", code: "8", label: "新文獻歸類與比較",
    hint: "獨立使用。先把新文獻上傳到同一個 Notebook，再判斷它屬於哪個既有主題，並挑同主題一篇代表文獻比較。",
    fields: [
      { id: "m8_paper", type: "text", label: "新文獻篇名或作者年份", placeholder: "避免 NotebookLM 搞混是哪一篇" },
      { id: "m8_themes", type: "textarea", label: "目前的主題清單", hint: "逐行或逗號分隔皆可", rows: 5 }
    ],
    rules: () => ["citation", "verify"],
    build: (p, R) => (blank(p.m8_paper) || blank(p.m8_themes)) ? "" : T.m8({ paperName: p.m8_paper, themes: p.m8_themes }) + R,
    empty: "（請填入新文獻與主題清單）",
    next: "下一步：切到這篇新文獻所在的 NotebookLM 對話貼上。"
  },
  {
    id: "m5d", group: "tools", code: "9", label: "名詞解釋",
    hint: "獨立使用。依名詞清單產生四面向（定義、角色、量表、補充）解釋。",
    fields: [{ id: "m5d_text", type: "textarea", label: "名詞清單", hint: "逐行或逗號分隔", placeholder: "品牌依附、自我一致性", rows: 5 }],
    rules: () => [],
    build: (p, R) => blank(p.m5d_text) ? "" : T.m5d({ terms: p.m5d_text }) + R,
    empty: "（請貼上名詞清單）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM。"
  },
  {
    id: "m7a", group: "tools", code: "10", label: "文字轉關係圖",
    hint: "獨立使用。任何一段已生成的文字都可以畫成 Mermaid 關係圖，每個主題群各畫一張。",
    fields: [{ id: "m7a_text", type: "textarea", label: "要畫成關係圖的文字", rows: 8 }],
    rules: () => [],
    build: (p, R) => blank(p.m7a_text) ? "" : T.m7a({ content: p.m7a_text }) + R,
    empty: "（請貼上要畫圖的文字）",
    next: "下一步：貼到 NotebookLM（建議在產生這段文字的同一個對話）；回覆整段複製後，到 [11] 補好圍籬。"
  },
  {
    id: "m7b", group: "tools", code: "11", label: "圍籬修補", tool: true,
    hint: "獨立使用。貼上 NotebookLM 的回覆（有沒有圍籬都可以），自動偵測每張圖並補上 ```mermaid 圍籬；包成 subgraph 的大圖會拆成每群一張。",
    fields: [{ id: "m7b_text", type: "textarea", label: "NotebookLM 回覆", rows: 12, mono: true }],
    build: p => {
      if (blank(p.m7b_text)) return "";
      const r = fixFences(p.m7b_text);
      return r.count ? r.text : "";
    },
    status: p => {
      if (blank(p.m7b_text)) return "";
      const r = fixFences(p.m7b_text);
      return r.count ? `已偵測到 ${r.count} 張圖` : "沒有偵測到任何 flowchart／graph 語法，請確認貼上的內容。";
    },
    empty: "（請貼上 NotebookLM 的回覆）",
    copyLabel: "複製結果",
    next: "下一步：貼進 Obsidian 的 .md 筆記，就會自動渲染成圖。"
  }
];
