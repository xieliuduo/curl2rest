import { createEditor } from "./editor.js";
import { parseRequest, toHttp, toCurl } from "../core/format.js";
import { substitute } from "../core/variables.js";
import { describeError } from "../core/errors.js";
import { loadHistory, pushHistory, patchHistory, deleteHistory } from "../core/history.js";
import {
  loadEnvironments, saveEnvironments, addEnv, removeEnv,
  setVar, removeVar, setCurrent, currentVars,
} from "../core/environments.js";
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

// ---- 环境状态 ----
let envState = { current: "", envs: {} };
let selectedEnv = ""; // 环境弹窗里当前正在编辑的环境(不一定等于生效环境)

// 当前生效的变量 map(发送时用)
function activeVars() {
  return currentVars(envState);
}

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
    const raw = substitute(editor.getValue(), activeVars());
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

// 左下角历史列表:可滚动,单条可改名/备注/回填/删除(数据与弹窗同源)
function refreshHistory(list) {
  historyCache = list || [];
  const ul = $("history-list");
  ul.innerHTML = "";

  if (!historyCache.length) {
    const li = document.createElement("li");
    li.className = "hl-empty";
    li.textContent = "暂无历史记录,发送请求后自动保存";
    ul.appendChild(li);
    return;
  }

  historyCache.forEach((item) => ul.appendChild(renderHlItem(item)));
}

// 左下单条历史项
function renderHlItem(item) {
  const li = document.createElement("li");
  li.className = "hl-item";

  const row1 = document.createElement("div");
  row1.className = "hl-row1";

  const name = document.createElement("input");
  name.className = "hl-name";
  name.value = item.name || `${item.method} ${item.url}`;
  name.title = "点击编辑名称";
  name.onchange = async () => {
    await patchHistory(item.id, { name: name.value.trim() || name.value });
    historyCache = await loadHistory();
    syncHistoryViews();
  };

  const loadBtn = document.createElement("button");
  loadBtn.className = "hl-btn load";
  loadBtn.textContent = "回填";
  loadBtn.onclick = () => loadIntoEditor(item);

  const delBtn = document.createElement("button");
  delBtn.className = "hl-btn del";
  delBtn.textContent = "删除";
  delBtn.onclick = async () => {
    await deleteHistory(item.id);
    historyCache = await loadHistory();
    syncHistoryViews();
  };
  row1.append(name, loadBtn, delBtn);

  const url = document.createElement("div");
  url.className = "hl-url";
  url.textContent = `${item.method} ${item.url}`;

  const note = document.createElement("textarea");
  note.className = "hl-note";
  note.placeholder = "填写备注…";
  note.value = item.note || "";
  note.onchange = async () => {
    await patchHistory(item.id, { note: note.value });
    historyCache = await loadHistory();
    // 备注变更无需重渲染左下(避免打断输入),仅同步弹窗数据源
    if (!modal.classList.contains("hidden")) renderHistoryPanel(searchInput.value);
  };

  li.append(row1, url, note);
  return li;
}

// 历史数据变更后,同步刷新左下列表与(若打开的)弹窗
function syncHistoryViews() {
  refreshHistory(historyCache);
  if (!modal.classList.contains("hidden")) renderHistoryPanel(searchInput.value);
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
    await patchHistory(item.id, { name: name.value.trim() || name.value });
    historyCache = await loadHistory();
    syncHistoryViews();
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
    await deleteHistory(item.id);
    historyCache = await loadHistory();
    syncHistoryViews();
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
    await patchHistory(item.id, { note: note.value });
    historyCache = await loadHistory();
    refreshHistory(historyCache);
  };

  li.append(row1, url, note);
  return li;
}

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

// ---- 历史面板高度可拖拽(存 localStorage) ----
(() => {
  const history = document.querySelector(".history");
  const resizer = $("history-resizer");
  const KEY = "curl2rest_history_h";

  const saved = parseInt(localStorage.getItem(KEY), 10);
  if (saved >= 60 && saved <= 600) history.style.height = saved + "px";

  let dragging = false;
  let startY = 0;
  let startH = 0;
  resizer.addEventListener("mousedown", (e) => {
    dragging = true;
    startY = e.clientY;
    startH = history.getBoundingClientRect().height;
    resizer.classList.add("dragging");
    document.body.style.userSelect = "none";
  });
  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    // 向上拖变高、向下拖变矮
    const h = startH + (startY - e.clientY);
    if (h >= 60 && h <= 600) history.style.height = h + "px";
  });
  window.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove("dragging");
    document.body.style.userSelect = "";
    localStorage.setItem(KEY, parseInt(history.style.height, 10));
  });
})();

// ---- 环境:下拉切换 + 管理弹窗 ----
const envSelect = $("env-select");
const envModal = $("env-modal");

// 渲染顶部下拉(列出所有环境,选中 = 当前生效环境)
function refreshEnvSelect() {
  envSelect.innerHTML = "";
  const names = Object.keys(envState.envs);
  if (!names.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "无环境";
    envSelect.appendChild(opt);
    envSelect.disabled = true;
    return;
  }
  envSelect.disabled = false;
  names.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === envState.current) opt.selected = true;
    envSelect.appendChild(opt);
  });
}

envSelect.onchange = async () => {
  envState = setCurrent(envState, envSelect.value);
  await saveEnvironments(envState);
};

// 打开/关闭环境弹窗
$("btn-env").onclick = () => {
  selectedEnv = envState.current || Object.keys(envState.envs)[0] || "";
  renderEnvModal();
  envModal.classList.remove("hidden");
};
$("env-close").onclick = () => envModal.classList.add("hidden");
envModal.addEventListener("click", (e) => { if (e.target === envModal) envModal.classList.add("hidden"); });

// 新增环境
$("env-add-btn").onclick = async () => {
  const input = $("env-new-name");
  const name = input.value.trim();
  if (!name) return;
  envState = addEnv(envState, name);
  input.value = "";
  selectedEnv = name;
  await saveEnvironments(envState);
  refreshEnvSelect();
  renderEnvModal();
};

// 添加变量到当前选中环境
$("env-var-add-btn").onclick = async () => {
  const keyEl = $("env-var-key");
  const valEl = $("env-var-val");
  const key = keyEl.value.trim();
  if (!key || !selectedEnv) return;
  envState = setVar(envState, selectedEnv, key, valEl.value);
  keyEl.value = "";
  valEl.value = "";
  await saveEnvironments(envState);
  renderEnvModal();
};

// 渲染环境弹窗:左侧环境列表 + 右侧变量表
function renderEnvModal() {
  // 左侧环境列表
  const ul = $("env-list");
  ul.innerHTML = "";
  const names = Object.keys(envState.envs);
  names.forEach((name) => {
    const li = document.createElement("li");
    if (name === selectedEnv) li.className = "active";
    const label = document.createElement("span");
    label.textContent = name + (name === envState.current ? " ✓" : "");
    label.onclick = () => { selectedEnv = name; renderEnvModal(); };
    label.style.flex = "1";
    const del = document.createElement("button");
    del.className = "env-del";
    del.textContent = "✕";
    del.title = "删除环境";
    del.onclick = async (e) => {
      e.stopPropagation();
      envState = removeEnv(envState, name);
      if (selectedEnv === name) selectedEnv = envState.current || Object.keys(envState.envs)[0] || "";
      await saveEnvironments(envState);
      refreshEnvSelect();
      renderEnvModal();
    };
    li.append(label, del);
    ul.appendChild(li);
  });

  // 右侧变量编辑区
  const title = $("env-vars-title");
  const rows = $("env-var-rows");
  const addBox = $("env-var-add");
  rows.innerHTML = "";

  if (!selectedEnv) {
    title.textContent = names.length ? "请选择一个环境" : "请先新增一个环境";
    addBox.classList.add("hidden");
    return;
  }
  title.textContent = `环境「${selectedEnv}」的变量`;
  addBox.classList.remove("hidden");

  const vars = envState.envs[selectedEnv] || {};
  Object.entries(vars).forEach(([key, value]) => {
    const tr = document.createElement("tr");

    const tdKey = document.createElement("td");
    const keyInput = document.createElement("input");
    keyInput.value = key;
    keyInput.readOnly = true; // 键名不就地改(改名=删+加),避免中途状态混乱
    keyInput.title = key;
    tdKey.appendChild(keyInput);

    const tdVal = document.createElement("td");
    const valInput = document.createElement("input");
    valInput.value = value;
    valInput.onchange = async () => {
      envState = setVar(envState, selectedEnv, key, valInput.value);
      await saveEnvironments(envState);
    };
    tdVal.appendChild(valInput);

    const tdDel = document.createElement("td");
    const del = document.createElement("button");
    del.className = "env-var-del";
    del.textContent = "✕";
    del.title = "删除变量";
    del.onclick = async () => {
      envState = removeVar(envState, selectedEnv, key);
      await saveEnvironments(envState);
      renderEnvModal();
    };
    tdDel.appendChild(del);

    tr.append(tdKey, tdVal, tdDel);
    rows.appendChild(tr);
  });
}

// ---- 初始化 ----
loadHistory().then(refreshHistory);
loadEnvironments().then((s) => { envState = s; refreshEnvSelect(); });
