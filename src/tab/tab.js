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
import {
  loadCollections, saveCollections,
  addProject, renameProject, removeProject,
  addModule, renameModule, removeModule,
  addRequest, renameRequest, updateRequest, removeRequest,
  moveRequest, reorderProject, reorderModule, reorderRequest,
  exportState, importState,
} from "../core/collections.js";

const SAMPLE = [
  "POST https://httpbin.org/post HTTP/1.1",
  "content-type: application/json",
  "",
  '{\n  "name": "sample",\n  "time": "Wed, 21 Oct 2015 18:27:50 GMT"\n}',
].join("\n");

const editor = createEditor(document.getElementById("editor"), SAMPLE, () => onEditorChange());

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
  if (typeof clearActiveRef === "function") clearActiveRef(); // 历史回填不关联请求库
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

  const saveBtn = document.createElement("button");
  saveBtn.className = "hl-btn load";
  saveBtn.textContent = "另存";
  saveBtn.title = "另存到请求库";
  saveBtn.onclick = () => openSaveModal(item);

  const noteBtn = document.createElement("button");
  noteBtn.className = "hl-btn";
  noteBtn.textContent = item.note ? "备注*" : "备注";
  noteBtn.title = item.note ? "查看/编辑备注(已有备注)" : "编辑备注";
  noteBtn.onclick = () => toggleHlNote(li, item, noteBtn);

  const delBtn = document.createElement("button");
  delBtn.className = "hl-btn del";
  delBtn.textContent = "删除";
  delBtn.onclick = async () => {
    await deleteHistory(item.id);
    historyCache = await loadHistory();
    syncHistoryViews();
  };
  row1.append(name, loadBtn, saveBtn, noteBtn, delBtn);

  const url = document.createElement("div");
  url.className = "hl-url";
  url.textContent = `${item.method} ${item.url}`;

  li.append(row1, url);
  return li;
}

// 展开/收起某条左下历史的备注表单(默认不显示)
function toggleHlNote(li, item, btn) {
  const exist = li.querySelector(".hl-note");
  if (exist) { exist.remove(); return; }
  const note = document.createElement("textarea");
  note.className = "hl-note";
  note.placeholder = "填写备注…";
  note.value = item.note || "";
  note.onchange = async () => {
    await patchHistory(item.id, { note: note.value });
    item.note = note.value; // 同步本地引用
    btn.textContent = note.value ? "备注*" : "备注";
    historyCache = await loadHistory();
    // 备注变更无需重渲染左下(避免打断输入),仅同步弹窗数据源
    if (!modal.classList.contains("hidden")) renderHistoryPanel(searchInput.value);
  };
  li.append(note);
  note.focus();
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
  const saveBtn = document.createElement("button");
  saveBtn.className = "load";
  saveBtn.textContent = "另存";
  saveBtn.title = "另存到请求库";
  saveBtn.onclick = () => { openSaveModal(item); };
  const delBtn = document.createElement("button");
  delBtn.className = "del";
  delBtn.textContent = "删除";
  delBtn.onclick = async () => {
    await deleteHistory(item.id);
    historyCache = await loadHistory();
    syncHistoryViews();
  };
  actions.append(loadBtn, saveBtn, delBtn);
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

// ==== 请求库(项目 → 模块 → 请求)====
let colState = { projects: [] };
// 记录展开状态(id 集合),避免重渲染后全部折叠
const expanded = new Set();

// 当前编辑器关联的请求库条目(用于「更新到库」);null 表示未关联
let activeRef = null;        // { pid, mid, rid, name }
let activeSnapshot = "";     // 关联时编辑器的原始内容,用于判断是否被改动

// 建立/清除编辑器与某条请求的关联
function setActiveRef(pid, mid, rid, name, text) {
  activeRef = { pid, mid, rid, name };
  activeSnapshot = text;
  refreshUpdateBtn();
}
function clearActiveRef() {
  activeRef = null;
  activeSnapshot = "";
  refreshUpdateBtn();
}

// 编辑器内容变化时:关联存在且内容与快照不一致 → 高亮更新按钮
function onEditorChange() {
  refreshUpdateBtn();
}

// 刷新「更新到库」按钮的显隐与脏高亮
function refreshUpdateBtn() {
  const btn = $("btn-update-collection");
  if (!btn) return;
  if (!activeRef) { btn.classList.add("hidden"); return; }
  btn.classList.remove("hidden");
  const dirty = editor.getValue() !== activeSnapshot;
  btn.classList.toggle("dirty", dirty);
  btn.textContent = dirty ? `⬆ 更新到库 *` : `⬆ 更新到库`;
  btn.title = `更新「${activeRef.name}」到请求库`;
}

async function saveCol() {
  await saveCollections(colState);
}

// 渲染整棵树
function refreshTree() {
  const box = $("collection-tree");
  box.innerHTML = "";
  if (!colState.projects.length) {
    const div = document.createElement("div");
    div.className = "ct-empty";
    div.textContent = "还没有项目,点上方「+ 项目」开始整理。";
    box.appendChild(div);
    return;
  }
  colState.projects.forEach((p) => box.appendChild(renderProject(p)));
}

// 通用:构造一行(toggle + 名称文本 + 操作按钮)。名称为纯文本,重命名走操作按钮弹窗
function makeRow(kind, id, name, onOpen, actions) {
  const row = document.createElement("div");
  row.className = "ct-row ct-" + kind;

  const toggle = document.createElement("span");
  toggle.className = "ct-toggle";
  if (kind === "req") {
    toggle.textContent = "";
  } else {
    toggle.textContent = expanded.has(id) ? "▾" : "▸";
    toggle.onclick = () => {
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      refreshTree();
    };
  }

  const label = document.createElement("span");
  label.className = "ct-label";
  label.textContent = name;
  label.title = name;
  if (onOpen) label.onclick = onOpen; // 项目/模块:点名字展开折叠;请求:点名字回填

  const act = document.createElement("span");
  act.className = "ct-actions";
  actions.forEach((a) => {
    const b = document.createElement("button");
    b.textContent = a.icon;
    b.title = a.title;
    if (a.danger) b.className = "ct-del";
    b.onclick = (e) => { e.stopPropagation(); a.fn(); };
    act.appendChild(b);
  });

  row.append(toggle, label, act);
  return row;
}

function renderProject(p) {
  const node = document.createElement("div");
  node.className = "ct-node";
  const row = makeRow("proj", p.id, p.name,
    () => { // 点名字:展开/折叠
      if (expanded.has(p.id)) expanded.delete(p.id);
      else expanded.add(p.id);
      refreshTree();
    },
    [
      { icon: "＋", title: "新建模块", fn: async () => {
          const name = prompt("模块名称"); if (!name) return;
          colState = addModule(colState, p.id, name); expanded.add(p.id); await saveCol(); refreshTree();
        } },
      { icon: "✎", title: "重命名项目", fn: async () => {
          const name = prompt("重命名项目", p.name); if (name === null) return;
          colState = renameProject(colState, p.id, name); await saveCol(); refreshTree();
        } },
      { icon: "↑", title: "上移", fn: async () => { colState = reorderProject(colState, p.id, -1); await saveCol(); refreshTree(); } },
      { icon: "↓", title: "下移", fn: async () => { colState = reorderProject(colState, p.id, 1); await saveCol(); refreshTree(); } },
      { icon: "🗑", title: "删除项目", danger: true, fn: async () => {
          const cnt = p.modules.reduce((s, m) => s + m.requests.length, 0);
          if (!confirm(`删除项目「${p.name}」? 将连同 ${p.modules.length} 个模块、${cnt} 个请求一起删除。`)) return;
          expanded.delete(p.id);
          p.modules.forEach((mm) => expanded.delete(mm.id));
          colState = removeProject(colState, p.id); await saveCol(); refreshTree();
        } },
    ]);
  node.appendChild(row);

  if (expanded.has(p.id)) {
    const children = document.createElement("div");
    children.className = "ct-children";
    p.modules.forEach((m) => children.appendChild(renderModule(p, m)));
    node.appendChild(children);
  }
  return node;
}

function renderModule(p, m) {
  const node = document.createElement("div");
  node.className = "ct-node";
  const row = makeRow("mod", m.id, m.name,
    () => { // 点名字:展开/折叠
      if (expanded.has(m.id)) expanded.delete(m.id);
      else expanded.add(m.id);
      refreshTree();
    },
    [
      { icon: "＋", title: "新建请求", fn: async () => {
          const req = { method: "GET", url: "https://", headers: {}, body: "", name: "新请求" };
          colState = addRequest(colState, p.id, m.id, req); expanded.add(m.id); await saveCol(); refreshTree();
          // 回填模板并关联到这条新请求
          const mod = colState.projects.find((x) => x.id === p.id).modules.find((x) => x.id === m.id);
          const created = mod.requests[mod.requests.length - 1];
          const text = toHttp(created);
          editor.setValue(text);
          setActiveRef(p.id, m.id, created.id, created.name, text);
        } },
      { icon: "✎", title: "重命名模块", fn: async () => {
          const name = prompt("重命名模块", m.name); if (name === null) return;
          colState = renameModule(colState, p.id, m.id, name); await saveCol(); refreshTree();
        } },
      { icon: "↑", title: "上移", fn: async () => { colState = reorderModule(colState, p.id, m.id, -1); await saveCol(); refreshTree(); } },
      { icon: "↓", title: "下移", fn: async () => { colState = reorderModule(colState, p.id, m.id, 1); await saveCol(); refreshTree(); } },
      { icon: "🗑", title: "删除模块", danger: true, fn: async () => {
          if (!confirm(`删除模块「${m.name}」? 将连同 ${m.requests.length} 个请求一起删除。`)) return;
          expanded.delete(m.id);
          colState = removeModule(colState, p.id, m.id); await saveCol(); refreshTree();
        } },
    ]);
  node.appendChild(row);

  if (expanded.has(m.id)) {
    const children = document.createElement("div");
    children.className = "ct-children";
    m.requests.forEach((r) => children.appendChild(renderRequest(p, m, r)));
    node.appendChild(children);
  }
  return node;
}

// 移动请求到其他模块(编号选择,最简实现)
async function moveRequestFlow(p, m, r) {
  const targets = [];
  colState.projects.forEach((tp) => {
    tp.modules.forEach((tm) => {
      targets.push({ pid: tp.id, mid: tm.id, label: `${tp.name} / ${tm.name}` });
    });
  });
  if (targets.length <= 1) { alert("没有其他模块可移动,请先新建模块。"); return; }
  const menu = targets.map((t, i) => `${i + 1}. ${t.label}`).join("\n");
  const ans = prompt(`把「${r.name}」移动到哪个模块? 输入编号:\n${menu}`);
  if (ans === null) return;
  const idx = parseInt(ans, 10) - 1;
  if (!(idx >= 0 && idx < targets.length)) { alert("编号无效。"); return; }
  const t = targets[idx];
  if (t.pid === p.id && t.mid === m.id) return; // 原地不动
  colState = moveRequest(colState, p.id, m.id, t.pid, t.mid, r.id);
  expanded.add(t.pid); expanded.add(t.mid);
  // 若移动的是当前关联请求,同步关联到新位置
  if (activeRef && activeRef.rid === r.id) { activeRef.pid = t.pid; activeRef.mid = t.mid; }
  await saveCol(); refreshTree();
}

function renderRequest(p, m, r) {
  const node = document.createElement("div");
  node.className = "ct-node";
  // 回填到编辑器并建立「更新到库」关联(快照用实际写入的文本)
  const open = () => {
    const text = toHttp(r);
    editor.setValue(text);
    setActiveRef(p.id, m.id, r.id, r.name, text);
  };
  const row = makeRow("req", r.id, r.name,
    open, // 点名字:回填到编辑器
    [
      { icon: "✎", title: "重命名请求", fn: async () => {
          const name = prompt("重命名请求", r.name); if (name === null) return;
          colState = renameRequest(colState, p.id, m.id, r.id, name); await saveCol(); refreshTree();
          if (activeRef && activeRef.rid === r.id) { activeRef.name = name.trim() || r.name; refreshUpdateBtn(); }
        } },
      { icon: "⇄", title: "移动到其他模块", fn: () => moveRequestFlow(p, m, r) },
      { icon: "↑", title: "上移", fn: async () => { colState = reorderRequest(colState, p.id, m.id, r.id, -1); await saveCol(); refreshTree(); } },
      { icon: "↓", title: "下移", fn: async () => { colState = reorderRequest(colState, p.id, m.id, r.id, 1); await saveCol(); refreshTree(); } },
      { icon: "🗑", title: "删除请求", danger: true, fn: async () => {
          if (!confirm(`删除请求「${r.name}」?`)) return;
          if (activeRef && activeRef.rid === r.id) clearActiveRef();
          colState = removeRequest(colState, p.id, m.id, r.id); await saveCol(); refreshTree();
        } },
    ]);
  node.appendChild(row);
  return node;
}

// 折叠侧边栏(状态存 localStorage)
(() => {
  const layout = document.querySelector(".layout");
  const KEY = "curl2rest_sidebar";
  if (localStorage.getItem(KEY) === "1") layout.classList.add("sidebar-collapsed");
  $("sidebar-toggle").onclick = () => {
    layout.classList.toggle("sidebar-collapsed");
    localStorage.setItem(KEY, layout.classList.contains("sidebar-collapsed") ? "1" : "0");
  };
})();

// 新建项目
$("btn-add-project").onclick = async () => {
  const name = prompt("项目名称");
  if (!name) return;
  colState = addProject(colState, name);
  await saveCol();
  refreshTree();
};

// 全部展开 / 全部收起(展开状态不持久化,与 expanded 一致)
$("btn-toggle-all").onclick = () => {
  // 收集所有可展开节点(项目 + 模块)的 id
  const allIds = [];
  colState.projects.forEach((p) => {
    allIds.push(p.id);
    p.modules.forEach((m) => allIds.push(m.id));
  });
  // 已全部展开 → 收起;否则 → 展开全部
  const allExpanded = allIds.length > 0 && allIds.every((id) => expanded.has(id));
  expanded.clear();
  if (!allExpanded) allIds.forEach((id) => expanded.add(id));
  $("btn-toggle-all").textContent = allExpanded ? "⊞" : "⊟";
  refreshTree();
};

// 导出 JSON(下载文件)
$("btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify(exportState(colState), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "curl2rest-collections.json";
  a.click();
  URL.revokeObjectURL(url);
};

// 导入 JSON(选文件 → 询问模式 → 合并/替换)
$("btn-import").onclick = () => $("import-file").click();
$("import-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const incoming = JSON.parse(await file.text());
    const merge = confirm("确定=合并到现有请求库;取消=整体替换现有请求库。");
    colState = importState(colState, incoming, merge ? "merge" : "replace");
    await saveCol();
    refreshTree();
  } catch {
    alert("导入失败:文件不是合法的 JSON。");
  } finally {
    e.target.value = ""; // 允许重复导入同一文件
  }
};

// ==== 「保存到」弹窗:入口 1(编辑器)/入口 2(历史)共用 ====
const saveModal = $("save-modal");
let pendingReq = null; // 待保存的请求对象
let pendingFromEditor = false; // 来源是否为编辑器(入口1);决定保存后是否建立更新关联

// 打开弹窗,预填名称;req 为已解析的请求对象;fromEditor 标记来源
function openSaveModal(req, fromEditor = false) {
  pendingReq = req;
  pendingFromEditor = fromEditor;
  $("save-name").value = req.name || `${req.method} ${req.url}`;
  refreshSaveSelects();
  saveModal.classList.remove("hidden");
}
function closeSaveModal() { saveModal.classList.add("hidden"); pendingReq = null; pendingFromEditor = false; }

// 刷新项目/模块下拉(模块随项目联动)
function refreshSaveSelects() {
  const projSel = $("save-project");
  projSel.innerHTML = "";
  colState.projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id; opt.textContent = p.name;
    projSel.appendChild(opt);
  });
  refreshSaveModuleSelect();
}
function refreshSaveModuleSelect() {
  const projSel = $("save-project");
  const modSel = $("save-module");
  modSel.innerHTML = "";
  const p = colState.projects.find((x) => x.id === projSel.value);
  (p ? p.modules : []).forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id; opt.textContent = m.name;
    modSel.appendChild(opt);
  });
}
$("save-project").onchange = refreshSaveModuleSelect;

// 弹窗内「+ 新建项目 / + 新建模块」
$("save-new-project").onclick = async () => {
  const name = prompt("新项目名称"); if (!name) return;
  colState = addProject(colState, name);
  await saveCol(); refreshTree(); refreshSaveSelects();
  const created = colState.projects[colState.projects.length - 1];
  $("save-project").value = created.id;
  refreshSaveModuleSelect();
};
$("save-new-module").onclick = async () => {
  const pid = $("save-project").value;
  if (!pid) { alert("请先新建/选择一个项目。"); return; }
  const name = prompt("新模块名称"); if (!name) return;
  colState = addModule(colState, pid, name);
  await saveCol(); refreshTree(); refreshSaveModuleSelect();
  const p = colState.projects.find((x) => x.id === pid);
  const created = p.modules[p.modules.length - 1];
  $("save-module").value = created.id;
};

// 确认保存
$("save-confirm").onclick = async () => {
  const pid = $("save-project").value;
  const mid = $("save-module").value;
  if (!pid || !mid) { alert("请选择项目和模块(可用「+ 新建」创建)。"); return; }
  const name = $("save-name").value.trim();
  // 空名不传 name 键,让 core 回退到默认 `${method} ${url}`
  const req = { ...pendingReq };
  if (name) req.name = name; else delete req.name;
  colState = addRequest(colState, pid, mid, req);
  expanded.add(pid); expanded.add(mid);
  await saveCol(); refreshTree();
  // 若来源是编辑器,把编辑器关联到刚保存的这条请求,便于后续「更新到库」
  if (pendingFromEditor) {
    const mod = colState.projects.find((x) => x.id === pid).modules.find((x) => x.id === mid);
    const created = mod.requests[mod.requests.length - 1];
    setActiveRef(pid, mid, created.id, created.name, editor.getValue());
  }
  closeSaveModal();
};

$("save-close").onclick = closeSaveModal;
saveModal.addEventListener("click", (e) => { if (e.target === saveModal) closeSaveModal(); });

// 入口 1:工具栏「保存到库」—— 解析当前编辑器内容后打开弹窗
$("btn-save-collection").onclick = () => {
  let req;
  try {
    req = parseRequest(substitute(editor.getValue(), activeVars()));
  } catch (e) {
    renderError(e.code, e.message);
    return;
  }
  openSaveModal(req, true);
};

// 「更新到库」:把当前编辑内容覆盖保存回关联的请求(覆盖前确认)
$("btn-update-collection").onclick = async () => {
  if (!activeRef) return;
  let req;
  try {
    req = parseRequest(substitute(editor.getValue(), activeVars()));
  } catch (e) {
    renderError(e.code, e.message);
    return;
  }
  if (!confirm(`确定用当前编辑内容更新「${activeRef.name}」?`)) return;
  colState = updateRequest(colState, activeRef.pid, activeRef.mid, activeRef.rid, req);
  await saveCol(); refreshTree();
  activeSnapshot = editor.getValue(); // 重置快照,回到未改动状态
  refreshUpdateBtn();
};

// ---- 初始化 ----
loadHistory().then(refreshHistory);
loadEnvironments().then((s) => { envState = s; refreshEnvSelect(); });
loadCollections().then((s) => { colState = s; refreshTree(); });
