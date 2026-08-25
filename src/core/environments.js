// 多环境变量管理。状态结构:{ current: string, envs: { [name]: { [key]: value } } }
// 纯函数不改原状态,便于测试;末尾提供 storage 持久化封装。

const KEY = "curl2rest_environments";

/** 空状态 */
export function emptyState() {
  return { current: "", envs: {} };
}

/** 新增环境;若名称已存在则保留原变量。首个环境自动设为 current */
export function addEnv(state, name) {
  if (!name) return state;
  const envs = { ...state.envs };
  if (!envs[name]) envs[name] = {};
  const current = state.current || name;
  return { current, envs };
}

/** 删除环境;若删的是当前环境,current 转到剩余第一个(没有则为空) */
export function removeEnv(state, name) {
  const envs = { ...state.envs };
  delete envs[name];
  let current = state.current;
  if (current === name) current = Object.keys(envs)[0] || "";
  return { current, envs };
}

/** 设置某环境的一个变量键值 */
export function setVar(state, name, key, value) {
  if (!state.envs[name]) return state;
  const env = { ...state.envs[name], [key]: value };
  return { ...state, envs: { ...state.envs, [name]: env } };
}

/** 删除某环境的一个变量键 */
export function removeVar(state, name, key) {
  if (!state.envs[name]) return state;
  const env = { ...state.envs[name] };
  delete env[key];
  return { ...state, envs: { ...state.envs, [name]: env } };
}

/** 切换当前环境(目标不存在则忽略) */
export function setCurrent(state, name) {
  if (!state.envs[name]) return state;
  return { ...state, current: name };
}

/** 取当前环境的变量 map(无当前环境返回空对象) */
export function currentVars(state) {
  return (state.current && state.envs[state.current]) || {};
}

// ---- 持久化 ----

/** 从 storage 读环境状态 */
export async function loadEnvironments() {
  const got = await chrome.storage.local.get(KEY);
  return got[KEY] || emptyState();
}

/** 持久化环境状态 */
export async function saveEnvironments(state) {
  await chrome.storage.local.set({ [KEY]: state });
  return state;
}
