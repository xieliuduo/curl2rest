const KEY = "curl2rest_history";
const MAX = 50;

/** 纯逻辑:把新条目插到最前并截断到上限 */
export function addEntry(list, entry, max = MAX) {
  return [entry, ...list].slice(0, max);
}

/** 纯逻辑:按 id 更新条目的部分字段(如 name/note),不改原数组 */
export function updateEntry(list, id, patch) {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/** 纯逻辑:按 id 删除条目 */
export function removeEntry(list, id) {
  return list.filter((item) => item.id !== id);
}

/** 生成一个基于时间+随机的简单唯一 id */
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 从 chrome.storage.local 读历史 */
export async function loadHistory() {
  const got = await chrome.storage.local.get(KEY);
  return got[KEY] || [];
}

/** 追加一条并持久化,返回新列表。自动补 id、默认名(METHOD URL)、空备注 */
export async function pushHistory(req) {
  const entry = {
    id: genId(),
    name: `${req.method} ${req.url}`,
    note: "",
    at: Date.now(),
    ...req,
  };
  const list = addEntry(await loadHistory(), entry);
  await chrome.storage.local.set({ [KEY]: list });
  return list;
}

/** 按 id 改名/写备注并持久化,返回新列表 */
export async function patchHistory(id, patch) {
  const list = updateEntry(await loadHistory(), id, patch);
  await chrome.storage.local.set({ [KEY]: list });
  return list;
}

/** 按 id 删除并持久化,返回新列表 */
export async function deleteHistory(id) {
  const list = removeEntry(await loadHistory(), id);
  await chrome.storage.local.set({ [KEY]: list });
  return list;
}
