// ============ 表单 DOM 抽取 ============
// 输出顶层字段 fields（text/textarea/date/select/radiogroup/checkbox/dropdown）
// 和重复段落 repeaters（同构兄弟块 + 「添加」按钮 + 块内字段的相对路径）。
// 与外挂版不同：插件直接持有元素引用，块内字段另存 relPath 便于定位第 i 块。

function fwVisible(el) {
  if (!el || !el.getClientRects || !el.getClientRects().length) return false;
  const st = getComputedStyle(el);
  return st.visibility !== "hidden" && st.display !== "none";
}

// 参与段落/字段识别的可填控件：排除 radio/checkbox，
// 否则「单选组」「并排日期格」会被误判成重复段落
const FW_CONTROL_FILL =
  'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=file]):not([type=radio]):not([type=checkbox]),textarea,select';

function fwKindOf(el) {
  if (el.tagName === "SELECT") return "select";
  if (el.tagName === "TEXTAREA") return "textarea";
  if (el.tagName === "INPUT") {
    const t = (el.getAttribute("type") || "text").toLowerCase();
    if (["date", "datetime-local", "month"].includes(t)) return "date";
    if (t === "checkbox") return "checkbox";
    return "text";
  }
  return "text";
}

function fwSigOf(el, label, type) {
  const name = (el.getAttribute("name") || "").replace(/\d+/g, "{i}");
  const id = (el.id || "").replace(/\d+/g, "{i}");
  return label + "|" + name + "|" + id + "|" + type;
}

  function fwRelPath(root, el) {
    // 块内相对选择器：新增块是克隆的，结构一致，用它定位第 i 块里的同名控件
    const parts = [];
    let node = el;
    while (node && node !== root) {
      let sel = node.tagName.toLowerCase();
      let sib = node, nth = 1;
      // 同 fwCssPath：nth-of-type 按「同标签兄弟」计数
      while ((sib = sib.previousElementSibling)) {
        if (sib.tagName === node.tagName) nth++;
      }
      sel += ':nth-of-type(' + nth + ')';
      parts.unshift(sel);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

// ---------- label 识别 ----------
function fwCleanCloneText(grp) {
  const c = grp.cloneNode(true);
  c.querySelectorAll('input,textarea,select,button,[class*="trigger"],[class*="value"],[class*="placeholder"],[class*="options"],[class*="menu"]')
    .forEach((n) => n.remove());
  return (c.innerText || c.textContent || "").replace(/\s+/g, " ").trim();
}

function fwGroupText(el) {
  const grp = el.closest(".form-group, .ant-form-item, .el-form-item, .field, .form-item, .form-item-wrap, td, li, .item");
  if (!grp) return "";
  if (grp.querySelectorAll("input:not([type=hidden]),textarea,select").length > 1) return ""; // 一组多控件时文本不可信
  return fwCleanCloneText(grp).slice(0, 60);
}

function fwSiblingText(el) {
  let node = (el.closest("label") || el).parentElement;
  for (let i = 0; i < 4 && node; i++) {
    let p = node.previousElementSibling;
    while (p) {
      const t = (p.innerText || "").replace(/\s+/g, " ").trim();
      if (t) return t.slice(0, 60);
      p = p.previousElementSibling;
    }
    node = node.parentElement;
  }
  return "";
}

// 表格型段落（如家庭成员）：单元格里的控件没有 label，
// 取它所在列的表头（thead 或首行）文本作为 label
function fwTableColumnLabel(el) {
  const cell = el.closest("td,th");
  if (!cell) return "";
  const row = cell.parentElement;
  const table = cell.closest("table");
  if (!table || !row) return "";
  const idx = Array.prototype.indexOf.call(row.children, cell);
  const headRow = table.tHead && table.tHead.rows.length ? table.tHead.rows[0] : table.rows[0];
  if (!headRow || headRow === row) return "";
  const th = headRow.children[idx];
  if (!th) return "";
  const t = (th.innerText || "").replace(/\s+/g, " ").trim();
  return t.slice(0, 60);
}

function fwLabelFor(el) {
  if (el.id) {
    const esc = window.CSS && CSS.escape ? CSS.escape(el.id) : el.id;
    const l = document.querySelector('label[for="' + esc + '"]');
    if (l && l.innerText.trim()) return l.innerText.replace(/\s+/g, " ").trim().slice(0, 60);
  }
  const lab = el.closest("label");
  if (lab) {
    const t = (lab.innerText || "").replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, 60);
  }
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim().slice(0, 60);
  const title = el.getAttribute("title");
  if (title && title.trim() && el.tagName === "INPUT") return title.trim().slice(0, 60); // 并排日期框等靠 title 区分
  const tbl = fwTableColumnLabel(el);
  if (tbl) return tbl;
  const gt = fwGroupText(el);
  if (gt) return gt;
  const st = fwSiblingText(el);
  if (st) return st;
  return el.getAttribute("placeholder") || "";
}

function fwRadioOptionLabel(r) {
  if (r.id) {
    const esc = window.CSS && CSS.escape ? CSS.escape(r.id) : r.id;
    const l = document.querySelector('label[for="' + esc + '"]');
    if (l && l.innerText.trim()) return l.innerText.replace(/\s+/g, " ").trim();
  }
  const lab = r.closest("label");
  if (lab) return (lab.innerText || "").replace(/\s+/g, " ").trim() || String(r.value || "").trim();
  return String(r.value || "").trim();
}

// ---------- Moka HR (mokahr.com) 站点适配 ----------
// Moka 的可重复模块不是「克隆块」：每个字段是独立的 div.apply-field 平铺在
// div.apply-fields.multi 容器里，第 N 条经历 = 各字段标题的第 N 次出现。
// 这里生成「虚拟段落」：locateField(第几条, 字段) 按标题第 N 次出现定位控件。

function fwMokaTitleOf(fd) {
  const t = fd.querySelector('[class*="title"]');
  return t ? (t.innerText || "").replace(/\s+/g, " ").trim() : "";
}

function fwMokaInputs(fd) {
  return [...fd.querySelectorAll("input, textarea")].filter((el) => {
    const t = (el.getAttribute("type") || "text").toLowerCase();
    return !["hidden", "checkbox", "radio", "file", "submit", "button"].includes(t) && fwVisible(el);
  });
}

function fwMokaIsDropdown(fd) {
  return !!fd.querySelector('[class*="Select-container"]');
}

function fwDetectMoka(repeaters, mokaContainers) {
  const containers = [...document.querySelectorAll('div[class*="apply-fields"]')]
    .filter((c) => /multi/.test(c.className) && fwVisible(c) && c.querySelector('[class*="apply-field"]'));
  containers.forEach((container, orderIdx) => {
    try {
      const titleOf = (fd) => {
        const t = fd.querySelector('[class*="title"]');
        return t ? (t.innerText || "").replace(/\s+/g, " ").trim() : "";
      };
      // 一条记录的字段序列：按文档序走到第一个重复标题为止（快照阶段取一次）
      const defs = [];
      const seen = new Set();
      for (const fd of [...container.querySelectorAll('div[class*="apply-field"]')]) {
        const title = fwMokaTitleOf(fd);
        if (!title || seen.has(title)) break;
        seen.add(title);
        const inputs = fwMokaInputs(fd);
        const isDD = fwMokaIsDropdown(fd);
        inputs.forEach((inp, sub) => {
          defs.push({
            mokaTitle: title, sub,
            style: isDD ? "dropdown" : fwKindOf(inp),
            splitDate: inputs.length > 1, // 年/月拆分的日期
            label: title + (inputs.length > 1 ? (sub === 0 ? "（年）" : "（月）") : ""),
          });
        });
      }
      if (!defs.length) return;
      const firstTitle = defs[0].mokaTitle;
      const defTitles = defs.map((d) => d.mokaTitle);
      // 防过期：React 重渲染会整体替换模块节点，提取时抓的引用会全部失效。
      // 所有查找都在调用时从当前文档重新解析：
      // 容器按「字段标题集合」匹配，匹配不到再按提取时的序号兜底
      const findContainer = () => {
        const cs = [...document.querySelectorAll('div[class*="apply-fields"]')]
          .filter((c) => /multi/.test(c.className) && fwVisible(c));
        for (const c of cs) {
          const titles = new Set(
            [...c.querySelectorAll('[class*="title"]')].map((t) => (t.innerText || "").replace(/\s+/g, " ").trim())
          );
          if (defTitles.length && defTitles.every((t) => titles.has(t))) return c;
        }
        return cs[orderIdx] || null;
      };
      const findAddBtn = (c) => {
        let root = c ? c.parentElement : null;
        for (let up = 0; up < 3 && root; up++) {
          let found = null;
          root.querySelectorAll("button, a, span, [role=button]").forEach((b) => {
            if (found || (c && c.contains(b)) || !fwVisible(b)) return;
            const txt = (b.innerText || b.title || "").replace(/\s+/g, " ").trim();
            if (txt && txt.length <= 8 && /^(添加|新增|增加)/.test(txt)) found = b;
          });
          if (found) return found;
          root = root.parentElement;
        }
        return null;
      };
      const entryCount = () => {
        const c = findContainer();
        if (!c) return 0;
        return [...c.querySelectorAll('div[class*="apply-field"]')]
          .filter((fd) => fwMokaTitleOf(fd) === firstTitle).length;
      };
      const rep = {
        key: "m" + repeaters.length,
        sig: "moka|" + defTitles.join("/"),
        addBtn: findAddBtn(container),
        addText: "",
        theme: null,
        count: entryCount(),
        // ensure_count 每次尝试前重新找按钮（重渲染后旧按钮会作废）
        getAddBtn: function () {
          const c = findContainer();
          return c ? findAddBtn(c) : null;
        },
        getItems: function () {
          return Array.from({ length: entryCount() }, (_, i) => ({ __mokaEntry: i }));
        },
        locateField: function (itemIdx, field) {
          const c = findContainer();
          if (!c) return null;
          const divs = [...c.querySelectorAll('div[class*="apply-field"]')]
            .filter((fd) => fwMokaTitleOf(fd) === field.mokaTitle);
          const fd = divs[itemIdx];
          if (!fd) return null;
          const inputs = fwMokaInputs(fd);
          return inputs[field.sub] || inputs[0] || null;
        },
        fields: [],
      };
      const addBtnEl = rep.getAddBtn();
      rep.addText = addBtnEl ? ((addBtnEl.innerText || addBtnEl.title || "添加") + "").replace(/\s+/g, " ").trim() : "";
      defs.forEach((d, i) => {
        rep.fields.push({
          key: "mf" + i, el: null, relPath: null,
          style: d.style, tag: d.style === "dropdown" ? "div" : "input",
          id: "", name: "",
          label: d.label, placeholder: "",
          required: false, options: null,
          mokaTitle: d.mokaTitle, sub: d.sub, splitDate: d.splitDate,
          sig: d.label + "|" + d.mokaTitle + "|" + d.style,
        });
      });
      const themeText = rep.addText + " " + rep.fields.map((f) => f.label).join(" ");
      rep.theme = fwMatchRepeaterTheme(themeText);
      repeaters.push(rep);
      mokaContainers.push(container);
    } catch (e) { /* 单模块失败不影响其他模块 */ }
  });
}

// ---------- 重复段落识别：同 tag+class 的兄弟块，块内 >=2 个控件 ----------
// 「添加」按钮是全局配对的：多个段落时按 DOM 顺序与段落一一对应，避免把
// 「添加获奖记录」误配给实习段落（旧版按文案最短挑选会配错）。
const FW_ADD_PAT = /(添加|新增|增加|追加|录入|append|add)/i;
const FW_PLUS_ONLY = /^[+＋]\s*$/; // 纯「＋」图标按钮
const FW_ADD_CLASS = /(add|plus|append|create|increase|insert)/i;

function fwCollectAddCandidates(itemEls, CONTROL) {
  const out = [];
  document.querySelectorAll(
    "button, a, span, div, i, em, p, [role=button], input[type=button], input[type=submit]"
  ).forEach((b) => {
    if (!fwVisible(b)) return;
    if (b.querySelector(CONTROL)) return; // 不是纯按钮
    const txt = (b.innerText || b.value || b.title || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (!txt || txt.length > 14) return;
    const meta = (b.getAttribute("class") || "") + " " + (b.title || "") + " " + (b.getAttribute("aria-label") || "");
    const plusOnly = FW_PLUS_ONLY.test(txt);
    if (plusOnly) {
      // 纯「＋」必须带 add-ish 类名/标注，避免把折叠开关、数量步进器当成添加
      if (!FW_ADD_CLASS.test(meta)) return;
    } else if (!FW_ADD_PAT.test(txt)) {
      return;
    }
    // 条目内部的按钮需要更强信号（条目里常有「添加附件」这类干扰）；
    // 但最后一个条目里的添加按钮是常见布局，文案明确时放行
    const inItem = itemEls.some((x) => x.contains(b));
    if (inItem) {
      const strongText = /添加\s*(一条|新)?\s*(教育|工作|实习|项目|获奖|竞赛|语言|研究|游戏|成员|经历|记录|能力|活动|实践|成果)/.test(txt);
      if (!FW_ADD_CLASS.test(meta) && !strongText) return;
    }
    const innerChildFilterRemoved = true; // 旧「子元素文本像添加就跳过」过滤会误杀文字包 span 的样式化按钮，已废弃
    void innerChildFilterRemoved;
    // 非交互元素的去重：内部已有真按钮 / 自己包着真按钮的，都让位给 <button>/<a>/<role=button>
    const isInteractive = b.tagName === "BUTTON" || b.tagName === "A" || b.tagName === "INPUT" || b.getAttribute("role") === "button";
    if (!isInteractive) {
      if (b.closest("button, a, [role=button]")) return;        // 是按钮内部的内容 span
      if (b.querySelector("button, a, [role=button]")) return;  // 是包着按钮的外层容器
    }
    out.push({ el: b, txt });
  });
  return out;
}

function fwDomOrder(a, b) {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

function fwCollectItemFields(item) {
  const CONTROL = FW_CONTROL_FILL;
  const fields = [];
  item.querySelectorAll(CONTROL).forEach((el) => {
    if (!fwVisible(el)) return;
    const kind = fwKindOf(el);
    const label = fwLabelFor(el);
    fields.push({
      key: "if" + fields.length, el, relPath: fwRelPath(item, el),
      style: kind, tag: el.tagName.toLowerCase(),
      id: el.id || "", name: el.getAttribute("name") || "",
      label, placeholder: el.getAttribute("placeholder") || "",
      required: !!el.required || el.getAttribute("aria-required") === "true",
      options: el.tagName === "SELECT" ? Array.from(el.options).map((o) => (o.text || "").trim()).filter(Boolean) : null,
      sig: fwSigOf(el, label, kind),
    });
  });
  // 块内自定义下拉触发器（element/antd 风格）
  item.querySelectorAll('[role=combobox],[class*="select"],[class*="cascader"]').forEach((el) => {
    if (el.matches("select,input,textarea,button,label")) return;
    if (!fwVisible(el)) return;
    if (el.querySelector('[role=combobox],[class*="select"],[class*="cascader"]')) return; // 取最内层触发器
    if (fields.some((f) => f.el === el)) return;
    const label = fwLabelFor(el);
    fields.push({
      key: "if" + fields.length, el, relPath: fwRelPath(item, el),
      style: "dropdown", tag: "div", id: el.id || "", name: "",
      label, placeholder: "", required: false, options: null,
      sig: fwSigOf(el, label, "dropdown"),
    });
  });
  return fields;
}

function extractForm() {
  const CONTROL = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=file]),textarea,select';

  // ---------- 重复段落 ----------
  const repeaters = [];
  let excludeParents = [];
  let softRepeaters = [];
  // 站点适配器先行：Moka HR 的模块结构特殊（字段平铺、按标题第 N 次出现分条），
  // 由适配器生成虚拟段落；其容器从标准检测与顶层字段中排除
  const mokaContainers = [];
  fwDetectMoka(repeaters, mokaContainers);
  (function detect() {
    const seen = new Set();
    const groups = [];
    document.querySelectorAll("body *").forEach((el) => {
      if (mokaContainers.some((c) => c.contains(el))) return; // Moka 适配器已接管
      if (el.matches(CONTROL + ",button,a,label,option,template")) return;
      const cls = (typeof el.className === "string" ? el.className : (el.getAttribute("class") || "")).trim();
      if (!cls) return;
      const parent = el.parentElement;
      if (!parent || parent === document.body) return;
      const same = (c) => c.tagName === el.tagName && (typeof c.className === "string" ? c.className : (c.getAttribute("class") || "")).trim() === cls;
      const items = Array.from(parent.children).filter(same);
      if (items.length === 0 || items[0] !== el) return; // 每组只在首块登记
      const key = parent.tagName + "|" + el.tagName + "|" + cls;
      if (seen.has(key)) return;
      seen.add(key);
      if (el.querySelectorAll(FW_CONTROL_FILL).length < 2) return; // 单控件包装不算段落
      groups.push({ el, parent, cls, items });
    });
    // 外层优先：嵌套在已收条目内部的组丢弃
    const kept = [];
    groups.forEach((g) => {
      const nested = kept.some((a) => a.items.some((it) => it.contains(g.el)));
      if (!nested) kept.push(g);
    });

    // 「添加」按钮全局配对：候选按钮与段落都按 DOM 顺序排，一一对应。
    // 注意按钮可能在最后一个条目内部（常见布局），所以条目只用于区分
    // 「条目内部的按钮需要更强信号」，而不是一刀切排除
    const itemEls = kept.flatMap((g) => g.items);
    const cands = fwCollectAddCandidates(itemEls, CONTROL);
    kept.sort((a, b) => fwDomOrder(a.el, b.el));
    cands.sort((x, y) => fwDomOrder(x.el, y.el));
    const btnFor = new Map();
    if (cands.length && cands.length === kept.length) {
      kept.forEach((g, i) => btnFor.set(g, cands[i]));
    } else {
      // 数量对不上：每个段落取 DOM 序在其条目之后的最近一个候选
      const used = new Set();
      kept.forEach((g) => {
        const last = g.items[g.items.length - 1];
        const after = cands.find((c) => !used.has(c) && fwDomOrder(last, c.el) < 0 && !used.has(c));
        const pick = after || cands.find((c) => !used.has(c));
        if (pick) { used.add(pick); btnFor.set(g, pick); }
      });
    }

    // 候选段落过滤：
    // - 吞下页面九成以上可填控件的单块容器（SPA 根节点）=> 拒绝
    // - 其余单块但没有「添加」按钮的 => 也不当段落（字段按顶层处理），
    //   但记录到 softRepeaters，供面板/控制台提示「这里疑似可扩展段落但没认出按钮」
    const pageControlCount = document.querySelectorAll(FW_CONTROL_FILL).length;
    const soft = [];
    const real = kept.filter((g) => {
      if (g.items.length !== 1) return true;
      const own = g.el.querySelectorAll(FW_CONTROL_FILL).length;
      const share = pageControlCount > 0 ? own / pageControlCount : 0;
      if (share >= 0.9) return false;
      if (!btnFor.get(g)) {
        soft.push({
          cls: g.cls,
          labels: fwCollectItemFields(g.items[0]).map((f) => f.label).slice(0, 8),
        });
        return false;
      }
      return true;
    });

    real.forEach((g, gi) => {
      const btn = btnFor.get(g);
      const addText = btn ? btn.txt : "";
      const rep = {
        key: "r" + gi,
        sig: (addText || "noAdd") + "|" + g.el.tagName + "." + g.cls,
        addBtn: btn ? btn.el : null,
        addText,
        theme: null,
      };
      // 独立闭包：新增块 append 到同一父节点后，重新收集同构兄弟
      const parent = g.parent, tag = g.el.tagName, cls = g.cls;
      rep.getItems = function () {
        if (!parent.isConnected) return [];
        return Array.from(parent.children).filter(
          (c) => c.tagName === tag && (typeof c.className === "string" ? c.className : (c.getAttribute("class") || "")).trim() === cls
        );
      };
      rep.fields = fwCollectItemFields(g.items[0]);
      rep.count = g.items.length;
      // 段落主题猜测：添加按钮文案 + 块内字段 label
      const themeText = addText + " " + rep.fields.map((f) => f.label).join(" ");
      rep.theme = fwMatchRepeaterTheme(themeText);
      repeaters.push(rep);
    });
    excludeParents = real.map((g) => g.parent).concat(mokaContainers);
    softRepeaters = soft;
  })();

  const inExcl = (el) => excludeParents.some((p) => p.contains(el));

  // ---------- 顶层字段 ----------
  const fields = [];
  document.querySelectorAll(CONTROL).forEach((el) => {
    if (!fwVisible(el) || inExcl(el)) return;
    const type = (el.getAttribute("type") || "").toLowerCase();
    if (type === "radio") return;
    const kind = fwKindOf(el);
    const label = fwLabelFor(el);
    fields.push({
      key: "f" + fields.length, el, style: kind, tag: el.tagName.toLowerCase(),
      id: el.id || "", name: el.getAttribute("name") || "", label,
      placeholder: el.getAttribute("placeholder") || "",
      required: !!el.required || el.getAttribute("aria-required") === "true",
      options: el.tagName === "SELECT" ? Array.from(el.options).map((o) => (o.text || "").trim()).filter(Boolean) : null,
      sig: fwSigOf(el, label, kind),
    });
  });

  // radio 组
  (function collectRadios() {
    const byName = new Map();
    document.querySelectorAll('input[type=radio]').forEach((r) => {
      if (!fwVisible(r) || inExcl(r)) return;
      const k = r.name || "_anon_" + fwRelPath(document.body, r.parentElement);
      if (!byName.has(k)) byName.set(k, []);
      byName.get(k).push(r);
    });
    byName.forEach((radios) => {
      const first = radios[0];
      const grp = first.closest(".form-group, .ant-form-item, .el-form-item, .field, .form-item, td, li, .item");
      // 先取单选组前方兄弟文本（干净），拿不到再退回整组清理文本（会混入选项文字）
      let gLabel = fwSiblingText(first);
      if (!gLabel && grp && grp.querySelectorAll("input[type=radio]").length === radios.length) {
        gLabel = fwCleanCloneText(grp);
      }
      fields.push({
        key: "g" + fields.length, el: first, style: "radiogroup", tag: "input",
        id: "", name: first.name || "", label: gLabel.slice(0, 60),
        placeholder: "", required: radios.some((r) => r.required),
        options: radios.map(fwRadioOptionLabel),
        radios,
        sig: "radio|" + (first.name || "") + "|" + gLabel.slice(0, 60),
      });
    });
  })();

  // 顶层自定义下拉触发器
  document.querySelectorAll('[role=combobox],[class*="select"],[class*="dropdown"],[class*="cascader"],[class*="picker"]').forEach((el) => {
    if (el.matches('select,input,textarea,button,label,[class*="options"],[class*="menu"],[class*="list"],[class*="panel"]')) return;
    if (!fwVisible(el) || inExcl(el)) return;
    if (el.querySelector('[role=combobox],[class*="select"],[class*="dropdown"],[class*="cascader"],[class*="picker"]')) return;
    if (fields.some((f) => f.el === el)) return;
    const label = fwLabelFor(el);
    fields.push({
      key: "d" + fields.length, el, style: "dropdown", tag: "div",
      id: el.id || "", name: "", label,
      placeholder: el.getAttribute("placeholder") || "",
      required: false, options: null,
      sig: fwSigOf(el, label, "dropdown"),
    });
  });

  // ---------- 指纹（缓存键） ----------
  const sigs = fields.map((f) => f.sig).concat(repeaters.map((r) => r.sig));
  let h = 0;
  for (const s of sigs.join("|")) h = (h * 31 + s.charCodeAt(0)) | 0;

  return {
    title: document.title,
    url: location.href,
    fingerprint: (h >>> 0).toString(16),
    fields,
    repeaters,
    softRepeaters,
  };
}
