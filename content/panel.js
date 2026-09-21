// ============ 填报计划悬浮面板 ============
// 「提示」层：把每一条要写的控件、值、匹配方式、选择式/自定义式形态列出来，
// 用户勾选/取消后一键执行；执行时逐条回显状态，最后给出回读校验结果。
// 用 Shadow DOM 隔离样式，避免被页面 CSS 污染。

const FWPanel = (() => {
  let host = null, root = null, listEl = null, footEl = null, sumEl = null;
  let onConfirmCb = null;

  const STYLE_BADGE = {
    select: ["选择式·下拉", "b-blue"],
    dropdown: ["选择式·下拉", "b-blue"],
    radiogroup: ["选择式·单选", "b-blue"],
    text: ["自定义式·输入", "b-green"],
    textarea: ["自定义式·文本", "b-green"],
    date: ["日期", "b-orange"],
    checkbox: ["勾选", "b-gray"],
    section: ["段落", "b-purple"],
  };

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement("div");
    host.id = "fw-panel-host";
    host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;all:initial;";
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: "Microsoft YaHei", system-ui, sans-serif; }
        .panel { width: 400px; max-height: 86vh; display: flex; flex-direction: column;
                 background:#fff; border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.25); overflow:hidden; }
        .head { padding:10px 14px; background:#1a73e8; color:#fff; display:flex; justify-content:space-between; align-items:center; }
        .head b { font-size:14px; }
        .head .x { cursor:pointer; opacity:.85; font-size:16px; padding:0 4px; }
        .sum { padding:6px 14px; font-size:12px; color:#555; background:#f4f7fc; border-bottom:1px solid #e8ecf2; }
        .list { overflow-y:auto; padding:6px 8px; flex:1; }
        .row { display:flex; gap:8px; padding:6px 8px; border-radius:6px; align-items:flex-start; font-size:12.5px; }
        .row:hover { background:#f5f8fd; }
        .row.section { background:#eef3ff; margin:6px 0 2px; font-weight:600; }
        .row.info { color:#8a6d3b; background:#fdf6e3; margin:4px 0; }
        .ck { padding-top:1px; }
        .main { flex:1; min-width:0; }
        .line1 { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .lab { font-weight:600; color:#222; }
        .val { color:#1a73e8; word-break:break-all; }
        .arrow { color:#999; }
        .badge { font-size:10.5px; padding:1px 6px; border-radius:8px; white-space:nowrap; }
        .b-blue { background:#e3edff; color:#1a5cd6; }
        .b-green { background:#e5f6e8; color:#1a7f37; }
        .b-orange { background:#fff0e0; color:#b06000; }
        .b-gray { background:#eee; color:#555; }
        .b-purple { background:#f1e6ff; color:#6a2fb8; }
        .line2 { margin-top:2px; color:#888; font-size:11.5px; }
        .note { color:#b06000; }
        .status { white-space:nowrap; font-size:11.5px; color:#888; padding-top:1px; max-width:110px; text-align:right; }
        .status.ok { color:#1a7f37; }
        .status.fail { color:#c62828; }
        .foot { padding:10px 14px; border-top:1px solid #e8ecf2; display:flex; gap:8px; justify-content:flex-end; align-items:center; }
        button { cursor:pointer; border:1px solid #d0d7de; background:#fff; color:#333; border-radius:6px;
                 padding:5px 12px; font-size:12.5px; }
        button.primary { background:#1a73e8; border-color:#1a73e8; color:#fff; }
        button:disabled { opacity:.5; cursor:not-allowed; }
        .verify { border-top:1px dashed #e0e0e0; margin-top:4px; padding-top:4px; }
        .verify .row { font-size:11.5px; }
      </style>
      <div class="panel">
        <div class="head"><b>网申填报助手 · 填报计划</b><span class="x" title="关闭">✕</span></div>
        <div class="sum"></div>
        <div class="list"></div>
        <div class="foot">
          <button class="all">全选</button>
          <button class="none">清空</button>
          <button class="primary go">开始填报</button>
        </div>
      </div>`;
    listEl = root.querySelector(".list");
    sumEl = root.querySelector(".sum");
    footEl = root.querySelector(".foot");
    root.querySelector(".x").addEventListener("click", close);
    root.querySelector(".all").addEventListener("click", () => setAll(true));
    root.querySelector(".none").addEventListener("click", () => setAll(false));
    root.querySelector(".go").addEventListener("click", onGo);
  }

  function rowHtml(st) {
    const badge = STYLE_BADGE[st.style] || ["", "b-gray"];
    const note = st.note ? `<span class="note">${esc(st.note)}</span>` : "";
    const sub = [st.method, note].filter(Boolean).join("　");
    if (st.kind === "add_blocks" || st.kind === "info") {
      const icon = st.kind === "info" ? "⚠" : "◆";
      return `<div class="row ${st.kind === "info" ? "info" : "section"}">
        <div class="main"><div class="line1">${icon} <span class="lab">${esc(st.label)}</span>
        ${st.kind === "add_blocks" ? `<span class="badge ${badge[1]}">${badge[0]}</span>` : ""}</div>
        <div class="line2">${esc(st.note || "")}</div></div><div class="status"></div></div>`;
    }
    return `<div class="row">
      <span class="ck"><input type="checkbox" checked></span>
      <div class="main">
        <div class="line1"><span class="badge ${badge[1]}">${badge[0]}</span>
          <span class="lab">${esc(st.label)}</span><span class="arrow">←</span><span class="val">${esc(st.value)}</span></div>
        <div class="line2">${esc(sub)}</div>
      </div>
      <div class="status"></div></div>`;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderPanel(steps, cbs) {
    ensureHost();
    onConfirmCb = cbs && cbs.onConfirm;
    listEl.innerHTML = "";
    host.style.display = "block";
    let nFill = 0, nSkip = 0;
    for (const st of steps) {
      const wrap = document.createElement("div");
      wrap.innerHTML = rowHtml(st).trim();
      const row = wrap.firstChild;
      st._row = row;
      st._ck = row.querySelector("input[type=checkbox]");
      if (st._ck && st.kind === "add_blocks" && Number(st.value) === 0) {
        st._ck.checked = false; st._ck.disabled = true; // 无需添加
      }
      listEl.appendChild(row);
      if (st._ck) nFill++;
      if (st.note && st.note.startsWith("⚠")) nSkip++;
    }
    sumEl.textContent = `共 ${nFill} 项可执行` + (nSkip ? `，${nSkip} 项需注意` : "") +
      "。取消勾选可跳过对应步骤，确认后才开始填写。";
    footEl.style.display = "flex";
    listEl.querySelectorAll(".verify").forEach((e) => e.remove());
    const go = root.querySelector(".go");
    go.disabled = false;
    go.textContent = "开始填报";
  }

  function setAll(v) {
    listEl.querySelectorAll("input[type=checkbox]").forEach((c) => { if (!c.disabled) c.checked = v; });
  }

  async function onGo() {
    const selected = [];
    for (const st of currentSteps()) {
      if (st._ck) {
        if (st._ck.checked) selected.push(st);
        else if (st.kind !== "add_blocks" || Number(st.value) > 0) st._row.querySelector(".status").textContent = "已跳过";
      }
    }
    const go = root.querySelector(".go");
    go.disabled = true;
    go.textContent = "填报中…";
    listEl.querySelectorAll("input[type=checkbox]").forEach((c) => (c.disabled = true));
    try {
      if (onConfirmCb) await onConfirmCb(selected);
    } catch (e) {
      sumEl.textContent = "执行出错: " + ((e && e.message) || e);
      sumEl.style.color = "#c62828";
    }
    go.disabled = false;
    go.textContent = "关闭面板";
    go.onclick = close;
  }

  let _steps = [];
  function currentSteps() { return _steps; }

  function statusText(st, text, cls) {
    const el = st && st._row ? st._row.querySelector(".status") : root.querySelector(".list");
    if (!el) return;
    el.textContent = text;
    el.className = "status" + (cls ? " " + cls : "");
  }

  function close() {
    if (host) host.style.display = "none";
  }

  return {
    show(steps, cbs) { _steps = steps; renderPanel(steps, cbs); },
    status(st, text, cls) { statusText(st, text, cls); },
    finish(pairs) {
      // pairs: [label, 结果文本]
      const v = document.createElement("div");
      v.className = "verify";
      const okCount = pairs.filter((p) => p[1].startsWith("√")).length;
      v.innerHTML = `<div class="row section"><div class="main"><div class="line1">◆ 回读校验（完成 ${okCount}/${pairs.length}）</div></div></div>` +
        pairs.map(([l, r]) => `<div class="row"><div class="main"><div class="line1"><span class="lab">${esc(l)}</span>
          <span class="${r.startsWith("√") ? "status ok" : "status fail"}" style="max-width:none;text-align:left">${esc(r)}</span></div></div></div>`).join("");
      listEl.appendChild(v);
      v.scrollIntoView({ block: "nearest" });
    },
    error(msg) {
      ensureHost();
      host.style.display = "block";
      listEl.innerHTML = `<div class="row info"><div class="main"><div class="line1">⚠ ${esc(msg)}</div></div></div>`;
    },
    close,
  };
})();
