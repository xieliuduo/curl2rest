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
