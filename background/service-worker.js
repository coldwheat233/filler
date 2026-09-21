// ============ Background Service Worker ============
// 职责：代理 LLM 请求。content script 的 fetch 受页面源 CORS 限制，
// 而 service worker 声明了 host_permissions，可直连任意 OpenAI 兼容接口。

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "FW_LLM_CHAT") {
    fwHandleLLM(msg.payload || {})
      .then((content) => sendResponse({ content }))
      .catch((e) => sendResponse({ error: String((e && e.message) || e) }));
    return true; // 异步响应
  }
  return undefined;
});

async function fwHandleLLM(p) {
  const { llm } = await chrome.storage.local.get("llm");
  const baseUrl = String(p.baseUrl || (llm && llm.baseUrl) || "").replace(/\/+$/, "");
  const apiKey = p.apiKey || (llm && llm.apiKey) || "";
  const model = p.model || (llm && llm.model) || "deepseek-chat";
  const temperature = typeof p.temperature === "number" ? p.temperature : 0;
  if (!baseUrl || !apiKey) {
    throw new Error("LLM 未配置：请在插件弹窗里填写接口地址和 api_key");
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model,
        temperature,
        messages: [
          { role: "system", content: p.system || "" },
          { role: "user", content: p.user || "" },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`LLM 接口 ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    const content = data.choices && data.choices[0] && data.choices[0].message;
    return (content && content.content) || "";
  } finally {
    clearTimeout(timer);
  }
}
