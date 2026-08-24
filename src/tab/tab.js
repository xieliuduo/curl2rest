import { createEditor } from "./editor.js";
import { parseRequest, toHttp, toCurl } from "../core/format.js";
import { substitute } from "../core/variables.js";
import { describeError } from "../core/errors.js";
import { loadHistory, pushHistory, patchHistory, deleteHistory } from "../core/history.js";
import { renderJsonTree } from "./json-tree.js";
import { MSG } from "../shared/messages.js";

const SAMPLE = [
  "POST https://httpbin.org/post HTTP/1.1",
  "content-type: application/json",
  "",
  '{\n  "name": "sample",\n  "time": "Wed, 21 Oct 2015 18:27:50 GMT"\n}',
].join("\n");

const editor = createEditor(document.getElementById("editor"), SAMPLE);

// 显示版本号(构建时由 Vite 从 package.json 注入)
document.getElementById("app-version").textContent = "v" + __APP_VERSION__;

const $ = (id) => document.getElementById(id);
const statusBar = $("status-bar");
const panelBody = $("panel-body");
const panelHeaders = $("panel-headers");
const bodyToolbar = $("body-toolbar");
const headersToolbar = $("headers-toolbar");
const errorCard = $("error-card");

// 缓存最近一次响应,供复制按钮使用
let lastResp = null;

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
  historyCache = await pushHistory(req);
  refreshHistory(historyCache);
}

// ---- 渲染响应 ----
function renderResponse(resp) {
  lastResp = resp;
  errorCard.classList.add("hidden");
  bodyToolbar.classList.remove("hidden");
  headersToolbar.classList.remove("hidden");
  const cls = "s" + String(resp.status)[0];
  statusBar.className = "status-bar " + cls;
  const hint = resp.status >= 400 ? " · 服务器返回了错误状态" : "";
  statusBar.textContent = `${resp.status} ${resp.statusText} · ${resp.timeMs}ms${hint}`;

  // body:能解析成 JSON 就渲染可折叠树,否则纯文本(超大截断)
  let parsed;
  try { parsed = JSON.parse(resp.body); } catch { parsed = undefined; }
  if (parsed !== undefined && typeof parsed === "object" && parsed !== null) {
    renderJsonTree(panelBody, parsed);
  } else {
    const LIMIT = 5 * 1024 * 1024;
    let text = resp.body;
    if (text.length > LIMIT) text = text.slice(0, LIMIT) + "\n…(响应内容过大,已只显示前 5MB)";
    panelBody.textContent = text;
  }
  panelHeaders.textContent = Object.entries(resp.headers)
    .map(([k, v]) => `${k}: ${v}`).join("\n");
}

// ---- 渲染友好错误卡片 ----
function renderError(code, rawMessage) {
  const d = describeError(code);
  bodyToolbar.classList.add("hidden");
  headersToolbar.classList.add("hidden");
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
    bodyToolbar.classList.toggle("hidden", !isBody || !lastResp);
    panelHeaders.classList.toggle("hidden", isBody);
    headersToolbar.classList.toggle("hidden", isBody || !lastResp);
  };
});

// ---- 复制响应体 / 响应头 ----
async function copyText(text, btn) {
  await navigator.clipboard.writeText(text);
  const old = btn.textContent;
  btn.textContent = "已复制";
  setTimeout(() => { btn.textContent = old; }, 1000);
}
$("btn-copy-body").onclick = (e) => { if (lastResp) copyText(lastResp.body, e.target); };
$("btn-copy-headers").onclick = (e) => {
  if (!lastResp) return;
  const text = Object.entries(lastResp.headers).map(([k, v]) => `${k}: ${v}`).join("\n");
  copyText(text, e.target);
};

// ---- 历史记录:左下概览列表 + 弹窗管理面板 ----
let historyCache = [];

// 把某条历史回填到编辑器(优先按原格式,退回 HTTP 报文)
function loadIntoEditor(item) {
  editor.setValue(toHttp(item));
}

// 左下角简单概览列表(显示自定义名称)
function refreshHistory(list) {
  historyCache = list || [];
  const ul = $("history-list");
  ul.innerHTML = "";
  historyCache.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item.name || `${item.method} ${item.url}`;
    li.title = `${item.method} ${item.url}`;
    li.onclick = () => loadIntoEditor(item);
    ul.appendChild(li);
  });
}

// ---- 弹窗管理面板 ----
const modal = $("history-modal");
const searchInput = $("history-search");

function openHistoryModal() {
  renderHistoryPanel(searchInput.value);
  modal.classList.remove("hidden");
}
function closeHistoryModal() { modal.classList.add("hidden"); }

$("btn-history").onclick = openHistoryModal;
$("history-close").onclick = closeHistoryModal;
modal.addEventListener("click", (e) => { if (e.target === modal) closeHistoryModal(); });
searchInput.oninput = () => renderHistoryPanel(searchInput.value);

// 渲染弹窗内的完整可管理列表
function renderHistoryPanel(keyword = "") {
  const ul = $("history-panel-list");
  ul.innerHTML = "";
  const kw = keyword.trim().toLowerCase();
  const list = historyCache.filter((item) => {
    if (!kw) return true;
    return (
      (item.name || "").toLowerCase().includes(kw) ||
      (item.url || "").toLowerCase().includes(kw) ||
      (item.note || "").toLowerCase().includes(kw)
    );
  });

  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = kw ? "没有匹配的历史记录" : "暂无历史记录";
    ul.appendChild(li);
    return;
  }

  list.forEach((item) => ul.appendChild(renderHistItem(item)));
}

// 单条历史项:可改名(失焦保存)、写备注(失焦保存)、回填、删除
function renderHistItem(item) {
  const li = document.createElement("li");
  li.className = "hist-item";

  const row1 = document.createElement("div");
  row1.className = "hist-row1";

  const name = document.createElement("input");
  name.className = "hist-name";
  name.value = item.name || `${item.method} ${item.url}`;
  name.title = "点击编辑名称";
  name.onchange = async () => {
    historyCache = await patchHistory(item.id, { name: name.value.trim() || name.value });
    refreshHistory(historyCache);
  };

  const actions = document.createElement("div");
  actions.className = "hist-actions";
  const loadBtn = document.createElement("button");
  loadBtn.className = "load";
  loadBtn.textContent = "回填";
  loadBtn.onclick = () => { loadIntoEditor(item); closeHistoryModal(); };
  const delBtn = document.createElement("button");
  delBtn.className = "del";
  delBtn.textContent = "删除";
  delBtn.onclick = async () => {
    historyCache = await deleteHistory(item.id);
    refreshHistory(historyCache);
    renderHistoryPanel(searchInput.value);
  };
  actions.append(loadBtn, delBtn);
  row1.append(name, actions);

  const url = document.createElement("div");
  url.className = "hist-url";
  url.textContent = `${item.method} ${item.url}`;

  const note = document.createElement("textarea");
  note.className = "hist-note";
  note.placeholder = "填写备注…";
  note.value = item.note || "";
  note.onchange = async () => {
    historyCache = await patchHistory(item.id, { note: note.value });
    refreshHistory(historyCache);
  };

  li.append(row1, url, note);
  return li;
}

loadHistory().then(refreshHistory);

// ---- 可拖拽分隔线:调整左右宽度,比例存 localStorage ----
(() => {
  const layout = document.querySelector(".layout");
  const left = document.querySelector(".left");
  const gutter = $("gutter");
  const KEY = "curl2rest_split";

  const saved = parseFloat(localStorage.getItem(KEY));
  if (saved > 10 && saved < 90) left.style.flexBasis = saved + "%";

  let dragging = false;
  gutter.addEventListener("mousedown", () => {
    dragging = true;
    gutter.classList.add("dragging");
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const rect = layout.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    if (pct > 10 && pct < 90) left.style.flexBasis = pct + "%";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    gutter.classList.remove("dragging");
    document.body.style.userSelect = "";
    localStorage.setItem(KEY, parseFloat(left.style.flexBasis));
  });
})();
