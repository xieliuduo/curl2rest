// 请求库:按「项目 → 模块 → 请求」两层管理手动收藏的请求。
// 状态结构:{ projects: [ { id, name, modules: [ { id, name, requests: [ {id,name,note,method,url,headers,body} ] } ] } ] }
// 纯函数不改原状态,便于测试;末尾提供 storage 持久化封装。

const KEY = "curl2rest_collections";

/** 空状态 */
export function emptyState() {
  return { projects: [] };
}

/** 生成基于时间+随机的唯一 id(与 history.js 一致) */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 新增项目(空名忽略) */
export function addProject(state, name) {
  const n = (name || "").trim();
  if (!n) return state;
  const project = { id: genId(), name: n, modules: [] };
  return { projects: [...state.projects, project] };
}

/** 按 id 给项目改名 */
export function renameProject(state, pid, name) {
  const n = (name || "").trim();
  if (!n) return state;
  return {
    projects: state.projects.map((p) =>
      p.id === pid ? { ...p, name: n } : p
    ),
  };
}

/** 按 id 删除项目 */
export function removeProject(state, pid) {
  return { projects: state.projects.filter((p) => p.id !== pid) };
}

/** 内部:对指定项目应用变换 fn(project) → newProject,其他项目不动 */
function mapProject(state, pid, fn) {
  return {
    projects: state.projects.map((p) => (p.id === pid ? fn(p) : p)),
  };
}

/** 在指定项目下新增模块(项目不存在或空名则忽略) */
export function addModule(state, pid, name) {
  const n = (name || "").trim();
  if (!n) return state;
  return mapProject(state, pid, (p) => ({
    ...p,
    modules: [...p.modules, { id: genId(), name: n, requests: [] }],
  }));
}

/** 给模块改名 */
export function renameModule(state, pid, mid, name) {
  const n = (name || "").trim();
  if (!n) return state;
  return mapProject(state, pid, (p) => ({
    ...p,
    modules: p.modules.map((m) => (m.id === mid ? { ...m, name: n } : m)),
  }));
}

/** 删除模块 */
export function removeModule(state, pid, mid) {
  return mapProject(state, pid, (p) => ({
    ...p,
    modules: p.modules.filter((m) => m.id !== mid),
  }));
}

/** 内部:对指定项目下的指定模块应用变换 fn(module) → newModule */
function mapModule(state, pid, mid, fn) {
  return mapProject(state, pid, (p) => ({
    ...p,
    modules: p.modules.map((m) => (m.id === mid ? fn(m) : m)),
  }));
}

/** 在模块下新增请求;自动补 id、默认名(METHOD URL)、空 note */
export function addRequest(state, pid, mid, req) {
  return mapModule(state, pid, mid, (m) => {
    const entry = {
      name: `${req.method} ${req.url}`,
      note: "",
      ...req,          // req 可覆盖 name/note,但不能覆盖 id
      id: genId(),     // id 始终最后生成,确保唯一
    };
    return { ...m, requests: [...m.requests, entry] };
  });
}

/** 请求改名 */
export function renameRequest(state, pid, mid, rid, name) {
  const n = (name || "").trim();
  if (!n) return state;
  return mapModule(state, pid, mid, (m) => ({
    ...m,
    requests: m.requests.map((r) => (r.id === rid ? { ...r, name: n } : r)),
  }));
}

/** 请求写备注 */
export function updateRequestNote(state, pid, mid, rid, note) {
  return mapModule(state, pid, mid, (m) => ({
    ...m,
    requests: m.requests.map((r) => (r.id === rid ? { ...r, note } : r)),
  }));
}

/** 覆盖请求内容(method/url/headers/body),保留 id/name/note */
export function updateRequest(state, pid, mid, rid, req) {
  const { method, url, headers, body } = req;
  return mapModule(state, pid, mid, (m) => ({
    ...m,
    requests: m.requests.map((r) =>
      r.id === rid ? { ...r, method, url, headers, body } : r
    ),
  }));
}

/** 删除请求 */
export function removeRequest(state, pid, mid, rid) {
  return mapModule(state, pid, mid, (m) => ({
    ...m,
    requests: m.requests.filter((r) => r.id !== rid),
  }));
}

/** 内部:在整棵树里按 (pid,mid,rid) 找请求对象,找不到返回 null */
function findRequest(state, pid, mid, rid) {
  const p = state.projects.find((x) => x.id === pid);
  const m = p && p.modules.find((x) => x.id === mid);
  return (m && m.requests.find((x) => x.id === rid)) || null;
}

/** 把请求从 (fromPid,fromMid) 移到 (toPid,toMid),保留原 id 与字段 */
export function moveRequest(state, fromPid, fromMid, toPid, toMid, rid) {
  const req = findRequest(state, fromPid, fromMid, rid);
  if (!req) return state;
  const removed = removeRequest(state, fromPid, fromMid, rid);
  return mapModule(removed, toPid, toMid, (m) => ({
    ...m,
    requests: [...m.requests, req],
  }));
}

/** 内部:在数组中把 id 对应元素按 dir(-1/1)与相邻元素交换,越界返回原数组 */
function swapById(arr, id, dir) {
  const i = arr.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** 项目排序 */
export function reorderProject(state, pid, dir) {
  return { projects: swapById(state.projects, pid, dir) };
}

/** 模块排序 */
export function reorderModule(state, pid, mid, dir) {
  return mapProject(state, pid, (p) => ({
    ...p,
    modules: swapById(p.modules, mid, dir),
  }));
}

/** 请求排序 */
export function reorderRequest(state, pid, mid, rid, dir) {
  return mapModule(state, pid, mid, (m) => ({
    ...m,
    requests: swapById(m.requests, rid, dir),
  }));
}

/** 导出:直接返回状态(已是纯数据,可 JSON 序列化) */
export function exportState(state) {
  return state;
}

/** 校验导入结构:必须是 { projects: [...] } */
function isValidState(x) {
  return x && typeof x === "object" && Array.isArray(x.projects);
}

/**
 * 导入。mode="replace" 整棵替换;mode="merge" 按项目名合并(同名并模块、追加请求),
 * 结构非法时原样返回当前状态。
 */
export function importState(state, incoming, mode = "replace") {
  if (!isValidState(incoming)) return state;
  if (mode === "replace") {
    return { projects: incoming.projects };
  }
  // merge:以当前状态为基,逐个并入 incoming 的项目
  let result = {
    projects: state.projects.map((p) => ({
      ...p,
      modules: p.modules.map((m) => ({ ...m, requests: [...m.requests] })),
    })),
  };
  incoming.projects.forEach((ip) => {
    const existing = result.projects.find((p) => p.name === ip.name);
    if (!existing) {
      result.projects.push(ip);
      return;
    }
    // 同名项目:按模块名合并
    ip.modules.forEach((im) => {
      const em = existing.modules.find((m) => m.name === im.name);
      if (!em) {
        existing.modules.push(im);
      } else {
        em.requests = [...em.requests, ...im.requests];
      }
    });
  });
  return result;
}

// ---- 持久化 ----

/** 从 chrome.storage.local 读请求库 */
export async function loadCollections() {
  const got = await chrome.storage.local.get(KEY);
  return got[KEY] || emptyState();
}

/** 持久化请求库,返回传入状态 */
export async function saveCollections(state) {
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}
