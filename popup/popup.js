// ============ Popup：结构化简历编辑器 ============
// 分页签编辑简历档案（这就是“提前填写参考”的入口），数据源始终是一个
// profile 对象；「经历段落」页对列表做可视化增删；JSON 页是高级模式。
// 保存到 chrome.storage.local，仅存本地。

// ---------------- 档案结构配置 ----------------
// [键, 标签, 类型(text/date/month/textarea), 选项数组?]
const FW_TAB_GROUPS = {
  "tab-basic": [
    {
      title: "基本信息",
      prefix: "basic",
      fields: [
        ["name", "姓名"], ["nickname", "花名/昵称"],
        ["last_pinyin", "姓全拼"], ["first_pinyin", "名全拼"],
        ["gender", "性别", "select", ["男", "女", "保密"]],
        ["birth_date", "出生日期", "date"],
        ["phone", "手机号"], ["email", "邮箱"],
        ["id_type", "证件类型", "select", ["身份证", "护照", "港澳居民来往内地通行证", "台湾居民来往大陆通行证"]],
        ["id_card", "证件号码"], ["nationality", "国籍"],
        ["city", "现居地", "text", null, true], ["native_place", "籍贯"],
        ["ethnic", "民族"], ["height", "身高(cm)"], ["weight", "体重(kg)"],
        ["huji_type", "户口性质", "select", ["居民户口", "城镇户口", "农村户口", "集体户口", "其他"]],
        ["marital", "婚否", "select", ["未婚", "已婚", "离异", "丧偶", "保密"]],
        ["political", "政治面貌", "select", ["中共党员", "中共预备党员", "共青团员", "群众", "民主党派"]],
        ["qq", "QQ"], ["wechat", "微信"],
        ["homepage", "个人主页", "text", null, true], ["portfolio", "作品链接", "text", null, true],
      ],
    },
  ],
  "tab-career": [
    {
      title: "求职意向",
      prefix: "expect",
      fields: [
        ["site", "期望面试站点"], ["position", "应聘岗位"], ["city", "期望城市"],
        ["salary", "期望薪资"], ["source", "招聘信息来源"],
        ["adjust", "是否接受岗位调剂", "select", ["是", "否"]], ["refcode", "推荐码"],
      ],
    },
    {
      title: "教育概况（页面顶部公共字段）",
      prefix: "edu",
      fields: [
        ["benke_school", "本科学校"], ["benke_subject", "本科学科"], ["benke_major", "本科专业名称"],
        ["graduate_school", "毕业学校"], ["top_subject", "最高学历学科"], ["top_major", "最高学历专业名称"],
        ["rank", "专业排名", "select", ["前10%", "前25%", "前50%", "其他"]],
        ["fresh", "应届/往届", "select", ["应届", "往届"]],
        ["english_level", "英语等级", "select", ["CET-4", "CET-6", "专业四级", "专业八级", "雅思", "托福", "其他"]],
        ["english_score", "英语等级成绩（分数）"],
        ["other_lang", "其他外语"], ["lang_level", "外语等级"],
        ["computer_level", "计算机等级", "select", ["一级", "二级", "三级", "四级", "软考", "其他"]],
        ["scholarship", "奖学金", "select", ["国家奖学金", "国家励志奖学金", "校一等奖学金", "校二等奖学金", "无"]],
        ["outstanding", "优秀毕业生级别", "select", ["国家级", "省级", "校级", "院级", "无"]],
        ["project_count", "项目/实习数量", "select", ["0", "1-2个", "3-5个", "5个以上"]],
        ["cadre_level", "学生干部职务级别", "select", ["校级", "院级", "班级", "无"]],
        ["cadre_title", "曾担任职务"], ["contest_level", "竞赛奖项级别", "select", ["国际", "国家级", "省级", "市级", "校级", "无"]],
      ],
    },
  ],
  "tab-other": [
    {
      title: "附加问题（常见统一口径）",
      prefix: "extra",
      fields: [
        ["obey", "是否服从公司分配", "select", ["是", "否"]],
        ["dispatch", "是否接受外派", "select", ["是", "否"]],
        ["overseas", "是否接受海外欠发达地区分配", "select", ["是", "否"]],
        ["relatives", "是否有亲属在本公司工作", "select", ["是", "否"]],
      ],
    },
    {
      title: "自我描述",
      prefix: "self",
      fields: [["description", "自我描述/自我评价", "textarea", null, true]],
    },
  ],
};

// 经历列表段落（可视化增删条目）
const FW_LISTS = [
  { key: "educations", title: "教育经历", hint: "请从高中/大学起填", fields: [
    ["school", "学校名称"], ["college", "学院名称"], ["major", "专业名称"],
    ["degree", "学历", "select", ["大专", "本科", "硕士", "博士"]],
    ["degree_level", "学位", "select", ["学士", "硕士", "博士"]],
    ["subject", "学科"], ["train_mode", "培养方式/学习形式"],
    ["rank", "专业排名", "select", ["前10%", "前25%", "前50%", "其他"]],
    ["tongzhao", "是否统招", "select", ["是", "否"]],
    ["abroad", "是否海外留学", "select", ["是", "否"]],
    ["start", "开始时间", "month"], ["end", "结束时间", "month"],
  ]},
  { key: "internships", title: "实习经历", fields: [
    ["company", "单位名称"], ["title", "角色/职位"],
    ["start", "开始时间", "month"], ["end", "结束时间", "month"],
    ["description", "实习内容", "textarea"],
  ]},
  { key: "projects", title: "项目经历", fields: [
    ["name", "项目名称"], ["role", "职务"],
    ["start", "开始时间", "month"], ["end", "结束时间", "month"],
    ["description", "项目描述", "textarea"],
  ]},
  { key: "awards", title: "获奖情况", fields: [
    ["name", "奖项名称"], ["date", "获奖时间", "month"],
    ["level", "获奖级别", "select", ["国家级", "省级", "校级", "院级"]],
    ["description", "获奖描述", "textarea"],
  ]},
  { key: "languages", title: "语言能力", fields: [
    ["language", "语言类型", "select", ["英语", "日语", "法语", "德语", "俄语", "其他"]],
    ["score", "证书等级/分数"],
    ["proficiency", "掌握程度", "select", ["简单对话", "日常会话", "流利", "精通"]],
  ]},
  { key: "researches", title: "研究成果（专利/论文）", fields: [
    ["name", "名称"], ["date", "时间", "month"], ["level", "等级"],
    ["description", "描述", "textarea"],
  ]},
  { key: "games", title: "游戏经历（游戏公司网申）", fields: [
    ["name", "游戏名称"], ["hours", "游戏时长"],
    ["depth", "游玩程度", "textarea"],
  ]},
];

// 示例档案（虚构数据，结构即 v2 全集）
const FW_EXAMPLE_PROFILE = {
  basic: {
    name: "张三", nickname: "小三", last_pinyin: "zhang", first_pinyin: "san",
    gender: "男", birth_date: "2002-06-15", phone: "13800001234", email: "zhangsan@example.com",
    id_type: "身份证", id_card: "110101200206150011", nationality: "中国",
    city: "北京海淀", native_place: "浙江杭州", ethnic: "汉族",
    height: "178", weight: "65", huji_type: "居民户口", marital: "未婚", political: "共青团员",
    qq: "12345678", wechat: "zhangsan_wx", homepage: "https://github.com/zhangsan",
  },
  expect: { position: "后端开发", city: "北京", salary: "10000-15000元/月", source: "内部推荐", adjust: "是" },
  edu: {
    benke_school: "浙江大学", benke_subject: "工学", benke_major: "软件工程",
    graduate_school: "浙江大学", top_subject: "工学", top_major: "软件工程",
    rank: "前25%", fresh: "应届", english_level: "CET-6", english_score: "550",
    computer_level: "三级", scholarship: "校一等奖学金", outstanding: "校级",
    project_count: "3-5个", cadre_level: "院级", cadre_title: "学习委员", contest_level: "省级",
  },
  educations: [
    { school: "浙江大学", major: "软件工程", degree: "本科", degree_level: "学士", start: "2020-09", end: "2024-06", train_mode: "全日制", tongzhao: "是" },
  ],
  internships: [
    { company: "字节跳动", title: "后端开发实习生", start: "2025-03", end: "2025-09", description: "负责活动平台服务端开发。" },
  ],
  projects: [
    { name: "MAI-agent", role: "全栈开发", start: "2026-08", end: "至今", description: "桌面端 AI Agent 助手。" },
  ],
  awards: [
    { name: "国家奖学金", date: "2022-10", level: "国家级" },
  ],
  languages: [
    { language: "英语", score: "CET-6 550", proficiency: "日常会话" },
  ],
  games: [
    { name: "Minecraft", hours: "单机时长 500h+", depth: "熟练各类生存技巧与自动化工程。" },
  ],
  researches: [],
  extra: { obey: "是", dispatch: "是", overseas: "否", relatives: "否" },
  self: { description: "算法基础扎实，有两个完整落地项目，习惯 AI 原生开发。" },
  sectionAliases: { "游戏经历": "games", "语言能力": "languages", "研究成果": "researches" },
};

const DEFAULT_LLM = { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "" };
const $ = (id) => document.getElementById(id);
let profile = {};

// ---------------- 工具 ----------------
function setByPath(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function msg(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = "msg " + (cls || "");
  setTimeout(() => { el.textContent = ""; }, 4000);
}

// ---------------- 对象字段渲染 ----------------
function fieldHtml(prefix, f) {
  const [k, label, type, options, wide] = f;
  const path = prefix + "." + k;
  const cur = profile[prefix] ? profile[prefix][k] : undefined;
  const v = cur == null ? "" : cur;
  const cls = "field" + (wide || type === "textarea" ? " wide" : "");
  let input;
  if (type === "select") {
    const opts = ['<option value=""></option>']
      .concat(options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`));
    input = `<select data-p="${path}">${opts.join("")}</select>`;
  } else if (type === "textarea") {
    input = `<textarea data-p="${path}" placeholder="${esc(label)}">${esc(v)}</textarea>`;
  } else {
    input = `<input type="${type === "date" ? "date" : type === "month" ? "month" : "text"}" data-p="${path}" value="${esc(v)}" placeholder="${esc(label)}">`;
  }
  return `<div class="${cls}"><label>${esc(label)}</label>${input}</div>`;
}

function renderObjectTab(tabId) {
  const groups = FW_TAB_GROUPS[tabId] || [];
  const el = $(tabId);
  el.innerHTML = groups.map((g) =>
    `<div class="group-title">${esc(g.title)}</div><div class="grid">` +
    g.fields.map((f) => fieldHtml(g.prefix, f)).join("") +
    `</div>`
  ).join("");
}

// ---------------- 经历列表渲染 ----------------
function listItemHtml(listKey, f, item, idx) {
  const [k, label, type, options] = f;
  const path = `${listKey}.${idx}.${k}`;
  const v = item && item[k] != null ? item[k] : "";
  let input;
  if (type === "select") {
    const opts = ['<option value=""></option>'].concat(options.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`));
    input = `<select data-p="${path}">${opts.join("")}</select>`;
  } else if (type === "textarea") {
    input = `<textarea data-p="${path}" placeholder="${esc(label)}">${esc(v)}</textarea>`;
  } else {
    input = `<input type="${type === "month" ? "month" : "text"}" data-p="${path}" value="${esc(v)}" placeholder="${esc(label)}">`;
  }
  return `<div class="field"><label>${esc(label)}</label>${input}</div>`;
}

function renderList(list, open) {
  const items = Array.isArray(profile[list.key]) ? profile[list.key] : [];
  const cards = items.map((it, i) =>
    `<div class="card" data-list="${list.key}" data-idx="${i}">
       <div class="card-head"><span>#${i + 1}</span><button class="del" data-del="${list.key}.${i}">删除</button></div>
       <div class="grid">${list.fields.map((f) => listItemHtml(list.key, f, it, i)).join("")}</div>
     </div>`).join("");
  return `<details class="list" ${open ? "open" : ""}>
    <summary>${esc(list.title)} <span class="cnt">(${items.length})</span></summary>
    <div class="body">${cards || '<p class="hint">暂无条目</p>'}
      <button class="add-one" data-add="${list.key}">＋ 添加${esc(list.title)}</button></div>
  </details>`;
}

function renderListsTab() {
  $("tab-lists").innerHTML =
    FW_LISTS.map((l, i) => renderList(l, i < 2)).join("") +
    `<div class="group-title">自定义段落别名（可选）</div>
     <p class="hint">站点里有内置没有的经历段落（如游戏经历、志愿者经历）时，填「页面段落关键词 → 你的列表键」，
     插件即按此把该段落对应到你的列表。列表本身在 JSON 页添加。</p>
     <div id="alias-box"></div>
     <button class="add-one" id="alias-add" style="margin-top:6px">＋ 添加别名</button>`;
  renderAliases();
}

function renderAliases() {
  const box = $("alias-box");
  const aliases = profile.sectionAliases && typeof profile.sectionAliases === "object" ? profile.sectionAliases : {};
  box.innerHTML = Object.keys(aliases).map((kw, i) =>
    `<div class="alias-row"><input value="${esc(kw)}" data-alias-kw="${i}" placeholder="段落关键词，如 游戏经历">
      <span class="arrow">→</span>
      <input value="${esc(aliases[kw])}" data-alias-key="${i}" placeholder="列表键，如 games">
      <button class="del" data-alias-del="${i}">删</button></div>`).join("");
  // 与 profile 双向绑定（在 blur 时同步）
  [...box.querySelectorAll("[data-alias-kw]")].forEach((inp) => {
    inp.addEventListener("change", () => {
      const keys = Object.keys(profile.sectionAliases);
      const old = keys[Number(inp.dataset.aliasKw)];
      const val = profile.sectionAliases[old];
      delete profile.sectionAliases[old];
      if (inp.value.trim()) profile.sectionAliases[inp.value.trim()] = val;
      renderAliases();
    });
  });
  [...box.querySelectorAll("[data-alias-key]")].forEach((inp) => {
    inp.addEventListener("change", () => {
      const keys = Object.keys(profile.sectionAliases);
      profile.sectionAliases[keys[Number(inp.dataset.aliasKey)]] = inp.value.trim();
    });
  });
  [...box.querySelectorAll("[data-alias-del]")].forEach((btn) => {
    btn.addEventListener("click", () => {
      const keys = Object.keys(profile.sectionAliases);
      delete profile.sectionAliases[keys[Number(btn.dataset.aliasDel)]];
      renderAliases();
    });
  });
}

// ---------------- 事件绑定 ----------------
function bindDelegation() {
  // 通用：data-path 输入直接写回 profile
  document.body.addEventListener("input", (e) => {
    const p = e.target.getAttribute && e.target.getAttribute("data-p");
    if (!p) return;
    setByPath(profile, p, e.target.value);
  });
  // 列表增删
  document.body.addEventListener("click", (e) => {
    const add = e.target.getAttribute && e.target.getAttribute("data-add");
    if (add) {
      if (!Array.isArray(profile[add])) profile[add] = [];
      profile[add].push({});
      renderListsTab();
      return;
    }
    const del = e.target.getAttribute && e.target.getAttribute("data-del");
    if (del) {
      const [key, idxStr] = del.split(".");
      profile[key].splice(Number(idxStr), 1);
      renderListsTab();
    }
  });
  $("alias-add").addEventListener("click", () => {
    if (!profile.sectionAliases) profile.sectionAliases = {};
    profile.sectionAliases["新段落关键词"] = "games";
    renderAliases();
  });
}

// ---------------- 页签 ----------------
function bindTabs() {
  $("tabs").addEventListener("click", (e) => {
    const id = e.target.getAttribute && e.target.getAttribute("data-tab");
    if (!id) return;
    [...$("tabs").children].forEach((b) => b.classList.toggle("on", b === e.target));
    [...document.querySelectorAll(".tab")].forEach((t) => t.classList.toggle("on", t.id === id));
  });
}

// ---------------- 初始化/保存 ----------------
async function init() {
  const stored = await chrome.storage.local.get(["profile", "llm"]);
  profile = stored.profile && typeof stored.profile === "object" ? JSON.parse(JSON.stringify(stored.profile)) : JSON.parse(JSON.stringify(FW_EXAMPLE_PROFILE));
  const cfg = stored.llm || DEFAULT_LLM;

  Object.keys(FW_TAB_GROUPS).forEach(renderObjectTab);
  renderListsTab();
  $("json").value = JSON.stringify(profile, null, 2);

  $("llm-base").value = cfg.baseUrl || "";
  $("llm-model").value = cfg.model || "";
  $("llm-key").value = cfg.apiKey || "";
  refreshLLMState();
  $("link-demo").href = chrome.runtime.getURL("demo/demo_form.html");

  bindTabs();
  bindDelegation();

  $("btn-save").addEventListener("click", async () => {
    try {
      await chrome.storage.local.set({ profile });
      msg("save-msg", "√ 简历已保存", "ok");
    } catch (e) {
      msg("save-msg", "保存失败: " + e.message, "err");
    }
  });
  $("btn-plan").addEventListener("click", startPlan);
  $("btn-save-llm").addEventListener("click", async () => {
    const cfg2 = {
      baseUrl: $("llm-base").value.trim() || DEFAULT_LLM.baseUrl,
      model: $("llm-model").value.trim() || DEFAULT_LLM.model,
      apiKey: $("llm-key").value.trim(),
    };
    await chrome.storage.local.set({ llm: cfg2 });
    refreshLLMState();
    msg("llm-msg", cfg2.apiKey ? "√ 已保存，语义匹配已启用" : "已保存（当前为离线规则模式）", "ok");
  });
  $("btn-json-sync").addEventListener("click", () => {
    $("json").value = JSON.stringify(profile, null, 2);
    msg("json-msg", "√ 已从表单生成", "ok");
  });
  $("btn-json-apply").addEventListener("click", () => {
    try {
      const data = JSON.parse($("json").value);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("顶层必须是 JSON 对象");
      profile = data;
      Object.keys(FW_TAB_GROUPS).forEach(renderObjectTab);
      renderListsTab();
      msg("json-msg", "√ 已应用到表单，记得点「保存简历」", "ok");
    } catch (e) {
      msg("json-msg", "JSON 格式错误: " + e.message, "err");
    }
  });
}

async function refreshLLMState() {
  const { llm } = await chrome.storage.local.get("llm");
  const on = !!(llm && llm.apiKey);
  const el = $("llm-state");
  el.textContent = on ? "LLM 已启用" : "离线规则模式";
  el.className = "state" + (on ? "" : " off");
}

async function startPlan() {
  const btn = $("btn-plan");
  btn.disabled = true;
  msg("plan-msg", "正在分析当前页面…");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("未找到活动标签页");
    const resp = await chrome.tabs.sendMessage(tab.id, { cmd: "FW_PLAN" });
    if (resp && resp.error) throw new Error(resp.error);
    msg("plan-msg", "√ 已生成，请回到页面右上角悬浮面板确认", "ok");
    setTimeout(() => window.close(), 1200);
  } catch (e) {
    const text = String(e.message || e);
    msg("plan-msg",
      text.includes("Could not establish connection") || text.includes("Receiving end does not exist")
        ? "该页面无法注入（浏览器内置页/请刷新页面后重试/file页面需开启“允许访问文件网址”）"
        : text, "err");
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
}

document.addEventListener("DOMContentLoaded", init);
