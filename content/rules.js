// ============ 规则表与匹配器 ============
// 内容脚本共享作用域：FW_ 前缀避免与页面/其他脚本冲突。

// 常见网申字段关键词。匹配顺序：label 整表优先于 name，再 placeholder；
// 同一条链内规则数组顺序即优先级——具体词（本科学校）必须排在宽泛词前面
const FW_RULES = [
  ["basic.name", ["姓名", "真实姓名", "full name", "name"]],
  ["basic.nickname", ["花名", "昵称", "艺名", "nickname"]],
  ["basic.last_pinyin", ["姓全拼", "姓拼音", "姓氏拼音"]],
  ["basic.first_pinyin", ["名全拼", "名拼音", "名字拼音"]],
  ["basic.gender", ["性别", "gender", "sex"]],
  ["basic.birth_date", ["出生", "生日", "birth"]],
  // IM/户口地的关键词含「联系/所在地」等宽泛词，必须排在 phone/city 之前
  ["basic.im", ["im联系方式", "im联系"]],
  ["basic.phone", ["手机", "电话", "mobile", "phone", "tel", "联系"]],
  ["basic.email", ["邮箱", "邮件", "email", "e-mail"]],
  ["basic.id_type", ["证件类型", "证件种类"]],
  ["basic.id_card", ["身份证", "证件号", "id card", "identity"]],
  ["basic.nationality", ["国籍", "nationality"]],
  ["basic.childhood_city", ["童年时所在城市", "童年", "儿时"]],
  ["basic.huji_place", ["户口所在地", "户口地", "户籍地"]],
  ["basic.city", ["现居住", "居住地", "所在地", "现居", "常住"]],
  ["basic.native_place", ["籍贯", "生源地"]],
  ["basic.huji_type", ["户口性质", "户口类型", "户籍类型"]],
  ["basic.huji_place", ["户口所在地", "户口地", "户籍地"]],
  ["basic.political", ["政治面貌", "政治", "political"]],
  ["basic.ethnic", ["民族", "ethnic"]],
  ["basic.height", ["身高"]],
  ["basic.weight", ["体重"]],
  ["basic.religion", ["宗教信仰", "宗教"]],
  ["basic.marital", ["婚否", "婚姻", "婚况"]],
  ["basic.qq", ["qq", "扣扣"]],
  ["basic.wechat", ["微信", "wechat", "weixin"]],
  ["basic.homepage", ["个人主页", "博客", "homepage", "github"]],
  ["basic.portfolio", ["作品链接", "作品集", "网盘", "portfolio"]],
  ["basic.weibo", ["微博"]],
  ["basic.zhihu", ["知乎"]],
  ["basic.douban", ["豆瓣"]],
  ["basic.xiaohongshu", ["小红书"]],
  ["basic.bilibili", ["b站", "bilibili"]],
  ["edu.benke_school", ["本科学校", "本科院校"]],
  ["edu.graduate_school", ["毕业学校", "毕业院校", "研究生学校"]],
  ["edu.benke_subject", ["本科学科"]],
  ["edu.top_subject", ["最高学历学科"]],
  ["edu.benke_major", ["本科专业"]],
  ["edu.top_major", ["最高学历毕业专业", "最高学历专业", "研究生专业"]],
  ["edu.rank", ["专业排名", "排名"]],
  ["edu.fresh", ["应届", "往届"]],
  ["edu.english_score", ["英语等级成绩", "英语成绩", "四级成绩", "六级成绩", "雅思成绩", "托福成绩"]],
  ["edu.english_level", ["英语等级", "英语水平", "英语能力"]],
  ["edu.other_lang", ["其他外语", "第二外语"]],
  ["edu.lang_level", ["外语等级"]],
  ["edu.computer_level", ["计算机等级", "计算机水平"]],
  ["edu.scholarship", ["奖学金"]],
  ["edu.outstanding", ["优秀毕业生", "优秀学生"]],
  ["edu.project_count", ["实习实践数量", "项目或实习", "项目实践数量"]],
  ["edu.cadre_level", ["干部职务级别", "干部级别"]],
  ["edu.cadre_title", ["担任如下职务", "曾任职务", "担任职务", "干部职务"]],
  ["edu.contest_level", ["竞赛的奖项级别", "竞赛奖项", "竞赛级别"]],
  ["expect.site", ["面试站点", "期望面试地", "面试城市"]],
  ["expect.adjust", ["岗位调剂", "服从调剂", "调剂"]],
  ["expect.position", ["应聘岗位", "意向岗位", "申请职位", "求职意向", "岗位", "position"]],
  ["expect.city", ["期望城市", "意向城市", "期望工作地", "工作城市", "意向地点"]],
  ["expect.salary_5y", ["五年后年薪", "五年后期望", "五年后"]],
  ["expect.salary", ["期望入职年薪", "期望年薪", "期望薪资", "期望薪酬", "年薪", "薪资", "薪酬", "salary", "月薪"]],
  ["expect.source", ["信息来源", "招聘来源", "校招来源", "来源渠道"]],
  ["expect.refcode", ["推荐码", "内推码", "推荐人"]],
  ["extra.obey", ["服从公司分配", "服从分配"]],
  ["extra.dispatch", ["接受外派", "外派"]],
  ["extra.overseas", ["海外欠发达", "海外分配", "海外工作", "驻外"]],
  ["extra.relatives", ["亲属"]],
  ["extra.intern_before_grad", ["毕业前能否实习", "毕业前实习", "能否实习"]],
  ["extra.gaokao_math", ["高考数学", "高考成绩"]],
  ["extra.smoke", ["吸烟", "抽烟"]],
  ["extra.infectious", ["传染病"]],
  ["extra.major_illness", ["重大病史"]],
  ["extra.chronic", ["慢性疾病", "慢性病"]],
  ["games_meta.total_hours", ["游戏上的总时长", "游戏总时长"]],
  ["games_meta.total_spend", ["游戏上的总花费", "游戏总花费"]],
  ["games_meta.console_games", ["单机游戏"]],
  ["games_meta.online_games", ["网络游戏"]],
  ["games_meta.mobile_games", ["手机游戏"]],
  ["self.description", ["自我描述", "自我评价", "自我介绍", "个人描述", "个人简介"]],
];

// 重复段落主题：添加按钮文案 / 条目字段 label 命中 => 对应简历中的哪个列表。
// 顺序即优先级：家庭成员/校园活动/竞赛 含「工作」「奖项」等宽泛词，
// 必须排在实习/获奖之前，否则会被后者抢走
const FW_REPEATER_THEMES = [
  ["family", ["家庭成员", "家庭信息", "父母", "亲属", "family"]],
  ["activities", ["校园活动", "社团", "协会", "学生组织", "学生工作", "activity"]],
  ["competitions", ["竞赛", "比赛", "contest", "competition"]],
  ["internships", ["实习", "工作经历", "工作经验", "工作", "internship", "work experience"]],
  ["projects", ["项目", "project"]],
  ["awards", ["获奖", "奖项", "荣誉", "奖学金", "award", "honor"]],
  ["educations", ["教育", "学习经历", "学历", "education"]],
  ["languages", ["语言能力", "语言", "language"]],
  ["researches", ["研究成果", "专利", "论文", "研究", "research", "publication"]],
  ["games", ["游戏经历", "游戏", "game"]],
  ["trainings", ["培训", "training"]],
  ["skills", ["技能", "证书", "skill", "certificate"]],
];

// 重复段落内部子字段：主题 -> [[条目子键, 关键词...]]
// 每个主题内规则顺序即优先级：具体词在前，宽泛词在后
const FW_THEME_SUBFIELD_RULES = {
  family: [
    ["name", ["姓名", "name"]],
    ["relation", ["关系", "称谓"]],
    ["age", ["年龄", "年纪"]],
    ["job", ["职业"]],
    ["position", ["职位", "职务"]],
    ["company", ["工作单位", "单位", "公司"]],
  ],
  activities: [
    ["org", ["组织单位", "单位", "协会", "社团", "组织"]],
    ["role", ["职务", "角色", "担任", "role"]],
    ["start", ["开始", "起始", "start"]],
    ["end", ["结束", "end"]],
    ["description", ["工作内容", "内容", "描述", "description"]],
  ],
  competitions: [
    ["name", ["竞赛奖项", "竞赛名称", "比赛名称", "奖项名称", "名称", "name"]],
    ["prize", ["奖励级别", "获奖等级", "奖项等级", "奖励等级", "奖励"]],
    ["level", ["竞赛级别", "级别", "level"]],
    ["date", ["时间", "日期", "date"]],
    ["description", ["竞赛说明", "说明", "描述", "description"]],
  ],
  internships: [
    ["company", ["单位名称", "公司名称", "公司", "单位", "企业", "机构", "employer", "company"]],
    ["title", ["职位", "岗位", "职务", "角色", "担任", "role", "title"]],
    ["department", ["部门"]],
    ["start", ["开始", "起始", "from", "start"]],
    ["end", ["结束", "毕业", "至", "to", "end"]],
    ["description", ["内容", "描述", "职责", "业绩", "简介", "工作", "description"]],
  ],
  projects: [
    ["name", ["项目名称", "项目经历名称", "项目", "名称", "name"]],
    ["role", ["项目职务", "职务", "角色", "担任", "职责", "我的", "role"]],
    ["start", ["开始", "起始", "start"]],
    ["end", ["结束", "end"]],
    ["description", ["描述", "内容", "简介", "业绩", "description"]],
  ],
  awards: [
    ["name", ["奖项名称", "奖项", "名称", "荣誉", "award", "name"]],
    ["level", ["获奖级别", "获奖等级", "等级", "级别", "level"]],
    ["date", ["获奖时间", "时间", "日期", "年月", "date"]],
    ["description", ["获奖描述", "描述", "说明", "description"]],
  ],
  educations: [
    ["school", ["学校名称", "学校", "院校", "大学", "school"]],
    ["college", ["学院名称", "学院", "分院"]],
    ["rank", ["专业排名", "排名"]],
    ["degree", ["学历", "degree"]],
    ["degree_level", ["学位"]],
    ["subject", ["学科"]],
    ["train_mode", ["培养方式", "学习形式"]],
    ["tongzhao", ["是否统招", "统招"]],
    ["abroad", ["海外", "留学"]],
    ["major", ["专业名称", "专业", "major"]],
    ["start", ["开始", "入学", "start"]],
    ["end", ["结束", "毕业", "end"]],
  ],
  languages: [
    ["language", ["语言类型", "语言", "language"]],
    ["score", ["证书等级", "分数", "成绩", "证书", "score"]],
    ["proficiency", ["掌握程度", "精通程度", "程度", "熟练"]],
  ],
  researches: [
    ["name", ["名称", "题目", "name"]],
    ["date", ["时间", "日期", "date"]],
    ["level", ["等级", "级别", "level"]],
    ["description", ["描述", "说明", "description"]],
  ],
  games: [
    ["hours", ["时长", "游戏时间", "hours"]],
    ["level", ["游戏等级", "段位", "等级", "level"]],
    ["rank", ["排名", "名次", "rank"]],
    ["name", ["游戏名称", "游戏名", "名称", "name"]],
    ["depth", ["精通程度", "游玩程度", "程度", "体验", "理解", "描述", "description"]],
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
        if (chrome.runtime.lastError) {
          console.warn("[网申填报助手] LLM 通道错误:", chrome.runtime.lastError.message);
          return resolve(null);
        }
        if (!resp || resp.error || !resp.content) {
          const err = (resp && resp.error) || "LLM 空响应";
          // 失败不能静默：控制台留痕 + 收集起来展示到计划面板
          console.warn("[网申填报助手] LLM 调用失败:", err);
          (window.__fwLLMErrors = window.__fwLLMErrors || []).push(String(err));
          return resolve(null);
        }
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
