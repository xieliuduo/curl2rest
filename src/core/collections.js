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
