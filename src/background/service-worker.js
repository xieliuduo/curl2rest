import { MSG } from "../shared/messages.js";

// 点击图标 → 打开标签页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/tab/tab.html") });
});

// 把 fetch 异常分类成错误码(供 UI 查友好文案)
function classifyError(err) {
  const msg = (err && err.message ? err.message : "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) return "NET_FAILED";
  if (msg.includes("name_not_resolved") || msg.includes("dns")) return "NET_DNS";
  if (msg.includes("timed out") || msg.includes("timeout")) return "NET_TIMEOUT";
  return "UNKNOWN";
}

async function doFetch(req) {
  const start = performance.now();
  const init = { method: req.method, headers: req.headers || {} };
  if (req.body != null && !["GET", "HEAD"].includes(req.method)) init.body = req.body;

  const resp = await fetch(req.url, init);
  const text = await resp.text();
  const timeMs = Math.round(performance.now() - start);
  const headers = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });

  return {
    ok: true,
    status: resp.status,
    statusText: resp.statusText,
    headers,
    body: text,
    timeMs,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MSG.SEND_REQUEST) {
    doFetch(message.payload)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, errorType: classifyError(err), rawMessage: String(err) })
      );
    return true; // 异步响应
  }
});
