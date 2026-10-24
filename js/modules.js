// ── 共用規則（可在每個模組勾選；舊模組的預設值沿用原本 PowerShell 版的組合） ──
const RULES = [
  { key: "citation", label: "引用格式規範", text: T.citation },
  { key: "evidence", label: "實證結果與引用分散", text: T.evidence },
  { key: "style", label: "文字風格規範", text: T.style },
  { key: "verify", label: "完成後自我核對", text: T.verify },
  // opt：只在步驟預設有列入時才顯示
  { key: "support", label: "文獻支持程度總結", text: T.support, opt: true }
];

// 貼到哪裡
const TARGETS = {
  nlm: "貼到 NotebookLM 對話",
  table: "貼到 NotebookLM「資料表」的自訂指示",
  ai: "貼到一般 AI 對話（Claude、ChatGPT、Gemini），不是 NotebookLM",
  tool: "在本頁直接處理，不需貼到 AI"
};

// 說明文字中的{#id}會換成本頁編號，{@id} 會換成另一頁的「頁名 [編號]」
const DEFS = {
  // ─── 前置探索 ───
  focus: {
    label: "研究方向聚焦", target: "ai",
    hint: "給尚未讀過文獻的研究生：以選擇題逐步把生活觀察收斂成研究問題，並產生中英文關鍵字與檢索字串。下方欄位全部選填；都不填時輸出原文，由 AI 從第一個問題開始問。",
    fields: [
      { id: "f_phen", type: "textarea", label: "感興趣的現象或研究方向", hint: "選填", rows: 2, placeholder: "例如：為什麼有些人願意排隊買網紅商品" },
      { id: "f_dir", type: "text", label: "想要的研究方向", hint: "選填", placeholder: "例如：價格對購買的影響、指導教授建議的方向" },
      { id: "f_res", type: "text", label: "可運用的資源", hint: "選填", placeholder: "例如：可取得的樣本、合作企業、熟悉的理論或方法" },
      { id: "f_prev", type: "textarea", label: "前次的研究問題草稿與檢索字串", hint: "在新視窗接續時才需要；填了會直接從第三節開始", rows: 3 }
    ],
    build: p => buildFocus(p),
    next: "下一步：貼到一般 AI 的新對話，依提問逐題作答；檢索到的文獻存進 Zotero 後，上傳到 NotebookLM，接著用{#matrix}。"
  },
  matrix: {
    label: "建立文獻比較表", target: "table",
    hint: "把筆記本中每一篇文獻整理成一列，作為後續分析的底稿。內容量大，請放在 NotebookLM 的「資料表」功能，不要貼在對話框，以免輸出被截斷。",
    fields: [{ id: "mx_cols", type: "checks", label: "要整理的欄位", hint: "「文獻」欄固定保留",
      options: MATRIX_COLS.map(c => [c.key, c.label, c.locked]), value: MATRIX_COLS.map(c => c.key) }],
    build: p => buildMatrix(p.mx_cols),
    next: "下一步：在已上傳文獻的 NotebookLM 建立資料表，把這段貼進自訂指示；完成後匯出成試算表，接著進行{#gapsel}。要看整批文獻的全貌時，再用{#m5a}。"
  },
  gapsel: {
    label: "選定變數與研究缺口", target: "ai",
    hint: "依文獻比較表，以選擇題逐步選出依變數與其他變數，再推薦 key paper、列出研究缺口候選，最後產出研究架構草案。只依據表格內容，不讀全文。",
    fields: [
      { id: "gs_mode", type: "radio", label: "表格怎麼給 AI", options: [["upload", "上傳試算表檔案"], ["paste", "貼上表格內容"]], value: "upload" },
      { id: "gs_table", type: "textarea", label: "表格內容", hint: "選「貼上表格內容」時才需要；從試算表複製即可", rows: 6, mono: true }
    ],
    build: p => buildGapsel(p),
    empty: "（請貼上表格內容，或改選「上傳試算表檔案」）",
    next: "下一步：在一般 AI 開新對話，上傳由{#matrix}匯出的試算表（或使用貼上的表格），貼上這段 Prompt 後依提問逐步選擇。步驟四的路徑清單可貼到{#hypo}的研究架構欄位。"
  },
  m5a: {
    label: "主題地圖・理論・方法", target: "nlm",
    hint: "先把整批文獻上傳到同一個 Notebook 並開新對話。這一輪只做主題地圖、理論框架與研究方法趨勢盤點。",
    fields: [{ id: "m5a_kw", type: "text", label: "搜尋這批文獻時用的關鍵字", hint: "可留空；可貼上{#focus}產生的檢索字串", placeholder: "例如：品牌人格、自我一致性" }],
    rules: () => [],
    build: (p, R) => T.m5a({ sourceDesc: blank(p.m5a_kw) ? "這批上傳的文獻" : `這批用關鍵字「${p.m5a_kw}」搜尋到的文獻` }) + R,
    next: "下一步：貼到 NotebookLM 新對話；回覆完成後切到{#m5b}，在同一個對話接續貼上（不要開新對話）。"
  },
  m5b: {
    label: "變數結構化與關係圖", target: "nlm",
    hint: "接在{#m5a}同一個對話，不需要重貼文獻。關係圖採用與{#m7a}相同的規則：每個主題群各畫一張。",
    fields: [], rules: () => [],
    build: (p, R) => T.m5b({}) + R,
    next: "下一步：回到{#m5a}那個對話貼上。回覆整段複製後，用{#m7b}補好圍籬再貼進 Obsidian；接著切到{#m5c}。"
  },
  m5c: {
    label: "研究缺口與主題建議", target: "nlm",
    hint: "接在{#m5a}、{#m5b}同一個對話。",
    fields: [], rules: () => [],
    build: (p, R) => T.m5c({}) + R,
    next: "下一步：回到同一個 NotebookLM 對話貼上（不要開新對話）。"
  },

  // ─── 論文撰寫：第一、二章 ───
  lr: {
    label: "文獻回顧", target: "nlm",
    hint: "由研究主題或具體問題出發，AI 先展開成學術問題，再整合上傳文獻撰寫回顧並自我驗證引用。",
    fields: [
      { id: "lr_start", type: "radio", label: "從哪裡出發", options: [["topic", "研究主題"], ["question", "具體問題"]], value: "topic" },
      { id: "lr_text", type: "text", label: "研究主題或問題", placeholder: "主題例：科技接受度模型；問題例：中介變數 C 在 A 與 B 之間的角色為何？" }
    ],
    variant: p => p.lr_start,
    rules: () => ["citation", "evidence", "style", "verify"],
    build: (p, R) => blank(p.lr_text) ? "" : (p.lr_start === "question" ? T.lr_question({ question: p.lr_text }) : T.lr_topic({ topic: p.lr_text })) + R,
    empty: "（請輸入研究主題或問題）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  m6a: {
    label: "主題群展開", target: "nlm",
    hint: "把單一主題群的表格式摘要（例如{#m5a}整理出的其中一群，或文獻比較表中同群的幾列）展開成完整的文獻探討小節。一次只貼一群。",
    fields: [{ id: "m6a_text", type: "textarea", label: "單一主題群摘要", rows: 8 }],
    rules: () => ["citation", "style", "verify"],
    build: (p, R) => blank(p.m6a_text) ? "" : T.m6a({ cluster: p.m6a_text }) + R,
    empty: "（請貼上一個主題群的摘要）",
    next: "下一步：建議貼到產生過這份主題地圖的同一個對話；回覆完成後切到{#m6b}接續貼上。"
  },
  m6b: {
    label: "代表文獻深入分析", target: "nlm",
    hint: "接在{#m6a}同一個對話，挑出該主題群最具代表性的一篇文獻深入分析。",
    fields: [], rules: () => [],
    build: (p, R) => T.m6b({}) + R,
    next: "下一步：回到{#m6a}那個對話貼上（不要開新對話）。"
  },
  m8: {
    label: "新文獻歸類與比較", target: "nlm",
    hint: "獨立使用。先把新文獻上傳到同一個 Notebook，再判斷它屬於草稿中哪個既有主題，並挑同主題一篇代表文獻比較。",
    fields: [
      { id: "m8_paper", type: "text", label: "新文獻篇名或作者年份", placeholder: "避免 NotebookLM 搞混是哪一篇" },
      { id: "m8_themes", type: "textarea", label: "論文草稿目前的主題清單", hint: "逐行或逗號分隔皆可", rows: 5 }
    ],
    rules: () => ["citation", "verify"],
    build: (p, R) => (blank(p.m8_paper) || blank(p.m8_themes)) ? "" : T.m8({ paperName: p.m8_paper, themes: p.m8_themes }) + R,
    empty: "（請填入新文獻與主題清單）",
    next: "下一步：切到這篇新文獻所在的 NotebookLM 對話貼上。"
  },
  m5d: {
    label: "名詞解釋", target: "nlm",
    hint: "依名詞清單產生四面向（定義、角色、量表、補充）解釋，可作為第一章名詞釋義或第二章構念定義的素材。",
    fields: [{ id: "m5d_text", type: "textarea", label: "名詞清單", hint: "逐行或逗號分隔", placeholder: "品牌依附、自我一致性", rows: 5 }],
    rules: () => [],
    build: (p, R) => blank(p.m5d_text) ? "" : T.m5d({ terms: p.m5d_text }) + R,
    empty: "（請貼上名詞清單）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM。"
  },

  // ─── 0.2 追問：研究架構、問卷、實務情境 ───
  asf: {
    label: "提出候選研究架構", target: "nlm",
    hint: "可接在{#lr}同一個對話，或開新對話。先依描述層次歸類相關構念，再提出數個彼此有明顯差異的研究架構，各附變數、理論、文獻支持與研究缺口，最後附上變數清單，供你挑選。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；以一句話描述要探討的現象或問題，可幫助 AI 聚焦", placeholder: "例如：使用者滑 TikTok 或 Instagram Reels 時看到平台推薦的產品開箱影片，是否會因此產生衝動購買？" },
      { id: "as_method", type: "radio", label: "研究方法", options: [["any", "不限"], ["survey", "問卷調查法"], ["exp", "實驗設計法"], ["sec", "次級資料"]], value: "survey" },
      { id: "as_n", type: "radio", label: "架構數量", options: [["2", "2 個"], ["3", "3 個"], ["4", "4 個"], ["5", "5 個"], ["6", "6 個"]], value: "4" }
    ],
    rules: () => ["citation"],
    build: (p, R) => blank(p.as_ctx) ? "" : T.ask_frame({ ctx: p.as_ctx.trim(), con: p.as_con.trim(), method: p.as_method, n: p.as_n }) + R,
    empty: "（請填入研究情境）",
    next: "下一步：到{#asmore}，在同一個對話補齊變數與各變數可擔任的角色，再到{#asmix}組合。"
  },
  asmore: {
    label: "補充變數清單", target: "nlm",
    hint: "接在{#asf}同一個對話。AI 已經思考過各架構，這一步只做一件事：逐篇檢查上傳文獻，補上尚未出現的變數，並列出每個變數可擔任的所有角色；有文獻依據的標示「文獻」，依理論推論的標示「推論」。",
    fields: [],
    rules: () => ["citation"],
    build: (p, R) => T.ask_more({}) + R,
    next: "下一步：若回覆最後寫「未完」，輸入「繼續」。把{#asf}與本步驟（含「繼續」）的各次回覆一起貼到{#asmix}，網頁會自動合併、去除重複。"
  },
  vdeep: {
    label: "深入了解單一變數", target: "nlm",
    hint: "依上傳文獻整理一個變數的定義、維度、理論、量表、施測情境、前因、後果與相近構念。只能根據上傳文獻回答，文獻只是順帶提及這個變數時，回答會較薄。",
    fields: [
      { id: "vd_var", type: "text", label: "變數名稱", placeholder: "例如：顧客靈感（customer inspiration）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" }
    ],
    rules: () => ["citation", "verify"],
    build: (p, R) => blank(p.vd_var) ? "" : T.var_deep({ v: p.vd_var.trim(), ctx: p.as_ctx.trim() }) + R,
    empty: "（請填入變數名稱）",
    next: "下一步：「文獻不足之處」列出的關鍵字可用來檢索新文獻，上傳到同一個 Notebook 後再問一次。要寫成第二章時用{#m6a}；整理量表與題項用{#opdef}。"
  },
  vcomp: {
    label: "區辨相近變數", target: "nlm",
    hint: "兩個以上的變數看起來很像時使用：比較定義、描述層次、文獻中的角色、衡量方式與實證區辨，判斷它們是同一構念、部分重疊、前後因果，還是彼此獨立，並建議在研究架構中如何處理。",
    fields: [
      { id: "vc_vars", type: "textarea", label: "變數", hint: "每行一個，至少兩個；建議附英文原文", rows: 4, placeholder: "偶遇商品資訊（Encountering Product Information）\n體驗到的驚喜感（Experienced Serendipity）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" }
    ],
    rules: () => ["citation"],
    build: (p, R) => {
      const vars = (p.vc_vars || "").split(/\r?\n/).map(v => v.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean);
      return vars.length < 2 ? "" : T.var_compare({ vars, ctx: p.as_ctx.trim() }) + R;
    },
    empty: "（請填入至少兩個變數，每行一個）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。若判斷為前後因果，可回到{#asmix}調整勾選；要深入了解其中一個變數，用{#vdeep}。"
  },
  asmix: {
    label: "組合研究架構", target: "nlm", stack: true,   // stack：欄位佔滿寬度，Prompt 放在下方
    hint: "在本頁貼上{#asf}與{#asmore}的回覆，依「變數清單」勾選要用的變數，可跨架構混搭；同一變數有多種角色時，會出現在各角色組中，由你決定位置；標示「推論」者為文獻尚未以此角色研究過的位置。產生的 Prompt 貼回同一個 NotebookLM 對話，確認路徑與文獻支持，並產生 Google Scholar Labs 的英文檢索問題。",
    fields: [
      { id: "as_vlist", type: "textarea", label: "前面步驟的回覆", hint: "貼上提出候選研究架構與補充變數清單的各次回覆，可一起貼上", rows: 6, mono: true },
      { id: "as_pick", type: "picker", label: "勾選要用的變數", source: p => parseVarList(p.as_vlist), roles: MIX_ROLES, value: [] },
      { id: "as_diag", type: "diagram", label: "研究架構圖", hint: "選填。拖曳方塊調整位置；點一個方塊再點另一個方塊，畫出箭頭；先點調節變數再點一條箭頭，畫出調節虛線；未選方塊時點箭頭或虛線可刪除。有畫箭頭時，AI 會逐條檢核你的路徑",
        source: p => { const on = new Set(p.as_pick || []); return parseVarList(p.as_vlist).filter(v => on.has(v.key)); } }
    ],
    rules: () => ["citation"],
    build: (p, R) => {
      const vs = parseVarList(p.as_vlist), on = new Set(p.as_pick || []);
      const picked = vs.filter(v => on.has(v.key));
      return picked.length ? T.ask_mix({ picked, paths: diagramPathText(picked, p.as_diag) }) + R : "";
    },
    status: p => {
      if (blank(p.as_vlist)) return "";
      const n = parseVarList(p.as_vlist).length;
      return n ? `已讀取 ${n} 個變數` : "沒有讀取到變數，請確認貼上的內容包含「變數清單」，且每行為「角色｜變數名稱｜出處｜架構」。";
    },
    empty: "（請貼上上一步的回覆，並勾選要用的變數）",
    next: "下一步：貼回同一個 NotebookLM 對話。回覆中的英文問題一次一個貼到 Google Scholar Labs（scholar.google.com 的 Labs），找到的文獻上傳到同一個 Notebook。確認組合可行後，到{#asq}時「選定的架構」選「我勾選組合的架構」；要查實務面時，把本步驟的完整回覆貼到{#asp}。"
  },
  asq: {
    label: "問卷草稿與可行性評估", target: "nlm",
    hint: "接在{#asf}同一個對話，選定一個架構後使用。題項只取自上傳文獻，量表的原始論文須先上傳到 NotebookLM；找不到的會標示【待補量表】。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_archm", type: "radio", label: "選定的架構", options: [["mine", "我勾選組合的架構"], ["num", "候選架構編號"], ["other", "其他"]], value: "mine" },
      { id: "as_archno", type: "text", label: "架構編號", hint: "填數字即可", placeholder: "例如：2", when: p => p.as_archm === "num" },
      { id: "as_arch", type: "textarea", label: "其他架構", hint: "簡短描述即可，不要貼上整段回覆", rows: 2, placeholder: "例如：架構一加上消費者創新性作為調節變數", when: p => p.as_archm === "other" },
      { id: "as_target", type: "text", label: "研究對象", hint: "選填", placeholder: "例如：過去三個月曾在抖音購物的消費者" },
      { id: "as_scale", type: "text", label: "量尺形式", hint: "選填；不填時依原量表", placeholder: "例如：Likert 七點尺度" },
      { id: "as_amethod", type: "text", label: "分析方法", hint: "選填；不填時由 AI 依架構建議", placeholder: "例如：PLS-SEM" }
    ],
    rules: () => ["citation"],
    status: p => p.as_archm === "other" && (p.as_arch || "").trim().length > 300 ? "「其他架構」內容過長，NotebookLM 可能無法讀取；同一個對話中簡短描述即可。" : "",
    build: (p, R) => {
      const arch = archLabel(p);
      return blank(p.as_ctx) || !arch ? "" : T.ask_survey({ ctx: p.as_ctx.trim(), arch, target: p.as_target.trim(), scale: p.as_scale.trim(), method: p.as_amethod.trim() }) + R;
    },
    empty: "（請填入研究情境，並指定選定的架構）",
    next: "下一步：【待補量表】的構念，請找到量表原始論文上傳後再問一次；確認可行後，到{#asp}查證實務面。正式撰寫第三章時，用{#opdef}整理量表。"
  },
  asp: {
    label: "研究情境與實務缺口", target: "ai",
    hint: "請使用已開啟網路搜尋的 AI；未開啟搜尋時，AI 只能憑記憶作答，捏造的風險很高。學術論點只採用{#asmix}的回覆，網路資料只用於研究情境與實務面。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；以一句話描述要探討的現象或問題，可幫助 AI 聚焦", placeholder: "例如：使用者滑 TikTok 或 Instagram Reels 時看到平台推薦的產品開箱影片，是否會因此產生衝動購買？" },
      { id: "as_path", type: "text", label: "研究情境中的歷程", hint: "選填；不填時由 AI 依構念與結果決定階段", placeholder: "例如：開啟應用程式、滑動影片、接觸商品相關內容、產生購買念頭" },
      { id: "as_prev", type: "textarea", label: "組合研究架構的回覆", hint: "貼上「組合研究架構」的完整回覆（含「無法由上傳文獻回答之事項」）", rows: 8 }
    ],
    build: p => blank(p.as_ctx) || blank(p.as_prev) ? "" : T.ask_practice({ ctx: p.as_ctx.trim(), con: p.as_con.trim(), path: p.as_path.trim(), prev: p.as_prev }),
    empty: "（請填入研究情境，並貼上組合研究架構的回覆）",
    next: "下一步：逐一點開「來源核對」中的網址確認內容；AI 即使遵守上述規則，仍可能產生不存在的網址。確認後，研究情境與實務問題可貼到{#bg}的「產業或實務背景資料」，學術缺口與實務缺口可貼到「研究缺口」。"
  },

  // ─── 新增：第一章、第三章 ───
  bg: {
    label: "研究背景與動機", target: "nlm",
    hint: "由產業現象收斂到文獻缺口，撰寫研究背景與研究動機。產業數據只會用您提供的資料，缺的會標【待補資料】。",
    fields: [
      { id: "bg_topic", type: "textarea", label: "研究主題與研究架構", rows: 3, placeholder: "例如：品牌人格透過自我一致性影響品牌依附——以台灣精釀啤酒為例" },
      { id: "bg_facts", type: "textarea", label: "產業或實務背景資料", hint: "選填；貼上您手邊的數據與出處", rows: 4 },
      { id: "bg_gaps", type: "textarea", label: "研究缺口", hint: "選填；可貼上{#gapsel}的結果", rows: 4 }
    ],
    rules: () => ["citation", "style", "verify"],
    build: (p, R) => blank(p.bg_topic) ? "" : T.bg({ topic: p.bg_topic.trim(), facts: p.bg_facts, gaps: p.bg_gaps }) + R,
    empty: "（請填入研究主題與研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話；【待補資料】請自行查找後補入。"
  },
  purpose: {
    label: "研究目的與問題", target: "nlm",
    hint: "依研究架構與研究動機，寫出研究目的與研究問題，並檢核「動機 → 目的 → 問題 → 假說」是否一一對應。",
    fields: [
      { id: "hy_paths", type: "textarea", label: "研究架構", hint: "一行一條假說；與{#hypo}共用同一份內容", rows: 5, placeholder: "H1：品牌人格 → 自我一致性（正向）" },
      { id: "pu_motive", type: "textarea", label: "研究動機", hint: "選填；貼上已寫好的研究動機或摘要", rows: 4 }
    ],
    rules: () => ["style"],
    build: (p, R) => blank(p.hy_paths) ? "" : T.purpose({ paths: p.hy_paths, motive: p.pu_motive }) + R,
    empty: "（請填入研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話（可接在寫研究背景與動機的同一個對話）。"
  },
  sample: {
    label: "研究對象與抽樣", target: "ai",
    hint: "把您的抽樣與資料蒐集資訊寫成段落。只會使用您填的數字；回收率與有效率由網頁計算，不交給 AI 算。",
    fields: [
      { id: "sp_pop", type: "text", label: "研究母體", placeholder: "例如：近一年曾購買精釀啤酒之台灣消費者" },
      { id: "sp_method", type: "text", label: "抽樣方法", placeholder: "例如：便利抽樣、滾雪球抽樣" },
      { id: "sp_collect", type: "text", label: "資料蒐集方式與期間", placeholder: "例如：網路問卷，2026 年 3 月至 4 月" },
      { id: "sp_pretest", type: "text", label: "前測", hint: "選填", placeholder: "例如：前測 40 份，各構念 α 皆大於 .80" },
      { id: "sp_size", type: "text", label: "樣本數規劃依據", hint: "選填", placeholder: "例如：G*Power 計算最低樣本數 138" },
      { id: "sp_n1", type: "text", label: "發放份數", hint: "選填" },
      { id: "sp_n2", type: "text", label: "回收份數", hint: "選填" },
      { id: "sp_n3", type: "text", label: "有效問卷份數", hint: "選填" }
    ],
    build: p => {
      if (blank(p.sp_pop) && blank(p.sp_method)) return "";
      const n = k => parseFloat(String(p[k]).replace(/[^\d.]/g, ""));
      const [a, b, c] = [n("sp_n1"), n("sp_n2"), n("sp_n3")];
      const pct = (x, y) => (x / y * 100).toFixed(2) + "%";
      const r = [];
      if (a > 0 && b > 0) r.push(`回收率 ${pct(b, a)}`);
      if (b > 0 && c > 0) r.push(`有效回收率（有效／回收）${pct(c, b)}`);
      return T.sample({ ...p, rates: r.join("；") });
    },
    empty: "（請至少填入研究母體或抽樣方法）",
    next: "下一步：貼到一般 AI 對話；【待補引用】請找到文獻後補上。"
  },
  analysis: {
    label: "資料分析方法", target: "ai",
    hint: "依分析順序說明每種方法的目的、做法與判斷準則。門檻值若沒有您指定的出處，會標【待補引用】，不讓 AI 自己寫作者年份。",
    fields: [
      { id: "an_soft", type: "text", label: "統計軟體", placeholder: "例如：SPSS 27、SmartPLS 4" },
      { id: "an_methods", type: "checks", label: "採用的分析方法", options: ANALYSES, value: ["desc", "rel", "cfa", "cmv", "corr", "pls", "med"] },
      { id: "hy_paths", type: "textarea", label: "研究假說", hint: "選填；與{#hypo}共用同一份內容", rows: 4 },
      { id: "an_criteria", type: "textarea", label: "指定的判斷準則與出處", hint: "選填", rows: 3, placeholder: "例如：AVE > .50（Fornell & Larcker, 1981）" }
    ],
    build: p => !p.an_methods.length ? "" : T.analysis({ soft: p.an_soft, methods: p.an_methods, paths: p.hy_paths, criteria: p.an_criteria }),
    empty: "（請至少勾選一種分析方法）",
    next: "下一步：貼到一般 AI 對話；【待補引用】請找到原始文獻後補上。"
  },

  // ─── 論文撰寫：第三章 ───
  hypo: {
    label: "假說推導", target: "nlm",
    hint: "依研究架構逐條撰寫假說推導：概念連結 → 理論依據 → 實證證據 → 推論至本研究情境 → 假說敘述，並檢核每條假說的文獻支持度。",
    fields: [
      { id: "hy_paths", type: "textarea", label: "研究架構", hint: "一行一條假說，含預期方向", rows: 6,
        placeholder: "H1：品牌人格 → 自我一致性（正向）\nH2：自我一致性 → 品牌依附（正向）\nH3：自我一致性中介品牌人格與品牌依附之關係" },
      { id: "hy_ctx", type: "text", label: "研究情境", hint: "選填", placeholder: "例如：台灣精釀啤酒消費者" }
    ],
    rules: () => ["citation", "evidence", "style", "verify"],
    build: (p, R) => blank(p.hy_paths) ? "" : T.hypo({ paths: p.hy_paths.trim(), ctx: p.hy_ctx }) + R,
    empty: "（請填入研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。研究架構圖可用{#m7a}畫出。"
  },
  opdef: {
    label: "操作型定義與量表", target: "nlm",
    hint: "逐一整理構念的概念性定義、操作型定義、量表來源、維度與題數、原研究信效度與題項，並輸出量表彙整表。",
    fields: [
      { id: "od_list", type: "textarea", label: "構念清單", hint: "一行一個；可附上預計採用的量表", rows: 6,
        placeholder: "品牌人格｜預計採用 Aaker (1997)\n自我一致性\n品牌依附" },
      { id: "od_scale", type: "text", label: "量尺形式", hint: "選填", placeholder: "例如：Likert 七點量尺" }
    ],
    rules: () => ["citation", "verify"],
    build: (p, R) => blank(p.od_list) ? "" : T.opdef({ list: p.od_list.trim(), scale: p.od_scale }) + R,
    empty: "（請填入構念清單）",
    next: "下一步：貼到已上傳量表原始文獻的 NotebookLM 對話；量表出處與信度數值請再對照原文確認。"
  },

  // ─── 論文撰寫：第四章 ───
  stats: {
    label: "統計結果轉 APA", target: "ai",
    hint: "把統計軟體的原始輸出轉成 APA7 表格與 Results 段落；填了假說清單，會再整理假說檢定彙整表。所有數值只能來自您貼上的輸出。",
    fields: [
      { id: "st_part", type: "radio", label: "撰寫哪一節", options: [["sample", "樣本描述"], ["rel", "信效度分析"], ["hypo", "假說檢定"]], value: "hypo" },
      { id: "st_soft", type: "radio", label: "統計軟體", options: [["spss", "SPSS"], ["pls", "SmartPLS"], ["amos", "AMOS"], ["other", "其他"]], value: "spss" },
      { id: "st_raw", type: "textarea", label: "原始統計輸出", hint: "從軟體複製的純文字", rows: 10, mono: true },
      { id: "hy_paths", type: "textarea", label: "假說清單", hint: "選填；與{#hypo}共用同一份內容", rows: 4, placeholder: "H1：品牌人格 → 自我一致性（正向）" }
    ],
    build: p => blank(p.st_raw) ? "" : T.stats({ part: p.st_part, soft: p.st_soft, raw: p.st_raw.trim(), hyps: (p.hy_paths || "").trim() }),
    empty: "（請貼上統計軟體的原始輸出）",
    next: "下一步：貼到一般 AI 對話。表格與段落中的每個數值，請再與原始輸出逐一核對；假說檢定彙整可直接帶到{#discuss}。"
  },

  // ─── 論文撰寫：第五章 ───
  discuss: {
    label: "討論、意涵與限制", target: "nlm",
    hint: "依假說檢定結果逐條對照文獻，撰寫研究發現與討論、理論意涵、實務意涵、研究限制與未來研究方向。",
    fields: [
      { id: "ds_results", type: "textarea", label: "假說檢定結果", hint: "可貼上{#stats}的假說檢定彙整", rows: 6 },
      { id: "ds_ctx", type: "text", label: "研究情境與樣本", hint: "選填", placeholder: "例如：台灣精釀啤酒消費者，有效問卷 412 份" },
      { id: "ds_secs", type: "checks", label: "要撰寫的節", options: Object.entries(DISCUSS_SECS).map(([k, v]) => [k, v[0]]), value: Object.keys(DISCUSS_SECS) }
    ],
    rules: () => ["citation", "evidence", "style", "verify"],
    build: (p, R) => (blank(p.ds_results) || !p.ds_secs.length) ? "" : T.discuss({ results: p.ds_results.trim(), ctx: p.ds_ctx, secs: p.ds_secs }) + R,
    empty: "（請貼上假說檢定結果，並至少勾選一節）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },

  // ─── 論文撰寫：各章通用 ───
  dr: {
    label: "段落核實改寫", target: "nlm",
    hint: "核實論文段落中的引用，再改寫。適用於任何一章。",
    fields: [
      { id: "dr_stage", type: "radio", label: "改寫方向", options: [["draft", "補強（字數不減）"], ["final", "精簡（術語查證＋字數必減）"]], value: "draft" },
      { id: "dr_text", type: "textarea", label: "論文段落", rows: 8 }
    ],
    variant: p => p.dr_stage,
    rules: p => p.dr_stage === "final" ? ["citation", "style"] : ["citation", "evidence", "style"],
    build: (p, R) => blank(p.dr_text) ? "" : (p.dr_stage === "final"
      ? T.dr_final({ draft: p.dr_text }) + R + "\n\n" + T.dr_final_tail({})
      : T.dr_draft({ draft: p.dr_text }) + R),
    empty: "（請貼上論文段落）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  polish: {
    label: "潤色與去 AI 味", target: "ai",
    hint: "潤色：只修正語病與邏輯漏洞，原文通順就保留。去 AI 味：把機器味、翻譯腔重寫成自然的學術表達。不涉及查證文獻，所以貼到一般 AI 即可。",
    fields: [
      { id: "po_mode", type: "radio", label: "處理方式", options: [["polish", "潤色"], ["dehai", "去 AI 味"]], value: "polish" },
      { id: "po_lang", type: "radio", label: "段落語言", options: [["zh", "中文"], ["en", "英文"]], value: "zh" },
      { id: "po_text", type: "textarea", label: "論文段落", rows: 8 }
    ],
    build: p => blank(p.po_text) ? "" : T[`${p.po_mode}_${p.po_lang}`]({ text: p.po_text.trim() }),
    empty: "（請貼上論文段落）",
    next: "下一步：貼到一般 AI 對話。若段落含引用且尚未核實，請先用{#dr}。"
  },

  // ─── 兩頁共用：小工具 ───
  m7a: {
    label: "文字轉關係圖", target: "nlm",
    hint: "任何一段已生成的文字都可以畫成 Mermaid 關係圖，每個主題群各畫一張；也可用來畫第三章的研究架構圖。",
    fields: [{ id: "m7a_text", type: "textarea", label: "要畫成關係圖的文字", rows: 8 }],
    rules: () => [],
    build: (p, R) => blank(p.m7a_text) ? "" : T.m7a({ content: p.m7a_text }) + R,
    empty: "（請貼上要畫圖的文字）",
    next: "下一步：貼到 NotebookLM（建議在產生這段文字的同一個對話）；回覆整段複製後，到{#m7b}補好圍籬。"
  },
  m7b: {
    label: "圍籬修補", target: "tool",
    hint: "貼上 NotebookLM 的回覆（有沒有圍籬都可以），自動偵測每張圖並補上 ```mermaid 圍籬；包成 subgraph 的大圖會拆成每群一張。",
    fields: [{ id: "m7b_text", type: "textarea", label: "NotebookLM 回覆", rows: 12, mono: true }],
    build: p => { if (blank(p.m7b_text)) return ""; const r = fixFences(p.m7b_text); return r.count ? r.text : ""; },
    status: p => {
      if (blank(p.m7b_text)) return "";
      const r = fixFences(p.m7b_text);
      return r.count ? `已偵測到 ${r.count} 張圖` : "沒有偵測到任何 flowchart／graph 語法，請確認貼上的內容。";
    },
    empty: "（請貼上 NotebookLM 的回覆）",
    copyLabel: "複製結果",
    next: "下一步：貼進 Obsidian 的 .md 筆記，就會自動渲染成圖。"
  }
};

// 問卷草稿：選定的架構（勾選組合／候選架構編號／其他）
function archLabel(p) {
  if (p.as_archm === "num") {
    const n = (p.as_archno || "").trim();
    if (!n) return "";
    const zh = { "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六" }[n] || n;
    return `上述候選研究架構中的架構${zh}`;
  }
  if (p.as_archm === "other") return (p.as_arch || "").trim();
  return "前述我自行勾選組合的研究架構";
}

// ── 論文目錄：章 → 節 → 步驟 ──
// step：{ mod, note, fixed（固定欄位值並隱藏該欄位） }；finish：每節最後的完稿步驟
const FIN_FULL = ["dr", "polish"], FIN_POLISH = ["polish"];
const OUTLINE = [
  { ch: "常用", quick: true, secs: [
    { id: "q-draft", no: "", title: "核實改寫：補強", desc: "段落還缺東西時使用（引用不確定、論點接不起來、細節不夠）：核實引用 → 診斷結構與邏輯 → 補強改寫，字數不減，產出可接近完稿。（舊選單 [3]）", steps: [
      { mod: "dr", note: "一次貼一段，任何一章都可以。", fixed: { dr_stage: "draft" } }] },
    { id: "q-final", no: "", title: "核實改寫：精簡", desc: "段落內容已齊全，但太冗長或想確認術語時使用：核實引用 → 術語查證 → 精簡診斷 → 改寫，字數必須減少。（舊選單 [4]）", steps: [
      { mod: "dr", note: "一次貼一段，任何一章都可以；可接在「補強」之後使用。", fixed: { dr_stage: "final" } }] },
    { id: "q-var", no: "", title: "深入了解單一變數", desc: "對某個變數有興趣、想深入了解時使用：定義、維度、理論、操作型定義與量表、施測情境、前因與後果、相近構念，任何階段都可以。", steps: [
      { mod: "vdeep", note: "一次問一個變數；文獻不足時，先針對這個變數補上傳文獻再問。「施測情境」常因原文只簡短交代而標示「未提及」，請回到原文的方法章節或附錄查看。" }] },
    { id: "q-vcomp", no: "", title: "區辨相近變數", desc: "兩個以上的變數看起來很像，想分辨它們在研究架構上的異同時使用。", steps: [
      { mod: "vcomp", note: "每行填一個變數；可直接從組合研究架構的勾選區複製名稱。" }] }
  ] },
  { ch: "第零章 研究準備", secs: [
    { id: "s0-1", no: "0.1", title: "主題探索", desc: "還沒讀文獻、只有一個想研究的現象時，從這裡開始：聚焦研究問題與關鍵字 → 建立文獻比較表 → 選定變數與研究缺口。步驟 3–6 為選用，要看整批文獻的全貌時再做。產出的研究架構草案可到 0.2 回到全文查證。", steps: [
      { mod: "focus", note: "用選擇題把現象收斂成研究問題，產生中英文關鍵字與檢索字串；檢索到的文獻存進同一個 Zotero 資料夾。" },
      { mod: "matrix", note: "文獻上傳到 NotebookLM 後，逐篇整理成比較表，作為之後所有章節的底稿。" },
      { mod: "m5a", note: "選用：要看整批文獻的全貌時使用。開新對話，盤點主題、理論與研究方法。" },
      { mod: "m5b", note: "選用：同一個對話接續，整理變數角色並畫關係圖。" },
      { mod: "m7b", note: "選用：把上一步的關係圖補好圍籬，貼進 Obsidian。" },
      { mod: "m5c", note: "選用：同一個對話接續，找出整批文獻的研究缺口與研究主題建議。" },
      { mod: "gapsel", note: "準備{#matrix}匯出的試算表。依提問逐步選擇；搭橋檢索若發現已有研究，回到{#focus}補充關鍵字。" }] },
    { id: "s0-4", no: "0.2", title: "向文獻提問、確認文獻支持", desc: "回到 NotebookLM 以全文查證。選「具體問題」：把 0.1 產出的研究架構草案或研究缺口逐一當成問題，確認是否有文獻支持；還沒選定變數時選「研究主題」：由 AI 先提出問題再回答，用來釐清方向。步驟 2–6 用於提出並組合研究架構、評估問卷可行性，以及查證實務情境與實務缺口。", steps: [
      { mod: "lr", note: "一次問一組變數關係或一個研究缺口。回覆最後的支持程度總結若為「部分」或「不足」，回到 0.1 調整變數或補充關鍵字。", preset: { lr_start: "question" }, rules: ["citation", "verify", "support"] },
      { mod: "asf", note: "變數與研究路線很多時使用：由 AI 提出幾個合理的研究架構，再由你挑選。" },
      { mod: "asmore", note: "提出架構後接著問：補齊變數，並列出每個變數可擔任的所有角色。" },
      { mod: "asmix", note: "從候選架構中自行挑選變數、跨架構混搭，組成自己的研究架構。" },
      { mod: "asq", note: "研究方法選問卷調查法時使用：為選定的架構產出問卷草稿，並評估題數、樣本數、量表與施測風險。" },
      { mod: "asp", note: "把前面步驟文獻無法回答的事項交給一般 AI 查證，寫成研究情境、實務問題與實務缺口。" }] }
  ] },
  { ch: "第一章 緒論", secs: [
    { id: "s1-1", no: "1.1", title: "研究背景與動機", desc: "由產業現象收斂到文獻缺口。", steps: [
      { mod: "bg", note: "準備研究架構、手邊的產業數據，以及 0.1 選定的研究缺口。" }], finish: FIN_FULL },
    { id: "s1-2", no: "1.2", title: "研究目的與問題", desc: "研究目的要對應動機，研究問題要能由假說回答。", steps: [
      { mod: "purpose", note: "準備研究架構（假說清單）與 1.1 寫好的研究動機。" }], finish: FIN_FULL },
    { id: "s1-3", no: "1.3", title: "名詞釋義", desc: "界定本研究主要構念的意涵。", steps: [
      { mod: "m5d", note: "列出要釋義的構念；產出的四面向解釋取「定義」部分改寫成名詞釋義。" }], finish: FIN_FULL }
  ] },
  { ch: "第二章 文獻探討", secs: [
    { id: "s2-1", no: "2.1", title: "各構念之定義與相關研究", desc: "每個構念各寫一節；這一節的步驟對每個構念重複一次。", steps: [
      { mod: "m6a", note: "貼上這個構念所屬主題群的摘要（主題地圖或文獻比較表中同群的幾列），展開成一個小節。" },
      { mod: "m6b", note: "同一個對話接續，挑出最具代表性的一篇文獻深入分析，補強本節。" }], finish: FIN_FULL },
    { id: "s2-2", no: "2.2", title: "變數間之關係", desc: "說明各變數之間關係的文獻證據，為第三章假說鋪路。", steps: [
      { mod: "lr", note: "輸入一組變數關係作為問題，例如「自我一致性對品牌依附的影響」；每組關係各做一次。", fixed: { lr_start: "question" } }], finish: FIN_FULL },
    { id: "s2-3", no: "2.3", title: "補入新文獻", desc: "第二章寫到一半又找到新文獻時使用。", steps: [
      { mod: "m8", note: "判斷新文獻該放進哪一節，並與同主題的代表文獻比較。" }] }
  ] },
  { ch: "第三章 研究方法", secs: [
    { id: "s3-1", no: "3.1", title: "研究架構", desc: "畫出研究架構圖。", steps: [
      { mod: "m7a", note: "貼上描述研究架構的文字（或假說清單），請 NotebookLM 畫成 Mermaid 圖。" },
      { mod: "m7b", note: "把回覆補好圍籬，貼進 Obsidian 或轉成圖片。" }] },
    { id: "s3-2", no: "3.2", title: "研究假說", desc: "逐條推導假說。", steps: [
      { mod: "hypo", note: "準備假說清單（含預期方向）；這份清單也會帶到 1.2、3.5 與 4.3。" }], finish: FIN_FULL },
    { id: "s3-3", no: "3.3", title: "操作型定義與衡量", desc: "構念定義與量表來源。", steps: [
      { mod: "opdef", note: "準備構念清單；量表原始文獻要先上傳到 NotebookLM。" }], finish: FIN_FULL },
    { id: "s3-4", no: "3.4", title: "研究對象與抽樣", desc: "母體、抽樣方法與資料蒐集。", steps: [
      { mod: "sample", note: "準備母體、抽樣方法、蒐集期間與份數。" }], finish: FIN_POLISH },
    { id: "s3-5", no: "3.5", title: "資料分析方法", desc: "各分析方法的目的、做法與判斷準則。", steps: [
      { mod: "analysis", note: "勾選要用的分析方法；判斷準則的出處可先填，沒填的會標【待補引用】。" }], finish: FIN_POLISH }
  ] },
  { ch: "第四章 研究結果", secs: [
    { id: "s4-1", no: "4.1", title: "樣本描述", desc: "受訪者特性與主要變數的描述性統計。", steps: [
      { mod: "stats", note: "貼上人口統計次數分配與描述性統計的輸出。", fixed: { st_part: "sample" } }], finish: FIN_POLISH },
    { id: "s4-2", no: "4.2", title: "信效度分析", desc: "信度、收斂效度與區別效度。", steps: [
      { mod: "stats", note: "貼上信度與效度分析的輸出。", fixed: { st_part: "rel" } }], finish: FIN_POLISH },
    { id: "s4-3", no: "4.3", title: "假說檢定", desc: "路徑係數、顯著性與假說支持與否。", steps: [
      { mod: "stats", note: "貼上結構模型或迴歸的輸出；假說清單會自動帶入，產出的假說檢定彙整可直接用於第五章。", fixed: { st_part: "hypo" } }], finish: FIN_POLISH }
  ] },
  { ch: "第五章 結論與建議", secs: [
    { id: "s5-1", no: "5.1", title: "研究發現與討論", desc: "逐條假說對照文獻。", steps: [
      { mod: "discuss", note: "貼上 4.3 的假說檢定彙整。", fixed: { ds_secs: ["disc"] } }], finish: FIN_FULL },
    { id: "s5-2", no: "5.2", title: "理論意涵", desc: "本研究對理論的貢獻。", steps: [
      { mod: "discuss", note: "可接在 5.1 同一個對話。", fixed: { ds_secs: ["theory"] } }], finish: FIN_FULL },
    { id: "s5-3", no: "5.3", title: "實務意涵", desc: "依研究發現提出管理建議。", steps: [
      { mod: "discuss", note: "可接在 5.1 同一個對話。", fixed: { ds_secs: ["practice"] } }], finish: FIN_FULL },
    { id: "s5-4", no: "5.4", title: "研究限制與未來研究方向", desc: "本研究的限制與對應的後續研究。", steps: [
      { mod: "discuss", note: "可接在 5.1 同一個對話。", fixed: { ds_secs: ["limit"] } }], finish: FIN_FULL }
  ] }
];

const FINISH_NOTE = {
  dr: "完稿：核實本節段落中的引用並改寫。內容還不完整用「補強」；內容齊全但太冗長，或想查證術語，用「精簡」。",
  polish: "完稿：潤色語句，或去除 AI 味。"
};
const ALL_SECS = OUTLINE.flatMap(c => c.secs);
const stepsOf = sec => [...sec.steps, ...(sec.finish || []).map(m => ({ mod: m, note: FINISH_NOTE[m], finish: true }))];

// 說明文字中的{#id}：本節有此模組時寫成「步驟 n」，否則指出它在目錄中的位置
function fillRefs(text, sec) {
  return text.replace(/\{#(\w+)\}/g, (_, id) => {
    const label = `「${DEFS[id].label}」`;
    const i = stepsOf(sec).findIndex(s => s.mod === id);
    if (i >= 0) return `步驟 ${i + 1}${label}`;
    const home = ALL_SECS.find(s => s.steps.some(st => st.mod === id));
    return home ? `${label}（${home.no ? "目錄 " + home.no + " " + home.title : "常用：" + home.title}）` : label;
  });
}
