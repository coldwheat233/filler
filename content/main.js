// ============ 内容侧编排 ============
// 流程：抽取表单 -> 字段匹配（规则 -> 缓存 -> LLM）-> 生成填报计划 ->
//       悬浮面板展示（选择式/自定义式提示）-> 用户确认 -> 执行 -> 回读校验

// 页面快照导出：站点适配需要真实 DOM。内容脚本把 outerHTML 存为下载文件，
// 用户把文件发给开发者即可精准定位「添加」按钮/段落结构。（注意：快照包含页面上已填内容）
function fwSnapshot() {
  const html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
  const blob = new Blob([html], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fw-snapshot-" + (location.hostname || "page") + "-" + Date.now() + ".html";
  document.documentElement.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.cmd === "FW_SNAPSHOT") {
    try {
      fwSnapshot();
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ error: String((e && e.message) || e) });
    }
    return undefined;
  }
  if (msg && msg.cmd === "FW_PLAN") {
    (async () => {
      const profile = await fwLoadProfile();
      const form = extractForm();
      return { profile, form };
    })()
      .then(({ profile, form }) => {
        // 表单可能在 iframe 里：内容脚本注入了所有 frame，
        // 本帧没找到表单就不响应，把接管权让给有表单的帧；
        // 所有帧都没有表单时，popup 侧会收到连接错误并提示用户。
        if (!form.fields.length && !form.repeaters.length) return;
        try { sendResponse({ ok: true }); } catch (e) { /* 别的帧先响应了 */ }
        fwRun(profile, form).catch((e) => FWPanel.error((e && e.message) || String(e)));
      })
      .catch((e) => {
        try { sendResponse({ error: String((e && e.message) || e) }); } catch (e2) { /* ignore */ }
      });
    return true;
  }
  return undefined;
});

async function fwLoadProfile() {
  const { profile } = await chrome.storage.local.get("profile");
  if (!profile || typeof profile !== "object") {
    throw new Error("尚未配置简历：点击浏览器工具栏的插件图标，在弹窗中填写简历后保存");
  }
  return profile;
}

// 供注入测试使用的入口：本帧直接跑
async function fwStart() {
  const profile = await fwLoadProfile();
  const form = extractForm();
  if (!form.fields.length && !form.repeaters.length) {
    throw new Error("本页未识别到表单字段");
  }
  return fwRun(profile, form);
}

async function fwRun(profile, form) {
  // 诊断输出：用户可按 F12 查看，便于远程排查站点识别问题
  console.info(
    "[网申填报助手] 识别到 " + form.fields.length + " 个字段、 " + form.repeaters.length + " 个重复段落:",
    form.repeaters.map((r) => (r.theme || "未识别主题") + "×" + r.count + (r.addBtn ? "(有添加按钮:「" + r.addText + "」)" : "(未识别到添加按钮)")).join("；")
      || "（无）",
    (form.softRepeaters || []).length
      ? "另有 " + form.softRepeaters.length + " 个疑似段落未识别到添加按钮: " +
        form.softRepeaters.map((s) => "「" + s.cls + "」").join("、")
      : ""
  );
  await fwMatchForm(form, profile);
  const steps = await fwBuildSteps(form, profile);
  // LLM 配置了但调用失败时，明确告诉用户而不是悄悄退化成离线模式
  const llmErrs = window.__fwLLMErrors || [];
  if (llmErrs.length) {
    steps.push({
      kind: "info", style: "section",
      label: `⚠ LLM 调用失败 ${llmErrs.length} 次（相关字段退回规则/人工）`,
      note: String(llmErrs[0]).slice(0, 140) + "｜请到弹窗 LLM 页用「测试连接」排查",
    });
  }
  FWPanel.show(steps, { onConfirm: (selected) => fwExecute(selected) });
}

// ---------------- 字段匹配：规则 -> 缓存 -> LLM ----------------
async function fwMatchForm(form, profile) {
  const cache = await fwLoadCache();
  const fp = form.fingerprint;
  const pending = [];
  for (const f of form.fields) {
    const c = fwCacheGet(cache, fp, f.sig);
    if (c && c.path && fwGetByPath(profile, c.path) !== undefined) {
      f.path = c.path;
      f.method = "缓存";
      continue;
    }
    const p = fwMatchByRules(f.label, f.name, f.placeholder);
    if (p && fwGetByPath(profile, p) !== undefined) {
      f.path = p;
      f.method = "规则";
      fwCacheSet(cache, fp, f.sig, { path: p, label: f.label });
      continue;
    }
    pending.push(f);
  }
  if (pending.length && (await fwHasLLM())) {
    await fwLLMMatchFields(pending, profile, fp);
  }
  await fwSaveCache(cache);
}

async function fwLLMMatchFields(pending, profile, fp) {
  const listing = pending
    .map((f) => {
      let line = `- key=${f.key} label=「${f.label || ""}」形态=${f.style}`;
      if (f.options && f.options.length) line += " 可选项:" + f.options.slice(0, 30).join("|");
      return line;
    })
    .join("\n");
  const data = await fwLLMChatJSON(
    "你是网申表单填报助手。任务：把网页表单字段映射到用户简历字段。\n" +
      "规则：1) 只能使用给出的简历路径，禁止发明；2) 语义不确定的字段放入 unmatched，宁缺毋滥。\n" +
      '只输出 JSON：{"mappings": [{"key": "字段key", "path": "简历路径"}], "unmatched": ["key"]}',
    "【用户简历字段】\n" + fwDescribeProfile(profile) + "\n\n【表单字段】\n" + listing
  );
  if (!data) return;
  const byKey = {};
  pending.forEach((f) => (byKey[f.key] = f));
  (data.mappings || []).forEach((m) => {
    const f = byKey[m.key];
    if (f && m.path && fwGetByPath(profile, m.path) !== undefined) {
      f.path = m.path;
      f.method = "LLM";
    }
  });
  // 匹配成功的写缓存
  const cache = await fwLoadCache();
  pending.forEach((f) => {
    if (f.path) fwCacheSet(cache, fp, f.sig, { path: f.path, label: f.label });
  });
  await fwSaveCache(cache);
}

// ---------------- 填报计划构建 ----------------
async function fwPrematchOption(st, options) {
  const { idx, how } = fwMatchOption(options, st.value);
  if (idx != null) {
    st.value = options[idx];
    st.method = (st.method ? st.method + "/" : "") + how;
    return;
  }
  const pick = await fwLLMPickOption(options, st.value);
  if (pick != null) {
    st.value = pick;
    st.method = (st.method ? st.method + "/" : "") + "LLM选项";
  } else {
    st.note = "⚠ 选项未命中，可选: " + options.slice(0, 6).join("|");
  }
}

async function fwBuildSteps(form, profile) {
  const steps = [];

  // 1) 顶层字段
  for (const f of form.fields) {
    const value = fwGetByPath(profile, f.path);
    if (value == null || value === "") continue;
    const st = {
      kind: "fill", field: f,
      label: f.label || f.name || f.key,
      value: String(value), method: f.method || "", style: f.style,
    };
    if (f.style === "select") await fwPrematchOption(st, f.options || []);
    steps.push(st);
  }

  // 未匹配字段也提示出来（保持留空、人工填写），与 README 描述一致
  const unmatchedTop = form.fields.filter((f) => !f.path).map((f) => f.label || f.name || f.key);
  if (unmatchedTop.length) {
    steps.push({
      kind: "info", style: "section",
      label: `${unmatchedTop.length} 个字段未能匹配（保持留空，人工填写）`,
      note: unmatchedTop.join("、"),
    });
  }

  // 疑似可扩展段落但没认出「添加」按钮：明确告知用户，否则表现为「只填第一块」
  const soft = form.softRepeaters || [];
  if (soft.length) {
    steps.push({
      kind: "info", style: "section",
      label: `⚠ ${soft.length} 个疑似可扩展段落未识别到「添加」按钮`,
      note: soft.map((s) => `容器「${s.cls}」字段: ${s.labels.join("/") || "?"}`).join("；").slice(0, 160) +
        "｜已按普通字段处理，只能填现有块；多块扩展请手动点添加后重新生成计划",
    });
  }

  // 2) 重复段落（经历类）
  for (const rep of form.repeaters) {
    const theme = await fwResolveTheme(rep, profile);
    if (!theme) {
      steps.push({
        kind: "info", style: "section",
        label: rep.addText || "重复段落",
        note: `⚠ 段落「${rep.addText || rep.sig.slice(0, 24)}」无法对应简历列表，已跳过`,
      });
      continue;
    }
    const items = (profile[theme] || []).filter((it) => it && typeof it === "object" && !Array.isArray(it));
    const unmatched = await fwMapItemFields(rep, theme, items, form.fingerprint);

    // 形态统计 → 提示语：让用户一眼看出该段落里哪些是选择式/自定义式
    const styleStat = {};
    rep.fields.forEach((f) => (styleStat[f.style] = (styleStat[f.style] || 0) + 1));
    const styleDesc = Object.entries(styleStat).map(([k, v]) => k + "×" + v).join("、");
    const needAdd = Math.max(0, items.length - rep.count);
    steps.push({
      kind: "add_blocks", rep, style: "section",
      label: rep.addText || theme,
      value: String(needAdd), targetCount: rep.count + needAdd,
      note: `${theme}：简历 ${items.length} 条 / 页面 ${rep.count} 块（${styleDesc}）` +
        (needAdd
          ? ` → 将点击「${rep.addText || "添加"}」${needAdd} 次` +
            (rep.addBtn ? "" : "；⚠ 未识别到添加按钮，该步骤会失败，请手动点添加后重新生成计划")
          : "，块数足够，无需添加") +
        (unmatched.length ? `；未识别子字段: ${unmatched.join("、")}` : ""),
    });
    for (let i = 0; i < items.length; i++) {
      for (const f of rep.fields) {
        if (!f.path) continue;
        const sub = f.path.split(".")[1];
        const value = items[i][sub];
        if (value == null || value === "") continue;
        const st = {
          kind: "fill_item", rep, itemIdx: i, field: f,
          label: `#${i + 1} ${f.label || f.key}`,
          value: String(value), method: f.method || "", style: f.style,
          options: f.options || null,
        };
        if (f.style === "select") await fwPrematchOption(st, f.options || []);
        else if (f.style === "dropdown") st.note = "选项将在运行时展开后匹配";
        steps.push(st);
      }
    }
  }
  return steps;
}

async function fwResolveTheme(rep, profile) {
  const lists = {};
  for (const k of Object.keys(profile)) {
    const v = profile[k];
    if (Array.isArray(v) && v.length && v[0] && typeof v[0] === "object" && !Array.isArray(v[0])) lists[k] = v;
  }
  // 1) 用户在档案里写的自定义段落别名（sectionAliases: { "游戏经历": "games", ... }）优先
  const aliases = profile.sectionAliases && typeof profile.sectionAliases === "object" ? profile.sectionAliases : {};
  const themeText = fwNorm(rep.addText + " " + rep.fields.map((f) => f.label).join(" "));
  for (const kw of Object.keys(aliases)) {
    const key = aliases[kw];
    if (lists[key] && fwNorm(kw) && themeText.includes(fwNorm(kw))) return key;
  }
  // 2) 内置主题
  if (rep.theme && lists[rep.theme]) return rep.theme;
  // 3) LLM 猜测
  if (Object.keys(lists).length && (await fwHasLLM())) {
    const data = await fwLLMChatJSON(
      '把网页上的重复段落(经历类区块)映射到简历中对应的列表键。只输出 JSON：{"key": "列表键"} 或 {"key": null}',
      `简历列表键: ${JSON.stringify(Object.keys(lists))}\n添加按钮文案: ${rep.addText}\n` +
        `段落内字段: ${JSON.stringify(rep.fields.map((f) => f.label))}`
    );
    if (data && data.key && lists[data.key]) {
      rep.theme = data.key;
      return rep.theme;
    }
  }
  return null;
}

async function fwMapItemFields(rep, theme, items, fp) {
  const rules = FW_THEME_SUBFIELD_RULES[theme] || [];
  const subkeys = items.length && items[0] ? Object.keys(items[0]) : [];
  const pending = [];
  const unmatched = [];
  const cache = await fwLoadCache();
  for (const f of rep.fields) {
    const ck = "rep:" + rep.sig + "|" + f.sig;
    const c = fwCacheGet(cache, fp, ck);
    if (c && c.path) {
      f.path = c.path;
      f.method = "缓存";
      continue;
    }
    const nl = fwNorm(f.label);
    let path = null;
    for (const [sub, kws] of rules) {
      if (kws.some((kw) => nl.includes(kw))) { path = theme + "." + sub; break; }
    }
    if (path) {
      f.path = path;
      f.method = "规则";
      fwCacheSet(cache, fp, ck, { path });
    } else {
      pending.push(f);
    }
  }
  if (pending.length && subkeys.length && (await fwHasLLM())) {
    const listing = pending
      .map((f) => `- key=${f.key} label=「${f.label || ""}」形态=${f.style}` +
        (f.options && f.options.length ? " 选项:" + f.options.slice(0, 20).join("|") : ""))
      .join("\n");
    const data = await fwLLMChatJSON(
      "把重复段落里的控件映射到该类条目的子字段。只输出 JSON：" +
        '{"mappings": [{"key": "控件key", "sub": "子键"}], "unmatched": ["key"]}',
      `条目子键: ${JSON.stringify(subkeys)}\n段落控件:\n${listing}`
    );
    if (data) {
      const byKey = {};
      pending.forEach((f) => (byKey[f.key] = f));
      (data.mappings || []).forEach((m) => {
        const f = byKey[m.key];
        if (f && subkeys.includes(m.sub)) {
          f.path = theme + "." + m.sub;
          f.method = "LLM";
          fwCacheSet(cache, fp, "rep:" + rep.sig + "|" + f.sig, { path: f.path });
        }
      });
    }
  }
  await fwSaveCache(cache);
  rep.fields.forEach((f) => { if (!f.path) unmatched.push(f.label || f.key); });
  return unmatched;
}

// ---------------- 执行 + 回读校验 ----------------
async function fwExecute(selected) {
  for (const st of selected) {
    if (st.kind === "info") continue;
    if (st.kind === "add_blocks") {
      FWPanel.status(st, "添加块中…");
      try {
        const need = Number(st.value || 0);
        const rep = st.rep;
        const added = need > 0 ? await fwEnsureCount(rep, st.targetCount) : 0;
        // 显式校验块数：目标 vs 实际，不达标按失败处理
        const now = rep.getItems().length;
        if (now < st.targetCount) {
          throw new Error("块数校验失败：目标 " + st.targetCount + " 块，实际 " + now + " 块");
        }
        FWPanel.status(st, added ? `√ 已添加 ${added} 块（现 ${now} 块）` : "√ 无需添加", added ? "ok" : "");
      } catch (e) {
        FWPanel.status(st, "× " + ((e && e.message) || e), "fail");
      }
      continue;
    }
    FWPanel.status(st, "填写中…");
    try {
      let field = st.field;
      if (st.kind === "fill_item") {
        const el = fwLocateItemField(st.rep, st.itemIdx, st.field);
        if (!el) { FWPanel.status(st, "× 未定位到控件", "fail"); continue; }
        field = Object.assign({}, st.field, { el });
      }
      // 年/月拆分字段（Moka 等）：从 "2022-10" 里取对应部分填写
      const fillValue = st.field.splitDate ? fwSplitDate(st.value, st.field.sub) : st.value;
      const r = await fwFillField(field, fillValue);
      st.filled = r.ok;
      st.fillValue = String(fillValue);
      FWPanel.status(st, (r.ok ? "√ " : "× ") + r.msg, r.ok ? "ok" : "fail");
      await fwSleep(150);
    } catch (e) {
      FWPanel.status(st, "× " + ((e && e.message) || e), "fail");
    }
  }

  // 回读校验
  const verify = [];
  // 先校验各段落块数：目标块数 vs 实际块数
  for (const st of selected) {
    if (st.kind !== "add_blocks") continue;
    const cur = st.rep ? st.rep.getItems().length : 0;
    verify.push([
      "◇ " + (st.label || "段落") + " 块数",
      cur >= st.targetCount ? "√ 现有 " + cur + " 块" : `× 目标 ${st.targetCount} 块，实际 ${cur} 块`,
    ]);
  }
  for (const st of selected) {
    if (st.kind === "info" || st.kind === "add_blocks") continue;
    if (st.filled === undefined) continue;
    let field = st.field;
    if (st.kind === "fill_item") {
      const el = fwLocateItemField(st.rep, st.itemIdx, st.field);
      if (!el) { verify.push([st.label, "× 未定位到控件"]); continue; }
      field = Object.assign({}, st.field, { el });
    }
    const cur = fwReadBack(field);
    const expect = String(st.fillValue || st.value);
    const good = !!cur && (cur.includes(expect) || expect.includes(cur));
    verify.push([st.label, good ? "√ " + cur.slice(0, 30) : `× 期望「${expect.slice(0, 20)}」实际「${cur.slice(0, 20)}」`]);
  }
  FWPanel.finish(verify);
}
