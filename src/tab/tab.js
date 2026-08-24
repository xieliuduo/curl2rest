import { createEditor } from "./editor.js";
import { parseRequest, toHttp, toCurl } from "../core/format.js";
import { substitute } from "../core/variables.js";
import { describeError } from "../core/errors.js";
import { loadHistory, pushHistory } from "../core/history.js";
import { MSG } from "../shared/messages.js";

const SAMPLE = [
  "POST https://httpbin.org/post HTTP/1.1",
  "content-type: application/json",
  "",
  '{\n  "name": "sample",\n  "time": "Wed, 21 Oct 2015 18:27:50 GMT"\n}',
].join("\n");

const editor = createEditor(document.getElementById("editor"), SAMPLE);

const $ = (id) => document.getElementById(id);
const statusBar = $("status-bar");
const panelBody = $("panel-body");
const panelHeaders = $("panel-headers");
const errorCard = $("error-card");

// 环境:v1 从 storage 读一个简单的键值 map(可为空)
let envVars = {};
chrome.storage.local.get("curl2rest_env").then((g) => { envVars = g.curl2rest_env || {}; });

// ---- 格式转换按钮 ----
$("btn-to-curl").onclick = () => tryConvert((obj) => toCurl(obj));
$("btn-to-http").onclick = () => tryConvert((obj) => toHttp(obj));

function tryConvert(fn) {
  try {
    const obj = parseRequest(editor.getValue());
    editor.setValue(fn(obj));
    hideError();
  } catch (e) {
    renderError(e.code, e.message);
  }
}

// ---- 发送 ----
$("btn-send").onclick = send;

async function send() {
  hideError();
  let req;
  try {
    const raw = substitute(editor.getValue(), envVars);
    req = parseRequest(raw);
  } catch (e) {
    renderError(e.code, e.message);
    return;
  }

  statusBar.textContent = "请求中…";
  statusBar.className = "status-bar";

  const resp = await chrome.runtime.sendMessage({ type: MSG.SEND_REQUEST, payload: req });

  if (!resp || !resp.ok) {
    renderError(resp?.errorType || "UNKNOWN", resp?.rawMessage || "无响应");
    return;
  }
  renderResponse(resp);
  await refreshHistory(await pushHistory({ ...req, at: Date.now() }));
}

// ---- 渲染响应 ----
function renderResponse(resp) {
  errorCard.classList.add("hidden");
  const cls = "s" + String(resp.status)[0];
  statusBar.className = "status-bar " + cls;
  const hint = resp.status >= 400 ? " · 服务器返回了错误状态" : "";
  statusBar.textContent = `${resp.status} ${resp.statusText} · ${resp.timeMs}ms${hint}`;

  // body:尝试 JSON 美化
  let body = resp.body;
  try { body = JSON.stringify(JSON.parse(resp.body), null, 2); } catch {}
  const LIMIT = 5 * 1024 * 1024;
  if (body.length > LIMIT) body = body.slice(0, LIMIT) + "\n…(响应内容过大,已只显示前 5MB)";
  panelBody.textContent = body;
  panelHeaders.textContent = Object.entries(resp.headers)
    .map(([k, v]) => `${k}: ${v}`).join("\n");
}

// ---- 渲染友好错误卡片 ----
function renderError(code, rawMessage) {
  const d = describeError(code);
  statusBar.textContent = "请求失败";
  statusBar.className = "status-bar s5";
  errorCard.innerHTML = `
    <h3>⚠️ ${d.title}</h3>
    <div class="row"><span class="label">可能原因:</span>${d.reason}</div>
    <div class="row"><span class="label">建议:</span>${d.suggestion}</div>
    <details><summary>查看技术详情</summary><pre>${escapeHtml(rawMessage || "")}</pre></details>
  `;
  errorCard.classList.remove("hidden");
}
function hideError() { errorCard.classList.add("hidden"); }
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// ---- Body/Headers 切换 ----
document.querySelectorAll(".tab").forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const isBody = btn.dataset.tab === "body";
    panelBody.classList.toggle("hidden", !isBody);
    panelHeaders.classList.toggle("hidden", isBody);
  };
});

// ---- 历史记录 ----
async function refreshHistory(list) {
  const ul = $("history-list");
  ul.innerHTML = "";
  (list || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.method} ${item.url}`;
    li.onclick = () => editor.setValue(toHttp(item));
    ul.appendChild(li);
  });
}
loadHistory().then(refreshHistory);
