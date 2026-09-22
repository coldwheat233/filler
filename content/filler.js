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

const FW_OPTION_SEL = 'li,[role=option],.el-select-dropdown__item,.ant-select-item-option,.select-option,[class*="dropdown"] li,[class*="menu"] li,[class*="popover"] li,[class*="options"] li,[class*="portal"] div,[class*="Dropdown"] div,[class*="select"] div';

function fwAllVisibleSet() {
  const s = new Set();
  document.querySelectorAll("body *").forEach((el) => {
    if (fwVisible(el)) s.add(el);
  });
  return s;
}

// 点开面板后，找出「新出现的叶子级带文本元素」作为选项——
// 不依赖具体标签（有的库用 li、有的用 div），全页差集天然适配 body 挂载的门户
function fwFreshLeafOptions(before) {
  const fresh = new Set();
  document.querySelectorAll("body *").forEach((el) => {
    if (!before.has(el) && fwVisible(el)) fresh.add(el);
  });
  const out = [];
  fresh.forEach((el) => {
    for (const c of el.children) {
      if (fresh.has(c)) return; // 面板容器等非叶子节点
    }
    const t = (el.innerText || "").replace(/\s+/g, " ").trim();
    if (t && t.length <= 40) out.push({ el, text: t });
  });
  const seen = new Set();
  return out.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)));
}

async function fwPollFreshOptions(before, rounds) {
  for (let i = 0; i < (rounds || 6); i++) {
    await fwSleep(150);
    const r = fwFreshLeafOptions(before);
    if (r.length) return r;
  }
  return [];
}

async function fwFillDropdown(triggerEl, value, log) {
  const before = fwAllVisibleSet();
  // 可搜索下拉（如 Moka 的学校/专业选择）：先把值打进输入框触发过滤，
  // 否则全量列表（或远程懒加载列表）里可能根本没有目标项。非搜索下拉无害，
  // 最终以点选的选项为准。
  if (triggerEl.tagName === "INPUT" && !triggerEl.readOnly) {
    try { fwSetNativeValue(triggerEl, String(value)); } catch (e) {}
    await fwSleep(300);
  }
  // 展开策略轮试：
  // 1) 完整点击（冒泡）——React/Vue 根委托能收到
  // 2) 只按下去（pointerdown+mousedown）——「mousedown 展开、click 收起」的
  //    toggle 型下拉（Moka sd-Select）用完整点击会开了又关，只按下去保持展开
  // 3) 完整点击（不冒泡）——防「点击空白处关闭」全局监听的站点
  // 4) 再来一轮完整冒泡点击（个别站点点两次才开）
  const rect = triggerEl.getBoundingClientRect();
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const pressOnly = () => {
    const po = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: "mouse", isPrimary: true, clientX: cx, clientY: cy };
    const mo = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    try { triggerEl.dispatchEvent(new PointerEvent("pointerdown", po)); } catch (e) {}
    triggerEl.dispatchEvent(new MouseEvent("mousedown", mo));
  };
  const modes = [
    () => fwClickLikeUser(triggerEl, { bubble: true }),
    pressOnly,
    () => fwClickLikeUser(triggerEl, { bubble: false }),
    () => fwClickLikeUser(triggerEl, { bubble: true }),
  ];
  let opts = [];
  // 打字可能已经带出过滤后的选项
  opts = await fwPollFreshOptions(before, 4);
  if (!opts.length) {
    for (const mode of modes) {
      mode();
      opts = await fwPollFreshOptions(before, 5);
      if (opts.length) break;
    }
  }
  if (!opts.length) return { ok: false, msg: "展开下拉失败：未出现新选项面板" };

  const labels = opts.map((x) => x.text);
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
  fwClickLikeUser(opts[idx].el);
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
