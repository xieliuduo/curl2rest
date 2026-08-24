const KEY = "curl2rest_history";
const MAX = 50;

/** 纯逻辑:把新条目插到最前并截断到上限 */
export function addEntry(list, entry, max = MAX) {
  return [entry, ...list].slice(0, max);
}

/** 从 chrome.storage.local 读历史 */
export async function loadHistory() {
  const got = await chrome.storage.local.get(KEY);
  return got[KEY] || [];
}

/** 追加一条并持久化,返回新列表 */
export async function pushHistory(entry) {
  const list = addEntry(await loadHistory(), entry);
  await chrome.storage.local.set({ [KEY]: list });
  return list;
}
