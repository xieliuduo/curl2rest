import { formatJsonBody } from "./format.js";

const KEY = "curl2rest_history";
const MAX = 30;

/** 请求内容指纹:方法、URL、请求头、请求体一致视为同一请求 */
export function requestFingerprint(req) {
  const headers = Object.entries(req.headers || {})
    .map(([key, value]) => [key.toLowerCase(), String(value)])
    .sort(([a], [b]) => a.localeCompare(b));
  const body = formatJsonBody(req.body);
  return JSON.stringify({
    method: String(req.method || "").toUpperCase(),
    url: String(req.url || ""),
    headers,
    body: body == null ? null : String(body).trim(),
  });
}

/** 保持原顺序(最新在前)清理重复项并限制数量 */
export function normalizeHistory(list, max = MAX) {
  const seen = new Set();
  const result = [];
  for (const item of list || []) {
    const fingerprint = requestFingerprint(item);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

/** 纯逻辑:按请求内容去重,把最新条目插到最前并截断到上限 */
export function addEntry(list, entry, max = MAX) {
  return normalizeHistory([entry, ...list], max);
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

/** 创建历史条目;meta 可携带关联请求库的名称、路径和 id */
export function createEntry(req, meta = {}, now = Date.now()) {
  return {
    id: genId(),
    note: "",
    at: now,
    ...req,
    name: meta.name || req.name || `${req.method} ${req.url}`,
    ...(meta.collectionPath ? { collectionPath: meta.collectionPath } : {}),
    ...(meta.collectionRef ? { collectionRef: meta.collectionRef } : {}),
  };
}

/** 从 chrome.storage.local 读历史 */
export async function loadHistory() {
  const got = await chrome.storage.local.get(KEY);
  return normalizeHistory(got[KEY] || []);
}

/** 追加一条并持久化,返回新列表。相同请求内容替换旧记录,最多保留 30 条 */
export async function pushHistory(req, meta = {}) {
  const entry = createEntry(req, meta);
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
