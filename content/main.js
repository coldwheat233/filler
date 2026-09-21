// ============ 内容侧编排 ============
// 流程：抽取表单 -> 字段匹配（规则 -> 缓存 -> LLM）-> 生成填报计划 ->
//       悬浮面板展示（选择式/自定义式提示）-> 用户确认 -> 执行 -> 回读校验

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.cmd === "FW_PLAN") {
    fwStart()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        FWPanel.error((e && e.message) || String(e));
        sendResponse({ error: String((e && e.message) || e) });
      });
    return true;
  }
  return undefined;
});

async function fwLoadProfile() {
  const { profile } = await chrome.storage.local.get("profile");
  if (!profile || typeof profile !== "object") {
    throw new Error("尚未配置简历：点击浏览器工具栏的插件图标，在弹窗中粘贴/编辑简历 JSON 后保存");
  }
  return profile;
}

async function fwStart() {
  const profile = await fwLoadProfile();
  const form = extractForm();
  if (!form.fields.length && !form.repeaters.length) {
    throw new Error("本页未识别到表单字段");
  }
  await fwMatchForm(form, profile);
  const steps = await fwBuildSteps(form, profile);
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
    await fwLLMMatchFields(pending, profile);
  }
  await fwSaveCache(cache);
}

async function fwLLMMatchFields(pending, profile) {
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
    if (f.path) fwCacheSet(cache, form.fingerprint, f.sig, { path: f.path, label: f.label });
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
        (needAdd ? ` → 将点击「${rep.addText || "添加"}」${needAdd} 次` : "，块数足够，无需添加") +
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
  if (rep.theme && lists[rep.theme]) return rep.theme;
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
        const added = need > 0 ? await fwEnsureCount(st.rep, st.targetCount) : 0;
        FWPanel.status(st, added ? `√ 已添加 ${added} 块` : "√ 无需添加", added ? "ok" : "");
      } catch (e) {
        FWPanel.status(st, "× " + ((e && e.message) || e), "fail");
      }
      continue;
    }
    FWPanel.status(st, "填写中…");
    try {
      let field = st.field;
      if (st.kind === "fill_item") {
        const el = fwItemFieldEl(st.rep, st.itemIdx, st.field);
        if (!el) { FWPanel.status(st, "× 未定位到控件", "fail"); continue; }
        field = Object.assign({}, st.field, { el });
      }
      const r = await fwFillField(field, st.value);
      st.filled = r.ok;
      FWPanel.status(st, (r.ok ? "√ " : "× ") + r.msg, r.ok ? "ok" : "fail");
      await fwSleep(150);
    } catch (e) {
      FWPanel.status(st, "× " + ((e && e.message) || e), "fail");
    }
  }

  // 回读校验
  const verify = [];
  for (const st of selected) {
    if (st.kind === "info" || st.kind === "add_blocks") continue;
    if (st.filled === undefined) continue;
    let field = st.field;
    if (st.kind === "fill_item") {
      const el = fwItemFieldEl(st.rep, st.itemIdx, st.field);
      if (!el) { verify.push([st.label, "× 未定位到控件"]); continue; }
      field = Object.assign({}, st.field, { el });
    }
    const cur = fwReadBack(field);
    const expect = String(st.value);
    const good = !!cur && (cur.includes(expect) || expect.includes(cur));
    verify.push([st.label, good ? "√ " + cur.slice(0, 30) : `× 期望「${expect.slice(0, 20)}」实际「${cur.slice(0, 20)}」`]);
  }
  FWPanel.finish(verify);
}
