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
    while ((sib = sib.previousElementSibling)) nth++;
    sel += ":nth-of-type(" + nth + ")";
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(" > ");
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

// ---------- 重复段落识别：同 tag+class 的兄弟块，块内 >=2 个控件 ----------
// 「添加」按钮是全局配对的：多个段落时按 DOM 顺序与段落一一对应，避免把
// 「添加获奖记录」误配给实习段落（旧版按文案最短挑选会配错）。
const FW_ADD_PAT = /(添加|新增|增加|追加|append|add)/i;

function fwCollectAddCandidates(excludeEls, CONTROL) {
  const out = [];
  document.querySelectorAll("button, a, span, div, i, em, input[type=button], input[type=submit]").forEach((b) => {
    if (!fwVisible(b)) return;
    if (excludeEls.some((x) => x.contains(b))) return;
    if (b.querySelector(CONTROL)) return; // 不是纯按钮
    const txt = (b.innerText || b.value || b.title || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    if (!txt || txt.length > 14) return;
    if (!FW_ADD_PAT.test(txt)) return;
    const innerChild = Array.from(b.children).some((c) => {
      const t = (c.innerText || c.title || "").replace(/\s+/g, " ").trim();
      return t && t.length <= 14 && FW_ADD_PAT.test(t);
    });
    if (innerChild) return; // 只收叶子级按钮
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
  (function detect() {
    const seen = new Set();
    const groups = [];
    document.querySelectorAll("body *").forEach((el) => {
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

    // 「添加」按钮全局配对：候选按钮与段落都按 DOM 顺序排，一一对应
    const excludeEls = kept.flatMap((g) => g.items);
    const cands = fwCollectAddCandidates(excludeEls, CONTROL);
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
    // - 单块且没有「添加」按钮：不是可扩展段落，字段改按顶层字段处理。
    //   否则 SPA 根节点（如 div.app-root）这类“唯一大容器”会被误判成段落，
    //   它的父节点又被当成排除区，整页字段直接清零（金山网申实测踩坑）。
    // - 单块且吞下页面九成以上可填控件：明显是表单容器，同样拒绝。
    const pageControlCount = document.querySelectorAll(FW_CONTROL_FILL).length;
    const real = kept.filter((g) => {
      if (g.items.length !== 1) return true;
      const own = g.el.querySelectorAll(FW_CONTROL_FILL).length;
      const share = pageControlCount > 0 ? own / pageControlCount : 0;
      if (share >= 0.9) return false;
      return !!btnFor.get(g);
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
    excludeParents = real.map((g) => g.parent);
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
  };
}
