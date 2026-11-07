// ── 共用規則（可在每個模組勾選；舊模組的預設值沿用原本 PowerShell 版的組合） ──
const RULES = [
  { key: "citation", label: "引用格式規範", text: T.citation },
  { key: "evidence", label: "實證結果與引用分散", text: T.evidence },
  { key: "style", label: "文字風格規範", text: T.style },
  { key: "verify", label: "完成後自我核對", text: T.verify },
  // opt：只在步驟預設有列入時才顯示
  { key: "support", label: "文獻支持程度總結", text: T.support, opt: true }
];

// 共用規則中的引用格式（欄位內第二個 Prompt 使用）
const citeText = () => { const r = RULES.find(x => x.key === "citation"); return typeof r.text === "function" ? r.text({}) : r.text; };
const isOn = v => Array.isArray(v) && v.includes("on");

// 貼到哪裡
const TARGETS = {
  nlm: "貼到 NotebookLM 對話",
  table: "貼到 NotebookLM「資料表」的自訂指示，不是對話框",
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
    next: "下一步：在已上傳文獻的 NotebookLM 開啟「資料表」，把這段 Prompt 貼進自訂指示（不是對話框）。完成後匯出成試算表，全選複製，貼到下方「AI 回覆」保存。"
  },
  gapsel: {
    label: "選定變數與研究缺口", target: "nlm",
    hint: "以文獻比較表作為索引，以選擇題逐步選出依變數與其他變數，再推薦 key paper、列出研究缺口候選，最後產出研究架構草案。判斷與引用回到全文查證，表格與全文不一致時以全文為準。",
    fields: [
      { id: "gs_mode", type: "radio", label: "表格怎麼給 NotebookLM", options: [["source", "已加入為來源（建議）"], ["paste", "貼在對話中"]], value: "source" },
      { id: "gs_table", type: "textarea", label: "表格內容", hint: "選「貼在對話中」時才需要；從試算表複製即可。留空時，沿用「建立文獻比較表」那一步貼在 AI 回覆的表格", rows: 6, mono: true, when: p => p.gs_mode === "paste" }
    ],
    build: p => buildGapsel(p),
    empty: "（請貼上表格內容，或改選「已加入為來源」）",
    status: p => p.gs_mode === "paste" && blank(p.gs_table) && matrixReply() ? "表格內容留空：已沿用「建立文獻比較表」那一步貼上的表格。" : "",
    next: "下一步：在已上傳文獻的同一個 NotebookLM，把{#matrix}的表格全選複製，以「新增來源 → 複製的文字」加入，再從來源右側的選單重新命名為「00_文獻比較表（索引）」（選「貼在對話中」則不需要）；再把這段 Prompt 貼到對話，依提問逐步選擇。\n執行後要回答 3 次選擇，每次回答後 AI 才會進入下一步：\n① 步驟一：從 5–8 個依變數選項中，選 1 或 2 個最想解釋的結果。\n② 步驟二：從 A 組（已與依變數一起檢驗過）與 B 組（尚未一起檢驗過）中，複選 1–3 個其他變數（填編號，例如 V2、V5）。\n③ 步驟三之後：從研究缺口候選中選一個，或提出自己的變數組合，AI 才會產出步驟四的研究架構草案。\n步驟四的「## 變數」與「## 路徑」兩節，可直接貼到{#archchk}的研究架構欄位，網頁會自動畫出架構圖。"
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
    next: "下一步：回到{#m5a}那個對話貼上。回覆整段貼到下方「AI 回覆」，研究存檔會自動補好關係圖的圍籬，用 Obsidian 等支援 Mermaid 的檢視器開啟就能看到圖；接著切到{#m5c}。"
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
    hint: "在已上傳文獻的 NotebookLM 開新對話。先依描述層次歸類相關構念，再提出數個彼此有明顯差異的研究架構，各附變數、理論、文獻支持與研究缺口，最後附上變數清單，供你挑選。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；以一句話描述要探討的現象或問題，可幫助 AI 聚焦", placeholder: "例如：使用者滑 TikTok 或 Instagram Reels 時看到平台推薦的產品開箱影片，是否會因此產生衝動購買？" },
      { id: "as_dv", type: "text", label: "已確定的依變數", hint: "選填；填了之後，所有候選架構都以它為依變數", placeholder: "例如：衝動購買意向（Impulsive Buying Intention）" },
      { id: "as_method", type: "radio", label: "研究方法", options: [["any", "不限"], ["survey", "問卷調查法"], ["exp", "實驗設計法"], ["sec", "panel data"]], value: "survey" },
      { id: "as_n", type: "radio", label: "架構數量", options: [["2", "2 個"], ["3", "3 個"], ["4", "4 個"], ["5", "5 個"], ["6", "6 個"]], value: "4" },
      { id: "as_more_on", type: "checks", below: true, label: "補充變數清單", options: [["on", "接著在同一個對話補充變數清單（列出每個變數可擔任的所有角色）"]], value: [] },
      { id: "as_more_prompt", type: "promptbox", below: true, label: "補充變數清單 Prompt", when: p => isOn(p.as_more_on),
        hint: "貼到同一個 NotebookLM 對話；回覆最後若寫「未完」，輸入「繼續」",
        copyLabel: "複製補充 Prompt（貼到 NotebookLM 同一個對話）", build: () => T.ask_more({}) + citeText() },
      { id: "as_morereply", type: "textarea", below: true, label: "補充變數清單的 AI 回覆", hint: "各次回覆（含「繼續」之後的）依序貼上；有勾選才會帶到組合步驟", rows: 5, when: p => isOn(p.as_more_on) },
    ],
    rules: () => ["citation"],
    seed: () => seedFrom01(), seedFrom: "0.1「研究方向聚焦」",
    status: () => {
      const r = String((store.replies || {})["s0-1|focus"] || "");
      if (blank(r)) return "0.1「研究方向聚焦」的 AI 回覆欄位是空的，所以沒有內容可帶入；請先把 0.1 的對話貼到該步驟最下方的「AI 回覆」。";
      if (!/研究情境[：:]/.test(r)) return "0.1 的 AI 回覆中沒有「研究情境：」「研究問題：」「依變數：」這三行（較早的 Prompt 不會產生）。請在 0.1 的同一個 NotebookLM 或 AI 對話輸入：「請以純文字另起三行寫出：研究情境：……、研究問題：……、依變數：……」，把新回覆接在 0.1 的「AI 回覆」最後，再回來按「重新帶入」。";
      return "";
    },
    seedNote: "研究情境、研究問題與依變數由 0.1「研究方向聚焦」的 AI 回覆帶入，可自行修改",
    build: (p, R) => blank(p.as_ctx) ? "" : T.ask_frame({ ctx: p.as_ctx.trim(), con: p.as_con.trim(), dv: (p.as_dv || "").trim(), method: p.as_method, n: p.as_n }) + R,
    empty: "（請填入研究情境）",
    next: "下一步：回覆貼到下方「AI 回覆」。需要更完整的變數時，勾選最下方的「補充變數清單」，在同一個對話接著問。完成後到{#asmix}。"
  },
  asmore: {
    label: "補充變數清單", target: "nlm",
    hint: "接在{#asf}同一個對話。AI 已經思考過各架構，這一步只做一件事：逐篇檢查上傳文獻，補上尚未出現的變數，並列出每個變數可擔任的所有角色；有文獻依據的標示「文獻」，依理論推論的標示「推論」。",
    fields: [],
    rules: () => ["citation"],
    build: (p, R) => T.ask_more({}) + R,
    next: "下一步：若回覆最後寫「未完」，輸入「繼續」。各次回覆（含「繼續」之後的）依序貼到下方「AI 回覆」，到{#asmix}會自動帶入、合併並去除重複。"
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
  smethod: {
    label: "方法導向檢索", target: "ai",
    hint: "要找特定領域中、實際使用某種統計方法的實證論文來模仿時使用。AI 會給你可直接貼到 Google Scholar 的檢索式與 Scholar Labs 問句；請使用有網路搜尋的 AI，它會試跑檢索式並附上 2–3 篇論文確認。",
    fields: [
      { id: "sm_field", type: "text", label: "研究領域", placeholder: "例如：行銷、消費者行為、人力資源管理" },
      { id: "sm_method", type: "text", label: "統計方法", hint: "建議附英文", placeholder: "例如：多層次模型（multilevel model）" },
      { id: "sm_unit", type: "text", label: "分析單位", hint: "選填；不填時 AI 會列出常見的組合供你挑選", placeholder: "例如：層次一：消費者；層次二：店家" },
      { id: "sm_topic", type: "text", label: "研究主題或變數", hint: "選填；只想找方法範例時可留空", placeholder: "例如：店家特性對購買意願的跨層次影響" },
      { id: "sm_extra", type: "text", label: "其他想加入的條件", hint: "選填；任何片段資訊皆可", placeholder: "例如：有報告組內相關係數（ICC）、使用 HLM 軟體、2015 年以後" },
      { id: "sm_excl", type: "text", label: "要排除的領域", hint: "選填；該方法常見但與你無關的領域", placeholder: "例如：教育、護理" }
    ],
    build: p => blank(p.sm_field) || blank(p.sm_method) ? "" : T.search_method({ field: p.sm_field.trim(), method: p.sm_method.trim(), unit: p.sm_unit.trim(), topic: p.sm_topic.trim(), extra: p.sm_extra.trim(), excl: p.sm_excl.trim() }),
    empty: "（請填入研究領域與統計方法）",
    next: "下一步：檢索式貼到 Google Scholar（scholar.google.com），問句貼到 Scholar Labs。先點開「試跑結果」的連結確認論文確實存在且使用該方法。"
  },
  asmix: {
    label: "組合研究架構", target: "nlm", stack: true,   // stack：欄位佔滿寬度，Prompt 放在下方
    hint: "依「前面步驟的回覆」中的變數清單勾選變數，同一角色可勾多個候選；自變數與依變數已確定時，勾選上方「已確定」，先請 AI 建議中介與調節變數。接著複製下方的候選架構 Prompt，請 AI 依你勾選的變數提出幾個候選架構；貼上回覆後，網頁會畫出每個候選，比較後按「選這個」。選定的架構到 0.3 檢核。",
    fields: [
      { id: "am_on", type: "checks", label: "自變數與依變數已確定", options: [["on", "已確定：先在清單勾選自變數與依變數，再請 AI 建議中介與調節變數"]], value: [] },
      { id: "as_vlist", type: "textarea", label: "前面步驟的回覆", hint: "自動帶入步驟 1 與下方篩選的 AI 回覆；也可直接貼上各次回覆", rows: 6, mono: true },
      { id: "as_pick", type: "picker", label: "勾選要用的變數", hint: "上方勾選「已確定」時：先勾自變數（可多個）與依變數；AI 建議的中介與調節變數貼回後才會出現，再勾選", source: p => parseVarList(p.as_vlist), roles: MIX_ROLES, value: [] },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填；用來判斷文獻能否類推", placeholder: "例如：蝦皮電商平台", when: p => isOn(p.am_on) },
      { id: "am_prompt", type: "promptbox", label: "篩選 Prompt", when: p => isOn(p.am_on),
        hint: "依你勾選的自變數與依變數產生；貼到已上傳相關文獻的 NotebookLM 對話，AI 會判定每個候選為建議納入、可考慮或不建議，找不到時直接寫「未找到」",
        copyLabel: "複製篩選 Prompt（貼到 NotebookLM）", empty: "（請先在上方清單勾選自變數與依變數）",
        build: p => { const { xs, ys } = mechXY(p); return xs.length && ys.length ? T.ask_mech({ x: xs.join("、"), y: ys.join("、"), ctx: (p.as_ctx || "").trim() }) + citeText() : ""; } },
      { id: "am_reply", type: "textarea", label: "篩選的 AI 回覆", hint: "貼上後按下方「重新帶入」，AI 建議的中介與調節變數會出現在勾選清單，並標示判定", rows: 5,
        reseed: { note: "把篩選結果加入勾選清單，並跳到清單位置", jump: "pick-as_pick" }, when: p => isOn(p.am_on) },
      { id: "as_diag", type: "diagram", label: "我的草圖", hint: "選填。畫了路徑的話，會列為「候選架構一（我的版本）」。拖曳方塊調整位置；點一個方塊再點另一個方塊，畫出箭頭；先點調節變數再點一條箭頭，畫出調節虛線；未選方塊時點箭頭或虛線可刪除",
        tray: true, all: p => mixPicked(p, true), source: p => mixPicked(p),
        onRemove: k => { store.values.as_pick = (store.values.as_pick || []).filter(x => x !== k); } },
      { id: "cf_n", type: "radio", label: "候選架構數量", options: [["2", "2 個"], ["3", "3 個"], ["4", "4 個"]], value: "3" },
      { id: "cf_reply", type: "textarea", afterOut: true, label: "候選架構的 AI 回覆", hint: "整段貼上；下方會畫出每個候選架構", rows: 6 },
      { id: "cf_view", type: "cands", afterOut: true, label: "比較候選架構", hint: "比較各架構的圖與理由，按「選這個」設為你的研究架構", render: p => renderCands(p), choose: i => chooseCand(i) },
      { id: "fin_diag", type: "diagram", afterOut: true, label: "選定的研究架構", hint: "可在圖上微調：點一個方塊再點另一個方塊加上箭頭；未選方塊時點箭頭可刪除；按「依文字重畫」回到 AI 的版本",
        when: p => !blank(store.values.cf_text), emptyHint: "（尚未選定）",
        source: p => parseArch(store.values.cf_text).vars,
        seed: p => { const A = parseArch(store.values.cf_text); return { sig: JSON.stringify([A.edges, A.mods].map(l => l.map(x => [x.from, x.to || x.edge]))), edges: A.edges.map(({ from, to }) => ({ from, to })), mods: A.mods.map(({ from, edge }) => ({ from, edge })) }; } }
    ],
    init: () => autoPickDV(),
    seed: () => { const v = store.values, r = store.replies || {};
      return { as_vlist: [r["s0-4|asf"], isOn(v.as_more_on) ? v.as_morereply : "", isOn(v.am_on) ? v.am_reply : ""].filter(x => !blank(x)).map(x => x.trim()).join("\n\n") }; },
    seedFrom: "步驟 1 與篩選的 AI 回覆", seedNote: "「前面步驟的回覆」由步驟 1 的 AI 回覆（含勾選的補充變數清單），以及下方「篩選的 AI 回覆」帶入",
    rules: () => ["citation"],
    build: (p, R) => {
      const picked = mixPicked(p);
      return picked.length ? T.ask_cands({ picked, paths: diagramPathText(picked, p.as_diag), ctx: (p.as_ctx || "").trim(), n: +(p.cf_n || 3) }) + R : "";
    },
    status: p => {
      if (blank(p.as_vlist)) return "";
      const n = parseVarList(p.as_vlist).length;
      return n ? `已讀取 ${n} 個變數` + trayNote("as_diag") + (blank(store.values.cf_text) ? "" : `\n已選定：${store.values.cf_title || "候選架構"}`) : "沒有讀取到變數，請確認貼上的內容包含「變數清單」，且每行為「角色｜變數名稱｜出處｜架構」。";
    },
    empty: "（請先在上方清單勾選變數）",
    noReply: true, copyLabel: "複製候選架構 Prompt（貼到 NotebookLM）",
    next: "下一步：貼到 NotebookLM（步驟 1 或篩選所用的同一個對話），把回覆貼到下方「候選架構的 AI 回覆」，比較各候選後按「選這個」；選定後到{#archchk}檢核，研究缺口與學術貢獻也在那裡一併產生。"
  },
  astat: {
    label: "統計方法與結果揭露", target: "nlm",
    hint: "接在{#archchk}同一個對話。整理上傳文獻針對相近變數與路徑用過的統計方法，建議本研究適用的方法，並列出實證結果應揭露的項目；一般應報告但文獻未報告者標示【待補文獻】。",
    fields: [
      { id: "as_rmethod", type: "radio", label: "研究方法", options: [["survey", "問卷調查法"], ["exp", "實驗設計法"], ["sec", "panel data"]], value: "survey" },
      { id: "as_data", type: "textarea", label: "資料描述", hint: "選填；資料來源、分析單位與特性", rows: 2, placeholder: "例如：非營利組織的捐款紀錄，捐款日期巢套於捐款者，很多人只有一筆捐款" }
    ],
    rules: () => ["citation"],
    build: (p, R) => T.ask_stats({ rm: p.as_rmethod, data: (p.as_data || "").trim(), arch: mixArchText().trim() }) + R,
    next: "下一步：研究方法為問卷調查法或實驗設計法時，到{#asq}；panel data 不需要問卷，可跳過。正式撰寫時，第三章用{#analysis}，第四章用{#stats}。"
  },
  asq: {
    label: "問卷草稿與可行性評估", target: "nlm",
    hint: "接在{#astat}同一個對話，研究方法為問卷調查法或實驗設計法時使用；實驗設計法會另外產出操弄情境與操弄檢定。題項只取自上傳文獻，量表的原始論文須先上傳到 NotebookLM；找不到的會標示【待補量表】。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_rmethod", type: "radio", label: "研究方法", options: [["survey", "問卷調查法"], ["exp", "實驗設計法"], ["sec", "panel data"]], value: "survey" },
      { id: "as_archm", type: "radio", label: "選定的架構", options: [["mine", "0.2 選定的研究架構"], ["num", "候選架構編號"], ["other", "其他"]], value: "mine" },
      { id: "as_archno", type: "text", label: "架構編號", hint: "填數字即可", placeholder: "例如：2", when: p => p.as_archm === "num" },
      { id: "as_arch", type: "textarea", label: "其他架構", hint: "簡短描述即可，不要貼上整段回覆", rows: 2, placeholder: "例如：架構一加上消費者創新性作為調節變數", when: p => p.as_archm === "other" },
      { id: "as_target", type: "text", label: "研究對象", hint: "選填", placeholder: "例如：過去三個月曾在抖音購物的消費者" },
      { id: "as_scale", type: "text", label: "量尺形式", hint: "選填；不填時依原量表", placeholder: "例如：Likert 七點尺度" },
      { id: "as_amethod", type: "text", label: "分析方法", hint: "選填；不填時由 AI 依架構建議", placeholder: "例如：PLS-SEM" },
      { id: "sv_reply", type: "textarea", below: true, label: "修訂建議的 AI 回覆", hint: "選填；貼上修改追問的回覆，會一併存入研究存檔", rows: 5 },
      { id: "sv_revp", type: "promptbox", below: true, label: "產生修訂版問卷", hint: "修訂建議貼上後，在同一個對話接著送出，請 NotebookLM 依建議輸出修訂後的完整問卷",
        copyLabel: "複製產生修訂版問卷 Prompt（貼到 NotebookLM）", empty: "（先貼上修訂建議的 AI 回覆）", build: p => blank(p.sv_reply) ? "" : svRevPrompt() },
      { id: "sv_rev", type: "textarea", below: true, label: "修訂版問卷的 AI 回覆", hint: "貼上後，上方問卷預覽會換成修訂版（改過的地方會標示原文），可切換回原版比對", rows: 5 }
    ],
    replyView: t => surveyView(t),
    rules: () => ["citation"],
    status: p => p.as_rmethod === "sec" ? "研究方法為 panel data 時不需要問卷草稿，可跳過此步驟。" : p.as_archm === "other" && (p.as_arch || "").trim().length > 300 ? "「其他架構」內容過長，NotebookLM 可能無法讀取；同一個對話中簡短描述即可。" : "",
    build: (p, R) => {
      const arch = archLabel(p);
      return blank(p.as_ctx) || !arch || p.as_rmethod === "sec" ? "" : T.ask_survey({ exp: p.as_rmethod === "exp", ctx: p.as_ctx.trim(), arch, target: p.as_target.trim(), scale: p.as_scale.trim(), method: p.as_amethod.trim() }) + R;
    },
    empty: "（請填入研究情境，並指定選定的架構）",
    next: "下一步：【待補量表】的構念，請找到量表原始論文上傳後再問一次。正式撰寫第三章時，用{#opdef}整理量表；要查實務面時，到{#asp}。"
  },
  asp: {
    label: "研究情境與實務缺口", target: "ai",
    hint: "請使用已開啟網路搜尋的 AI；未開啟搜尋時，AI 只能憑記憶作答，捏造的風險很高。學術論點只採用{#archchk}的回覆，網路資料只用於研究情境與實務面。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；以一句話描述要探討的現象或問題，可幫助 AI 聚焦", placeholder: "例如：使用者滑 TikTok 或 Instagram Reels 時看到平台推薦的產品開箱影片，是否會因此產生衝動購買？" },
      { id: "as_path", type: "text", label: "研究情境中的歷程", hint: "選填；不填時由 AI 依構念與結果決定階段", placeholder: "例如：開啟應用程式、滑動影片、接觸商品相關內容、產生購買念頭" },
      { id: "as_prev", type: "textarea", label: "0.3 檢核的回覆", hint: "貼上「依文獻檢核架構」兩則的完整回覆（含「研究缺口」與「無法由上傳文獻回答之事項」）", rows: 8 }
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
      { id: "bg_gaps", type: "textarea", label: "研究缺口", hint: "選填；可貼上 0.2 或 0.3 回覆中的研究缺口", rows: 4 }
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
  },
  // ─── 0.2 路線 D：篩選中介與調節變數 ───
  amech: {
    label: "篩選中介與調節變數", target: "nlm",
    hint: "自變數與依變數已經確定時使用：依上傳文獻找出兩者之間的中介變數與調節變數候選，逐一評估證據強度、結果一致性、理論依據、情境適用性與彼此重疊，並判定建議納入、可考慮或不建議。上傳文獻中找不到時，會直接寫「未找到」，不做推論。",
    fields: [
      { id: "am_x", type: "text", label: "自變數", hint: "建議附英文原文", placeholder: "例如：從眾性（Conformity）" },
      { id: "am_y", type: "text", label: "依變數", hint: "建議附英文原文", placeholder: "例如：衝動購買意向（Impulsive Buying Intention）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填；用來判斷文獻能否類推", placeholder: "例如：蝦皮電商平台" }
    ],
    rules: () => ["citation"],
    build: (p, R) => blank(p.am_x) || blank(p.am_y) ? "" : T.ask_mech({ x: p.am_x.trim(), y: p.am_y.trim(), ctx: (p.as_ctx || "").trim() }) + R,
    empty: "（請填入自變數與依變數）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。回覆貼到下方「AI 回覆」後，到{#asmix}按「重新帶入」，依判定勾選變數、畫出路徑；不確定的變數先移到待選區。上傳文獻中找不到的機制，補上傳文獻後再問一次。"
  },
  // ─── 0.3 研究架構合理性檢核 ───
  archx: {
    label: "拆解研究架構圖", target: "ai",
    hint: "手邊只有研究架構圖、沒有文字時使用：在一般 AI 對話上傳架構圖並貼上這段 Prompt，AI 會依圖整理出變數、角色與路徑，並列出看不清楚的地方。已有變數與假說的文字清單時，可略過這一步。",
    fields: [
      { id: "ax_note", type: "textarea", label: "圖例或補充說明", hint: "選填；圖中看不出來、但會影響判讀的資訊", rows: 2, placeholder: "例如：虛線代表調節效果；小方框為構面；H4 指向 H2 的箭頭" }
    ],
    build: p => T.arch_extract({ note: (p.ax_note || "").trim() }),
    next: "下一步：在一般 AI 開新對話，先上傳架構圖再貼上這段 Prompt。把回覆整段貼到{#archchk}的研究架構欄位，在自動畫出的架構圖上核對與修正。"
  },
  archchk: {
    label: "依文獻檢核架構", target: "nlm", stack: true,
    hint: "選擇研究架構來源：「0.2 組合研究架構」會自動帶入並畫出架構圖；「自行設計或匯入」可直接畫，或從架構圖圖片、0.3 修正後的架構匯入。產生的 Prompt 貼到已上傳文獻的 NotebookLM 對話，依勾選的制式項目檢核，並可一併提出自己的問題；回覆最後會逐條路徑總結文獻支持程度，並提出文獻支持更充分的修正架構。",
    fields: [
      { id: "ac_src", type: "radio", label: "研究架構來源", options: [["mix", "0.2 組合研究架構"], ["own", "自行設計或匯入（不經 0.2）"]], value: "mix" },
      { id: "ow_mode", type: "radio", label: "開始方式", options: [["draw", "直接畫"], ["import", "從圖片或文字匯入"]], value: "draw", when: p => p.ac_src === "own" },
      { id: "ax_note", type: "textarea", label: "圖例或補充說明", hint: "選填；圖中看不出來、但會影響判讀的資訊，會加入下方的讀圖 Prompt", rows: 2, placeholder: "例如：虛線代表調節效果；小方框為構面；H4 指向 H2 的箭頭", when: p => p.ac_src === "own" && p.ow_mode === "import" },
      { id: "ax_prompt", type: "promptbox", label: "讀圖 Prompt", when: p => p.ac_src === "own" && p.ow_mode === "import",
        hint: "有架構圖圖片時：在一般 AI（Claude、ChatGPT、Gemini）開新對話，先上傳架構圖，再貼上這段 Prompt",
        copyLabel: "複製讀圖 Prompt（貼到一般 AI，並上傳架構圖）", build: p => T.arch_extract({ note: (p.ax_note || "").trim() }) },
      { id: "ow_imp", type: "textarea", label: "要匯入的架構", hint: "貼上一般 AI 讀圖的回覆，或 0.3 修正後架構的「### 變數」「### 路徑」兩節", rows: 6, mono: true, when: p => p.ac_src === "own" && p.ow_mode === "import" },
      { id: "ow_go", type: "button", label: "匯入到圖上", hint: "會取代下方目前的變數與箭頭", when: p => p.ac_src === "own" && p.ow_mode === "import",
        run: p => {
          const r = importArch(p.ow_imp || "");
          if (!r) return "沒有讀到變數，請確認貼上的內容包含「變數」與「路徑」兩節。";
          return `已匯入 ${r.n} 個變數、${r.e} 條路徑，請在下方圖上核對。` + (r.unsure.length ? `\n讀圖時無法確定之處：${r.unsure.join("；")}` : "");
        } },
      { id: "ow_vars", type: "textarea", when: p => p.ac_src === "own", label: "變數", hint: "每行一個：角色｜變數名稱（英文原文）。角色為自變數、中介變數、調節變數、依變數或控制變數；省略角色時，依圖上的箭頭判斷", rows: 6, mono: true,
        placeholder: "自變數｜演算法推薦（Algorithmic Recommendation）\n中介變數｜顧客靈感（Customer Inspiration）\n調節變數｜說服知識（Persuasion Knowledge）\n依變數｜衝動購買意圖（Impulse Buying Intention）" },
      { id: "ow_diag", type: "diagram", when: p => p.ac_src === "own", label: "研究架構圖", hint: "拖曳方塊調整位置；點一個方塊再點另一個方塊，畫出箭頭；先點調節變數再點一條箭頭，畫出調節虛線；未選方塊時點箭頭或虛線可刪除",
        emptyHint: "（輸入變數後，這裡會出現方塊）",
        tray: true, all: p => ownVars(p, true), source: p => ownVars(p),
        onRemove: k => { store.values.ow_vars = (store.values.ow_vars || "").split(/\r?\n/).filter(l => { const v = parseOwnVars(l)[0]; return !v || v.key !== k; }).join("\n"); } },
      { id: "ac_diag", type: "diagram", when: p => p.ac_src !== "own", label: "研究架構圖", hint: "依 0.2 的架構自動畫出，請核對是否正確；要修改請回到 0.2。在此圖上的修改只用於這次檢核",
        emptyHint: "（0.2 還沒有架構：請先在 0.2 勾選變數並畫出路徑）",
        source: p => parseArch(archSrcText(p)).vars,
        seed: p => { const A = parseArch(archSrcText(p)); return { sig: JSON.stringify([A.edges, A.mods].map(l => l.map(x => [x.from, x.to || x.edge]))), edges: A.edges.map(({ from, to }) => ({ from, to })), mods: A.mods.map(({ from, edge }) => ({ from, edge })) }; } },
      { id: "ac_theory", type: "text", label: "理論基礎", hint: "選填；架構圖上通常沒有，有採用特定理論時填入", placeholder: "例如：自我一致性理論（Self-Congruity Theory）" },
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", hint: "選填", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "ac_checks", type: "checks", label: "制式檢核項目", hint: "可全部取消，只問自己的問題",
        options: ARCH_CHECKS.map(c => [c.key, c.label]), value: ARCH_CHECKS.map(c => c.key) },
      { id: "ac_extra", type: "checks", label: "檢核之後", options: [["revise", "提出文獻支持更充分的修正架構"]], value: ["revise"] },
      { id: "ac_qs", type: "textarea", label: "我的問題", hint: "選填；每行一題，會與制式項目一起送出", rows: 4,
        placeholder: "我把品牌熟悉度設為調節變數，文獻中比較常把它當成調節變數、中介變數，還是前因？\n文獻支持 H2 的研究多半是哪些產品類別？" },
      { id: "ac_detail", type: "promptbox", afterOut: true, label: "第二則 Prompt：路徑依據、變數衡量、研究缺口與學術貢獻",
        hint: "第一則的回覆完成後，在同一個對話接著送出；兩則回覆依序貼到下方「AI 回覆」",
        copyLabel: "② 複製第二則 Prompt（同一個對話接著送出）",
        build: p => T.ask_detail({ target: (p.ac_extra || []).includes("revise") ? "若上一則已提出修正後的研究架構，以修正後的架構為準；否則針對下列研究架構" : "針對下列研究架構", arch: archOut(p) }) }
    ],
    replyView: t => revisedView(t) + qaView(t, splitLines(store.values.ac_qs)) + (secondMissing(t) ? secondView(t) : pathView(t) + measureView(t, "")),
    rules: () => ["citation"],
    build: (p, R) => {
      const raw = archSrcText(p).trim(), qs = splitLines(p.ac_qs);
      if (!raw || (!p.ac_checks.length && !qs.length)) return "";
      return T.arch_check({ arch: archOut(p), theory: (p.ac_theory || "").trim(), ctx: (p.as_ctx || "").trim(), checks: p.ac_checks, qs, revise: (p.ac_extra || []).includes("revise") }) + R;
    },
    status: p => {
      const src = archSrcText(p), own = p.ac_src === "own";
      if (blank(src)) return own ? "請輸入變數，或從圖片、文字匯入。" : "0.2「組合研究架構」還沒有勾選變數。";
      const A = parseArch(src);
      if (!A.edges.length) return own ? "請在下方圖上畫出路徑。" : "0.2 的架構圖還沒有畫箭頭，請回到 0.2 畫好路徑。";
      return `已讀取 ${A.vars.length} 個變數、${A.edges.length} 條路徑` + (A.mods.length ? `、${A.mods.length} 條調節路徑` : "") + "。" +
        (own ? trayNote("ow_diag") : "要修改請回到 0.2；在下方圖上的修改只用於這次檢核。");
    },
    empty: "（請提供研究架構：貼上文字，或選擇 0.2 的架構；並至少勾選一個檢核項目或填入一個問題）",
    next: "下一步：貼到已上傳文獻的 NotebookLM 對話，回覆貼到下方「AI 回覆」，網頁會畫出 AI 修正後的架構，並整理變數定義與衡量。還有疑問時，用{#archq}在同一個對話接著問。"
  },
  archq: {
    label: "追問", target: "nlm",
    hint: "讀完檢核回覆後，針對特定路徑或變數再提問。在同一個 NotebookLM 對話接續貼上，AI 會沿用前面貼過的研究架構。",
    fields: [
      { id: "aq_qs", type: "textarea", label: "我的問題", hint: "每行一題；一次問一到兩題，回答會比較深入", rows: 4,
        placeholder: "H3 的支持證據是否都來自西方樣本？有沒有亞洲或台灣的研究？\n請扮演口試委員，針對 H2 提出三個最可能被質疑的問題，每題附文獻依據。" }
    ],
    replyView: t => qaView(t, splitLines(store.values.aq_qs)),
    rules: () => ["citation"],
    build: (p, R) => { const qs = splitLines(p.aq_qs); return qs.length ? T.arch_followup({ qs }) + R : ""; },
    empty: "（請填入至少一個問題）",
    next: "下一步：貼到同一個 NotebookLM 對話接續提問；要換問題時，清空欄位重新填寫即可。"
  }
};

// 貼上回覆後：依角色整理「變數定義與衡量」
// 分兩則送出時：回覆中還沒有第二則的內容，就提醒並附上複製按鈕
function secondMissing(text) { return !blank(text) && !parsePaths(text).length && !parseMeasures(text).length; }
function secondView(text) {
  if (!secondMissing(text)) return "";
  const m = mod(), f = m.fields.find(x => x.afterOut && x.type === "promptbox"); if (!f) return "";
  const t = f.build(valuesOf(m));
  return `<div class="needbox second"><b>第二則尚未送出</b>：回覆中還沒有「路徑的預期方向與依據」與「變數定義與衡量」。請在同一個 NotebookLM 對話送出第二則，再把回覆接在上方「AI 回覆」的最後。
    <p><button type="button" class="copy" data-copytext="${esc(t)}">② 複製第二則 Prompt</button></p></div>`;
}

function measureView(text, nextHint) {
  if (blank(text)) return "";
  const vs = parseMeasures(text);
  if (!vs.length) return `<p class="note warn">回覆中沒有找到「## 變數定義與衡量」一節（較早的 Prompt 不會產生）。可在同一個對話輸入：「請補上變數定義與衡量一節」，再把回覆接在下方。</p>` + (nextHint ? `<p class="stepnote after">${esc(nextHint)}</p>` : "");
  const known = Object.fromEntries(parseArch(store.values.cf_text || "").vars.map(v => [dgLabel(v.name)[0], v.role]));
  vs.forEach(v => { if (!v.role) v.role = known[dgLabel(v.name)[0]] || ""; });
  const groups = [["iv", "自變數"], ["med", "中介變數"], ["mod", "調節變數"], ["dv", "依變數"], ["ctrl", "控制變數"], ["", "其他"]];
  const html = groups.map(([r, label]) => {
    const g = vs.filter(v => v.role === r); if (!g.length) return "";
    return `<h4>${label}</h4>` + g.map(v => `<div class="mv"><b>${esc(v.name)}</b>
      <p><span>理論定義</span>${esc(v.def || "（回覆未提供）")}</p>
      <p><span>量表出處</span>${esc(v.scale || "（回覆未提供）")}</p>
      ${v.need ? `<p class="need"><span>補齊文獻</span>${esc(v.need)}</p>` : ""}
      <div><span>代表題項</span>${v.items.length === 1 && /未列題項/.test(v.items[0]) ? esc(v.items[0]) : v.items.length ? `<ol>${v.items.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : "（回覆未提供）"}</div></div>`).join("");
  }).join("");
  const needs = vs.filter(v => v.need && !/^無|省略/.test(v.need));
  const needBox = needs.length ? `<div class="needbox"><b>量表或題項缺失，建議補齊的文獻</b><ul>${needs.map(v => `<li><b>${esc(dgLabel(v.name)[0])}</b>：${esc(v.need)}</li>`).join("")}</ul><p class="hint">找到後上傳到同一個 Notebook，再請 AI 補上該變數的量表與題項。</p></div>` : "";
  return `<div class="mview"><h3>變數定義與衡量</h3>${needBox}${html}</div>` + (nextHint ? `<p class="stepnote after">${esc(nextHint)}</p>` : "");
}

// 貼上回覆後：每條路徑的預期方向、理論基礎與實證支持
function pathView(text) {
  if (blank(text)) return "";
  const ps = parsePaths(text);
  if (!ps.length) return `<p class="hint">（回覆中沒有找到「## 路徑的預期方向與依據」一節；可在同一個對話輸入「請依格式補上路徑的預期方向與依據」）</p>`;
  const badge = s => /負|−|-/.test(s) && !/正/.test(s.slice(0, 4)) ? ["neg", "−"] : /強化|減弱|調節/.test(s) ? ["mod", "調節"] : /正|＋|\+/.test(s) ? ["pos", "＋"] : ["", "？"];
  const qs = ps.filter(x => x.query);
  const qbox = qs.length ? `<div class="needbox"><b>理論或實證不足的路徑：到 Google Scholar Labs 補充文獻</b>
    <ol>${qs.map(x => `<li><b>${esc(x.head)}</b><br>${esc(x.query)} <button type="button" data-copytext="${esc(x.query)}">複製</button>${x.qnote ? `<br><small>${esc(x.qnote)}</small>` : ""}</li>`).join("")}</ol>
    <p class="hint">逐一複製問句，貼到 <a href="https://scholar.google.com/" target="_blank" rel="noopener">Google Scholar</a> 的 Labs；找到的文獻上傳到同一個 Notebook 後，再檢核一次。</p></div>` : "";
  return `<div class="mview pview"><h3>路徑的預期方向與依據</h3>${qbox}` + ps.map(x => {
    const [c, b] = badge(x.sign);
    return `<div class="mv"><b>${esc(x.head)}</b> <em class="sign ${c}">${b}</em>
      <p><span>預期方向</span>${esc(x.sign || "（回覆未提供）")}</p>
      <p><span>理論基礎</span>${esc(x.theory || "（回覆未提供）")}</p>
      <p class="ev"><span>實證支持</span>${esc(x.evidence || "（回覆未提供）")}</p>
      ${x.query ? `<p class="q"><span>補充檢索</span>${esc(x.query)} <button type="button" data-copytext="${esc(x.query)}">複製</button>${x.qnote ? `<br><small>${esc(x.qnote)}</small>` : ""}</p>` : ""}</div>`;
  }).join("") + `</div>`;
}

// 貼上回覆後：把「我的問題」逐題對應回答
function qaView(text, qs) {
  if (blank(text) || !qs.length) return "";
  const ans = parseAnswers(text);
  return `<div class="mview qview"><h3>我的問題與回答</h3>` + qs.map((q, i) => {
    const a = ans[i + 1];
    return `<div class="mv"><b>Q${i + 1}　${esc(q)}</b><p class="ev">${a ? esc(a) : `<span class="miss">回覆中沒有找到 Q${i + 1} 的回答</span>`}</p></div>`;
  }).join("") + `</div>`;
}

// 0.3 貼上回覆後：畫出 AI 的修正架構
function revisedView(text) {
  if (blank(text)) return "";
  if (/^\s*(以下是我提出的研究架構|## 制式檢核)/.test(text)) return `<p class="note warn">這裡貼的似乎是 Prompt 本身，不是 NotebookLM 的回覆；請貼上 AI 回答的內容。</p>`;
  const r = parseRevised(text);
  if (!r) return (store.values.ac_extra || ["revise"]).includes("revise") && /修正後的研究架構/.test(text)
    ? `<p class="hint">（回覆中的「修正後的研究架構」沒有「### 變數」「### 路徑」兩節，無法畫圖；維持原架構時可忽略）</p>` : "";
  const d = { pos: {}, edges: r.A.edges.map(({ from, to }) => ({ from, to })), mods: r.A.mods.map(({ from, edge }) => ({ from, edge })) };
  dgAutoPos(r.A.vars, d.pos, true);
  return ref(`<div class="rview"><div class="cand-head"><h3>AI 修正後的研究架構</h3><button type="button" class="copy" data-adopt="1">採用此修正架構</button></div>
    <div class="cand-svg">${dgSvg(r.A.vars, d, null, false)}</div>
    <p class="hint">採用：按「採用此修正架構」，研究架構來源會改為「自行設計或匯入」並載入此架構，可在圖上微調，再複製 Prompt 檢核一次。<br>不採用、維持原架構：不必做任何修改，原架構就是你的研究架構；檢核中指出的疑慮可用{#archq}追問，接著到{#astat}與{#asq}。</p></div>`);
}
function adoptRevised() {
  const r = parseRevised((store.replies || {})[replyKey()] || ""); if (!r) return;
  importArch(r.src); store.values.ac_src = "own"; store.values.ow_mode = "draw";
}

// ── 0.4 問卷草稿：預覽（像實際問卷）、直接修改題項、修改清單與追問 ──
const svOrig = () => deLatex((store.replies || {})["s0-6|asq"] || "");
const svRev = () => deLatex(store.values.sv_rev || "");
const hasRev = () => !!parseSurvey(svRev());
const svUseRev = () => hasRev() && store.values.sv_ver !== "orig";
const svReply = () => svUseRev() ? svRev() : svOrig();
function svOrigMap() {   // 原版各題文字，供修訂版標示差異
  const O = parseSurvey(svOrig()), m = {}; if (!O) return m;
  const q = x => x.q + (x.opts.length ? `（${x.opts.join("／")}）` : "");
  if (O.intro) m.intro = O.intro; if (O.scaleText) m.scale = O.scaleText;
  [...O.screen, ...O.manip, ...O.demo, ...O.other.flatMap(o => o.qs)].forEach(x => (m[x.id] = q(x)));
  O.other.forEach(o => { if (o.text) m["sec:" + o.head] = o.text; });
  O.constructs.forEach(c => c.items.forEach(it => (m[it.id] = it.zh)));
  return m;
}
function svRevPrompt() {
  const S = parseSurvey(svReply()); if (!S) return "";
  const edits = svAllItems(S).filter(it => svItemText(it) !== it.zh).map(it => ({ id: it.id, text: svItemText(it) }));
  return T.ask_svrev({ edits, manip: S.manip.length > 0 });
}
const svItemText = it => { const e = (store.values.sv_edit || {})[it.id]; return e && e.orig === it.zh ? e.text : it.zh; };
function svAllItems(S) { return S.constructs.flatMap(c => c.items.map(it => ({ ...it, con: c.name, src: c.src }))); }
// 問卷各部分（依問卷順序），作為修改意見的對象
function svParts(S) {
  const q = x => x.q + (x.opts.length ? `（${x.opts.join("／")}）` : "");
  const oth = k => S.other.filter(o => o.after === k).flatMap(o => [
    ...(o.text ? [{ key: "sec:" + o.head, label: `「${o.head}」說明`, kind: "other", text: o.text }] : []),
    ...o.qs.map(x => ({ key: x.id, label: `${x.id}（${o.head}）`, kind: "other", text: q(x) }))]);
  return [
    ...oth("start"),
    ...(S.intro ? [{ key: "intro", label: "填答說明", kind: "other", text: S.intro }] : []), ...oth("intro"),
    ...S.screen.map(x => ({ key: x.id, label: `${x.id}（篩選題）`, kind: "other", text: q(x) })), ...oth("screen"),
    ...S.manip.map(x => ({ key: x.id, label: `${x.id}（操弄檢定）`, kind: "other", text: q(x) })), ...oth("manip"),
    ...(S.scaleText ? [{ key: "scale", label: "量尺", kind: "other", text: S.scaleText }] : []), ...oth("scale"),
    ...S.constructs.flatMap(c => [{ key: "con:" + c.name, label: `構念「${c.name}」`, kind: "con", src: c.src, text: c.items.map(it => `${it.id} ${svItemText(it)}`).join("；") || c.missing },
      ...c.items.map(it => ({ key: it.id, label: it.id, kind: "item", con: c.name, src: c.src, text: svItemText(it), en: it.en }))]), ...oth("con"),
    ...S.demo.map(x => ({ key: x.id, label: `${x.id}（基本資料）`, kind: "other", text: q(x) })), ...oth("demo")
  ];
}
const svNotes = () => Object.fromEntries(Object.entries(store.values.sv_fix || {}).filter(([, v]) => !blank(v)));
function svFixBox(S) {   // 下方彙整：只列有填意見的部分
  const fix = svNotes(), parts = S ? svParts(S).filter(x => x.key in fix) : [];
  if (!parts.length) return `<p class="hint">（在各部分下方的「修改意見」欄填寫後，會彙整在這裡）</p>`;
  return `<h4>修改意見彙整（${parts.length} 項）</h4>` + parts.map(x => `<div class="sv-fixrow"><b>${esc(x.label)}</b><span class="sv-orig">${esc(x.text)}</span>
      <div class="sv-notev">意見：${esc(fix[x.key])}</div><button type="button" data-svclear="${esc(x.key)}">清除</button></div>`).join("") +
    (B => B.length > 1 ? `<p class="note warn">意見較多，分成 ${B.length} 則依序送出（NotebookLM 單次輸入有字數上限）；每則回覆完成後再送下一則，所有回覆依序貼到下方「修訂建議的 AI 回覆」。</p>
      <p class="sv-btns">${B.map((b, k) => `<button type="button" class="copy" data-svfixcopy="${k + 1}">${"①②③④⑤⑥⑦⑧⑨"[k] || k + 1} 複製第 ${k + 1} 則（${b.n} 項）</button>`).join("")}</p>
      <p class="sv-btns">` : `<p class="sv-btns"><button type="button" class="copy" data-svfixcopy="1">複製修改追問 Prompt（逐條請 NotebookLM 回應）</button>`)(svFixBatches()) +
    `
      <button type="button" class="copy alt" data-svnotecopy="1">複製修改意見（純文字，可給學生）</button></p>
    <p class="sv-btns"><button type="button" data-svclear="*">清除全部意見</button></p>
    <p class="hint">AI 的修訂建議貼到下方「修訂建議的 AI 回覆」，再複製「產生修訂版問卷 Prompt」。修訂版貼上後，可清除全部意見，再對修訂版提出下一輪意見。</p>`;
}
function surveyView(text) {
  if (blank(text) && !hasRev()) return "";
  const S = parseSurvey(svReply()), rev = svUseRev(), O = rev ? svOrigMap() : {};
  const was = (key, now) => !rev ? "" : !(key in O) ? `<div class="sv-was">（修訂版新增）</div>` : O[key] !== now ? `<div class="sv-was">原：${esc(O[key])}</div>` : "";
  if (!S) return `<p class="note warn">回覆中沒有找到「## 問卷草稿」一節（較早的 Prompt 格式不同），請重新複製 Prompt 產生問卷草稿。</p>`;
  const fix = store.values.sv_fix || {}, n = S.points;
  const note = key => `<input type="text" class="sv-note${blank(fix[key]) ? "" : " filled"}" data-svnote="${esc(key)}" value="${esc(fix[key] || "")}" placeholder="修改意見（選填）">`;
  const dots = `<span class="sv-dots">${Array.from({ length: n }, (_, k) => `<i>${k + 1}</i>`).join("")}</span>`;
  const opts = q => q.opts.length ? `<div class="sv-opts">${q.opts.map(o => `<span><i class="sv-box${q.multi ? " multi" : ""}"></i>${esc(o)}</span>`).join("")}</div>` : "";
  const simple = (title, qs) => qs.length ? (title ? `<h4>${title}</h4>` : "") + qs.map(q => { const w = was(q.id, q.q + (q.opts.length ? `（${q.opts.join("／")}）` : ""));
    return `<div class="sv-q${w ? " revised" : ""}"><b>${esc(q.id)}</b> ${esc(q.q)}${opts(q)}${w}${note(q.id)}</div>`; }).join("") : "";
  const oth = k => S.other.filter(o => o.after === k).map(o => { const w = was("sec:" + o.head, o.text);
    return `<h4>${esc(o.head)}</h4>${o.text ? `<div class="${w ? "revised" : ""}"><p class="sv-intro">${esc(o.text)}</p>${w}</div>${note("sec:" + o.head)}` : ""}${simple("", o.qs)}`; }).join("");
  const cons = S.constructs.map(c => { const ck = "con:" + c.name;
    return `<div class="sv-con"><h4>${esc(c.name)}</h4><p class="hint">${esc([c.src, c.dim && !/^無$/.test(c.dim) ? "構面：" + c.dim : ""].filter(Boolean).join("｜"))}</p>
    ${note(ck).replace('placeholder="修改意見（選填）"', 'placeholder="對整組題項的修改意見（選填）"')}
    ${c.missing ? `<p class="note warn">${esc(c.missing)}</p>` : ""}
    ${c.items.map(it => { const t = svItemText(it), ed = t !== it.zh, w = was(it.id, it.zh);
      return `<div class="sv-item${ed ? " edited" : ""}${w ? " revised" : ""}"><b>${esc(it.id)}</b>
        <div class="sv-text"><span class="sv-zh" contenteditable="true" spellcheck="false" data-sved="${esc(it.id)}" data-orig="${esc(it.zh)}" title="也可以點一下直接修改">${esc(t)}</span>
          ${it.en ? `<small>${esc(it.en)}</small>` : ""}
          ${w}${ed ? `<span class="sv-act"><button type="button" data-svrestore="${esc(it.id)}">還原</button></span>` : ""}
          ${note(it.id)}</div>${dots}</div>`; }).join("")}</div>`; }).join("");
  const scaleHead = `<div class="sv-scale"><span>${esc(S.ends[0] || "1")}</span>${dots}<span>${esc(S.ends[1] || String(n))}</span></div>${was("scale", S.scaleText)}${note("scale").replace('placeholder="修改意見（選填）"', 'placeholder="對量尺的修改意見（選填）"')}`;
  return `<div class="sview"><div class="cand-head"><h3>問卷預覽${rev ? "（修訂版）" : ""}</h3>${hasRev() ? `<span class="sv-ver"><button type="button" data-svver="rev" class="${rev ? "on" : ""}">修訂版</button><button type="button" data-svver="orig" class="${rev ? "" : "on"}">原版</button></span>` : ""}<button type="button" class="copy" data-svcopy="1">複製整份問卷</button></div>
    ${rev ? `<p class="hint">黃底是修訂版改過或新增的部分，下方標示原文；完整的修改理由見「修訂版問卷的 AI 回覆」中的「修改摘要」。</p>` : ""}
    <p class="hint">每個部分、每一題下方都有「修改意見」欄，有填寫的會彙整在問卷最下方，再一次複製請 NotebookLM 逐條回應；量表題項也可以點文字直接修改。</p>
    ${oth("start")}${S.intro ? `<h4>填答說明</h4><p class="sv-intro">${esc(S.intro)}</p>${was("intro", S.intro)}${note("intro")}` : ""}${oth("intro")}
    ${simple("篩選題", S.screen)}${oth("screen")}${simple("操弄檢定與注意力檢核", S.manip)}${oth("manip")}
    ${S.constructs.length ? `<h4>量表題項</h4>${scaleHead}` : ""}${oth("scale")}${cons}${oth("con")}
    ${simple("基本資料題", S.demo)}${oth("demo")}</div><div class="sv-fixbox" id="svfixbox">${svFixBox(S)}</div>`;
}
function svText() {   // 整份問卷的純文字（含修改）
  const S = parseSurvey(svReply()); if (!S) return "";
  const q = x => `${x.id}. ${x.q}` + (x.opts.length ? `（${x.opts.join("／")}）` : "");
  const oth = k => S.other.filter(o => o.after === k).map(o => `【${o.head}】\n` + [o.text, ...o.qs.map(q)].filter(Boolean).join("\n"));
  return [...oth("start"), S.intro && "【填答說明】\n" + S.intro, ...oth("intro"), S.screen.length && "【篩選題】\n" + S.screen.map(q).join("\n"), ...oth("screen"),
    S.manip.length && "【操弄檢定與注意力檢核】\n" + S.manip.map(q).join("\n"), ...oth("manip"),
    S.constructs.length && `【量表題項】量尺：${S.scaleText}`, ...oth("scale"),
    ...S.constructs.map(c => `〈${c.name}〉${c.src ? "（" + c.src + "）" : ""}\n` + (c.missing ? c.missing + "\n" : "") + c.items.map(it => `${it.id}. ${svItemText(it)}`).join("\n")), ...oth("con"),
    S.demo.length && "【基本資料】\n" + S.demo.map(q).join("\n"), ...oth("demo")].filter(Boolean).join("\n\n");
}
function svFixBatches() {   // 依 NotebookLM 單次輸入上限分批
  const S = parseSurvey(svReply()); if (!S) return [];
  const fix = svNotes(), LIMIT = 2600;
  const items = svParts(S).filter(x => x.key in fix).map(x => ({ ...x, note: fix[x.key] }));
  const groups = [];
  items.forEach(x => {
    const g = groups[groups.length - 1];
    if (g && T.ask_svfix({ items: [...g, x], part: groups.length, parts: 9 }).length <= LIMIT) g.push(x); else groups.push([x]);
  });
  return groups.map((g, k) => ({ n: g.length, text: T.ask_svfix({ items: g, part: k + 1, parts: groups.length }) }));
}
const svFixPrompt = (k = 1) => (svFixBatches()[k - 1] || {}).text || "";
function svNotesText() {   // 修改意見清單（純文字）
  const S = parseSurvey(svReply()); if (!S) return "";
  const fix = svNotes();
  const items = svParts(S).filter(x => x.key in fix);
  return items.length ? "【問卷修改意見】\n\n" + items.map((x, k) => `${k + 1}. ${x.label}\n原文：${x.text}\n意見：${fix[x.key] || "（未填）"}`).join("\n\n") : "";
}

// 組合研究架構：選定架構的圖（依 cf_text 建立，保留圖上微調）
const finDiag = p => dgSeed(DEFS.asmix.fields.find(f => f.id === "fin_diag"), p);
// 候選架構卡片：每個候選畫成一張圖，附新增變數與理由
function renderCands(p) {
  if (blank(p.cf_reply)) return `<p class="hint">（貼上候選架構的 AI 回覆後，這裡會畫出每個候選架構）</p>`;
  const cs = parseCands(deLatex(p.cf_reply));
  if (!cs.length) return `<p class="note warn">沒有讀到候選架構，請確認回覆中有「## 候選架構一」以及「### 變數」「### 路徑」兩節。</p>`;
  return cs.map((c, i) => {
    const d = { pos: {}, edges: c.A.edges.map(({ from, to }) => ({ from, to })), mods: c.A.mods.map(({ from, edge }) => ({ from, edge })) };
    dgAutoPos(c.A.vars, d.pos, true);
    const on = (store.values.cf_sel ?? -1) === i && !blank(store.values.cf_text);
    return `<div class="cand${on ? " on" : ""}"><div class="cand-head"><b>${esc(c.title)}</b><button type="button" class="copy" data-cand="${i}">${on ? "已選定 ✓" : "選這個"}</button></div>
      <div class="cand-svg">${dgSvg(c.A.vars, d, null, false)}</div>
      ${c.fresh.length ? `<p class="hint">新增變數：${esc(c.fresh.join("、"))}</p>` : ""}
      <details><summary>理由與文獻支持</summary><div class="cand-reason">${esc(c.reason || "（回覆中沒有理由說明）")}</div></details></div>`;
  }).join("");
}
function chooseCand(i) {
  const c = parseCands(store.values.cf_reply)[i]; if (!c) return;
  store.values.cf_text = candText(c.A); store.values.cf_sel = i; store.values.cf_title = c.title;
  const d = dgData("fin_diag"); d.sig = null; d.pos = {};
}

// 0.3 步驟 2：架構圖資料（依文字建立，保留圖上的手動修改）與送出的架構文字
const archDiag = p => dgSeed(DEFS.archchk.fields.find(f => f.id === "ac_diag"), p);
const archOut = p => { const t = archSrcText(p), A = parseArch(t); return A.edges.length ? archText(A, archDiag(p)) : t.trim(); };

// 0.2 路線 B：由 0.1「研究方向聚焦」帶入研究情境與研究問題
// 取 AI 回覆中最後一次出現的「研究情境：」「研究問題：」；沒有回覆時，研究問題改用 0.1 填寫的「感興趣的現象」
function seedFrom01() {
  const r = String((store.replies || {})["s0-1|focus"] || "").replace(/\*\*/g, "");
  const last = re => { const m = [...r.matchAll(re)]; return m.length ? m[m.length - 1][1].trim() : ""; };
  const ctx = last(/研究情境[：:]\s*(.+)/g), con = last(/研究問題[：:]\s*(.+)/g) || (store.values.f_phen || "").trim();
  const dv = last(/^\s*依變數[：:]\s*(.+)$/gm);
  return { as_ctx: ctx, as_con: con, as_dv: dv };
}

// 每行一項（去除行首的條列符號與空白）
const splitLines = s => (s || "").split(/\r?\n/).map(v => v.replace(/^[\s\-*•]+/, "").trim()).filter(Boolean);

// 問卷草稿：選定的架構（勾選組合／候選架構編號／其他）
function archLabel(p) {
  if (p.as_archm === "num") {
    const n = (p.as_archno || "").trim();
    if (!n) return "";
    const zh = { "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六" }[n] || n;
    return `上述候選研究架構中的架構${zh}`;
  }
  if (p.as_archm === "other") return (p.as_arch || "").trim();
  const t = mixArchText();   // 0.2 選定（或勾選組合）的架構，帶入完整的變數與路徑
  return t ? "\n\n" + t.trim() + "\n\n" : "前述我自行勾選組合的研究架構";
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
      { mod: "vcomp", note: "每行填一個變數；可直接從組合研究架構的勾選區複製名稱。" }] },
    { id: "r-method", no: "", title: "方法導向檢索", desc: "找特定領域中、實際使用某種統計方法的實證論文作為模仿範例：產生精準的 Google Scholar 檢索式與 Scholar Labs 問句。", steps: [
      { mod: "smethod", note: "貼到有網路搜尋的 AI 對話，不需要上傳文獻。" }] }
  ] },
  { ch: "第零章 研究準備", secs: [
    { id: "s0-1", no: "0.1", title: "文獻蒐集與整理", desc: "還沒讀文獻、只有一個想研究的現象時，從這裡開始：聚焦研究問題與關鍵字 → 建立文獻比較表。步驟 3–5 為選用的「整批文獻全貌」：要先看整個研究領域的主題、理論、變數與缺口時再做。整理好之後，到 0.2 形成研究架構。", steps: [
      { mod: "focus", note: "用選擇題把現象收斂成研究問題，產生中英文關鍵字與檢索字串；檢索到的文獻存進同一個 Zotero 資料夾。", go: [{ to: "s0-1", step: 1, when: "檢索到的文獻存進 Zotero、上傳到 NotebookLM 後" }] },
      { mod: "matrix", note: "文獻上傳到 NotebookLM 後，逐篇整理成比較表；完成後加入 NotebookLM 的來源，作為後續提出與檢核研究架構的索引（做法見最下方）。", go: [{ to: "s0-4", step: 0, when: "已大致知道要研究哪些變數，或已確定自變數與依變數" }, { to: "s0-1", step: 2, when: "文獻多而分散，想先看整個領域的全貌" }],
        after: "完成後請做兩件事，後續步驟都會用到這份表：\n1. 把匯出的試算表全選複製（Ctrl+A、Ctrl+C），貼到上方「AI 回覆」保存。\n2. 回到同一個 NotebookLM，按「新增來源 → 複製的文字」貼上，再從該來源右側的選單重新命名為「00_文獻比較表（索引）」。之後 0.2「提出候選研究架構」「組合研究架構」與 0.3「依文獻檢核架構」的 Prompt，都會以它作為索引，快速對照每篇文獻的變數、理論與量表，作為提出與檢核研究架構的依據；引用仍回到各篇全文。\n\n接下來：已大致知道要研究哪些變數、指導教授已給方向，或已確定自變數與依變數 → 直接到 0.2；文獻多而分散、還看不出主流方向，想先了解整個領域的主題、理論、方法與缺口 → 繼續步驟 3–5。" },
      { mod: "m5a", note: "選用（整批文獻全貌）：開新對話，盤點主題、理論與研究方法。", go: [{ to: "s0-1", step: 3, when: "同一個對話接續" }] },
      { mod: "m5b", note: "選用（整批文獻全貌）：同一個對話接續，以文字說明各變數的定義、測量與角色，並畫關係圖；用來理解變數，挑選變數請用 0.2。", go: [{ to: "s0-1", step: 4, when: "同一個對話接續" }] },
      { mod: "m5c", note: "選用（整批文獻全貌）：同一個對話接續，從變數、理論、情境與方法四個面向，找出整個領域的研究缺口與研究主題建議。", go: [{ to: "s0-4", step: 0, when: "看完全貌、選定研究方向後" }] }] },
    { id: "s0-4", no: "0.2", title: "形成研究架構", desc: "兩種做法：有研究主題與情境時，先由 AI 提出候選架構（步驟 1），再到步驟 2 勾選變數、畫出路徑；自變數與依變數已確定時，直接到步驟 2，勾選「自變數與依變數已確定」。組合好的架構到 0.3 檢核；已有自己的架構或只有架構圖圖片，直接到 0.3 選「自行設計或匯入」。", steps: [
      { mod: "asf", note: "由 AI 提出幾個合理的研究架構，再由你挑選；已確定依變數時可填入。需要更完整的變數時，勾選最下方的「補充變數清單」。", go: [{ to: "s0-4", step: 1, when: "回覆貼到「AI 回覆」後，勾選變數、請 AI 提出候選架構" }] },
      { mod: "asmix", note: "勾選變數（同一角色可勾多個候選）→ 請 AI 提出候選架構 → 網頁畫出各候選，選定最適合者 → 到 0.3 檢核。自變數與依變數已確定時，先勾選上方的「已確定」，請 AI 建議中介與調節變數。", go: [{ to: "s0-5", step: 0, when: "選定架構後，檢核合理性並產生研究缺口與學術貢獻" }] }] },
    { id: "s0-5", no: "0.3", title: "研究架構合理性檢核", desc: "依已上傳的文獻檢核研究架構的合理性，並提出文獻支持更充分的修正架構：0.2 各路線產出的架構都在這裡檢核，也可單獨使用（例如只有一張架構圖）。NotebookLM 依制式項目與你的問題檢核 → 同一對話追問。", steps: [
      { mod: "archchk", note: "選擇研究架構來源：在 0.2 組合的架構選「0.2 組合研究架構」，會自動帶入；已有自己的架構或只有架構圖圖片，選「自行設計或匯入」。NotebookLM 需先上傳與架構相關的文獻；文獻愈完整，檢核愈有意義。", go: [{ to: "s0-5", step: 1, when: "對檢核結果還有疑問" }, { to: "s0-6", step: 0, when: "架構確定後（維持原架構或已採用修正架構並再檢核）" }] },
      { mod: "archq", note: "接在步驟 1 的同一個對話；可重複使用。", go: [{ to: "s0-6", step: 0, when: "疑問釐清、架構確定後" }] }] },
    { id: "s0-6", no: "0.4", title: "研究設計", desc: "研究架構確定之後：確認文獻用過的統計方法、本研究適用的方法與應揭露的實證結果；研究方法為問卷調查法或實驗設計法時，再產出問卷草稿。", steps: [
      { mod: "astat", note: "選定變數與資料之後：確認統計方法，以及實證結果應揭露哪些項目。可接在 0.3 檢核的同一個對話。", go: [{ to: "s0-6", step: 1, when: "研究方法為問卷調查法或實驗設計法" }, { to: "s1-1", step: 0, when: "panel data，或統計方法已確定，開始撰寫第一章" }] },
      { mod: "asq", note: "研究方法為問卷調查法或實驗設計法時使用：產出問卷草稿，並評估題數、樣本數、量表與施測風險；panel data 可跳過。", go: [{ to: "s1-1", step: 0, when: "問卷草稿完成，開始撰寫第一章緒論" }, { to: "s3-3", step: 0, when: "正式撰寫量表與操作型定義時" }] }] }
  ] },
  { ch: "第一章 緒論", secs: [
    { id: "s1-1", no: "1.1", title: "研究背景與動機", desc: "由產業現象收斂到文獻缺口。", steps: [
      { mod: "asp", note: "先查實務面：把{#archchk}兩則的完整回覆交給有網路搜尋的 AI，寫成研究情境、實務問題與實務缺口。" },
      { mod: "bg", note: "準備研究架構、手邊的產業數據，以及 0.2 選定的研究缺口；上一步的研究情境與實務問題可貼到「產業或實務背景資料」。" }], finish: FIN_FULL },
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
