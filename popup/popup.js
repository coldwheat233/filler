// ============ Popup 逻辑 ============
// 简历档案与 LLM 配置都存 chrome.storage.local，不上传任何服务器
// （LLM 请求也只发往用户自己填写的接口地址）。

const FW_EXAMPLE_PROFILE = {
  basic: {
    name: "张三",
    gender: "男",
    birth_date: "2002-06-15",
    phone: "13800001234",
    email: "zhangsan@example.com",
    id_card: "110101200206150011",
    political: "共青团员",
    ethnic: "汉族",
    native_place: "浙江杭州",
    city: "北京海淀",
    height: "178",
    weight: "65",
  },
  expect: {
    position: "数据分析师",
    city: "北京",
    salary: "10000-15000元/月",
  },
  educations: [
    { school: "浙江大学", major: "统计学", degree: "本科", start: "2020-09", end: "2024-06" },
    { school: "中国人民大学", major: "应用统计", degree: "硕士", start: "2024-09", end: "2026-06" },
  ],
  internships: [
    {
      company: "字节跳动",
      title: "数据分析实习生",
      start: "2025-03",
      end: "2025-09",
      description: "负责抖音电商活动复盘，搭建指标看板，活动GMV环比提升18%。",
    },
    {
      company: "美团",
      title: "商业分析实习生",
      start: "2024-06",
      end: "2024-12",
      description: "对接到店业务线，输出周报自动化脚本，节省人力约10小时/周。",
    },
  ],
  awards: [
    { name: "国家奖学金", level: "国家级", date: "2022-10" },
    { name: "校一等奖学金", level: "校级", date: "2023-10" },
  ],
  projects: [
    { name: "校园二手交易平台", role: "后端负责人", description: "使用 Django + Redis 搭建，日均订单 300+。" },
  ],
};

const DEFAULT_LLM = {
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  apiKey: "",
};

const $ = (id) => document.getElementById(id);

async function init() {
  const { profile, llm } = await chrome.storage.local.get(["profile", "llm"]);
  $("profile").value = JSON.stringify(profile || FW_EXAMPLE_PROFILE, null, 2);
  const cfg = llm || DEFAULT_LLM;
  $("llm-base").value = cfg.baseUrl || "";
  $("llm-model").value = cfg.model || "";
  $("llm-key").value = cfg.apiKey || "";
  refreshLLMState();
  $("link-demo").href = chrome.runtime.getURL("demo/demo_form.html");
  $("link-demo").target = "_blank";

  $("btn-example").addEventListener("click", () => {
    $("profile").value = JSON.stringify(FW_EXAMPLE_PROFILE, null, 2);
    msg("profile-msg", "已载入示例（记得保存）", "ok");
  });
  $("btn-save-profile").addEventListener("click", async () => {
    try {
      const data = JSON.parse($("profile").value);
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("顶层必须是 JSON 对象");
      await chrome.storage.local.set({ profile: data });
      msg("profile-msg", "√ 已保存", "ok");
    } catch (e) {
      msg("profile-msg", "JSON 格式错误: " + e.message, "err");
    }
  });
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
  $("btn-plan").addEventListener("click", startPlan);
}

function msg(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = "msg " + (cls || "");
  setTimeout(() => { el.textContent = ""; }, 4000);
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
    msg("plan-msg", "√ 已生成，请回到页面上方右侧的悬浮面板确认", "ok");
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
