// ── 共用規則（可在每個模組勾選；舊模組的預設值沿用原本 PowerShell 版的組合） ──
const RULES = [
  { key: "citation", label: "引用格式規範", text: T.citation },
  { key: "evidence", label: "實證結果與引用分散", text: T.evidence },
  { key: "style", label: "文字風格規範", text: T.style },
  { key: "verify", label: "完成後自我核對", text: T.verify },
  // opt：只在步驟預設有列入時才顯示
  { key: "support", label: "文獻支持程度總結", text: T.support, opt: true },
  { key: "ch1", label: "第一章寫作規範", opt: true,
    text: () => "\n\n[第一章寫作規範]\n本段屬於論文第一章緒論，請遵守以下規範；與其他規則衝突時，以本規範為準：\n" + GUIDE_CH1.ai },
  { key: "ch2", label: "第二章寫作規範", opt: true,
    text: () => "\n\n[第二章寫作規範]\n本段屬於論文第二章文獻探討，請遵守以下規範；與其他規則衝突時，以本規範為準：\n" + GUIDE_CH2.ai }
];
const inCh1 = () => /^s1-/.test(store.sec || "");

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
      { id: "as_iv", type: "textarea", label: "已確定的自變數", hint: "選填；每行一個，只寫名稱即可（貼上含定義的整段也可以，網頁只取變數名稱）；填了之後，所有候選架構都包含這些自變數", rows: 2, placeholder: "例如：特惠偏好度（Deal Proneness）" },
      { id: "as_dv", type: "textarea", label: "已確定的依變數", hint: "選填；每行一個，可填兩個以上；填了之後，所有候選架構都以這些變數為依變數", rows: 2, placeholder: "例如：認知型衝動購買（Cognitive Impulse Buying）\n情感型衝動購買（Affective Impulse Buying）" },
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
    build: (p, R) => blank(p.as_ctx) ? "" : T.ask_frame({ ctx: p.as_ctx.trim(), con: p.as_con.trim(), ivs: fixedNames(p.as_iv), dvs: fixedNames(p.as_dv), method: p.as_method, n: p.as_n }) + R,
    seedQuiet: ["as_dv"],
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
      { id: "as_req", type: "textarea", label: "問卷設計要求", hint: "選填；例如某個構念要分成幾個題組、各幾題、指導語怎麼寫、哪些字眼不能出現；會附在 Prompt 中，請精簡（建議 600 字內）", rows: 5,
        placeholder: "例如：依變數題組共 8 題：認知型衝動購買 3 題、情感型衝動購買 3 題、整體衝動購買 2 題，分列為三個構念；題項不得出現「促銷」「折扣」等字眼。" },
      { id: "sv_reply", type: "textarea", below: true, label: "修訂建議的 AI 回覆", hint: "選填；貼上修改追問的回覆，會一併存入研究存檔", rows: 5 },
      { id: "sv_revp", type: "promptbox", below: true, label: "產生修訂版問卷", hint: "修訂建議貼上後，在同一個對話接著送出，請 NotebookLM 依建議輸出修訂後的完整問卷",
        copyLabel: "複製產生修訂版問卷 Prompt（貼到 NotebookLM）", empty: "（先貼上修訂建議的 AI 回覆）", build: p => blank(p.sv_reply) ? "" : svRevPrompt() },
      { id: "sv_rev", type: "textarea", below: true, label: "修訂版問卷的 AI 回覆", hint: "貼上後，上方問卷預覽會換成修訂版（改過的地方會標示原文），可切換回原版比對", rows: 5 },
      { id: "sv_tofinal", type: "button", below: true, label: "以目前問卷預覽作為定稿", hint: "把預覽中的問卷（含直接修改）帶入下方「定稿問卷」",
        run: () => { const t = svText(); if (!t) return "沒有問卷預覽可帶入；請直接把定稿問卷貼到下方。";
          if (!blank(store.values.sv_final) && !confirm("「定稿問卷」已有內容，要以目前預覽取代嗎？")) return "未變更";
          store.values.sv_final = t; return "已帶入目前問卷預覽，可再直接修改。"; } },
      { id: "sv_final", type: "textarea", below: true, label: "定稿問卷", hint: "最後確定的整份問卷（純文字即可，構念寫成〈構念名稱〉（量表出處），題項寫成 Q1. 題目）；會存入研究存檔，並帶到 3.3 撰寫操作型定義與量表", rows: 10 }
    ],
    replyView: t => surveyView(t),
    rules: () => ["citation"],
    status: p => p.as_rmethod === "sec" ? "研究方法為 panel data 時不需要問卷草稿，可跳過此步驟。" : (p.as_req || "").trim().length > 800 ? "「問卷設計要求」內容較長，Prompt 可能超過 NotebookLM 單次輸入上限；請精簡為重點。" : p.as_archm === "other" && (p.as_arch || "").trim().length > 300 ? "「其他架構」內容過長，NotebookLM 可能無法讀取；同一個對話中簡短描述即可。" : "",
    build: (p, R) => {
      const arch = archLabel(p);
      return blank(p.as_ctx) || !arch || p.as_rmethod === "sec" ? "" : T.ask_survey({ exp: p.as_rmethod === "exp", ctx: p.as_ctx.trim(), arch, target: p.as_target.trim(), scale: p.as_scale.trim(), method: p.as_amethod.trim(), req: (p.as_req || "").trim() }) + R;
    },
    empty: "（請填入研究情境，並指定選定的架構）",
    next: "下一步：【待補量表】的構念，請找到量表原始論文上傳後再問一次。問卷定稿後貼到下方「定稿問卷」，正式撰寫第三章時，用{#opdef}依定稿問卷撰寫操作型定義與量表；要查實務面時，到{#asp}。"
  },
  asp: {
    label: "研究情境與實務缺口", target: "ai",
    hint: "請使用已開啟網路搜尋的 AI；未開啟搜尋時，AI 只能憑記憶作答，捏造的風險很高。學術論點只採用{#archchk}的回覆，網路資料只用於研究情境與實務面。",
    fields: [
      { id: "as_ctx", type: "text", label: "研究情境（平台或產業）", placeholder: "例如：抖音電商、台灣精釀啤酒、國軍基層部隊" },
      { id: "as_con", type: "text", label: "研究問題", hint: "選填；以一句話描述要探討的現象或問題，可幫助 AI 聚焦", placeholder: "例如：使用者滑 TikTok 或 Instagram Reels 時看到平台推薦的產品開箱影片，是否會因此產生衝動購買？" },
      { id: "as_path", type: "text", label: "研究情境中的歷程", hint: "選填；不填時由 AI 依構念與結果決定階段", placeholder: "例如：開啟應用程式、滑動影片、接觸商品相關內容、產生購買念頭" },
      { id: "bg_plan", type: "textarea", label: "選定的寫法", hint: "貼上上一步回覆中你選的那一種寫法（段落大綱）；AI 會依其中需要的統計數據上網查台灣資料。與下一步共用", rows: 5 },
      { id: "as_prev", type: "textarea", label: "0.3 檢核的回覆", hint: "自動帶入 0.3「依文獻檢核架構」的 AI 回覆（兩則都貼在那裡時會一起帶入）；也可以自己貼上", rows: 8 },
      { id: "as_draft", type: "textarea", label: "學生原稿（僅供參考）", hint: "選填；貼上學生原本寫的研究背景、動機或產業描述，僅供參考。撰寫以研究架構與文獻為主軸，學生內容可被改寫或捨棄；回覆會逐項列出需要查證或修正之處（與 1.1 的兩個步驟共用）", rows: 6 }
    ],
    seed: () => ({ as_prev: (store.replies || {})["s0-5|archchk"] || "" }),
    seedFrom: "0.3「依文獻檢核架構」", seedNote: "「0.3 檢核的回覆」由 0.3「依文獻檢核架構」的 AI 回覆帶入",
    build: p => blank(p.as_ctx) || blank(p.as_prev) ? "" : T.ask_practice({ ctx: p.as_ctx.trim(), con: p.as_con.trim(), path: p.as_path.trim(), prev: p.as_prev, plan: (p.bg_plan || "").trim(), draft: (p.as_draft || "").trim() }),
    empty: "（請填入研究情境，並貼上組合研究架構的回覆）",
    next: "下一步：逐一點開「來源核對」中的網址確認內容；AI 即使遵守上述規則，仍可能產生不存在的網址。確認後，研究情境與實務問題可貼到{#bg}的「產業或實務背景資料」，學術缺口與實務缺口可貼到「研究缺口」。"
  },

  // ─── 新增：第一章、第三章 ───
  bgplan: {
    label: "背景與動機的寫法", target: "nlm",
    hint: "請 NotebookLM 綜合上傳文獻的研究背景與動機寫法：與本研究題目相關、必須交代的背景要素；文獻用了哪些統計數據、本研究至少要寫幾點，以及可改用的台灣資料；文獻從理論、實務資料或研究缺口切入的方式；最後整理出幾種寫法供你選擇。",
    fields: [
      { id: "bp_topic", type: "textarea", label: "研究題目與研究架構", hint: "自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "bp_n", type: "radio", label: "寫法數量", options: [["2", "2 種"], ["3", "3 種"], ["4", "4 種"]], value: "3" }
    ],
    seed: () => ({ bp_topic: bgSeed().bg_topic }),
    seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5 定稿題目、研究情境與 3.1／0.3 的研究架構帶入",
    rules: () => ["citation"],
    replyView: t => bpView(t),
    build: (p, R) => blank(p.bp_topic) ? "" : T.bgplan({ topic: p.bp_topic.trim(), n: p.bp_n }) + R,
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構）",
    next: "下一步：在下方勾選要用的寫法（可勾多種合併），會自動帶入{#asp}與{#bg}的「選定的寫法」。"
  },
  bg: {
    label: "研究動機", target: "nlm",
    hint: "由產業現象收斂到文獻缺口，撰寫研究背景與研究動機。產業數據只會用您提供的資料，缺的會標【待補資料】。",
    fields: [
      { id: "bg_topic", type: "textarea", label: "研究主題與研究架構", hint: "自動帶入 0.5 定稿題目、研究情境與 3.1／0.3 的研究架構路徑", rows: 4, placeholder: "例如：品牌人格透過自我一致性影響品牌依附——以台灣精釀啤酒為例" },
      { id: "bg_facts", type: "textarea", label: "產業或實務背景資料", hint: "自動帶入上一步回覆的「研究情境」「實務問題」「實務缺口」（請先確認網址）", rows: 5 },
      { id: "bg_gaps", type: "textarea", label: "研究缺口", hint: "自動帶入 0.3 回覆中的「研究缺口」", rows: 4 },
      { id: "bg_plan", type: "textarea", label: "選定的寫法", hint: "與步驟 2 共用；AI 會照這個段落大綱撰寫", rows: 5 },
      { id: "as_draft", type: "textarea", label: "學生原稿（僅供參考）", hint: "選填；貼上學生原本寫的研究背景、動機或產業描述，僅供參考。撰寫以研究架構與文獻為主軸，學生內容可被改寫或捨棄；回覆會逐項列出需要查證或修正之處（與 1.1 的兩個步驟共用）", rows: 6 },
      ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(k => ({ id: "bg_b" + k, type: "promptbox", afterOut: true, when: p => bgParts(p).length >= k,
        get label() { const n = bgParts(valuesOf(DEFS.bg)).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始撰寫）` : `第 ${k} 則 Prompt`; },
        hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出；最後一則送出後，NotebookLM 才會開始撰寫",
        copyLabel: `${"②③④⑤⑥⑦⑧⑨⑩⑪⑫"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => bgParts(p)[k - 1] || "" })),
    ],
    rules: () => ["citation", "style", "verify"],
    seed: () => bgSeed(),
    seedFrom: "前面步驟", seedNote: "研究主題、背景資料與研究缺口由 0.5 定稿題目、3.1／0.3 研究架構、上一步回覆與 0.3 回覆帶入",
    status: p => bgParts(p).length > 1 ? `內容較長，Prompt 自動分成 ${bgParts(p).length} 則：前幾則是參考資料（NotebookLM 只會回覆「已收到」），最後一則才開始撰寫；請在同一個對話依序送出，只把最後一則的回覆貼到「AI 回覆」。` : "",
    build: (p, R) => { BG_R = R || ""; return bgParts(p)[0] || ""; },
    empty: "（請填入研究主題與研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話；【待補資料】請自行查找後補入。"
  },
  purpose: {
    label: "研究目的", target: "nlm",
    hint: "依研究架構與 1.1 的研究缺口，參考上傳文獻宣告研究目的的寫法撰寫研究目的，並檢核「缺口 → 目的 → 假說」是否一一對應。",
    fields: [
      { id: "hy_paths", type: "textarea", label: "研究架構", hint: "一行一條假說；與第二章「第二章架構」共用同一份內容", rows: 5, placeholder: "H1：品牌人格 → 自我一致性（正向）" },
      { id: "pu_motive", type: "textarea", label: "1.1 的研究缺口", hint: "自動帶入 1.1 定稿的最後一段（研究缺口）；可自行修改", rows: 4 },
      ...partBoxes("pu_b", "purpose", p => puParts(p))
    ],
    seed: () => ({ hy_paths: archHyp(), pu_motive: (finBlocks(finText("s1-1")).filter(b => !/^#/.test(b)).slice(-1)[0] || "") }),
    seedQuiet: ["hy_paths"], seedFrom: "架構圖與 1.1 定稿", seedNote: "研究架構由 3.1／0.3 架構圖帶入，研究缺口由 1.1 定稿最後一段帶入",
    rules: () => ["style"],
    build: p => puParts(p)[0] || "",
    status: p => partsNote(puParts(p)),
    empty: "（請填入研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話（可接在寫研究動機的同一個對話）。"
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
      { id: "hy_paths", type: "textarea", label: "研究假說", hint: "選填；與第二章「第二章架構」共用同一份內容", rows: 4 },
      { id: "an_criteria", type: "textarea", label: "指定的判斷準則與出處", hint: "選填", rows: 3, placeholder: "例如：AVE > .50（Fornell & Larcker, 1981）" }
    ],
    build: p => !p.an_methods.length ? "" : T.analysis({ soft: p.an_soft, methods: p.an_methods, paths: p.hy_paths, criteria: p.an_criteria }),
    empty: "（請至少勾選一種分析方法）",
    next: "下一步：貼到一般 AI 對話；【待補引用】請找到原始文獻後補上。"
  },

  // ─── 論文撰寫：第三章 ───
  ch2plan: {
    label: "第二章架構", target: "tool", noReply: true,
    hint: "第二章依研究架構分節：理論基礎，再來是各變數一節（依變數在前，同一構念的不同面向合在同一節）。假說在各變數一節推導：每條假說歸到影響方變數的那一節，中介假說歸中介變數、調節假說歸調節變數。下方每一行是一節，格式為「節名：本節涵蓋的變數」；可以改名、合併、調整順序，左側目錄會立即更新。",
    fields: [
      { id: "ch2_plan", type: "textarea", label: "各變數的節（一行一節）", hint: "自動依架構圖產生（依變數在前）；改了之後若想回到預設，清空欄位後按「重新帶入」", rows: 6, placeholder: "衝動購買：認知型衝動購買、情感型衝動購買\n線上瀏覽：功利型瀏覽、享樂型瀏覽\n特惠偏好度：特惠偏好度\n社會影響從眾：社會影響從眾" },
      { id: "hy_paths", type: "textarea", label: "研究假說（一行一條，含預期方向）", hint: "與 1.2、3.5、4.3 共用同一份內容；自動依架構圖產生，請補上預期方向。每條假說會歸到其影響方變數的一節推導", rows: 6, placeholder: "H1：享樂型瀏覽 → 情感型衝動購買（正向）\nH2：功利型瀏覽中介特惠偏好度與認知型衝動購買之關係\nH3：社會影響從眾 調節（享樂型瀏覽 → 情感型衝動購買）" },
      { id: "hy_renum", type: "button", label: "依章節順序重新編號", hint: "讓 H1、H2…的順序與第二章各節的出現順序一致，並把各章節論文內容中的假說編號一起改成現行編號；已經編號過也可以再按一次，用來同步論文內容", run: () => hypRenumber() },
      { id: "ch2_prev", type: "cands", label: "第二章目錄預覽", render: () => ch2PrevHtml() }
    ],
    seed: () => ({ ch2_plan: ch2Default(), hy_paths: archHyp() }), seedQuiet: ["hy_paths"], seedFrom: "架構圖", seedNote: "各變數的節與研究假說由 3.1／0.3 的架構圖自動產生",
    build: () => "", empty: "（設定完成後，到左側目錄的第二章各節撰寫）"
  },
  ch2th: {
    label: "撰寫理論基礎", target: "nlm",
    hint: "以一個統攝的理論說明各變數之間的機制，並把本研究的變數對應到理論的要素。",
    fields: [
      { id: "cv_arch", type: "textarea", label: "研究題目與研究架構", hint: "第二章各節共用；自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "th_theory", type: "text", label: "理論", hint: "選填；例如「刺激—機體—反應模型（S-O-R）」；留白則請 NotebookLM 依相近文獻建議" },
      ...partBoxes("th_b", "ch2th", p => thParts(p))
    ],
    seed: () => ({ cv_arch: bgSeed().bg_topic }), seedQuiet: ["cv_arch"], seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5、3.1／0.3 帶入",
    rules: () => ["citation", "style", "ch2"],
    build: p => thParts(p)[0] || "", status: p => partsNote(thParts(p)),
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  ch2var: {
    label: "撰寫本節", target: "nlm",
    hint: "依序撰寫本節構念的定義、面向、相關理論、前因與後果、衡量方式（概念層次）；本節分配到假說時，接著推導這些假說。",
    fields: [
      { id: "cv_title", type: "text", label: "節名", hint: "由「第二章架構」帶入" },
      { id: "cv_vars", type: "text", label: "本節涵蓋的變數", hint: "由「第二章架構」帶入；兩個以上面向會以子標題分開" },
      { id: "cv_arch", type: "textarea", label: "研究題目與研究架構", hint: "第二章各節共用；自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "cv_hyps", type: "cands", label: "本節要推導的假說", render: () => { const h = ch2SecHyps(store.sec); return h.length ? `<ol class="hlist">${h.map(x => `<li>${esc(x)}</li>`).join("")}</ol><p class="hint">假說的文字與歸屬在「第二章架構」修改。</p>` : `<p class="hint">本節沒有分配到假說，只介紹構念；前因與後果只做類別概述。假說的歸屬在「第二章架構」修改。</p>`; } },
      ...partBoxes("cv_b", "ch2var", p => cvParts(p))
    ],
    seed: () => ({ cv_arch: bgSeed().bg_topic }), seedQuiet: ["cv_arch"], seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5、3.1／0.3 帶入",
    rules: () => ["citation", "style", "ch2"],
    build: p => cvParts(p)[0] || "", status: p => partsNote(cvParts(p)),
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構，並在「第二章架構」設定本節）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話；【待補文獻】請補上傳文獻後再補寫。"
  },
  hylist: {
    label: "假說清單", target: "tool", noReply: true,
    hint: "第三章只列出假說；假說的推導寫在第二章各變數一節。下方會從第二章各節的論文內容中取出每一條假說敘述。",
    fields: [{ id: "hl_view", type: "cands", label: "", render: () => hlView() },
      { id: "hl_put", type: "button", label: "放入本節定稿", hint: "把上方的假說清單放入 3.2 的「本節論文內容」", run: () => { const t = hlText(); if (!t) return "沒有找到假說，請先完成第二章各變數一節的假說推導。"; setFin("s3-2", t); return "已放入本節定稿。"; } }],
    build: () => hlText(), copyLabel: "複製假說清單", empty: "（第二章各變數一節還沒有出現「H1：……」形式的假說敘述）"
  },
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
      { id: "od_scale", type: "text", label: "量尺形式", hint: "選填", placeholder: "例如：Likert 七點量尺" },
      ...[2, 3, 4, 5].map(k => ({ id: "od_b" + k, type: "promptbox", afterOut: true, label: `第 ${k} 則 Prompt`, when: p => odBatches(p).length >= k,
        hint: "上一則的回覆完成後，在同一個對話接著送出；各則回覆依序貼到下方「AI 回覆」",
        copyLabel: `${"②③④⑤"[k - 2]} 複製第 ${k} 則 Prompt（同一個對話接著送出）`, build: p => odBatches(p)[k - 1] || "" }))
    ],
    seed: () => { const F = finalSurvey(); return F ? { od_list: F.cons.map(c => c.name + (c.src ? "｜預計採用 " + c.src : "")).join("\n"), od_scale: F.scale } : {}; },
    seedFrom: "0.4「定稿問卷」", seedNote: "構念清單與量尺由 0.4「定稿問卷」帶入（未填定稿時用 0.4 的問卷預覽），各構念的中文題項會一併附在 Prompt 中",
    rules: () => ["citation", "verify"],
    status: p => odBatches(p).length > 1 ? `題項較多，Prompt 分成 ${odBatches(p).length} 則依序送出（NotebookLM 單次輸入有字數上限）。` : "",
    build: (p, R) => blank(p.od_list) ? "" : (odBatches(p)[0] ? odBatches(p)[0] : T.opdef({ list: p.od_list.trim(), scale: p.od_scale }) + R),
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
      { id: "hy_paths", type: "textarea", label: "假說清單", hint: "選填；與第二章「第二章架構」共用同一份內容", rows: 4, placeholder: "H1：品牌人格 → 自我一致性（正向）" }
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
    label: "修訂論文", target: "nlm",
    // 換到另一節時，清掉上一節帶入的「論文段落」與融合選取，避免把別節的內容送去改寫
    init: () => { const v = store.values, sid = drSid() || store.sec; if (v.dr_text_sid !== sid) { v.dr_text = ""; v.dr_ask = ""; v.dr_sel = []; v.dr_text_sid = sid; } },
    hint: "補強：段落還缺東西時使用，字數不減。精簡：內容齊全但太冗長，字數必須減少，可設定目標長度。整節統整：整節去除重複、調整段落順序與邏輯。融合：把幾段合併成一段。都會先核實引用。",
    fields: [
      { id: "dr_stage", type: "radio", top: true, label: "改寫方向", options: [["draft", "補強（字數不減）"], ["final", "精簡（術語查證＋字數必減）"], ["whole", "整節統整（整節去重複、調整段落順序與邏輯）"], ["merge", "融合（多段合併，討論先後邏輯）"]], value: "draft" },
      { id: "dr_hlbox", type: "cands", label: "要修改的文字", when: p => inThesisSec() && p.dr_stage !== "whole", render: () => `<p class="hint"><button type="button" class="copy" data-drhl="1">用反白的文字</button> 在下方「本節論文內容」反白要修改的文字（可跨段落，融合時反白要合併的幾段），再按這個按鈕帶入「論文段落」；改寫後按「以此取代反白的部分」，只替換那一塊。</p>` },
      { id: "dr_paras", type: "cands", label: "本節的段落", when: p => !inThesisSec() && drParas().length > 0 && p.dr_stage !== "whole", render: () => drView() },
      { id: "dr_sec", type: "radio", label: "要修訂哪一節", hint: "列出已有定稿內容的章節", when: () => !inThesisSec(),
        get options() { const ss = THESIS_SECS().filter(s => !blank(finText(s.id))); return ss.length ? ss.map(s => [s.id, `${s.no} ${s.title}`]) : [["", "（還沒有任何章節有定稿內容）"]]; } },
      { id: "dr_back", type: "cands", label: "", when: () => !inThesisSec() && !!drSid(), render: () => `<p class="hint"><button type="button" data-go="${drSid()}" data-gostep="0">← 回到 ${esc(secLabel(drSid()))}</button>　修訂結果按「以此取代」後，會直接更新該節的定稿。</p>` },
      { id: "dw_info", type: "cands", label: "", when: p => p.dr_stage === "whole", render: () => { const sid = drSid(), t = sid ? finText(sid) : "";
        if (!sid) return `<p class="note warn">請先在上方選擇要修訂的章節。</p>`;
        return t ? `<p class="note">整節統整會自動帶入「${esc(secLabel(sid))}」定稿的全文（約 ${zhCount(t)} 字），請 NotebookLM 先診斷各段重點與重複之處，再輸出修訂後的全文；只能沿用原文已有的引用。</p>` : `<p class="note warn">本節還沒有定稿內容。</p>`; } },
      { id: "dr_full", type: "checks", label: "上下文", options: [["on", "附上本節全文（要檢查與本節其他段落是否重複時勾選；全文較長時 Prompt 會分成多則）"]], value: [], when: p => inThesisSec() && (p.dr_stage === "draft" || p.dr_stage === "final") },
      { id: "dr_len", type: "radio", label: "精簡目標", options: [["auto", "比原文少即可"], ["70", "約原文 70%"], ["50", "約原文 50%"], ["n", "指定字數"]], value: "auto", when: p => p.dr_stage === "final" || p.dr_stage === "whole" },
      { id: "dr_lenN", type: "text", label: "目標字數", placeholder: "例如 600", when: p => (p.dr_stage === "final" || p.dr_stage === "whole") && p.dr_len === "n" },
      { id: "dr_stat", type: "checks", label: "統計數據", options: [["on", "每個論點最多保留 1–2 個關鍵數字，其餘改成文字概述"]], value: ["on"], when: p => (p.dr_stage === "final" || p.dr_stage === "whole") && !drCh2() },
      { id: "dr_rules", type: "promptbox", get label() { return drCh1() ? "第一章共用規則（引用格式、文字風格、第一章寫作規範）" : drCh2() ? "第二章共用規則（含第二章寫作規範）" : "共用規則"; }, hint: "每個 NotebookLM 對話只要先送一次（NotebookLM 會回覆「已收到」），之後每一段都送下方的 Prompt 即可；避免每段都超過字數上限",
        get copyLabel() { return `先送這則：複製${drCh1() ? "第一章" : drCh2() ? "第二章" : ""}共用規則（每個對話一次）`; }, build: () => DR_R ? T.rules_once(DR_R) : "" },
      { id: "dr_text", type: "textarea", label: "論文段落", when: p => p.dr_stage !== "whole", get hint() { return inThesisSec() ? "按上方「用反白的文字」帶入；也可以自己貼上" : "按上方「用這一段」自動帶入；融合時按「加入融合」可選多段；也可以自己貼上"; }, rows: 8 },
      { id: "dr_ask", type: "textarea", label: "我的追問與修改意見（選填）", hint: "例如：兩個理論都必要嗎？為什麼 Yassin & Soares（2023）不算支持證據？NotebookLM 會先逐題回答，再依回答修改；反白新的文字時會自動清空", rows: 3, placeholder: "一行一個問題或意見" },
      ...[2, 3, 4, 5, 6, 7, 8].map(k => ({ id: "dw_b" + k, type: "promptbox", afterOut: true, when: p => drParts(p).length >= k,
        get label() { const n = drParts(valuesOf(DEFS.dr)).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始改寫）` : `第 ${k} 則 Prompt`; },
        hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出；最後一則送出後才會開始改寫",
        copyLabel: `${"②③④⑤⑥⑦"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => drParts(p)[k - 1] || "" }))
    ],
    variant: p => p.dr_stage,
    replyView: t => drResultView(t),
    rules: p => drCh1() ? ["citation", "style", "ch1"] : [...(p.dr_stage === "final" ? ["citation", "style"] : ["citation", "evidence", "style"]), ...(drCh2() ? ["ch2"] : [])],
    build: (p, R) => { DR_R = R || ""; return drParts(p)[0] || ""; },
    status: p => [drParts(p).length > 1 ? `內容較長，Prompt 自動分成 ${drParts(p).length} 則：前幾則是本節全文（NotebookLM 只會回覆「已收到」），最後一則才開始${p.dr_stage === "whole" ? "統整" : "改寫"}；請在同一個對話依序送出。` : "",
      (p.dr_stage === "final" || p.dr_stage === "whole") && !blank(drBase(p)) ? drLenNote(p) : ""].filter(Boolean).join("\n"),
    empty: "（請貼上論文段落）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  polish: {
    label: "潤色與去 AI 味", target: "ai",
    hint: "潤色：只修正語病與邏輯漏洞，原文通順就保留。去 AI 味：把機器味、翻譯腔重寫成自然的學術表達。不涉及查證文獻，所以貼到一般 AI 即可。",
    fields: [
      { id: "po_mode", type: "radio", label: "處理方式", options: [["suggest", "逐句修改建議（只列需要改的句子，逐句採用）"], ["polish", "潤色（輸出全文）"], ["dehai", "去 AI 味（輸出全文）"]], value: "suggest" },
      { id: "po_lang", type: "radio", label: "段落語言", options: [["zh", "中文"], ["en", "英文"]], value: "zh", when: p => p.po_mode !== "suggest" },
      { id: "po_load", type: "button", label: "帶入本節定稿", hint: "把「本節論文內容」的全文帶入下方；也可以只貼其中幾段", when: () => THESIS_SECS().some(x => x.id === store.sec),
        run: () => { const t = finText(store.sec); if (blank(t)) return "本節還沒有定稿內容。"; store.values.po_text = t; return "已帶入本節定稿。"; } },
      { id: "po_text", type: "textarea", label: "論文段落", rows: 8 }
    ],
    replyView: t => store.values.po_mode === "suggest" || !store.values.po_mode ? poView(t) : "",
    build: p => blank(p.po_text) ? "" : p.po_mode === "suggest" ? T.polish_suggest({ text: p.po_text.trim() }) : T[`${p.po_mode}_${p.po_lang}`]({ text: p.po_text.trim() }),
    empty: "（請貼上論文段落）",
    next: "下一步：貼到一般 AI 對話。若段落含引用且尚未核實，請先用{#dr}。"
  },

  // ─── 兩頁共用：小工具 ───
  ttl: {
    label: "論文題目", target: "nlm",
    hint: "依 0.3 檢核後的研究架構，請 NotebookLM 參考上傳文獻的題目寫法，提出數個中英文題目候選並比較優缺點；選定或修改後，把定稿題目填在最下方。",
    fields: [
      { id: "tt_n", type: "radio", label: "候選題目數", options: [["3", "3 個"], ["5", "5 個"]], value: "5" },
      { id: "tt_pref", type: "textarea", label: "題目偏好", hint: "選填；例如要不要包含研究情境、以哪個機制為主軸、字數限制", rows: 2, placeholder: "例如：要包含「蝦皮」；以雙路徑瀏覽為主軸；中文 30 字以內" },
      { id: "tt_zh", type: "text", below: true, label: "定稿題目（中文）", hint: "會成為論文草稿檔的標題", placeholder: "例如：特惠偏好與社會從眾對線上衝動購買之影響：以瀏覽動機為中介" },
      { id: "tt_en", type: "text", below: true, label: "定稿題目（英文）", hint: "選填", placeholder: "例如：The Effects of Deal Proneness and Social Influence on Online Impulse Buying" }
    ],
    rules: () => ["citation"],
    build: (p, R) => { const t = f31Text() || ttlArch(); return t ? T.title({ arch: t, ctx: (store.values.as_ctx || "").trim(), n: p.tt_n, pref: (p.tt_pref || "").trim() }) + R : ""; },
    empty: "（0.3 還沒有研究架構）",
    next: "下一步：題目定稿後，到{#asp}開始撰寫第一章。"
  },
  fa31: {
    label: "研究架構圖與說明", target: "nlm",
    hint: "由 0.3 檢核後的研究架構自動帶入架構圖，可微調位置後按「下載 PNG」放進論文；再複製 Prompt，請 NotebookLM 撰寫「3.1 研究架構」一節。",
    fields: [
      { id: "f31_diag", type: "diagram", label: "研究架構圖（由 0.3 帶入）", hint: "拖曳方塊調整位置；點一個方塊再點另一個方塊可加箭頭；未選方塊時點箭頭可刪除。0.3 的架構改過後，按「依文字重畫」更新",
        emptyHint: "（0.3 還沒有研究架構：請先完成 0.3 研究架構合理性檢核）",
        source: () => finalArch().vars,
        seed: () => { const { d } = finalArch(); return { sig: JSON.stringify([d.edges, d.mods].map(l => l.map(x => [x.from, x.to || x.edge]))), edges: d.edges, mods: d.mods, pos: d.pos }; } },
      { id: "f31_theory", type: "text", label: "理論基礎", hint: "選填；不填時由 NotebookLM 依文獻判斷", placeholder: "例如：刺激—有機體—反應（S-O-R）模式" }
    ],
    rules: () => ["citation"],
    build: (p, R) => { const t = f31Text(); return t ? T.frame31({ arch: t, theory: (p.f31_theory || "").trim(), ctx: (store.values.as_ctx || "").trim() }) + R : ""; },
    empty: "（0.3 還沒有研究架構）",
    next: "下一步：在第二章「第二章架構」確認研究假說，各假說在其影響方變數的一節推導；需要 Mermaid 格式的架構圖時，用本節的「文字轉關係圖」。"
  },
  m7a: {
    label: "文字轉關係圖", target: "nlm",
    hint: "任何一段已生成的文字都可以畫成 Mermaid 關係圖，每個主題群各畫一張；也可用來畫第三章的研究架構圖。",
    fields: [{ id: "m7a_text", type: "textarea", label: "要畫成關係圖的文字", rows: 8 }],
    rules: () => [],
    build: (p, R) => blank(p.m7a_text) ? "" : T.m7a({ content: p.m7a_text }) + R,
    empty: "（請貼上要畫圖的文字）",
    next: "下一步：貼到 NotebookLM（建議在產生這段文字的同一個對話）；回覆整段複製後，到{#m7b}補好圍籬。"
  },
  fulltext: {
    label: "論文全文", target: "tool",
    hint: "依章節顯示各節定稿，也就是「研究名稱_論文.md」的內容；要修改某一節，到該節最下方的「本節論文內容」。",
    fields: [{ id: "ft_view", type: "cands", label: "", render: () => fullView() }],
    build: () => thesisBody(),
    empty: "（目前還沒有任何一節有內容）",
    copyLabel: "複製論文全文（Markdown）",
    next: "【待補】標記可到「待補資料查證」填入查證內容。"
  },
  refs: {
    label: "參考文獻", target: "tool",
    hint: "正文中每一筆引用列成一項：自動帶入的出處（黃框）請核對後修改；找不到出處的（紅框）請填入完整的 APA 參考文獻；填過的會變成綠框並保存。",
    fields: [
      { id: "rf_bulk", type: "textarea", label: "一次貼上書目（選填）", rows: 3,
        hint: "可貼 Zotero 匯出的書目，或一般 AI 整理的參考文獻清單（一行一筆）；網站依作者與年份自動配對到下方各筆引用，配到的會變成黃框，請核對。Zotero 中文文獻的英文標點會自動改成中文 APA 格式。",
        placeholder: "Zheng, X., Men, J., Yang, F., & Gong, X. (2019). Understanding impulse buying in mobile commerce…" },
      { id: "rf_ai", type: "promptbox", label: "請一般 AI 查證並整理缺少的參考文獻", when: () => !!refFillItems(),
        hint: "列出找不到出處、或格式不是 APA 的引用（網路資料會附上回覆中的網址當線索）。貼到開啟網路搜尋的一般 AI，把回覆貼到上方「一次貼上書目」。學術文獻以 Zotero 匯出較可靠。",
        copyLabel: "複製 Prompt（貼到一般 AI，需開啟網路搜尋）", build: () => (it => it ? T.ref_fill({ items: it }) : "")(refFillItems()) },
      { id: "rf_web_on", type: "checks", label: "網路文獻格式產生器", options: [["on", "填入網頁、新聞、報告的資訊，產生 APA 第七版參考文獻"]], value: [] },
      { id: "rw_type", type: "radio", label: "類型", options: [["page", "網頁／新聞"], ["report", "報告／統計資料（PDF）"]], value: "page", when: p => isOn(p.rf_web_on) },
      { id: "rw_author", type: "text", label: "作者或機構", placeholder: "例如：經濟部統計處；個人作者寫姓名", when: p => isOn(p.rf_web_on) },
      { id: "rw_date", type: "text", label: "發布日期", hint: "網頁、新聞寫到日，例如 2026/6/30；報告寫年即可；查不到留白（會寫成「無日期」）", placeholder: "2026/6/30", when: p => isOn(p.rf_web_on) },
      { id: "rw_title", type: "text", label: "標題", hint: "網頁或報告上的完整標題", when: p => isOn(p.rf_web_on) },
      { id: "rw_site", type: "text", label: "網站名稱或出版機構", hint: "與作者相同時可留白（APA 規定相同時省略）", placeholder: "例如：經濟日報", when: p => isOn(p.rf_web_on) },
      { id: "rw_url", type: "text", label: "網址", when: p => isOn(p.rf_web_on) },
      { id: "rw_prev", type: "cands", label: "", when: p => isOn(p.rf_web_on), render: p => webRefView(p) },
      { id: "rw_fill", type: "button", label: "填入對應的引用", when: p => isOn(p.rf_web_on), run: p => webRefFill(p) },
      { id: "rf_view", type: "cands", label: "", render: () => refView() }],
    build: () => refList().join("\n"),
    empty: "（正文中還沒有引用，或尚未填入任何出處）",
    copyLabel: "複製參考文獻清單",
    next: "論文.md 最後會自動附上「參考文獻」一節（只列已有出處者）。"
  },
  ch1guide: {
    label: "第一章寫作規範", target: "tool",
    hint: "供撰寫與審查第一章時參考；下方「複製」可取得精簡版規範的純文字。",
    fields: [{ id: "g1_view", type: "cands", label: "", render: () => `<div class="guide-body">${GUIDE_CH1.full}</div>` }],
    build: () => GUIDE_CH1.ai,
    copyLabel: "複製精簡版規範",
    next: "第一章各步驟的 Prompt 會自動附上精簡版規範（附加共用規則中的「第一章寫作規範」）。"
  },
  scope: {
    label: "研究範圍", target: "nlm",
    hint: "依研究題目、研究架構、研究情境與研究對象，撰寫「研究範圍」：先說明選擇此研究情境（平台）的理由，再說明研究對象與本研究聚焦的變數；只寫聚焦在哪裡，不列排除項目。",
    fields: [
      { id: "sc_topic", type: "textarea", label: "研究題目與研究架構", hint: "自動帶入 0.5 定稿題目、研究情境與研究架構", rows: 4 },
      { id: "sc_target", type: "text", label: "研究對象", hint: "自動帶入 0.4 的研究對象", placeholder: "例如：年滿 18 歲、過去半年曾在蝦皮購物的消費者" },
      { id: "sc_extra", type: "textarea", label: "範圍補充", hint: "選填；例如研究設計實際採取的篩選條件（如以篩選題排除未曾在平台購物者）", rows: 2 },
      { id: "sc_ctx", type: "textarea", label: "研究情境資料", hint: "自動帶入 1.1 定稿中提到平台的段落（用來說明選擇此平台的理由）；可自行增刪", rows: 4 },
      ...[2, 3, 4].map(k => ({ id: "sc_b" + k, type: "promptbox", afterOut: true, when: p => scParts(p).length >= k,
        get label() { const n = scParts(valuesOf(DEFS.scope)).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始撰寫）` : `第 ${k} 則 Prompt`; },
        hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出",
        copyLabel: `${"②③"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => scParts(p)[k - 1] || "" }))
    ],
    seed: () => ({ sc_topic: bgSeed().bg_topic, sc_target: (store.values.as_target || "").trim(), sc_ctx: scCtx() }),
    seedQuiet: ["sc_ctx"],
    seedFrom: "前面步驟", seedNote: "研究題目與研究架構由 0.5、3.1／0.3 帶入，研究對象由 0.4 帶入",
    rules: () => ["style", "ch1"],
    build: p => scParts(p)[0] || "",
    status: p => scParts(p).length > 1 ? `內容較長，Prompt 自動分成 ${scParts(p).length} 則：前幾則是參考資料（NotebookLM 只會回覆「已收到」），最後一則才開始撰寫；請在同一個對話依序送出。` : "",
    empty: "（請先完成 0.5 論文題目或 0.3 研究架構）",
    next: "下一步：貼到已上傳相關文獻的 NotebookLM 對話。"
  },
  flow: {
    label: "研究流程", target: "ai",
    hint: "依第一章到第三章（或全文）已完成的定稿，說明本研究的主要階段、各階段的目的，以及在哪一章呈現；不需要文獻，貼到一般 AI 即可。",
    fields: [
      { id: "fl_src", type: "textarea", label: "各章定稿摘要", hint: "自動帶入第一章到第五章已有定稿的各節（研究方法各節帶入較多內容）；可自行增刪", rows: 8 },
      { id: "fl_extra", type: "textarea", label: "流程補充", hint: "選填；例如前測、專家效度、資料蒐集期間等定稿中沒寫到的步驟", rows: 2 }
    ],
    seed: () => ({ fl_src: flSummary() }),
    seedFrom: "各章定稿", seedNote: "各章定稿摘要由第一章到第五章已有定稿的各節帶入",
    rules: () => ["style"],
    build: (p, R) => blank(p.fl_src) ? "" : T.flow({ src: p.fl_src.trim(), extra: (p.fl_extra || "").trim(),
      chapters: OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).map(c => c.ch + "（" + secsOf(c).map(s => s.title).join("、") + "）").join("；") }) + R,
    empty: "（第一章到第三章還沒有定稿內容；建議第三章定稿後再寫研究流程）",
    next: "下一步：貼到一般 AI（不需要上傳文獻）。"
  },
  tbfill: {
    label: "待補資料查證", target: "tool",
    hint: "每一項列出所在章節與前後文。查證後，把正確內容（含出處）填在下方欄位；「研究名稱_論文.md」會以填入的文字直接取代【待補】標記，請寫成可以接在原句中的文字。各章回覆最後的「需要研究者查證的背景資料」有建議的查證來源與關鍵字。",
    fields: [{ id: "tb_list", type: "cands", label: "待補清單", render: () => tbView() }],
    build: () => tbText(),
    empty: "（目前沒有待補項目，或尚未填寫任何查證內容）",
    copyLabel: "複製已查證的清單（純文字）",
    next: "填入的內容只用於論文草稿檔；網頁上各步驟的 AI 回覆保持原樣。"
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
const svEnKey = t => String(t || "").toLowerCase().replace(/[^a-z]/g, "");   // 以英文原題對照（題號可能移動）
function svOrigMap() {   // 原版各題文字，供修訂版標示差異
  const O = parseSurvey(svOrig()), m = {}; if (!O) return m;
  const q = x => x.q + (x.opts.length ? `（${x.opts.join("／")}）` : "");
  if (O.intro) m.intro = O.intro; if (O.scaleText) m.scale = O.scaleText;
  [...O.screen, ...O.manip, ...O.demo, ...O.other.flatMap(o => o.qs)].forEach(x => (m[x.id] = q(x)));
  O.other.forEach(o => { if (o.text) m["sec:" + o.head] = o.text; });
  O.constructs.forEach(c => c.items.forEach(it => { m[it.id] = it.zh; if (it.en) m["en:" + svEnKey(it.en)] = it.zh; }));
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
    ...S.constructs.flatMap((c, ci) => [{ key: "con:" + c.name, label: `構念「${c.name}」`, kind: "con", src: c.src, text: (c.stem ? `題幹：${c.stem}；` : "") + c.items.map(it => `${it.id} ${svItemText(it)}`).join("；") || c.missing },
      ...c.items.map(it => ({ key: it.id, label: it.id, kind: "item", con: c.name, src: c.src, text: svItemText(it), en: it.en })), ...oth("con" + ci)]), ...oth("con"),
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
  const cons = S.constructs.map((c, ci) => { const ck = "con:" + c.name;
    return `<div class="sv-con"><h4>${esc(c.name)}</h4><p class="hint">${esc([c.src, (d => d && !/^無$/.test(d) ? "構面：" + d : "")((c.dim || "").replace(/^(構面\s*[：:]\s*)+/, "").trim())].filter(Boolean).join("｜"))}</p>
    ${note(ck).replace('placeholder="修改意見（選填）"', 'placeholder="對整組題項的修改意見（選填）"')}
    ${c.missing ? `<p class="note warn">${esc(c.missing)}</p>` : ""}
    ${c.stem ? `<p class="sv-stem">${esc(c.stem)}${/[，,：:]$/.test(c.stem) ? "" : "……"}</p>` : ""}
    ${c.items.map(it => { const t = svItemText(it), ed = t !== it.zh, w = !it.en ? was(it.id, it.zh) : !rev ? "" : ("en:" + svEnKey(it.en)) in O ? was("en:" + svEnKey(it.en), it.zh) : `<div class="sv-was">（修訂版新增或更換的題項）</div>`;
      return `<div class="sv-item${ed ? " edited" : ""}${w ? " revised" : ""}"><b>${esc(it.id)}</b>
        <div class="sv-text"><span class="sv-zh" contenteditable="true" spellcheck="false" data-sved="${esc(it.id)}" data-orig="${esc(it.zh)}" title="也可以點一下直接修改">${esc(t)}</span>
          ${it.en ? `<small>${esc(it.en)}</small>` : ""}
          ${w}${ed ? `<span class="sv-act"><button type="button" data-svrestore="${esc(it.id)}">還原</button></span>` : ""}
          ${note(it.id)}</div>${dots}</div>`; }).join("")}</div>${oth("con" + ci)}`; }).join("");
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
    ...S.constructs.flatMap((c, ci) => [`〈${c.name}〉${c.src ? "（" + c.src + "）" : ""}\n` + (c.missing ? c.missing + "\n" : "") + (c.stem ? c.stem + (/[，,：:]$/.test(c.stem) ? "" : "……") + "\n" : "") + c.items.map(it => `${it.id}. ${svItemText(it)}`).join("\n"), ...oth("con" + ci)]), ...oth("con"),
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

// ── 定稿問卷 → 3.3 操作型定義與量表 ──
function parseFinal(text) {   // 純文字問卷：〈構念〉（出處）、題幹、Q1. 題目
  const t = String(text || "").replace(/\r\n?/g, "\n"), cons = []; let cur = null;
  const scale = ((t.match(/量尺[：:]\s*([^\n（(]+)/) || [])[1] || "").trim();
  t.split("\n").forEach(raw => {
    const l = raw.trim(); if (!l) return;
    const h = l.match(/^〈([^〉]+)〉\s*(?:[（(](.*)[）)])?\s*$/);
    if (h) { cur = { name: h[1].trim(), src: (h[2] || "").trim(), pre: [], items: [] }; cons.push(cur); return; }
    if (/^【/.test(l)) { cur = null; return; }
    if (!cur) return;
    const q = l.match(/^(Q\d+)\s*[.．、｜|：:]?\s*(.+)$/i);
    if (q) { cur.items.push({ id: q[1].toUpperCase(), zh: q[2].trim() }); return; }
    if (!cur.items.length) cur.pre.push(l);
  });
  cons.forEach(c => { const last = c.pre[c.pre.length - 1] || "", isStem = last && !/[。.！!？?]$/.test(last);   // 句號結尾者是說明，不是題幹
    c.stem = isStem ? last : ""; c.note = (isStem ? c.pre.slice(0, -1) : c.pre).join(" "); });
  return cons.length ? { scale, cons } : null;
}
function finalSurvey() {   // 定稿問卷；未填時用問卷預覽；出處缺漏時由問卷預覽補上
  const S = parseSurvey(svReply()), F = parseFinal(store.values.sv_final) || parseFinal(svText());
  if (!F) return null;
  F.cons.forEach(c => { const m = S && S.constructs.find(x => x.name === c.name || x.name.startsWith(c.name));
    if (m) { if (!c.src) c.src = m.src; if (m.name !== c.name && /[（(]/.test(m.name)) c.name = m.name; } });
  return F;
}
function odBatches(p) {   // 依構念清單附上定稿題項，依字數分批
  const F = finalSurvey(); if (!F || blank(p.od_list)) return [];
  const blocks = splitLines(p.od_list).map(line => {
    const name = line.split(/[｜|]/)[0].trim(), src = (line.split(/[｜|]/)[1] || "").replace(/^預計採用\s*/, "").trim();
    const c = F.cons.find(x => x.name === name || x.name.startsWith(name) || name.startsWith(x.name));
    return [`### ${name}${src ? "｜預計量表：" + src : ""}`, ...(c ? [...(c.note ? ["說明：" + c.note] : []), ...(c.stem ? ["題幹：" + c.stem] : []), ...c.items.map(it => `${it.id} ${it.zh}`)] : ["（尚無題項）"])].join("\n");
  });
  if (!F.cons.some(c => c.items.length)) return [];
  const scale = (p.od_scale || F.scale || "").trim(), LIMIT = 2700, groups = [];
  blocks.forEach(b => { const g = groups[groups.length - 1];
    if (g && T.opdef_items({ blocks: [...g, b], scale, part: groups.length, parts: 9 }).length <= LIMIT) g.push(b); else groups.push([b]); });
  return groups.map((g, k) => T.opdef_items({ blocks: g, scale, part: k + 1, parts: groups.length }));
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
// 3.1：0.3 檢核後的最終研究架構（自行設計時用自畫的圖，否則用 0.2 組合架構）
function finalArch() {
  const p = {}; DEFS.archchk.fields.forEach(f => { p[f.id] = store.values[f.id] ?? (Array.isArray(f.value) ? f.value.slice() : f.value ?? ""); });
  const own = p.ac_src === "own";
  const A = parseArch(archSrcText(p)), vars = own ? ownVars(p) : A.vars;
  const d = own ? dgData("ow_diag") : archDiag(p);
  return { A, vars, d: { edges: d.edges || [], mods: d.mods || [], pos: d.pos || {} } };
}
// 精簡：目標字數與統計數據規則
const zhCount = t => String(t || "").replace(/\s/g, "").length;
const drBase = p => p.dr_stage === "whole" ? finText(drSid()) : p.dr_text;   // 計算字數的原文：整節統整用本節全文
function drTarget(p) {
  const n = zhCount(drBase(p));
  return p.dr_len === "70" ? Math.round(n * 0.7) : p.dr_len === "50" ? Math.round(n * 0.5) : p.dr_len === "n" ? +(String(p.dr_lenN || "").match(/\d+/) || [0])[0] : 0;
}
function drLenNote(p) { const n = zhCount(drBase(p)), m = drTarget(p); return `原文約 ${n} 字` + (m ? `，精簡目標約 ${m} 字。` : "。"); }
function drLenReq(p) {
  const m = drTarget(p), out = [];
  if (m) out.push(`字數目標：原文約 ${zhCount(drBase(p))} 字（不含空白），改寫後請控制在約 ${m} 字（上下 10% 以內），以此取代上方${p.dr_stage === "whole" ? "「字數不得多於原文」的規定" : "第 5 點的「盡量壓縮」"}。為達到字數目標，優先刪除次要的例證、重複的論點與過多的數據，保留核心論點與其引用。`);
  if (isOn(p.dr_stat)) out.push("統計數據：每個論點最多保留 1–2 個最關鍵的數字，其餘數字改以文字概述（例如「涵蓋清潔、衣著、居家與美妝等日常商品」）；保留的數字須維持原有的引用。");
  return out.length ? "\n\n[精簡要求]\n" + out.map((x, i) => `${i + 1}. ${x}`).join("\n") : "";
}
// ── 背景與動機的寫法：把回覆中的「寫法選項」拆成可勾選的卡片 ──
function bpOptions(text) {
  // 每種寫法以「寫法一／寫法二……」開頭（可能是 ### 小標題、粗體或一般行）；其下的「1. 切入方式」等不是寫法
  const wHead = l => /^\s*(#{1,6}\s*)?[*_\-\s]*(寫法|選項|方案)\s*[一二三四五六七八九十\d]+/.test(l);
  let body = mdSection(text, ["寫法選項"]) || "";
  if (!body.split("\n").slice(1).some(wHead)) {   // 寫法用了與「寫法選項」同級的標題時，改取「寫法選項」之後的全部內容
    const t = String(text || "").replace(/\r\n?/g, "\n").replace(/\*\*/g, ""), i = t.search(/^#{1,4}\s*[0-9一二三四五六七八九十、.．\s]*寫法選項/m);
    if (i >= 0) body = t.slice(i);
  }
  const L = body.split("\n").slice(1), opts = []; let cur = null;
  const head = L.some(wHead) ? wHead : l => /^#{3,5}\s/.test(l);
  L.forEach(l => {
    if (head(l)) { cur = { title: l.replace(/^\s*#+\s*|\*\*/g, "").replace(/^[*_\-\s]+/, "").trim(), lines: [] }; opts.push(cur); }
    else if (cur) cur.lines.push(l);
  });
  return opts.map(o => ({ title: o.title, text: o.lines.join("\n").replace(/^\s*#+\s*/gm, "").trim() })).filter(o => o.text);
}
function bpView(t) {
  const os = bpOptions(t); if (!os.length) return blank(t) ? "" : `<p class="note warn">回覆中沒有找到「寫法選項」一節，請重新複製 Prompt（新版會以「### 寫法一：名稱」分開各寫法）。</p>`;
  const pick = store.values.bp_pick || [];
  return `<div class="bpview"><h3>勾選要用的寫法</h3><p class="hint">可勾多種，合併成一個大綱；勾選的內容會自動帶入下一步與步驟 3 的「選定的寫法」，帶入後也可以自己修改。</p>` +
    os.map((o, i) => `<label class="bp-opt${pick.includes(o.title) ? " on" : ""}"><span class="bp-head"><input type="checkbox" data-bppick="${i}" ${pick.includes(o.title) ? "checked" : ""}><b>${esc(o.title)}</b></span><div class="bp-body">${esc(o.text).replace(/\*\*/g, "")}</div></label>`).join("") + `</div>`;
}

// ── 行內引用與參考文獻 ──
const CJK = /[\u3400-\u9fff]/;
const CITE_YEAR = "(\\d{4}[a-z]?|無日期|n\\.d\\.)";
// 括號內「作者, 年份」：中文作者用全形逗號，英文作者用半形逗號；括號後多餘的空白去掉
function normCite(text) {
  return String(text || "").replace(/[（(]([^（）()]{2,300})[）)]/g, (all, inner) => {
    const parts = inner.split(/\s*[；;]\s*/), re = new RegExp(`^(.+?)\\s*[,，]\\s*${CITE_YEAR}$`);
    if (!parts.every(x => re.test(x.trim()))) return all;
    const fixed = parts.map(x => { const m = x.trim().match(re); return CJK.test(m[1]) ? `${m[1].trim()}，${m[2]}` : `${m[1].trim()}, ${m[2]}`; });
    return "（" + fixed.join(fixed.some(x => CJK.test(x)) ? "；" : "; ") + "）";
  }).replace(/([）)])\s+([。，、；：])/g, "$1$2");
}
const citeKey = (author, year) => (CJK.test(author) ? author.replace(/\s/g, "") : author.split(/\s|,|&/)[0]).toLowerCase() + "|" + year;
function citeScan() {   // 各節定稿中的引用：{ key, author, year, label, secs }
  const map = new Map(), re = new RegExp(`^(.+?)\\s*[,，]\\s*${CITE_YEAR}$`);
  const add = (author, year, sid) => {
    author = author.replace(/^(轉引自|引自|見|e\.g\.,?)\s*/, "").trim(); if (!author || author.length > 60) return;
    const k = citeKey(author, year), x = map.get(k) || { key: k, author, year, label: CJK.test(author) ? `${author}，${year}` : `${author}, ${year}`, secs: new Set() };
    x.secs.add(sid); map.set(k, x);
  };
  THESIS_SECS().forEach(s => {
    const t = finText(s.id);
    for (const m of t.matchAll(/[（(]([^（）()]{2,300})[）)]/g)) m[1].split(/\s*[；;]\s*/).forEach(p => { const q = p.trim().match(re); if (q) add(q[1], q[2], s.no); });
    for (const m of t.matchAll(/([A-Z][A-Za-z'’\-]+(?:\s+et al\.|\s+(?:&|and)\s+[A-Z][A-Za-z'’\-]+)?)\s*[（(](\d{4}[a-z]?)[）)]/g)) add(m[1], m[2], s.no);
  });
  return [...map.values()];
}
// 參考文獻條目的開頭：「作者（年份…）。」或「Author, A. (2019).」；作者在年份括號之前，不含句號
const REF_HEAD = /^([^。（()）]{1,150}?)\s*[（(](\d{4}[a-z]?|無日期|n\.d\.)[^（）()]{0,30}[）)]\s*([。.，,])/;
const refClean = l => l.replace(/^[\s>*•\-–]+|^\d+[.、)]\s*|\*\*/g, "").replace(/^\[引用來源\]\s*/, "").trim();
// 一行一筆；貼上時若多筆擠在同一行，在「句點或網址之後、下一位作者（Surname, A. 或 中文作者（年份））之前」切開
const refLines = t => deLatex(String(t || "")).split(/\r?\n|(?<=[.。]|https?:\/\/\S+)\s+(?=[A-Z][A-Za-z'’\-]+,\s+(?:[A-Z]\.|[A-Z][a-z]+\.)|[\u3400-\u9fff]{2,20}\.?\s*[（(]\d{4})/).map(refClean).filter(l => l.length >= 20 && l.length <= 600 && REF_HEAD.test(l));
function refCandidates() {   // 各步驟回覆中的參考文獻條目（只取「作者（年份）」開頭的行，正文段落不採用）
  const out = [];
  Object.values(store.replies || {}).concat(Object.entries(store.values || {}).filter(([k, v]) => k !== "rf_bulk" && typeof v === "string" && v.length > 200).map(([, v]) => v))
    .forEach(r => out.push(...refLines(r)));
  return [...new Set(out)];
}
const refSur = c => CJK.test(c.author) ? c.author.replace(/\s/g, "") : c.author.split(/\s|,|&/)[0];
function refAuto(c, cands, yr = c.year.replace(/^n\.d\.$/, "n.d.")) {
  const sur = refSur(c);
  const hit = cands.filter(l => { const m = l.match(REF_HEAD); return m && (yr instanceof RegExp ? yr.test(m[2]) : m[2] === yr) && (CJK.test(sur) ? m[1].replace(/\s/g, "") : m[1]).startsWith(sur); });   // 條目須以該作者開頭
  if (yr instanceof RegExp) return [...new Set(hit)];
  return hit.sort((a, b) => (/[。.]$/.test(b.match(REF_HEAD)[3]) - /[。.]$/.test(a.match(REF_HEAD)[3])) || (/https?:|doi/i.test(b) - /https?:|doi/i.test(a)) || b.length - a.length)[0] || "";
}
// 網路文獻：依填入的資訊產生 APA 第七版參考文獻
function webRef(p) {
  const A = (p.rw_author || "").trim(), T = (p.rw_title || "").trim().replace(/[。.]$/, ""), U = (p.rw_url || "").trim(); if (!A || !T) return null;
  const S = (p.rw_site || "").trim(), site = S && S !== A ? S : "", zh = CJK.test(A + T), rep = p.rw_type === "report";
  const dm = (p.rw_date || "").match(/(\d{4})(?:\s*[\/\-.年]\s*(\d{1,2})(?:\s*[\/\-.月]\s*(\d{1,2}))?)?/), y = dm ? dm[1] : "", mo = dm && !rep ? +dm[2] || 0 : 0, d = dm && mo ? +dm[3] || 0 : 0;
  if (zh) {
    const date = !y ? "無日期" : mo ? `${y} 年 ${mo} 月${d ? ` ${d} 日` : ""}` : y;   // 中文 APA：（2026 年 7 月 27 日）
    return { year: y || "無日期", text: `${A}（${date}）。${T}。${site ? site + "。" : ""}${U}`.trim() };
  }
  const M = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const date = !y ? "n.d." : mo ? `${y}, ${M[mo - 1]}${d ? " " + d : ""}` : y, a = /[.]$/.test(A) ? A : A + ".";
  return { year: y || "n.d.", text: `${a} (${date}). ${T}. ${site ? site + ". " : ""}${U}`.trim() };
}
function webRefTarget(p) { const r = webRef(p); return r ? refRows().find(x => x.key === citeKey((p.rw_author || "").trim(), r.year)) : null; }
function webRefView(p) {
  const r = webRef(p); if (!r) return `<p class="hint">填入作者或機構與標題後，這裡會出現格式化的參考文獻。</p>`;
  const t = webRefTarget(p);
  return `<div class="ref-item auto"><small>產生的參考文獻</small><div style="margin-top:4px">${esc(r.text)}</div></div>` +
    `<p class="note${t ? "" : " warn"}">${t ? `按下方按鈕，會填入正文引用（${esc(t.label)}）並存檔。` : `正文中找不到（${esc((p.rw_author || "").trim())}，${esc(r.year)}）這筆引用：請確認作者與年份是否與正文一致，或直接複製上方文字使用。`}</p>`;
}
function webRefFill(p) {
  const r = webRef(p), t = webRefTarget(p); if (!r) return "請先填入作者或機構與標題。"; if (!t) return "正文中沒有對應的引用，無法填入。";
  (store.values.refs ||= {})[t.key] = r.text; ["rw_author", "rw_date", "rw_title", "rw_site", "rw_url"].forEach(k => store.values[k] = "");
  return `已填入（${t.label}），欄位已清空，可以接著填下一筆。`;
}
// 同一作者同一年有多筆（2019a、2019b），正文卻只寫 2019：列出候選讓使用者選
const refAlts = (c, lines) => /^\d{4}$/.test(c.year) ? refAuto(c, lines, new RegExp(`^${c.year}[a-z]$`)) : [];
const refNoLetter = (e, y) => e.replace(new RegExp(`([（(]${y})[a-z]`), "$1");
const refApa = e => (m => !!m && /[。.]/.test(m[3]))(String(e || "").match(REF_HEAD));   // 開頭符合 APA（年份括號後接句號）
// Zotero 以 APA 輸出中文文獻時是英文標點：「陳立儀. (2026). 標題. 網站.」→「陳立儀（2026）。標題。網站。」
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const zhDate = d => d.replace(/([A-Za-z]+)\s*(\d{1,2})?/, (m, mo, day) => { const k = MONTHS.indexOf(mo.toLowerCase()) + 1; return k ? `${k} 月${day ? " " + day + " 日" : ""}` : m; });
function zhRef(e) {
  if (!CJK.test(e.charAt(0))) return e;
  return e.replace(/^([^()（）]+?)\.?\s*\((\d{4}[a-z]?|n\.d\.)(?:,\s*([^)]*))?\)\.\s*/, (m, a, y, d) => `${a.trim().replace(/,?\s*&\s*|,\s*/g, "、")}（${y === "n.d." ? "無日期" : y}${d ? " 年 " + zhDate(d) : ""}）。`)
    .replace(/([\u3400-\u9fff》〉」）])\.(\s+|$)/g, "$1。").replace(/([\u3400-\u9fff》〉」]),\s*(?=[\u3400-\u9fff\d])/g, "$1，")
    .replace(/(\d+)\((\d+)\),\s*/, "$1（$2），").replace(/(\d+[–-]\d+)\.(\s+|$)/, "$1。");
}
const refCollator = new Intl.Collator("zh-TW-u-co-stroke"), enCollator = new Intl.Collator("en");
function refRows() {
  const cites = citeScan(), cands = refCandidates(), saved = store.values.refs || {};
  const bulk = refLines([store.values.rf_bulk, ...Object.values(store.values.rf_paste || {})].join("\n"));   // 參考文獻頁與各節定稿貼上的書目
  return cites.map(c => { const b = c.key in saved ? "" : refAuto(c, bulk);
    const entry = c.key in saved ? saved[c.key] : refTidy(b ? zhRef(b) : refAuto(c, cands));
    return { ...c, saved: c.key in saved, bulk: !!b, entry, alts: entry.trim() ? [] : refAlts(c, bulk.concat(cands)).map(zhRef) }; });
}
function refFillItems(no) {   // 缺出處或格式不符 APA 的引用（no：只列該節），附上回覆中的線索（含網址的行）
  const rows = refRows().filter(r => (!no || r.secs.has(no)) && !r.alts.length && (!r.entry.trim() || (!r.saved && !refApa(r.entry))));
  if (!rows.length) return "";
  const src = Object.values(store.replies || {}).concat(THESIS_SECS().map(s => finText(s.id))).join("\n").split(/\r?\n/).map(refClean);
  return rows.map(r => {
    const sur = refSur(r), clue = r.entry.trim() ? [r.entry.trim()] : [...new Set(src.filter(l => l.includes(sur) && l.includes(r.year) && /https?:\/\//.test(l)))].slice(0, 2).map(l => l.length > 220 ? l.slice(0, 220) + "…" : l);
    return `- （${r.label}）` + (clue.length ? "\n  線索：" + clue.join("\n  線索：") : "");
  }).join("\n");
}
// AI 常把網址寫成 Markdown 連結（[文字](網址)），還會重複附上來源連結：改成純文字網址，只留一次
function refTidy(e) {
  let t = String(e || "").replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, " $2 ").replace(/<(https?:\/\/[^>\s]+)>/g, "$1");
  const seen = new Set();
  t = t.replace(/https?:\/\/[^\s，。）)】」]+/g, u => { const k = u.replace(/[.,;]+$/, ""); if (seen.has(k)) return ""; seen.add(k); return u; });
  return t.replace(/[ \t\u3000]{2,}/g, " ").replace(/。\s+(?=https?:)/g, "。").replace(/\s+$/g, "").trim();
}
function refList() {   // APA 第七版：中文在前（筆畫），英文在後（字母）
  const es = refRows().map(r => refTidy(r.entry)).filter(Boolean);
  return [...new Set(es)].sort((a, b) => (CJK.test(a[0]) ? 0 : 1) - (CJK.test(b[0]) ? 0 : 1) || (CJK.test(a[0]) ? refCollator.compare(a, b) : enCollator.compare(a, b)));
}
function refView() {
  const rows = refRows(); if (!rows.length) return `<p class="hint">各節定稿中還沒有行內引用。</p>`;
  const saved = store.values.refs || {}, cited = new Set(rows.map(r => r.key)), orphan = Object.keys(saved).filter(k => !cited.has(k));
  const n = { ok: rows.filter(r => r.saved && r.entry.trim()).length, auto: rows.filter(r => !r.saved && r.entry).length, alt: rows.filter(r => r.alts.length).length, miss: rows.filter(r => !r.entry.trim() && !r.alts.length).length };
  const altBox = r => `<div class="ref-alt"><p class="note warn">書目中有 ${r.alts.length} 筆 ${esc(refSur(r))} ${esc(r.year)}（${r.alts.map(a => esc((a.match(REF_HEAD) || [])[2] || "")).join("、")}），無法判斷正文引用的是哪一筆。請按「用這一筆」選定（年份後的字母會自動去掉）。若正文確實引用了其中兩筆以上，請到該節的「本節論文內容」把引用年份分別改成 ${esc(r.year)}a、${esc(r.year)}b，網站會各自配對。</p>` +
    r.alts.map((a, i) => `<div class="ref-altrow"><span>${esc(a)}</span> <button type="button" data-refpick="${esc(r.key)}" data-i="${i}">用這一筆</button></div>`).join("") + `</div>`;
  return `<p class="tb-count">共 ${rows.length} 筆引用：已確認 ${n.ok}、自動帶入待核對 ${n.auto}${n.alt ? `、同年多筆待選 ${n.alt}` : ""}、找不到出處 ${n.miss}</p>` +
    rows.map(r => `<div class="ref-item ${r.saved && r.entry.trim() ? "ok" : r.entry ? "auto" : "miss"}">
      <b>（${esc(r.label)}）</b><small>　出現於 ${esc([...r.secs].join("、"))}　${r.saved && r.entry.trim() ? "已確認" : r.alts.length ? "同一作者同年有多筆，請選定" : r.entry ? (r.bulk ? "由貼上的書目帶入，請核對" : "自動帶入，請核對") + (refApa(r.entry) ? "" : "（格式不是 APA，請修改或請 AI 整理）") : "找不到出處，請填入"}</small>
      ${r.alts.length ? altBox(r) : ""}<textarea data-ref="${esc(r.key)}" rows="2" placeholder="完整的 APA 第七版參考文獻，例如：經濟部統計處（2026）。報告名稱。https://……">${esc(r.entry)}</textarea></div>`).join("") +
    (orphan.length ? `<h4>正文已不再引用的出處（${orphan.length}）</h4>` + orphan.map(k => `<div class="ref-item orphan"><span>${esc(saved[k])}</span> <button type="button" data-refdel="${esc(k)}">刪除</button></div>`).join("") : "");
}

// ── 潤色：逐句修改建議，按「採用」才替換本節定稿中的那一句 ──
function poParse(text) {
  const t = deLatex(String(text || "")).replace(/\r\n?/g, "\n").replace(/\*\*/g, "");
  const strip = v => (v || "").trim().replace(/^[「『"“]|[」』"”]$/g, "").trim();
  return t.split(/^#{2,4}\s*建議\s*\d+[^\n]*$/m).slice(1).map(b => ({
    from: strip((b.match(/^\s*原句[：:]\s*(.+)$/m) || [])[1]),
    to: strip((b.match(/^\s*建議[：:]\s*(.+)$/m) || [])[1]),
    why: strip((b.match(/^\s*理由[：:]\s*(.+)$/m) || [])[1])
  })).filter(x => x.from && x.to);
}
function poView(t) {
  const ss = poParse(t); if (!ss.length) return blank(t) ? "" : `<p class="hint">（回覆中沒有找到「### 建議 1」這類格式的修改建議）</p>`;
  const fin = THESIS_SECS().some(x => x.id === store.sec) ? finText(store.sec) : null, done = store.values.po_done || {};
  return `<div class="posug"><h3>逐句修改建議（${ss.length} 句）</h3><p class="hint">按「採用」才會替換「本節論文內容」中的那一句；不採用的句子保持原樣。</p>` + ss.map((x, i) => {
    const key = store.sec + "|" + x.from, used = done[key], found = fin !== null && fin.includes(x.from);
    const mine = (store.values.po_edit || {})[key];
    return `<div class="po-item${used ? " used" : ""}"><div class="po-from"><small>原句</small>${esc(x.from)}</div><div class="po-to"><small>建議</small>${esc(x.to)}</div>
      ${x.why ? `<div class="po-why"><small>理由</small>${esc(x.why)}</div>` : ""}
      <label class="po-mine"><small>我的修改</small><span class="hint">可參考建議自行修改；按「採用」時以這裡的文字取代原句</span>
        <textarea data-poedit="${i}" rows="2">${esc(mine ?? x.to)}</textarea></label>
      <p class="fin-btns">${used ? `✓ 已採用 <button type="button" data-poadopt="${i}">以上方修改後的文字重新採用</button><button type="button" data-poundo="${i}">復原原句</button>` : fin === null ? `<span class="hint">（不在第一～五章的節內，請自行替換）</span>` : found ? `<button type="button" data-poadopt="${i}">採用</button>` : `<span class="hint">本節定稿中找不到這一句（可能已修改過）</span>`}</p></div>`;
  }).join("") + `</div>`;
}
// 採用：記下放進定稿的文字，之後可以改用新的修改句重新採用，或復原原句
function poAdopt(i) {
  const x = poParse((store.replies || {})[replyKey()] || "")[i]; if (!x) return;
  const key = store.sec + "|" + x.from, done = (store.values.po_done ||= {}), cur = typeof done[key] === "string" ? done[key] : done[key] ? x.to : null;
  const mine = (store.values.po_edit || {})[key], to = blank(mine) ? x.to : mine.trim(), t = finText(store.sec), from = cur && t.includes(cur) ? cur : x.from;
  if (!t.includes(from)) { alert("本節定稿中找不到這一句（可能已在「本節論文內容」中修改過），請到那裡直接修改。"); return; }
  setFin(store.sec, t.replace(from, to)); done[key] = to;
}
function poUndo(i) {
  const x = poParse((store.replies || {})[replyKey()] || "")[i]; if (!x) return;
  const key = store.sec + "|" + x.from, done = store.values.po_done || {}, cur = typeof done[key] === "string" ? done[key] : x.to, t = finText(store.sec);
  if (!t.includes(cur)) { alert("本節定稿中找不到採用後的句子（可能已再修改過），請到「本節論文內容」直接修改。"); return; }
  setFin(store.sec, t.replace(cur, x.from)); delete done[key];
}

// ── 本節定稿：論文.md 與網頁「本節論文內容」「論文全文」只放定稿 ──
const NOT_TEXT = new Set(["bgplan", "asp", "m7a", "m7b"]);   // 分析、查資料、畫圖的步驟，不是論文正文
const writeStep = s => { const st = stepsOf(s).filter(x => !x.finish && DEFS[x.mod].target !== "tool" && !NOT_TEXT.has(x.mod)); return st[st.length - 1]; };
function cleanBody(text) {   // 撰寫步驟的回覆 → 論文正文：去掉開場說明、查證與待補清單類小節、角標
  let t = deLatex(String(text || "")).replace(/\r\n?/g, "\n");
  t = t.replace(/^#{1,4}\s*(?:\d+[.、]\s*)?文獻中的寫法[^\n]*\n[\s\S]*?(?=^#{1,4}\s|(?![\s\S]))/m, "");   // 寫法分析不放進正文
  const cut = t.search(VERIFY_HEAD); if (cut >= 0) t = t.slice(0, cut);
  const first = t.search(/^#{1,6}\s/m), lead = first > 0 ? t.slice(0, first) : "";   // 第一個標題前的文字：沒有引用且很短，才視為開場說明去掉
  if (lead && !/[（(][^（）()\n]*\d{4}[a-z]?[）)]/.test(lead) && lead.replace(/\s/g, "").length <= 200) t = t.slice(first);
  return t.split("\n").filter(l => !/^\s*-{3,}\s*$/.test(l))
    .map(l => /^#{1,6}\s/.test(l) ? "#### " + l.replace(/^#+\s*|\*\*/g, "").trim() : l.replace(/\*\*/g, "").replace(/\s?\[\d+(?:\s*[,，–-]\s*\d+)*\]/g, ""))
    .join("\n").replace(/^(#### .*)\n(?=\S)/gm, "$1\n\n").replace(/^([(（][一二三四五六七八九十]+[)）][^\n。，；]{1,30})$/gm, "\n$1\n").replace(/\n{3,}/g, "\n\n").trim();   // 小標題（含「(一)標題」）自成一段
}
function finText(sid) {
  const v = (store.values.fin || {})[sid]; if (typeof v === "string" && v.trim()) return v;   // 定稿被清空時，改回由撰寫步驟的回覆產生
  const s = ALL_SECS.find(x => x.id === sid), st = s && writeStep(s);
  const t = st ? cleanBody((store.replies || {})[sid + "|" + st.mod]) : "", hs = t.match(/^#### .*$/gm) || [];
  if (hs.length === 1 && t.startsWith("#### ")) return t.replace(/^#### .*\n*/, "");   // 只有一個小標題（例如「研究背景與動機」）時去掉
  const h0 = t.startsWith("#### ") ? hs[0].slice(5).trim() : "", title = (s && s.title) || "";   // 開頭的小標題就是本節名稱時去掉
  return h0 && title && title.includes(h0) ? t.replace(/^#### .*\n*/, "") : t;   // 只有一個小標題（例如「研究背景與動機」）時去掉，正文不設小標題
}
const setFin = (sid, t) => { (store.values.fin ||= {})[sid] = t; };
// 重複段落：去掉空白與標點後，以兩字片段的重疊比例判斷（一段包含另一段也算）
function blockSim(a, b) {
  const n = x => x.replace(/[\s，。、；：「」（）()【】,.;:\-—]/g, ""), A = n(a), B = n(b); if (A.length < 20 || B.length < 20) return 0;
  if (A.includes(B) || B.includes(A)) return 1;
  const g = x => { const s = new Set(); for (let i = 0; i < x.length - 1; i++) s.add(x.slice(i, i + 2)); return s; }, ga = g(A), gb = g(B);
  let k = 0; ga.forEach(x => { if (gb.has(x)) k++; }); return k / Math.min(ga.size, gb.size);
}
function finDups(t) {   // [{ i, j, sim }]：第 j 段與前面的第 i 段重複或幾乎相同
  const bs = finBlocks(t), out = [];
  bs.forEach((b, j) => { for (let i = 0; i < j; i++) { const s = blockSim(bs[i], b); if (s >= 0.8) { out.push({ i, j, sim: s }); break; } } });
  return out;
}
const finBlocks = t => String(t || "").split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
const FIN_SUBHEAD = /^[(（][一二三四五六七八九十]+[)）]\s*[^。，；]{1,30}$/;   // 「(一)標題」形式的小標題
function finHtml(t, ed) {   // 定稿的簡易排版：#### 小標題、段落、【待補】標記；ed：每段可直接點擊修改
  return finBlocks(t).map((b, i) => { const a = ed ? ` contenteditable="true" spellcheck="false" data-fp="${i}"` : "";
    return (/^#{1,6}\s/.test(b) || FIN_SUBHEAD.test(b)) && !b.includes("\n")
    ? `<h4${a}>${esc(b.replace(/^#+\s*/, ""))}</h4>`
    : `<p${a}>${esc(b).replace(/\n/g, "<br>").replace(/【待補[^】]*】/g, m => `<mark>${m}</mark>`)}</p>`; }).join("");
}
function finBox() {   // 第一～五章各節：所有步驟下方的「本節論文內容」
  const s = sec(); if (!THESIS_SECS().some(x => x.id === s.id)) return "";
  const t = finText(s.id), own = typeof (store.values.fin || {})[s.id] === "string";
  const missR = t ? finRefMissRows(s) : [], miss = missR.length, dup = t ? finDups(t).length : 0;
  return `<details class="fin" id="finbox"><summary>本節論文內容（定稿）${t ? "" : "：尚未撰寫"}${miss ? `<span class="fin-refhint">　📚 尚缺 ${miss} 筆參考文獻${miss <= 3 ? "：" + missR.map(r => "（" + esc(r.label) + "）").join("") : ""}，點開到最下方「查找參考文獻」</span>` : ""}${dup ? `<span class="fin-refhint">　⚠ 有 ${dup} 組重複段落</span>` : ""}</summary>
    ${finDupBox(t)}${t ? `<p class="hint">直接點文字即可修改，整節連在一起，可以跨段落選取；自動存檔。按 Enter 另起一段，刪掉段落之間的分隔即合併兩段。</p>
    <div class="fin-view fin-ed" id="finview" contenteditable="true" spellcheck="false" data-fall="1">${finHtml(t)}</div>` : `<div class="fin-view" id="finview"><p class="hint">完成本節的撰寫步驟並貼上 AI 回覆後，正文會自動出現在這裡。</p></div>`}
    <p class="fin-btns">${own ? `<button type="button" data-finreset="1">重新從撰寫步驟帶入</button>` : ""}${(store.values.fin_undo || {})[s.id] ? `<button type="button" data-finundo="1">復原上一次清除或取代前的內容</button>` : ""}
    <span class="hint">論文.md 與「論文全文」只放這裡的內容</span></p>${finRefBox(s)}</details>`;
}
function finDupBox(t) {
  const ds = finDups(t); if (!ds.length) return "";
  const bs = finBlocks(t), cut = x => x.length > 40 ? x.slice(0, 40) + "…" : x;
  return `<div class="note warn fin-dup"><b>發現 ${ds.length} 組重複的段落</b>（通常是同一段被「加到本節定稿最後」或貼上了兩次）。` +
    `<p><button type="button" class="copy" data-findedup="1">一鍵清除重複段落（每組只保留最新、最後面的那一段）</button></p>` +
    `<details><summary>逐組比對、自己決定刪哪一段</summary>` +
    ds.map(d => `<div class="fin-duprow">${d.sim >= 0.999 ? "兩段相同" : "兩段幾乎相同"}
      <div>前：「${esc(cut(bs[d.i]))}」 <button type="button" data-findel="${d.i}">刪除這段</button></div>
      <div>後：「${esc(cut(bs[d.j]))}」 <button type="button" data-findel="${d.j}">刪除這段</button></div></div>`).join("") + `</details></div>`;
}
function finDedupLatest(t) {   // 重複或幾乎相同的段落：每組只保留最後面（最新）的那一段
  let bs = finBlocks(t);
  for (let k = 0; k < 200; k++) { const d = finDups(bs.join("\n\n"))[0]; if (!d) break; bs.splice(d.i, 1); }
  return bs.join("\n\n");
}
// 本節定稿下方：查找本節缺少的參考文獻 → 貼上 AI 回覆 → 自動匯入參考文獻頁
const finRefMissRows = s => refRows().filter(r => r.secs.has(s.no) && !(r.entry.trim() && (r.saved || refApa(r.entry))));   // 本節缺 APA 出處的引用
function finRefMiss(s) { return finRefMissRows(s).length; }
function finRefCount(s) {
  const rows = refRows().filter(r => r.secs.has(s.no)); if (!rows.length) return "";
  const ok = rows.filter(r => r.entry.trim() && (r.saved || refApa(r.entry))).length;
  return `本節共 ${rows.length} 筆引用，已有 APA 格式出處 ${ok} 筆${ok < rows.length ? `，尚缺 ${rows.length - ok} 筆` : "，全部齊全"}。逐筆核對在「論文整理 → 參考文獻」。`;
}
function finRefBox(s) {
  const c = finRefCount(s); if (!c) return "";
  const pasted = (store.values.rf_paste || {})[s.id] || "", need = !!refFillItems(s.no);
  const mr = finRefMissRows(s);
  return `<div class="fin-ref"><h4>查找參考文獻</h4><p class="hint" id="finrefcount">${c}</p>` + (mr.length ? `<p class="note warn">尚缺出處：${mr.map(r => `（${esc(r.label)}）${r.entry.trim() ? "<small>已有出處但不是 APA 格式</small>" : ""}`).join("、")}</p>` : "") + (need || pasted ? `
    <p><b>①</b> <button type="button" data-finrefcopy="${esc(s.no)}">複製查找文獻 Prompt（貼到一般 AI）</button> <span class="hint">需開啟網路搜尋；接在查過資料的同一個對話最準</span></p>
    <label><b>②</b> 貼上 AI 回覆，自動匯入參考文獻<textarea data-finref="${s.id}" rows="3" placeholder="貼上 AI 列出的 APA 參考文獻（一行一筆）">${esc(pasted)}</textarea></label>` : "") + `</div>`;
}
function thesisBody() {   // 論文全文（Markdown）：題目＋各章節定稿
  const zh = (store.values.tt_zh || "").trim(), en = (store.values.tt_en || "").trim();
  const out = [`# ${zh || store.name || "論文"}`, ...(en ? ["", en] : []), ""];
  OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).forEach(c => {
    out.push(`## ${c.ch}`, "");
    secsOf(c).forEach(s => { out.push(`### ${s.no} ${s.title}`, ""); const t = normCite(tbApply(s.id, "fin", finText(s.id))); if (t) out.push(t, ""); });
  });
  const refs = refList(); if (refs.length) out.push("## 參考文獻", "", ...refs.flatMap(r => [r, ""]));
  return THESIS_SECS().some(s => finText(s.id)) ? out.join("\n") : "";
}
function fullView() {
  const zh = (store.values.tt_zh || "").trim(), en = (store.values.tt_en || "").trim();
  return `<div class="fulltext"><h2 class="ft-title">${esc(zh || store.name || "論文")}</h2>${en ? `<p class="ft-en">${esc(en)}</p>` : ""}` +
    OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).map(c => `<h2>${esc(c.ch)}</h2>` + secsOf(c).map(s => {
      let fig = "";
      if (s.id === "s3-1") { try { const f = DEFS.fa31.fields[0], d = dgSeed(f, {}), v = f.source(); if (d.edges.length) { dgAutoPos(v, d.pos, false); fig = `<div class="ft-fig">${dgSvg(v, d, null, false)}<p>圖 3-1　研究架構圖</p></div>`; } } catch {} }
      const t = normCite(tbApply(s.id, "fin", finText(s.id)));
      return `<h3>${esc(s.no + " " + s.title)}</h3>${fig}${t ? finHtml(t) : `<p class="hint">（尚未撰寫）</p>`}`;
    }).join("")).join("") + (refList().length ? `<h2>參考文獻</h2>` + refList().map(r => `<p class="ref-line">${esc(r)}</p>`).join("") : "") + `</div>`;
}
// 段落核實改寫：回覆中最新一次的「## 改寫後段落」或「## 融合後的段落」
function drLatest(text) {
  const L = deLatex(String(text || "")).replace(/\r\n?/g, "\n").replace(/\*\*/g, "").split("\n");
  let start = -1, lv = 0;
  L.forEach((l, i) => { const m = l.match(/^(#{1,4})\s*(改寫後段落|融合後的段落|統整後全文)/); if (m) { start = i; lv = m[1].length; } });
  if (start < 0) return "";
  let end = L.length;
  for (let i = start + 1; i < L.length; i++) { const m = L[i].match(/^(#{1,4})\s/); if (m && m[1].length <= lv) { end = i; break; } }
  return L.slice(start + 1, end).join("\n").replace(/\s?\[\d+(?:\s*[,，–-]\s*\d+)*\]/g, "").replace(/^\s*-{3,}\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
function drResultView(t) {
  const ans = (mdSection(deLatex(String(t || "")), ["追問回覆"]) || "").split("\n").slice(1).join("\n").trim();
  const ansBox = ans ? `<details class="drres" open><summary><b>追問回覆</b></summary><div class="fin-view">${finHtml(ans)}</div></details>` : "";
  const r = drLatest(t); if (!r) return ansBox + (blank(t) ? "" : `<p class="hint">（回覆中沒有找到「## 改寫後段落」或「## 融合後的段落」；新版 Prompt 會固定用這兩個標題）</p>`);
  const ps = drParas(), merge = store.values.dr_stage === "merge", whole = store.values.dr_stage === "whole", sel = (store.values.dr_sel || []).filter(k => ps.some(x => x.key === k));
  const cur = ps.findIndex(x => x.text.trim() === (store.values.dr_text || "").trim());
  const have = new Set(finBlocks(finText(drSid()))), used = finBlocks(r).every(b => have.has(b)) || finText(drSid()).includes(r.trim());   // 結果已在定稿中：不再顯示加入按鈕，避免重複加入
  const allPicked = !merge && !whole && ps.length > 1 && (store.values.dr_text || "").trim() === ps.map(x => x.text).join("\n\n").trim();   // 按過「全選」
  const btn = whole || allPicked ? `<button type="button" class="copy" data-drrep="all">以此取代本節全部內容</button>` : merge ? (sel.length ? `<button type="button" class="copy" data-drrep="merge">以此取代所選的 ${sel.length} 段（合併為一段）</button>` : "")
    : cur >= 0 ? `<button type="button" class="copy" data-drrep="one">以此取代第 ${cur + 1} 段</button>`
    : drHl() ? `<button type="button" class="copy" data-drrep="sel">以此取代反白的部分</button>` : "";
  const kind = whole ? "整節統整" : merge ? "融合" : "改寫";
  if (used) return ansBox + `<div class="drres"><details><summary>✓ 最新的${kind}結果已套用到「本節論文內容」（點開檢視）</summary><div class="fin-view">${finHtml(r)}</div></details></div>`;   // 已套用：收合，避免與定稿重複顯示
  return ansBox + `<div class="drres"><h3>${kind}結果（尚未套用）</h3><p class="hint">這是 AI 回覆的預覽，還不是論文內容；按下方「以此取代」後才會寫入「本節論文內容」。</p><div class="fin-view">${finHtml(r)}</div>
    ${`${btn ? "" : `<p class="note warn">沒有出現「以此取代」按鈕：原本選的段落已不在本節定稿中（可能已修改或刪除）。${inThesisSec() ? "請在「本節論文內容」重新反白要被取代的文字，按上方「用反白的文字」" : `請在上方「本節的段落」重新按「用這一段」${merge ? "或勾選「加入融合」" : ""}，選好要被取代的段落`}後，就會出現取代按鈕。</p>`}<p class="fin-btns">${btn}${whole || allPicked ? "" : `<button type="button" data-drrep="all">以此取代本節全部內容</button>`}<button type="button" data-drrep="append">不取代，另外加在本節最後</button>
    <span class="hint">一般請按「以此取代」；取代後會更新「本節論文內容」與論文.md</span></p>`}</div>`;
}
// 整節統整：本節全文先分則送出，最後一則才是統整任務；在「常用 → 修訂論文」使用時，由使用者選章節
const inThesisSec = () => THESIS_SECS().some(x => x.id === store.sec);
// 段落核實改寫的對象章節：在章節內就是該節；在「常用 → 修訂論文」由使用者選（或從章節點過來時帶入）
const drSid = () => inThesisSec() ? store.sec : (k => THESIS_SECS().some(x => x.id === k) ? k : "")(store.values.dr_sec || store.values.dw_sec);
const drCh1 = () => /^s1-/.test(drSid()), drCh2 = () => /^s2-/.test(drSid());
// 用反白的文字：「論文段落」是定稿中的一段連續文字，但不是完整的單一段落
const drHl = () => { const x = (store.values.dr_text || "").trim(), sid = drSid(); return !!x && !!sid && finText(sid).includes(store.values.dr_text) && !drParas().some(p => p.text.trim() === x); };
// 在定稿中找出反白的文字（略去空白、換行與小標題的 #），回傳定稿中的原文片段
function finFind(t, sel) {
  const skip = c => /[\s#]/.test(c), key = [...String(sel || "")].filter(c => !skip(c)).join(""); if (key.length < 2) return "";
  let s = ""; const idx = [];
  for (let i = 0; i < t.length; i++) if (!skip(t[i])) { s += t[i]; idx.push(i); }
  const k = s.indexOf(key); if (k < 0) return "";
  let a = idx[k]; const b = idx[k + key.length - 1] + 1, ls = t.lastIndexOf("\n", a - 1) + 1;
  if (/^[#\s]*$/.test(t.slice(ls, a))) a = ls;   // 從小標題開始反白時，連同 #### 一起取
  return t.slice(a, b);
}
const secLabel = sid => (s => s ? `${s.no} ${s.title}` : "")(ALL_SECS.find(x => x.id === sid));
// 修訂時以研究者目前的原文為準：保留其小標題寫法、編號與段落結構，不沿用對話中較早的版本
const drFmtNote = whole => "\n\n[以目前原文為準]\n本對話中較早出現的內容（例如撰寫本節時的 Prompt、你先前的回覆）若與我這次提供的原文不同，一律以這次的原文為準；我已自行修改過的結構、用字與編號都要保留。" +
  "小標題照原文的文字與編號格式輸出（例如原文寫「(一)兩種瀏覽動機」就照寫，不得改成「###」或其他格式）；" + (whole ? "若調整段落順序，小標題的編號須隨之重排。" : "段落順序與分段照原文，不得改回較早版本的結構。") + "原文中的假說敘述（例如「H1：……」）維持獨立一行，編號照原文或下方的現行假說清單。";
// 第二章修訂時一併檢查：假說敘述寫法、與本節其他段落重複、理論放錯位置
const drCh2Check = (whole, full = true) => !drCh2() ? "" : "\n\n[第二章修訂：以下問題一律直接改正在輸出的文字中，不要只提出建議]\n1. 假說敘述改成完整句子並以句號結尾（例如「H1：功利型瀏覽對認知型衝動購買有正向影響。」），刪除箭頭與「（正向）」等標記。" +
  (whole ? "\n2. 重複的內容（例如本研究採用的量表說明寫了兩次、同一定義出現兩次）只保留一處，保留引用較完整、位置較合適的版本，其餘刪除。" +
    "\n3. 解釋兩個變數之間關係的理論與實證，移到該關係的推導段落；介紹構念本身的段落（定義、面向、衡量）只談構念，不談路徑機制。移動時一併調整前後的承接句。"
  : (full ? "\n2. 對照上方本節全文：要改寫的內容若與本節其他段落重複（例如本研究採用的量表說明在別段已經寫過），就從改寫結果中刪除重複的部分；要改寫的內容本身前後重複時，合併為一處。" +
    "\n3. 要改寫的內容中，若解釋變數關係的理論或實證放在介紹構念的段落，而該關係的推導段落也在要改寫的範圍內，就直接移過去；若推導段落不在範圍內，且該處已寫過相同內容，就直接刪除。"
    : "\n2. 要改寫的內容本身前後重複時（例如同一份量表的說明寫了兩次），合併為一處。" +
    "\n3. 要改寫的內容中，若解釋變數關係的理論或實證放在介紹構念的段落，而該關係的推導段落也在要改寫的範圍內，就直接移過去。")) +
  "\n4. 小標題一律寫成「(一)標題」的形式，獨立一行。" +
  "\n改寫說明中簡要列出做了哪些改正即可。";
// 研究者的追問：先逐題回答，再依回答修訂
const drAskNote = (p, out) => blank(p.dr_ask) ? "" : `\n\n[研究者的追問與修改意見]\n${p.dr_ask.trim()}\n請先在「## 追問回覆」標題下逐題回答：只依據上傳文獻並附引用，文獻無法回答的明確說明，不得臆測；認同我的意見時說明理由，不認同時也要說明文獻依據。接著依回答修訂，結果照常放在「${out}」標題之下。追問與前述規則衝突時，以追問為準。`;
// 第二章分到假說的節：修訂時附上現行假說清單，避免 NotebookLM 沿用對話中較早的編號
function drHypNote() {
  const h = drCh2() ? ch2SecHyps(drSid()) : []; if (!h.length) return "";
  return "\n\n[本節現行假說清單]\n" + h.join("\n") + "\n假說的編號與內容一律以此清單為準，本對話中先前出現的假說編號全部作廢；改寫後若出現假說敘述或假說編號，必須與此清單一致。清單中的箭頭只是標記，正文的假說敘述以完整句子寫成（例如「H1：功利型瀏覽對認知型衝動購買有正向影響。」）。";
}
function dwParts(p) {
  const sid = drSid(), t = sid ? finText(sid) : ""; if (blank(t)) return [];
  const s = ALL_SECS.find(x => x.id === sid) || {}, ref = (DR_R ? "\n\n請同時遵守本對話先前送出的「共用規則」。" : "") + drFmtNote(true) + drCh2Check(true) + drHypNote();
  const mat = `以下是論文「${s.no || ""} ${s.title || ""}」一節目前的全文：\n---\n${t}\n---`, task = T.dr_whole({ sec: `${s.no || ""} ${s.title || ""}`.trim(), intro: sid === "s1-1" }) + drLenReq(p) + drAskNote(p, "## 統整後全文") + ref;
  return (mat + "\n\n" + task).length <= 2800 ? [mat + "\n\n" + task] : splitForNLM(mat, task, "整節統整");
}
// 修訂論文的 Prompt：補強、精簡附上本節全文作為上下文（太長自動分則）；整節統整見 dwParts；融合為單則
function drParts(p) {
  if (p.dr_stage === "whole") return dwParts(p);
  if (blank(p.dr_text)) return [];
  const sid = drSid(), full = sid ? finText(sid) : "", s = ALL_SECS.find(x => x.id === sid) || {}, sn = `${s.no || ""} ${s.title || ""}`.trim();
  const same = zhCount(full.replace(/^#{1,6}\s.*$/gm, "")) <= zhCount(p.dr_text) + 5;   // 全選時，待改寫段落就是整節，不另附上下文
  const useFull = isOn(p.dr_full) && full && !same, at = full.indexOf(p.dr_text), local = !useFull && !same && at >= 0;
  const ref = (DR_R ? "\n\n請同時遵守本對話先前送出的「共用規則」。" : "") + drFmtNote(false) + drCh2Check(false, useFull) + drHypNote() + drAskNote(p, p.dr_stage === "merge" ? "## 融合後的段落" : "## 改寫後段落");
  if (p.dr_stage === "merge") return [T.dr_merge({ arch: bgSeed().bg_topic, text: p.dr_text }) + ref];
  const ctx = useFull ? "\n\n[上下文要求]\n上方已提供本節全文作為上下文，待改寫的段落是其中的一部分。請先在「## 段落角色」標題下，以一兩句說明待改寫段落在整節中的角色，以及與前一段、後一段的承接關係；再依此改寫：保留與前後段的銜接；不重複本節其他段落已寫過的論點、定義與數據；不刪除後文會用到的論點或術語。「## 改寫後段落」之下只放待改寫段落的改寫結果，不要改寫或輸出其他段落。"
    : local ? "\n\n[上下文要求]\n上方已提供待改寫段落的前一段與後一段（節錄）及本節小標題，只供參考：改寫時保留與前後段的銜接，「## 改寫後段落」之下只放待改寫段落的改寫結果，不要改寫或輸出前後段。" : "";
  const task = p.dr_stage === "final" ? T.dr_final({ draft: p.dr_text }) + drLenReq(p) + ctx + ref + "\n\n" + T.dr_final_tail({}) : T.dr_draft({ draft: p.dr_text }) + ctx + ref;
  if (local) {   // 只附前後文：前一段、後一段（節錄）與本節小標題
    const blk = t => finBlocks(t).filter(b => !(/^#{1,6}\s/.test(b) || FIN_SUBHEAD.test(b)) || b.includes("\n"));
    const prev = blk(full.slice(0, at)).pop() || "", next = blk(full.slice(at + p.dr_text.length))[0] || "";
    const heads = finBlocks(full).filter(b => !b.includes("\n") && (/^#{1,6}\s/.test(b) || FIN_SUBHEAD.test(b))).map(b => b.replace(/^#+\s*/, ""));
    const room = Math.min(300, Math.floor((2800 - task.length - heads.join("、").length - 160) / 2));   // 依剩餘字數調整節錄長度，盡量維持單則
    const cut = (t, tail) => t.length <= room ? t : tail ? "……" + t.slice(-room) : t.slice(0, room) + "……";
    if (room < 60) return task.length <= 2800 ? [task] : splitForNLM(`以下是待改寫的論文段落（「${sn}」一節）：\n---\n${p.dr_text}\n---`, (p.dr_stage === "final" ? T.dr_final({ draft: "（待改寫的內容即為前面分則送出的段落）" }) + drLenReq(p) + ref + "\n\n" + T.dr_final_tail({}) : T.dr_draft({ draft: "（待改寫的內容即為前面分則送出的段落）" }) + ref), "修訂論文");
    const mat = `以下是待改寫段落在論文「${sn}」一節中的位置（只供參考，不要改寫）：` + (heads.length ? `\n本節小標題：${heads.join("、")}` : "") +
      `\n前一段（節錄）：${prev ? cut(prev, true) : "（無，待改寫段落位於本節開頭）"}\n後一段（節錄）：${next ? cut(next, false) : "（無，待改寫段落位於本節結尾）"}`;
    return (mat + "\n\n" + task).length <= 2800 ? [mat + "\n\n" + task] : (task.length <= 2800 ? [task] : splitForNLM(`以下是待改寫的論文段落（「${sn}」一節）：\n---\n${p.dr_text}\n---`, (p.dr_stage === "final" ? T.dr_final({ draft: "（待改寫的內容即為前面分則送出的段落）" }) + drLenReq(p) + ref + "\n\n" + T.dr_final_tail({}) : T.dr_draft({ draft: "（待改寫的內容即為前面分則送出的段落）" }) + ref), "修訂論文"));
  }
  if (!ctx) {   // 全選或沒有上下文：太長時，先分則送出待改寫的全文，最後一則只放改寫任務
    if (task.length <= 2800) return [task];
    const ph = "（待改寫的內容即為前面分則送出的本節全文）", t2 = p.dr_stage === "final" ? T.dr_final({ draft: ph }) + drLenReq(p) + ref + "\n\n" + T.dr_final_tail({}) : T.dr_draft({ draft: ph }) + ref;
    return splitForNLM(`以下是待改寫的論文段落（「${sn}」一節）：\n---\n${p.dr_text}\n---`, t2, "修訂論文");
  }
  const mat = `以下是論文「${sn}」一節目前的全文（作為上下文，只供參考）：\n---\n${full}\n---`;
  return (mat + "\n\n" + task).length <= 2800 ? [mat + "\n\n" + task] : splitForNLM(mat, task, "修訂論文");
}
function drReplace(mode) {
  const sid = drSid(), r = drLatest((store.replies || {})[replyKey()] || ""); if (!r || !sid) return;
  let t = finText(sid); const ps = drParas();
  if (mode === "all") { if (!confirm(`以這個結果取代「${secLabel(sid) || "本節"}」定稿的全部文字？（之後可在該節定稿下方按「復原上一次清除或取代前的內容」）`)) return; (store.values.fin_undo ||= {})[sid] = t; t = r; }
  else if (mode === "append") { if (finBlocks(t).some(b => blockSim(b, r) >= 0.8) && !confirm("本節定稿中已有相同或幾乎相同的段落，仍要再加到最後嗎？")) return; t = (t ? t + "\n\n" : "") + r; }
  else if (mode === "sel") { const x = store.values.dr_text || ""; if (!x.trim() || !t.includes(x)) { alert("本節定稿中找不到原本反白的文字（可能已修改過），請重新反白後再試。"); return; } t = t.replace(x, r); store.values.dr_text = r; }
  else if (mode === "one") { const p = ps.find(x => x.text.trim() === (store.values.dr_text || "").trim()); if (!p) return; t = t.replace(p.text, r); store.values.dr_text = r; }
  else { const sel = ps.filter(x => (store.values.dr_sel || []).includes(x.key)); if (!sel.length) return; t = t.replace(sel[0].text, r); sel.slice(1).forEach(x => { t = t.replace(x.text, ""); }); t = t.replace(/\n{3,}/g, "\n\n").trim(); store.values.dr_sel = []; }
  setFin(sid, t);
  const k = sid + "|" + r.replace(/\s/g, "").slice(0, 40); (store.values.dr_done ||= {})[k] = true;
}

// ── 段落核實改寫：把本節定稿拆成一段一段 ──
let DR_R = "";   // 段落核實改寫的共用規則（另成一則，每個對話送一次）
const VERIFY_HEAD = /^#{1,4}\s*(?:\d+[.、]\s*)?(待補清單|待補資料|需要研究者查證|學生原稿檢核|學生內容查證|來源核對|對應檢核|假說支持度檢核)/m;
function drParas() {
  const s = ALL_SECS.find(x => x.id === drSid()); if (!s || !s.no) return [];
  const out = []; let head = "";
  finText(s.id).split(/\n\s*\n/).forEach(b => {
    b = b.trim(); if (!b) return;
    if (/^#{1,6}\s/.test(b) && !b.includes("\n")) { head = b.replace(/^#+\s*/, ""); return; }
    if (b.replace(/\s/g, "").length >= 20) out.push({ head, text: b, key: s.id + "|" + b.replace(/\s/g, "").slice(0, 40) });
  });
  return out;
}
function drView() {
  const ps = drParas(), done = store.values.dr_done || {}, cur = (store.values.dr_text || "").trim();
  const merge = store.values.dr_stage === "merge", sel = store.values.dr_sel || [];
  return `<p class="hint">本節共 ${ps.length} 段，已完成 ${ps.filter(x => done[x.key]).length} 段。${merge ? "融合：按「加入融合」選兩段以上（依清單順序帶入），複製 Prompt 送出，AI 會先提出排序方案再寫出融合後的段落。" : "按「用這一段」帶入下方，複製 Prompt 送出；回覆貼到「AI 回覆」後，按「完成」標記，再換下一段。"}　<button type="button" data-drall="1">${merge ? "全選（全部加入融合）" : "全選（帶入本節全部段落）"}</button></p>` +
    ps.map((x, i) => `<div class="dr-para${done[x.key] ? " done" : ""}${(merge ? sel.includes(x.key) : cur === x.text.trim()) ? " cur" : ""}"><b>${i + 1}</b>
      <div class="dr-txt">${x.head ? `<small>${esc(x.head)}</small>` : ""}${x.text.length > 90
        ? `<details><summary>${esc(x.text.slice(0, 90))}……<span class="dr-more">展開全文</span></summary><div class="dr-full">${esc(x.text)}</div></details>`
        : `<span>${esc(x.text)}</span>`}</div>
      <span class="dr-btns">${merge ? `<button type="button" data-drsel="${i}" class="${sel.includes(x.key) ? "on" : ""}">${sel.includes(x.key) ? "✓ 已加入" : "加入融合"}</button>` : `<button type="button" data-drpick="${i}">${cur === x.text.trim() ? "目前這段" : "用這一段"}</button>`}
      <button type="button" data-drdone="${i}">${done[x.key] ? "✓ 已完成" : "完成"}</button></span></div>`).join("");
}

// ── 待補資料查證：第一～五章 AI 回覆中的【待補…】標記 ──
const TB_RE = /【(待補[^：:】]*)(?:[：:]([^】]*))?】/g;
const THESIS_SECS = () => OUTLINE.filter(c => /^第[一二三四五六七八九十]章/.test(c.ch)).flatMap(c => c.secs).filter(s => !s.setup);
function secsOf(c) { return c.secs.filter(s => !s.setup); }
// 回覆中的待補標記（略過回覆最後的待補清單類小節，避免重複）；key：章節｜步驟｜標記文字｜同文字第幾次
function tbMarks(sid, mod, text) {
  const t = String(text || ""), cut = t.search(/^#{1,4}\s*(?:\d+[.、]\s*)?(待補清單|待補資料|需要研究者查證|學生原稿檢核|學生內容查證|來源核對)/m);
  const seen = {}, out = [];
  for (const m of t.matchAll(TB_RE)) {
    if (cut >= 0 && m.index > cut) break;
    const n = (seen[m[0]] = (seen[m[0]] || 0) + 1);
    const a = Math.max(t.lastIndexOf("。", m.index - 1), t.lastIndexOf("\n", m.index - 1)) + 1;
    let b = t.slice(m.index + m[0].length).search(/[。\n]/); b = b < 0 ? t.length : m.index + m[0].length + b + 1;
    out.push({ key: `${sid}|${mod}|${m[0]}|${n}`, mark: m[0], kind: m[1], need: (m[2] || "").trim(), ctx: t.slice(a, b).trim(), index: m.index });
  }
  return out;
}
function tbItems() {   // 只看各節定稿（論文正文）中的待補標記
  return THESIS_SECS().flatMap(s => tbMarks(s.id, "fin", finText(s.id)).map(x => ({ ...x, sec: `${s.no} ${s.title}`, step: "本節定稿" })));
}
// 以查證內容取代標記（論文草稿檔用）
function tbApply(sid, mod, text) {
  const fill = store.values.tb_fill || {}, ms = tbMarks(sid, mod, text).filter(x => !blank(fill[x.key]));
  let t = String(text);
  ms.sort((a, b) => b.index - a.index).forEach(x => { t = t.slice(0, x.index) + fill[x.key].trim() + t.slice(x.index + x.mark.length); });
  return t;
}
function tbView() {
  const items = tbItems(), fill = store.values.tb_fill || {};
  if (!items.length) return `<p class="hint">第一章到第五章的 AI 回覆中，目前沒有【待補】標記。</p>`;
  const done = items.filter(x => !blank(fill[x.key])).length;
  let last = "";
  return `<p class="tb-count" id="tbcount">已填 ${done}／${items.length} 項</p>` + items.map(x => {
    const head = x.sec + "｜" + x.step !== last ? `<h4>${esc(x.sec)}｜${esc(x.step)}</h4>` : ""; last = x.sec + "｜" + x.step;
    const ctx = esc(x.ctx).replace(esc(x.mark), `<mark>${esc(x.mark)}</mark>`);
    return `${head}<div class="tb-item"><p class="tb-ctx">${ctx}</p>
      <textarea class="tb-in${blank(fill[x.key]) ? "" : " filled"}" data-tbfill="${esc(x.key)}" rows="2" placeholder="查證後的內容（含出處），例如：2024 年台灣電商市場規模約……（經濟部統計處, 2025）">${esc(fill[x.key] || "")}</textarea></div>`;
  }).join("");
}
function tbText() {
  const fill = store.values.tb_fill || {}, items = tbItems().filter(x => !blank(fill[x.key]));
  return items.length ? "【待補資料查證結果】\n\n" + items.map((x, k) => `${k + 1}. ${x.sec}｜${x.step}\n原文：${x.ctx}\n查證內容：${fill[x.key].trim()}`).join("\n\n") : "";
}

// 1.1 研究背景與動機：由前面步驟帶入
function mdSection(text, names) {   // 取出「## 名稱」一節（含其下的小標題，到下一個同級或更高標題為止）；同名者取最後一次出現
  const L = String(text || "").replace(/\r\n?/g, "\n").replace(/\*\*/g, "").split("\n");
  return names.map(n => {
    let start = -1, lv = 0;
    L.forEach((l, i) => { const m = l.match(/^(#{1,4})\s*(.*)$/); if (m && m[2].replace(/^[0-9一二三四五六七八九十、.．\s]+/, "").startsWith(n)) { start = i; lv = m[1].length; } });
    if (start < 0) return "";
    let end = L.length;
    for (let i = start + 1; i < L.length; i++) { const m = L[i].match(/^(#{1,4})\s/); if (m && m[1].length <= lv) { end = i; break; } }
    const body = L.slice(start + 1, end).join("\n").trim();
    return body ? `${n}\n${body}` : "";
  }).filter(Boolean).join("\n\n");
}
let BG_R = "";   // 研究背景與動機：最近一次的共用規則文字（分則時附在最後一則）
function bgParts(p) {
  if (blank(p.bg_topic)) return [];
  const q = { topic: p.bg_topic.trim(), facts: p.bg_facts, gaps: p.bg_gaps, plan: (p.bg_plan || "").trim(), draft: (p.as_draft || "").trim() };
  const R = RULES.filter(r => activeRules(DEFS.bg, p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
  const one = T.bg_mat(q) + "\n" + T.bg_task(q) + R;
  if (one.length <= 2800) return [one];
  // 太長：撰寫規則併入前面的參考資料分則送出，最後一則只放撰寫任務
  return splitForNLM(T.bg_mat(q) + (R ? "\n\n【撰寫時須遵守的規則】" + R : ""), T.bg_task(q) + (R ? "\n\n撰寫時請遵守前面提供的「撰寫時須遵守的規則」。" : ""), "研究背景與動機");
}
function bgSeed() {
  const v = store.values, r = store.replies || {};
  const { vars, d } = finalArch(), nm = k => ((vars.find(x => x.key === k) || {}).name || k).replace(/\s*[（(][^（）()]*[）)]\s*$/, "");
  const paths = d.edges.map(e => `${nm(e.from)} → ${nm(e.to)}`).concat(d.mods.map(m => { const [a, b] = m.edge.split(">"); return `${nm(m.from)} 調節（${nm(a)} → ${nm(b)}）`; }));
  const topic = [(v.tt_zh || "").trim() && "論文題目：" + v.tt_zh.trim(), (v.as_ctx || "").trim() && "研究情境：" + v.as_ctx.trim(), paths.length && "研究架構：" + paths.join("；")].filter(Boolean).join("\n");
  return { bg_topic: topic, bg_facts: mdSection(r["s1-1|asp"], ["台灣統計資料", "研究情境", "實務問題", "實務缺口"]), bg_gaps: mdSection(r["s0-5|archchk"], ["研究缺口"]) };
}
// 共用規則讓 Prompt 超過 NotebookLM 字數上限時：規則先分則送出（只回「已收到」），最後一則才是撰寫任務
function ruleSplit(mod, p, prompt, what) {
  if (!prompt) return [];
  const R = RULES.filter(r => activeRules(DEFS[mod], p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
  return (prompt + R).length <= 2800 ? [prompt + R] : splitForNLM("【撰寫時須遵守的規則】" + R, prompt + "\n\n撰寫時請遵守前面提供的「撰寫時須遵守的規則」。", what);
}
function partsNote(ps) { return ps.length > 1 ? `內容較長，Prompt 自動分成 ${ps.length} 則：前幾則是參考資料或規則（NotebookLM 只會回覆「已收到」），最後一則才開始撰寫；請在同一個對話依序送出。` : ""; }
function partBoxes(pre, mod, fn) { return [2, 3, 4].map(k => ({ id: pre + k, type: "promptbox", afterOut: true, when: p => fn(p).length >= k,
  get label() { const n = fn(valuesOf(DEFS[mod])).length; return k === n ? `第 ${k} 則 Prompt（最後一則：開始撰寫）` : `第 ${k} 則 Prompt`; },
  hint: "上一則送出、NotebookLM 回覆「已收到」後，在同一個對話接著送出",
  copyLabel: `${"②③"[k - 2]} 複製第 ${k} 則（同一個對話接著送出）`, build: p => fn(p)[k - 1] || "" })); }
function puParts(p) { return blank(p.hy_paths) ? [] : ruleSplit("purpose", p, T.purpose({ paths: p.hy_paths, motive: p.pu_motive }), "研究目的"); }
function scParts(p) {
  if (blank(p.sc_topic)) return [];
  const q = { topic: p.sc_topic.trim(), target: (p.sc_target || "").trim(), extra: (p.sc_extra || "").trim(), ctx: (p.sc_ctx || "").trim() };
  const R = RULES.filter(r => activeRules(DEFS.scope, p).includes(r.key)).map(r => typeof r.text === "function" ? r.text(p) : r.text).join("");
  const one = T.scope(q) + R;
  if (one.length <= 2800) return [one];
  return splitForNLM(T.scope_mat(q) + (R ? "\n\n【撰寫時須遵守的規則】" + R : ""), T.scope_task(q) + (R ? "\n\n撰寫時請遵守前面提供的「撰寫時須遵守的規則」。" : ""), "研究範圍");
}
// 1.4 研究流程：各章已有定稿的摘要（第三章研究方法帶入較多內容）
function flSummary() {
  return THESIS_SECS().map(s => {
    const t = finBlocks(finText(s.id)).filter(b => !/^#/.test(b)).join(" "); if (!t) return "";
    const n = /^s3-/.test(s.id) ? 500 : 120;
    return `${s.no} ${s.title}：${t.length > n ? t.slice(0, n) + "……" : t}`;
  }).filter(Boolean).join("\n");
}
// 1.3 研究範圍：1.1 定稿中描述研究情境（平台）的段落，用來說明選擇此平台的理由
function scCtx() {
  const name = (store.values.as_ctx || "").replace(/[（(].*$/, "").trim().slice(0, 4), bs = finBlocks(finText("s1-1")).filter(b => !/^#/.test(b));
  const hit = (name && bs.find(b => b.includes(name))) || bs.find(b => /平台|市集/.test(b)) || "";   // 優先取提到平台名稱的那一段
  return hit.length > 650 ? hit.slice(0, 650) + "……" : hit;
}
// 由架構圖列出假說清單（一行一條；預期方向請研究者自行補上）
function archHyp() {
  const { vars, d } = finalArch(), nm = k => ((vars.find(x => x.key === k) || {}).name || k).replace(/\s*[（(][^（）()]*[）)]\s*$/, "");
  const ls = d.edges.map(e => `${nm(e.from)} → ${nm(e.to)}`).concat(d.mods.map(m => { const [a, b] = m.edge.split(">"); return `${nm(m.from)} 調節（${nm(a)} → ${nm(b)}）`; }));
  return ls.map((l, i) => `H${i + 1}：${l}`).join("\n");
}
function ttlArch() { const { A, vars, d } = finalArch(); return vars.length && d.edges.length ? archText({ ...A, vars }, d) : ""; }
function f31Text() {
  const { A, vars } = finalArch(); if (!vars.length) return "";
  const d = dgSeed(DEFS.fa31.fields[0], {});
  if (!d.edges.length) return "";
  return archText({ ...A, vars }, d);
}
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
    { id: "q-draft", no: "", title: "修訂論文", desc: "補強：段落還缺東西時使用，字數不減。精簡：內容齊全但太冗長，字數必須減少，可設定目標長度。整節統整：整節去除重複、調整段落順序與邏輯。融合：把幾段合併成一段。都會先核實引用，任何一章都可以用。", steps: [
      { mod: "dr", note: "先在上方「改寫方向」選擇做法。補強、精簡一次一段；整節統整會自動帶入本節全文；融合可選多段。" }] },
    { id: "q-var", no: "", title: "變數定義", desc: "步驟 1 深入了解單一變數：定義、維度、理論、操作型定義與量表、施測情境、前因與後果、相近構念。步驟 2 區辨相近變數：兩個以上的變數看起來很像時，分辨它們在研究架構上的異同。任何階段都可以用。", steps: [
      { mod: "vdeep", note: "一次問一個變數；文獻不足時，先針對這個變數補上傳文獻再問。「施測情境」常因原文只簡短交代而標示「未提及」，請回到原文的方法章節或附錄查看。" },
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
      { mod: "asq", note: "研究方法為問卷調查法或實驗設計法時使用：產出問卷草稿，並評估題數、樣本數、量表與施測風險；panel data 可跳過。", go: [{ to: "s0-7", step: 0, when: "研究設計完成，擬定論文題目" }, { to: "s3-3", step: 0, when: "正式撰寫量表與操作型定義時" }] }] },
    { id: "s0-7", no: "0.5", title: "論文題目", desc: "依確定的研究架構擬定中英文論文題目：AI 提出候選題目並比較優缺點，再由你定稿；定稿題目會成為論文草稿檔的標題。", steps: [
      { mod: "ttl", note: "可接在 0.3 或 0.4 的同一個 NotebookLM 對話；定稿題目填在最下方。", go: [{ to: "s1-1", step: 0, when: "題目定稿後，開始撰寫第一章緒論" }] }] }
  ] },
  { ch: "第一章 緒論", secs: [
    { id: "s1-1", no: "1.1", title: "研究動機", desc: "由產業與平台背景逐步收斂到研究缺口（期刊式引言）。", steps: [
      { mod: "bgplan", rules: ["citation", "ch1"], note: "先看相關文獻怎麼寫研究背景與動機：必寫的要素、要放幾點統計數據、從理論或從實務資料切入，並整理出幾種寫法供你選擇。" },
      { mod: "asp", note: "依選定的寫法查台灣的統計與實務資料：把選定寫法的段落大綱與{#archchk}的回覆交給有網路搜尋的 AI，寫成研究情境、實務問題與實務缺口，並整理台灣統計資料。" },
      { mod: "bg", rules: ["citation", "style", "verify", "ch1"], note: "依選定的寫法撰寫；研究主題、選定的寫法、背景資料與研究缺口會自動帶入。" }], finish: FIN_FULL },
    { id: "s1-2", no: "1.2", title: "研究目的", desc: "承接 1.1 的研究缺口，參考文獻的寫法說明本研究的整體目的與檢驗重點；不另寫研究問題。", steps: [
      { mod: "purpose", rules: ["citation", "style", "ch1"], note: "研究架構（假說清單）由架構圖自動帶入，請補上預期方向；研究缺口自動帶入 1.1 定稿的最後一段。貼到寫 1.1 的同一個 NotebookLM 對話。" }], finish: FIN_POLISH },
    { id: "s1-3", no: "1.3", title: "研究範圍", desc: "界定研究的情境、對象與變數邊界。", steps: [
      { mod: "scope", rules: ["citation", "style", "ch1"], note: "研究題目、研究架構、研究情境與研究對象會自動帶入；可補充要排除的範圍。" }], finish: FIN_FULL },
    { id: "s1-4", no: "1.4", title: "研究流程", desc: "說明研究的主要階段與各章安排；建議第三章定稿後再寫（碩論特有小節，投稿期刊時可整段刪除）。", steps: [
      { mod: "flow", rules: ["style"], note: "建議在第三章定稿後（或全文完成後）再寫：各章定稿摘要會自動帶入，貼到一般 AI 即可。" }], finish: FIN_FULL }
  ] },
  { ch: "第二章 文獻探討", secs: [
    // 各節由 rebuildCh2() 依「第二章架構」產生
  ] },
  { ch: "第三章 研究方法", secs: [
    { id: "s3-1", no: "3.1", title: "研究架構", desc: "畫出研究架構圖。", steps: [
      { mod: "fa31", note: "由 0.3 的研究架構帶入架構圖，微調後下載 PNG；再產生撰寫 3.1 段落的 Prompt。" },
      { mod: "m7a", note: "選用：需要 Mermaid 格式的架構圖時，貼上描述研究架構的文字，請 NotebookLM 畫成 Mermaid 圖。" },
      { mod: "m7b", note: "把回覆補好圍籬，貼進 Obsidian 或轉成圖片。" }] },
    { id: "s3-2", no: "3.2", title: "研究假說", desc: "列出本研究的假說；推導寫在第二章各變數一節。", steps: [
      { mod: "hylist", note: "從第二章各變數一節取出每一條假說敘述，按「放入本節定稿」即可。" }], finish: FIN_FULL },
    { id: "s3-3", no: "3.3", title: "操作型定義與衡量", desc: "構念定義與量表來源。", steps: [
      { mod: "m5d", note: "選用：需要名詞釋義時使用（原第一章 1.3）。列出要釋義的構念；產出的四面向解釋取「定義」部分改寫成名詞釋義。" },
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
  ] },
  { ch: "論文整理", secs: [
    { id: "q-newlit", no: "", title: "補入新文獻", desc: "第二章寫到一半又找到新文獻時使用：判斷新文獻該放進哪一節，並與同主題的代表文獻比較。", steps: [
      { mod: "m8" }] },
    { id: "q-full", no: "", title: "論文全文", desc: "依章節顯示各節的定稿（就是「研究名稱_論文.md」的內容）；各節的定稿可在該節最下方的「本節論文內容」查看與修改。", steps: [
      { mod: "fulltext", note: "定稿來自各節撰寫步驟的正文，修訂論文（補強、精簡、整節統整、融合）後可取代為改寫版。" }] },
    { id: "q-ref", no: "", title: "參考文獻", desc: "掃描各節定稿中的行內引用，從各步驟的 AI 回覆中找出完整出處；請逐筆核對或填入，論文.md 最後會附上依 APA 第七版排序的參考文獻。", steps: [
      { mod: "refs", note: "中文文獻在前（依筆畫）、英文文獻在後（依字母）。自動帶入的出處請務必核對原文。" }] },
    { id: "q-tb", no: "", title: "待補資料查證", desc: "集中列出第一章到第五章各節定稿中所有【待補資料】【待補文獻】【待補引用】【待補量表】，查證後直接填入；論文.md 會以填入的內容取代標記。", steps: [
      { mod: "tbfill", note: "可隨時回來填寫；AI 回覆更新後，清單會自動重新整理。" }] },
    { id: "q-ch1g", no: "", title: "第一章寫作規範", desc: "整理自「如何寫論文」筆記本（畢恆達、Evans et al.、Swales CARS 模型等）：第一章的組成、各節寫作邏輯、該寫與不該寫、常見錯誤與精簡版規範。精簡版會自動附在第一章各步驟的 Prompt 中。", steps: [
      { mod: "ch1guide", note: "第一章各節上方也有「本節寫作規範」可展開查看。" }] }
  ] }
];

const FINISH_NOTE = {
  dr: "先在上方「改寫方向」選擇做法。補強、精簡、融合：在「本節論文內容」反白要修改的文字（可跨段落；反白範圍內的重複會一併合併）；整節統整會自動帶入本節全文。",
  polish: "完稿：潤色語句，或去除 AI 味。"
};
THESIS_SECS().forEach(s => { s.finish = FIN_FULL; });   // 第一～五章每一節都有「修訂論文」與「潤色與去 AI 味」兩個完稿步驟
let ALL_SECS = OUTLINE.flatMap(c => c.secs);
// ── 第二章：依「第二章架構」產生各節（理論基礎 → 各變數一節；假說在影響方變數的一節推導）──
function ch2Default() {
  const { vars, d } = finalArch(); if (!vars.length || !d.edges.length) return "";
  const nm = v => (v.name || v.key).replace(/\s*[（(][^（）()]*[）)]\s*$/, "").trim();
  const outs = new Set(d.edges.map(e => e.from)), ins = new Set(d.edges.map(e => e.to)), mods = new Set(d.mods.map(m => m.from));
  const role = k => !ins.has(k) ? 2 : !outs.has(k) ? 0 : 1;   // 依變數在前（0）、中介（1）、前因與調節（2）
  const used = vars.filter(v => outs.has(v.key) || ins.has(v.key) || mods.has(v.key)), groups = [];
  used.forEach(v => { const n = nm(v), base = n.replace(/^[^型]{1,3}型/, "") || n, g = groups.find(x => x.base === base);
    if (g) g.vars.push(n); else groups.push({ base, vars: [n], role: role(v.key) }); });
  return groups.sort((a, b) => a.role - b.role).map(g => `${g.vars.length > 1 ? g.base : g.vars[0]}：${g.vars.join("、")}`).join("\n");
}
function idOf(t) { let h = 5381; for (const ch of t) h = ((h << 5) + h + ch.charCodeAt(0)) | 0; return (h >>> 0).toString(36); }
function ch2Plan() {   // [{ title, vars, names }]：第二章架構的每一行
  const ready = typeof store !== "undefined";
  return String((ready && (store.values.ch2_plan || "").trim()) || (ready ? ch2Default() : "")).split("\n")
    .map(l => l.trim()).filter(Boolean).map(l => { const [t, v] = l.split(/[：:]/); const title = t.trim(), vars = (v || t).trim();
      return { title, vars, names: [...new Set([title, ...vars.split(/[、，,／/]/)].map(x => x.trim()).filter(Boolean))] }; });
}
const hypLines = () => String((typeof store !== "undefined" && (store.values.hy_paths || "").trim()) || (typeof store !== "undefined" ? archHyp() : "")).split("\n").map(l => l.trim()).filter(Boolean);
// 假說歸屬：影響方變數所在的節。句中最早出現的變數即影響方（直接效果 X → Y、「M 中介…」、「Z 調節…」）；「X 透過 M 影響 Y」取 M
function hypHost(line, plan) {
  let body = line.replace(/^H\d+[a-z]?\s*[：:]\s*/, "");
  const via = body.match(/(?:透過|經由)(.*)$/); if (via) body = via[1];
  let best = -1, pos = Infinity, len = 0;
  plan.forEach((x, i) => x.names.forEach(n => { const k = body.indexOf(n); if (k >= 0 && (k < pos || (k === pos && n.length > len))) { best = i; pos = k; len = n.length; } }));
  return best;
}
function ch2HypMap() { const plan = ch2Plan(), by = plan.map(() => []), un = []; hypLines().forEach(l => { const h = hypHost(l, plan); (h >= 0 ? by[h] : un).push(l); }); return { plan, by, un }; }
const ch2SecHyps = sid => ((ALL_SECS.find(s => s.id === sid) || {}).hyps || []);
function hypRenumber() {
  const plan = ch2Plan(), ls = hypLines(); if (!ls.length) return "沒有研究假說可以重新編號。";
  const rows = ls.map((l, i) => ({ l, i, h: hypHost(l, plan), m: l.match(/^H(\d+)([a-z]?)\s*[：:]\s*/) }));
  if (rows.some(r => !r.m)) return "有假說不是以「H1：」的形式開頭，無法自動重新編號。";
  rows.sort((a, b) => (a.h < 0 ? 1e9 : a.h) - (b.h < 0 ? 1e9 : b.h) || a.i - b.i);
  const map = new Map(); let n = 0;
  store.values.hy_paths = rows.map(r => { if (!map.has(r.m[1])) map.set(r.m[1], ++n); return `H${map.get(r.m[1])}${r.m[2]}：${r.l.slice(r.m[0].length)}`; }).join("\n");
  // 論文內容中的假說編號一併更新：先依假說敘述的變數對照現行清單（可修正先前重新編號後仍留在正文的舊編號），其餘依本次的新舊編號對照
  const align = hypAlign(); map.forEach((w, o) => { if (!align.has(o)) align.set(o, w); });
  const moved = [...align].filter(([o, w]) => +o !== w), done = [];
  if (moved.length) THESIS_SECS().forEach(sc => {
    const t = finText(sc.id); if (!t) return;
    const u = t.replace(/(?<![A-Za-z])H(\d+)(?!\d)/g, (x, d) => align.has(d) ? "H" + align.get(d) : x);   // 單次替換，不會連鎖誤換
    if (u !== t) { setFin(sc.id, u); done.push(sc.no || sc.title); }
  });
  rebuildCh2(); if (typeof renderToc === "function") renderToc();
  return "已依章節順序重新編號；1.2、3.5、4.3 也會使用新的編號。" + (done.length ? `論文內容中的假說編號已一併更新：${done.join("、")}。` : moved.length ? "論文內容中沒有需要更新的假說編號。" : "編號原本就已依章節順序排列。");
}
// 正文中的假說敘述（Hn：……）依其中的變數與順序，對照現行假說清單，得到 舊編號 → 現行編號
function hypAlign() {
  const names = [...new Set(ch2Plan().flatMap(x => x.vars.split(/[、，,／/]/).map(v => v.trim()).filter(Boolean)))];
  const key = t => names.map(n => [t.indexOf(n), n]).filter(([k]) => k >= 0).sort((a, b) => a[0] - b[0]).map(([, n]) => n).join("|");
  const cur = new Map(); hypLines().forEach(l => { const m = l.match(/^H(\d+)[a-z]?\s*[：:]\s*(.*)$/); if (m) { const k = key(m[2]); if (k) cur.set(k, cur.has(k) ? null : +m[1]); } });
  const out = new Map(), bad = new Set(), ch = OUTLINE.find(c => /^第二章/.test(c.ch));
  (ch ? ch.secs : []).filter(x => !x.setup).forEach(sc => finText(sc.id).split("\n").forEach(l => {
    const m = l.match(/(?:^|[\s，。；：「（])H(\d+)[a-z]?\s*[：:]\s*(.+)$/); if (!m) return;
    const w = cur.get(key(m[2])); if (!w) return;
    if (out.has(m[1]) && out.get(m[1]) !== w) bad.add(m[1]); else out.set(m[1], w);
  }));
  bad.forEach(o => out.delete(o));
  return out;
}
function ch2PrevHtml() {
  const { un } = ch2HypMap(), secs = secsOf(OUTLINE.find(c => /^第二章/.test(c.ch)));
  return `<ol class="ch2prev">${secs.map(s => `<li><b>${esc(s.no)}</b> ${esc(s.title)}${(s.hyps || []).length ? `<br><small>推導：${esc(s.hyps.map(h => (h.match(/^H\d+[a-z]?/) || [h.slice(0, 12)])[0]).join("、"))}</small>` : ""}</li>`).join("")}</ol>` +
    (un.length ? `<p class="note warn">下列假說找不到對應的節（假說中的變數名稱要與上方各節的變數一致）：<br>${un.map(esc).join("<br>")}</p>` : "") +
    `<p class="hint">同一構念的不同面向會在該節以子標題分開。節名或變數改動後，原本那一節的內容會保留在研究存檔中，但不會出現在新的節名下。</p>`;
}
function rebuildCh2() {
  const ch = OUTLINE.find(c => /^第二章/.test(c.ch)); if (!ch) return;
  const { plan, by } = ch2HypMap();
  const R2 = ["citation", "style", "ch2"], seen = new Set();
  ch.secs = [
    { id: "s2-0", no: "", title: "第二章架構", setup: true, desc: "設定第二章的分節與研究假說：理論基礎、各變數一節；每條假說在其影響方變數的一節推導。", steps: [{ mod: "ch2plan" }] },
    { id: "s2-th", no: "2.1", title: "理論基礎", desc: "以統攝的理論說明各變數之間的機制。", steps: [{ mod: "ch2th", rules: R2, note: "理論可自行指定，或留白請 NotebookLM 依相近文獻建議。" }] },
    ...plan.map((x, i) => { let id = "s2-" + idOf(x.vars.replace(/\s/g, "")); while (seen.has(id)) id += "x"; seen.add(id);
      const hy = by[i], hn = hy.map(h => (h.match(/^H\d+[a-z]?/) || [""])[0]).filter(Boolean);
      return { id, no: `2.${i + 2}`, title: x.title, hyps: hy, desc: `本節涵蓋：${x.vars}。依序撰寫定義、面向、相關理論、前因與後果、衡量方式${hy.length ? `，接著推導${hn.length ? " " + hn.join("、") + " " : "本節的假說"}` : ""}。`,
        steps: [{ mod: "ch2var", rules: hy.length ? [...R2, "evidence"] : R2, preset: { cv_title: x.title, cv_vars: x.vars }, note: hy.length ? "節名、變數與本節要推導的假說由「第二章架構」帶入；研究題目與架構各節共用。" : "節名與變數由「第二章架構」帶入；本節沒有分配到假說，只介紹構念。" }] }; })
  ];
  ch.secs.forEach(s => { if (!s.setup) s.finish = FIN_FULL; });
  ALL_SECS = OUTLINE.flatMap(c => c.secs);
}
rebuildCh2();
// 第二章：理論基礎與各變數一節的 Prompt（規則過長時分則）
function thParts(p) { return blank(p.cv_arch) ? [] : ruleSplit("ch2th", p, T.ch2th({ arch: p.cv_arch.trim(), theory: (p.th_theory || "").trim(), title: (s => s ? `${s.no} ${s.title}` : "理論基礎")(sec && sec()) }), "理論基礎"); }
function cvParts(p) { return blank(p.cv_arch) || blank(p.cv_vars) ? [] : ruleSplit("ch2var", p, T.ch2var({ arch: p.cv_arch.trim(), vars: p.cv_vars.trim(), hyps: ch2SecHyps((sec && sec() || {}).id).join("\n"), scale: cvScale(p.cv_vars), title: `${(sec && sec() || {}).no || ""} ${p.cv_title || ""}`.trim() }), p.cv_title || "本節"); }
// 第二章各變數一節：本節變數在 0.4 定稿問卷中的量表（出處、題數、量尺）
function cvScale(vars) {
  const F = finalSurvey(); if (!F) return "";
  const vs = String(vars || "").split(/[、，,／/]/).map(x => x.trim()).filter(Boolean);
  const cs = F.cons.filter(c => vs.some(v => c.name === v || c.name.startsWith(v) || v.startsWith(c.name.replace(/\s*[（(].*$/, ""))));
  return cs.map(c => `- ${c.name}：${c.src || "出處未填"}${c.items.length ? `，${c.items.length} 題` : ""}${F.scale ? `，${F.scale}` : ""}`).join("\n");
}
// 3.2 研究假說：從第二章各變數一節的論文內容取出假說敘述（舊版「研究假說之推導」的回覆也一併讀取）
function hlItems() {
  const ch = OUTLINE.find(c => /^第二章/.test(c.ch)), src = (ch ? ch.secs : []).filter(s => !s.setup).map(s => finText(s.id));
  let old = deLatex(String((store.replies || {})["s2-hy|hypo"] || "")); const cut = old.search(VERIFY_HEAD); if (cut >= 0) old = old.slice(0, cut);
  const m = new Map();
  [...src, old].join("\n").replace(/\*\*/g, "").split(/\r?\n/).forEach(l => { const x = l.match(/(?:^|[\s，。；：「（])(H\d+[a-z]?)\s*[：:]\s*(.+)$/) || l.trim().replace(/^[-*•]\s*/, "").match(/^(H\d+[a-z]?)\s*[：:]\s*(.+)$/);
    if (x && !m.has(x[1])) m.set(x[1], `${x[1]}：${x[2].trim()}`); });
  const num = k => { const r = k.match(/^H(\d+)([a-z]?)/); return +r[1] * 100 + (r[2] ? r[2].charCodeAt(0) - 96 : 0); };
  return [...m.keys()].sort((a, b) => num(a) - num(b)).map(k => m.get(k));
}
function hlText() { const it = hlItems(); return it.length ? "依據第二章的推導，本研究提出以下假說：\n\n" + it.join("\n") : ""; }
function hlView() { const it = hlItems(); return it.length ? `<ol class="hlist">${it.map(x => `<li>${esc(x)}</li>`).join("")}</ol>` : `<p class="hint">第二章各變數一節還沒有出現「H1：……」形式的假說敘述。</p>`; }
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
