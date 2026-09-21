// ============ 规则表与匹配器 ============
// 内容脚本共享作用域：FW_ 前缀避免与页面/其他脚本冲突。

// 常见网申字段关键词（label > placeholder > name 依次匹配，全部小写比较）
const FW_RULES = [
  ["basic.name", ["姓名", "真实姓名", "name", "full name"]],
  ["basic.gender", ["性别", "gender", "sex"]],
  ["basic.birth_date", ["出生", "生日", "birth"]],
  ["basic.phone", ["手机", "电话", "mobile", "phone", "tel", "联系"]],
  ["basic.email", ["邮箱", "邮件", "email", "e-mail", "mail"]],
  ["basic.id_card", ["身份证", "证件号", "证件号码", "id card", "identity"]],
  ["basic.political", ["政治面貌", "政治", "political", "党派"]],
  ["basic.ethnic", ["民族", "ethnic"]],
  ["basic.native_place", ["籍贯", "生源地", "户籍"]],
  ["basic.city", ["现居住", "居住地", "所在地", "现居", "常住"]],
  ["basic.qq", ["qq", "扣扣"]],
  ["basic.wechat", ["微信", "wechat", "weixin"]],
  ["basic.height", ["身高"]],
  ["basic.weight", ["体重"]],
  ["basic.marital", ["婚姻", "婚况"]],
  ["expect.position", ["应聘岗位", "意向岗位", "申请职位", "求职意向", "岗位", "position"]],
  ["expect.city", ["期望城市", "意向城市", "期望工作地", "工作城市", "意向地点"]],
  ["expect.salary", ["期望薪资", "期望薪酬", "薪资", "薪酬", "salary", "月薪"]],
];

// 重复段落主题：添加按钮文案 / 条目字段 label 命中 => 对应简历中的哪个列表
const FW_REPEATER_THEMES = [
  ["internships", ["实习", "工作经历", "工作经验", "工作", "internship", "work experience"]],
  ["projects", ["项目", "project"]],
  ["awards", ["获奖", "奖项", "荣誉", "奖学金", "award", "honor"]],
  ["educations", ["教育", "学习经历", "学历", "education"]],
  ["trainings", ["培训", "training"]],
  ["skills", ["技能", "证书", "skill", "certificate"]],
];

// 重复段落内部子字段：主题 -> [[条目子键, 关键词...]]
const FW_THEME_SUBFIELD_RULES = {
  internships: [
    ["company", ["公司", "单位", "企业", "机构", "employer", "company"]],
    ["title", ["职位", "岗位", "职务", "担任", "role", "title"]],
    ["department", ["部门"]],
    ["start", ["开始", "起始", "from", "start"]],
    ["end", ["结束", "毕业", "至", "to", "end"]],
    ["description", ["内容", "描述", "职责", "业绩", "简介", "工作", "description"]],
  ],
  projects: [
    ["name", ["项目名称", "项目", "名称", "name"]],
    ["role", ["角色", "担任", "职责", "我的", "role"]],
    ["start", ["开始", "起始", "start"]],
    ["end", ["结束", "end"]],
    ["description", ["描述", "内容", "简介", "业绩", "description"]],
  ],
  awards: [
    // 具体字段放前面：裸「获奖/名称」这类宽泛词放最后兜底，
    // 否则「获奖等级」「获奖时间」都会先被 name 的「获奖」吃掉
    ["level", ["获奖等级", "等级", "级别", "level"]],
    ["date", ["获奖时间", "时间", "日期", "年月", "date"]],
    ["name", ["奖项名称", "奖项", "名称", "荣誉", "award", "name"]],
    ["description", ["描述", "说明", "description"]],
  ],
  educations: [
    ["school", ["学校", "院校", "大学", "学院", "school"]],
    ["major", ["专业", "major"]],
    ["degree", ["学历", "学位", "degree"]],
    ["start", ["开始", "入学", "start"]],
    ["end", ["结束", "毕业", "end"]],
  ],
};

const FW_FILTH = /[*＊（(][^*＊（）()]*[*＊）)]|必填|选填|required|:：|请输入|please enter|\d+[.、]/gi;

function fwNorm(s) {
  return (s == null ? "" : String(s)).toLowerCase().replace(FW_FILTH, "").replace(/\s+/g, " ").trim();
}

function fwContainsKeyword(text, kw) {
  // ASCII 关键词按词元匹配：避免 name 命中 name@domain.com、tel 命中 hotel 之类
  if (/[a-z]/i.test(kw)) {
    const esc = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp("(^|[^a-z0-9])" + esc + "([^a-z0-9]|$)").test(text);
  }
  return text.includes(kw);
}

function fwMatchByRules(label, name, extra) {
  // 整表先扫 label，再 name，最后 placeholder：标签的优先级必须整体高于占位符，
  // 否则占位符文本会抢在真正 label 之前命中其他字段（如 name@domain.com → 姓名）
  const fields = [fwNorm(label), fwNorm(name), fwNorm(extra)];
  for (const f of fields) {
    if (!f) continue;
    for (const [path, keywords] of FW_RULES) {
      for (const kw of keywords) {
        if (fwContainsKeyword(f, kw)) return path;
      }
    }
  }
  return null;
}

function fwMatchRepeaterTheme(text) {
  const t = fwNorm(text);
  for (const [listPath, keywords] of FW_REPEATER_THEMES) {
    for (const kw of keywords) {
      if (t.includes(kw)) return listPath;
    }
  }
  return null;
}

// ---------------- 选项匹配（选择式条目核心） ----------------
function fwStripNote(s) {
  return String(s || "").replace(/[（(][^（）()]*[)）]/g, "").trim();
}

// 简历值 -> 页面选项：精确 -> 去括号注释 -> 包含
function fwMatchOption(options, value) {
  if (value == null || String(value).trim() === "") return { idx: null, how: "无值" };
  const v = String(value).trim();
  for (let i = 0; i < options.length; i++) {
    if (String(options[i]).trim() === v) return { idx: i, how: "精确" };
  }
  for (let i = 0; i < options.length; i++) {
    if (fwStripNote(options[i]) === fwStripNote(v)) return { idx: i, how: "去注释" };
  }
  for (let i = 0; i < options.length; i++) {
    const o = String(options[i]).trim();
    if (o && (o.includes(v) || v.includes(o))) return { idx: i, how: "包含" };
  }
  return { idx: null, how: "未命中" };
}

// ---------------- profile 工具 ----------------
function fwFlatten(obj, prefix) {
  const out = {};
  prefix = prefix || "";
  if (obj && typeof obj === "object" && !Array.isArray(obj)) {
    for (const k of Object.keys(obj)) {
      const p = prefix ? prefix + "." + k : String(k);
      Object.assign(out, fwFlatten(obj[k], p));
    }
  } else if (Array.isArray(obj)) {
    obj.forEach((v, i) => Object.assign(out, fwFlatten(v, prefix + "." + i)));
  } else {
    out[prefix] = obj;
  }
  return out;
}

function fwGetByPath(profile, path) {
  let cur = profile;
  for (const part of String(path).split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(part);
      cur = Number.isInteger(i) ? cur[i] : undefined;
    } else if (typeof cur === "object") {
      cur = cur[part];
    } else {
      return undefined;
    }
  }
  return cur;
}

function fwDescribeProfile(profile, maxItems) {
  maxItems = maxItems || 3;
  const flat = fwFlatten(profile);
  const lines = [];
  for (const path of Object.keys(flat)) {
    const parts = path.split(".");
    if (parts.length >= 2 && /^\d+$/.test(parts[parts.length - 2]) && Number(parts[parts.length - 2]) >= maxItems) continue;
    lines.push(path + " = " + flat[path]);
  }
  return lines.join("\n");
}

// ---------------- LLM（经 background 代理，绕开 CORS） ----------------
function fwParseJSONLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (m) t = m[1].trim();
  try {
    return JSON.parse(t);
  } catch (e) {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) { return null; }
    }
    return null;
  }
}

function fwLLMChatJSON(system, user) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: "FW_LLM_CHAT", payload: { system, user } }, (resp) => {
        if (chrome.runtime.lastError) return resolve(null);
        if (!resp || resp.error || !resp.content) return resolve(null);
        resolve(fwParseJSONLoose(resp.content));
      });
    } catch (e) {
      resolve(null);
    }
  });
}

async function fwHasLLM() {
  const { llm } = await chrome.storage.local.get("llm");
  return !!(llm && llm.apiKey && llm.baseUrl);
}

// 选择式字段：规则匹配未命中时，让 LLM 从选项里挑最接近的
async function fwLLMPickOption(options, value) {
  if (!options || !options.length || value == null || value === "") return null;
  const has = await fwHasLLM();
  if (!has) return null;
  const data = await fwLLMChatJSON(
    '从给定选项中选出与目标值最匹配的一个，找不到就输出 null。只输出 JSON：{"choice": "选项文本"} 或 {"choice": null}',
    "目标值: " + value + "\n选项列表: " + JSON.stringify(options)
  );
  if (data && data.choice != null) {
    const hit = options.find((o) => String(o) === String(data.choice));
    if (hit != null) return hit;
  }
  return null;
}

// ---------------- 映射缓存（storage.local，同站点二次填报免 LLM） ----------------
async function fwLoadCache() {
  const { fwCache } = await chrome.storage.local.get("fwCache");
  return fwCache || {};
}
async function fwSaveCache(cache) {
  await chrome.storage.local.set({ fwCache: cache });
}
function fwCacheGet(cache, fp, sig) {
  return cache[fp] && cache[fp][sig];
}
function fwCacheSet(cache, fp, sig, val) {
  if (!cache[fp]) cache[fp] = {};
  cache[fp][sig] = val;
}
