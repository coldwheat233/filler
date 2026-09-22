// ============ 填报执行器 ============
// 全部走原生 DOM 事件（input/change + React 的 value setter），
// 避免 Vue/React 受控组件“值变了但框架不知道”的问题。

// 后台/被遮挡标签页的 setTimeout 会被浏览器节流（最低 1 次/秒，极端 1 次/分），
// 填报流程大量依赖短 sleep，被节流就会像假死。MessageChannel 宏任务不受节流。
function fwSleep(ms) {
  return new Promise((resolve) => {
    const start = performance.now();
    (function tick() {
      if (performance.now() >= start + ms) return resolve();
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); tick(); };
      ch.port2.postMessage(0);
    })();
  });
}

function fwAsDate(value) {
  const v = String(value == null ? "" : value).trim();
  if (/^\d{4}-\d{1,2}$/.test(v)) return v + "-01";
  if (/^\d{4}$/.test(v)) return v + "-01-01";
  return v.replace(/[./]/g, "-");
}

// 年/月拆分字段的取值：idx 0 取年，1 取月（Moka 的 month-range-select）
function fwSplitDate(value, idx) {
  const parts = String(value == null ? "" : value).trim().split("-");
  return parts[idx] != null ? parts[idx] : String(value);
}

// React 重写 value 后会吞掉赋值，必须用原生 setter 再派发 input
function fwSetNativeValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function fwClickLikeUser(el, opts) {
  // 完整按键序列：pointerdown/up（部分框架用 Pointer 事件）→ mousedown/up → click。
  // opts.bubble=false 用于下拉触发器：事件不冒泡，避免页面「点击空白处关闭面板」
  // 的全局监听把我们刚展开的面板立刻关掉（触发器自身的监听仍会触发）。
  const bubble = !(opts && opts.bubble === false);
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const mouseOpts = { bubbles: bubble, cancelable: true, view: window, clientX: cx, clientY: cy };
  const pointerOpts = Object.assign({ pointerId: 1, pointerType: "mouse", isPrimary: true }, mouseOpts);
  try { el.dispatchEvent(new PointerEvent("pointerdown", pointerOpts)); } catch (e) {}
  el.dispatchEvent(new MouseEvent("mousedown", mouseOpts));
  try { el.dispatchEvent(new PointerEvent("pointerup", pointerOpts)); } catch (e) {}
  el.dispatchEvent(new MouseEvent("mouseup", mouseOpts));
  if (bubble) el.click();
  else el.dispatchEvent(new MouseEvent("click", mouseOpts));
}

const FW_OPTION_SEL = 'li,[role=option],.el-select-dropdown__item,.ant-select-item-option,.select-option,[class*="dropdown-menu"] li,[class*="options"] li,[class*="menu"] li';

function fwVisibleOptionTexts() {
  const out = [];
  document.querySelectorAll(FW_OPTION_SEL).forEach((o) => {
    if (!fwVisible(o)) return;
    const t = (o.innerText || "").replace(/\s+/g, " ").trim();
    if (t && !out.some((x) => x.el === o)) out.push({ el: o, text: t });
  });
  // 同文本可能因面板挂在多个容器出现两份，按文本去重保第一个可见的
  const seen = new Set();
  return out.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
}

async function fwFillDropdown(triggerEl, value, log) {
  fwClickLikeUser(triggerEl, { bubble: false });
  // 等待选项面板渲染
  let texts = [];
  for (let i = 0; i < 12; i++) {
    await fwSleep(150);
    texts = fwVisibleOptionTexts();
    if (texts.length) break;
  }
  if (!texts.length) return { ok: false, msg: "展开下拉失败：未出现可见选项" };
  const labels = texts.map((x) => x.text);
  let { idx, how } = fwMatchOption(labels, value);
  if (idx == null) {
    const pick = await fwLLMPickOption(labels, value);
    if (pick != null) {
      idx = labels.indexOf(pick);
      how = "LLM";
    }
  }
  if (idx == null) {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { ok: false, msg: "选项未命中: " + value + "（可见: " + labels.slice(0, 6).join("|") + "）" };
  }
  fwClickLikeUser(texts[idx].el);
  await fwSleep(250);
  return { ok: true, msg: "ok(" + how + "匹配)" };
}

function fwFillSelect(el, value) {
  const options = Array.from(el.options).map((o) => (o.text || "").trim()).filter(Boolean);
  let { idx, how } = fwMatchOption(options, value);
  if (idx == null) return { ok: false, async: true, msg: "选项未命中: " + value };
  el.selectedIndex = idx;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true, msg: "ok(" + how + "匹配)" };
}

function fwFillRadio(field, value) {
  const { idx, how } = fwMatchOption(field.options || [], value);
  if (idx == null) return { ok: false, msg: "选项未命中: " + value };
  const r = field.radios[idx];
  const label = r.id ? document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(r.id) : r.id) + '"]') : null;
  const target = fwVisible(r) ? r : label || r;
  fwClickLikeUser(target);
  if (!r.checked) r.checked = true; // 兜底
  r.dispatchEvent(new Event("change", { bubbles: true }));
  r.dispatchEvent(new Event("input", { bubbles: true }));
  return { ok: true, msg: "ok(" + how + "匹配)" };
}

async function fwFillField(field, value, log) {
  if (value == null || String(value).trim() === "") return { ok: false, msg: "空值跳过" };
  switch (field.style) {
    case "text":
    case "textarea":
      fwSetNativeValue(field.el, String(value));
      return { ok: true, msg: "ok" };
    case "date": {
      // 「至今/至今有效」类结束时间在多数站点是勾选框或需手动选，如实标注人工处理
      if (/至今|now|current|present/i.test(String(value))) {
        return { ok: false, msg: "「至今」类结束时间需人工勾选/选择" };
      }
      fwSetNativeValue(field.el, fwAsDate(value));
      return { ok: true, msg: "ok" };
    }
    case "select":
      return fwFillSelect(field.el, value);
    case "radiogroup":
      return fwFillRadio(field, value);
    case "checkbox": {
      const truthy = ["1", "true", "yes", "y", "on", "是", "同意", "已阅读"].includes(String(value).trim().toLowerCase());
      if (truthy && !field.el.checked) fwClickLikeUser(field.el);
      if (!truthy && field.el.checked) fwClickLikeUser(field.el);
      return { ok: true, msg: "ok" };
    }
    case "dropdown":
      return await fwFillDropdown(field.el, value, log);
    default:
      return { ok: false, msg: "未知控件形态: " + field.style };
  }
}

// ---------------- 回读校验 ----------------
function fwReadBack(field) {
  try {
    switch (field.style) {
      case "text":
      case "textarea":
      case "date":
        return field.el.value;
      case "select": {
        const o = field.el.selectedOptions && field.el.selectedOptions[0];
        return o ? (o.text || "").trim() : "";
      }
      case "radiogroup": {
        const checked = (field.radios || []).findIndex((r) => r.checked);
        return checked >= 0 ? field.options[checked] : "";
      }
      case "checkbox":
        return field.el.checked ? "是" : "否";
      case "dropdown":
        // 自定义下拉的触发器可能是 input（Moka sd-Select）也可能是 div
        if (field.el.tagName === "INPUT") return field.el.value;
        return (field.el.innerText || field.el.textContent || "").replace(/\s+/g, " ").trim();
      default:
        return "";
    }
  } catch (e) {
    return "(读取失败)";
  }
}
