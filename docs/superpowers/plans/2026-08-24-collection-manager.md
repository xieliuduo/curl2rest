# 请求库管理(项目 → 模块 → 请求)实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增一套独立于历史记录的手动请求库,按「项目 → 模块 → 请求」两层维度归类收藏请求,常驻左侧折叠边栏管理。

**Architecture:** 复刻现有 `environments.js` 范式 —— 纯函数嵌套树数据模型 + `chrome.storage.local` 持久化;UI 用原生 DOM 渲染三级树,融入现有 flex 三栏布局;三种保存入口共用一个「保存到」小弹窗。

**Tech Stack:** 原生 ES modules、CodeMirror 6(已有)、chrome.storage.local、Vitest。

设计文档:`docs/superpowers/specs/2026-08-24-collection-manager-design.md`

---

## 文件结构

- **Create** `src/core/collections.js` —— 纯函数数据模型 + storage 封装(唯一新增核心文件)
- **Create** `test/core/collections.test.js` —— 纯函数单测
- **Modify** `src/tab/tab.html` —— 加侧边栏 DOM、折叠按钮、「保存到库」按钮、「保存到」弹窗
- **Modify** `src/tab/tab.css` —— 侧边栏、树、折叠、保存弹窗样式
- **Modify** `src/tab/tab.js` —— 侧边栏渲染、三入口接线、折叠记忆、回填、导入导出
- **Modify** `package.json` / `manifest.json` / `CHANGELOG.md` —— 版本号 0.2.0 → 0.3.0

数据模型全部集中在 `collections.js`,UI 逻辑集中在 `tab.js`(与现状一致,项目本就把整个 tab 逻辑放一个文件)。

---

## Task 1: collections.js —— 空状态与 id 生成

**Files:**
- Create: `src/core/collections.js`
- Test: `test/core/collections.test.js`

- [ ] **Step 1: 写失败测试**

创建 `test/core/collections.test.js`:

```js
import { describe, it, expect } from "vitest";
import { emptyState } from "../../src/core/collections.js";

describe("emptyState", () => {
  it("初始为空:projects 为空数组", () => {
    const s = emptyState();
    expect(s.projects).toEqual([]);
  });
  it("每次返回全新对象(不共享引用)", () => {
    expect(emptyState()).not.toBe(emptyState());
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/collections.test.js`
Expected: FAIL,`emptyState` 未定义 / 模块不存在。

- [ ] **Step 3: 写最小实现**

创建 `src/core/collections.js`:

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/collections.test.js`
Expected: PASS(2 passed)。

- [ ] **Step 5: 提交**

```bash
git add src/core/collections.js test/core/collections.test.js
git commit -m "feat: collections 空状态与 id 生成(TDD)"
```

---

## Task 2: 项目的增删改

**Files:**
- Modify: `src/core/collections.js`
- Test: `test/core/collections.test.js`

- [ ] **Step 1: 写失败测试**

在 `test/core/collections.test.js` 追加(并在顶部 import 补 `addProject, renameProject, removeProject`):

```js
import {
  emptyState, addProject, renameProject, removeProject,
} from "../../src/core/collections.js";

describe("addProject", () => {
  it("新增项目,带 id、空 modules", () => {
    const s = addProject(emptyState(), "电商后台");
    expect(s.projects).toHaveLength(1);
    expect(s.projects[0].name).toBe("电商后台");
    expect(s.projects[0].modules).toEqual([]);
    expect(typeof s.projects[0].id).toBe("string");
  });
  it("空名忽略", () => {
    const s = addProject(emptyState(), "  ");
    expect(s.projects).toHaveLength(0);
  });
  it("不修改原状态(纯函数)", () => {
    const s0 = emptyState();
    addProject(s0, "x");
    expect(s0.projects).toHaveLength(0);
  });
});

describe("renameProject", () => {
  it("按 id 改名", () => {
    let s = addProject(emptyState(), "旧名");
    const pid = s.projects[0].id;
    s = renameProject(s, pid, "新名");
    expect(s.projects[0].name).toBe("新名");
  });
  it("id 不存在时原样返回", () => {
    const s = addProject(emptyState(), "a");
    expect(renameProject(s, "nope", "x")).toEqual(s);
  });
});

describe("removeProject", () => {
  it("按 id 删除项目", () => {
    let s = addProject(addProject(emptyState(), "a"), "b");
    const pid = s.projects[0].id;
    s = removeProject(s, pid);
    expect(s.projects.map((p) => p.name)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/collections.test.js`
Expected: FAIL,`addProject` 等未定义。

- [ ] **Step 3: 写最小实现**

在 `src/core/collections.js` 的 `genId` 之后追加:

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/collections.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/collections.js test/core/collections.test.js
git commit -m "feat: collections 项目增删改(TDD)"
```

---

## Task 3: 模块的增删改

**Files:**
- Modify: `src/core/collections.js`
- Test: `test/core/collections.test.js`

- [ ] **Step 1: 写失败测试**

追加 import `addModule, renameModule, removeModule`,并追加:

```js
import {
  addModule, renameModule, removeModule,
} from "../../src/core/collections.js";

describe("addModule", () => {
  it("在指定项目下新增模块", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "订单");
    expect(s.projects[0].modules).toHaveLength(1);
    expect(s.projects[0].modules[0].name).toBe("订单");
    expect(s.projects[0].modules[0].requests).toEqual([]);
  });
  it("项目不存在时原样返回", () => {
    const s = addProject(emptyState(), "p");
    expect(addModule(s, "nope", "m")).toEqual(s);
  });
  it("空名忽略", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "  ");
    expect(s.projects[0].modules).toHaveLength(0);
  });
});

describe("renameModule", () => {
  it("按 id 给模块改名", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "旧");
    const mid = s.projects[0].modules[0].id;
    s = renameModule(s, pid, mid, "新");
    expect(s.projects[0].modules[0].name).toBe("新");
  });
});

describe("removeModule", () => {
  it("按 id 删除模块", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(addModule(s, pid, "a"), pid, "b");
    const mid = s.projects[0].modules[0].id;
    s = removeModule(s, pid, mid);
    expect(s.projects[0].modules.map((m) => m.name)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/collections.test.js`
Expected: FAIL,`addModule` 等未定义。

- [ ] **Step 3: 写最小实现**

在 `src/core/collections.js` 追加。为避免嵌套 map 重复,先加一个内部辅助:

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/collections.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/collections.js test/core/collections.test.js
git commit -m "feat: collections 模块增删改(TDD)"
```

---

## Task 4: 请求的增删改与备注

**Files:**
- Modify: `src/core/collections.js`
- Test: `test/core/collections.test.js`

- [ ] **Step 1: 写失败测试**

追加 import `addRequest, renameRequest, updateRequestNote, removeRequest`,并追加:

```js
import {
  addRequest, renameRequest, updateRequestNote, removeRequest,
} from "../../src/core/collections.js";

// 便捷构造:返回 {state, pid, mid}
function withModule() {
  let s = addProject(emptyState(), "p");
  const pid = s.projects[0].id;
  s = addModule(s, pid, "m");
  const mid = s.projects[0].modules[0].id;
  return { s, pid, mid };
}
const REQ = { method: "GET", url: "https://x.com", headers: {}, body: "" };

describe("addRequest", () => {
  it("在模块下新增请求,补 id / 默认 name / 空 note", () => {
    const { s, pid, mid } = withModule();
    const s2 = addRequest(s, pid, mid, REQ);
    const r = s2.projects[0].modules[0].requests[0];
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://x.com");
    expect(r.name).toBe("GET https://x.com");
    expect(r.note).toBe("");
    expect(typeof r.id).toBe("string");
  });
  it("传入的 name 优先于默认名", () => {
    const { s, pid, mid } = withModule();
    const s2 = addRequest(s, pid, mid, { ...REQ, name: "查询用户" });
    expect(s2.projects[0].modules[0].requests[0].name).toBe("查询用户");
  });
  it("模块不存在时原样返回", () => {
    const { s, pid } = withModule();
    expect(addRequest(s, pid, "nope", REQ)).toEqual(s);
  });
});

describe("renameRequest / updateRequestNote", () => {
  it("改名", () => {
    let { s, pid, mid } = withModule();
    s = addRequest(s, pid, mid, REQ);
    const rid = s.projects[0].modules[0].requests[0].id;
    s = renameRequest(s, pid, mid, rid, "新名");
    expect(s.projects[0].modules[0].requests[0].name).toBe("新名");
  });
  it("写备注", () => {
    let { s, pid, mid } = withModule();
    s = addRequest(s, pid, mid, REQ);
    const rid = s.projects[0].modules[0].requests[0].id;
    s = updateRequestNote(s, pid, mid, rid, "这是登录接口");
    expect(s.projects[0].modules[0].requests[0].note).toBe("这是登录接口");
  });
});

describe("removeRequest", () => {
  it("按 id 删除请求", () => {
    let { s, pid, mid } = withModule();
    s = addRequest(s, pid, mid, { ...REQ, name: "a" });
    s = addRequest(s, pid, mid, { ...REQ, name: "b" });
    const rid = s.projects[0].modules[0].requests[0].id;
    s = removeRequest(s, pid, mid, rid);
    expect(s.projects[0].modules[0].requests.map((r) => r.name)).toEqual(["b"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/collections.test.js`
Expected: FAIL,请求相关函数未定义。

- [ ] **Step 3: 写最小实现**

追加内部辅助 `mapModule` 与四个导出函数:

```js
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
      id: genId(),
      name: `${req.method} ${req.url}`,
      note: "",
      ...req,
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

/** 删除请求 */
export function removeRequest(state, pid, mid, rid) {
  return mapModule(state, pid, mid, (m) => ({
    ...m,
    requests: m.requests.filter((r) => r.id !== rid),
  }));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/collections.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/collections.js test/core/collections.test.js
git commit -m "feat: collections 请求增删改与备注(TDD)"
```

---

## Task 5: 移动请求

**Files:**
- Modify: `src/core/collections.js`
- Test: `test/core/collections.test.js`

- [ ] **Step 1: 写失败测试**

追加 import `moveRequest`,并追加:

```js
import { moveRequest } from "../../src/core/collections.js";

describe("moveRequest", () => {
  it("把请求从一个模块移到另一个模块(可跨项目)", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(addModule(s, pid, "src"), pid, "dst");
    const srcMid = s.projects[0].modules[0].id;
    const dstMid = s.projects[0].modules[1].id;
    s = addRequest(s, pid, srcMid, { method: "GET", url: "https://a", headers: {}, body: "" });
    const rid = s.projects[0].modules[0].requests[0].id;

    s = moveRequest(s, pid, srcMid, pid, dstMid, rid);

    expect(s.projects[0].modules[0].requests).toHaveLength(0);
    expect(s.projects[0].modules[1].requests).toHaveLength(1);
    expect(s.projects[0].modules[1].requests[0].id).toBe(rid);
  });
  it("源请求不存在时原样返回", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "m");
    const mid = s.projects[0].modules[0].id;
    expect(moveRequest(s, pid, mid, pid, mid, "nope")).toEqual(s);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/collections.test.js`
Expected: FAIL,`moveRequest` 未定义。

- [ ] **Step 3: 写最小实现**

追加。先取出请求对象,再从源删除、向目标追加(用已有的 `removeRequest`,追加时保留原 id 故不复用 addRequest):

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/collections.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/collections.js test/core/collections.test.js
git commit -m "feat: collections 移动请求(TDD)"
```

---

## Task 6: 排序(上移/下移)

**Files:**
- Modify: `src/core/collections.js`
- Test: `test/core/collections.test.js`

设计里的「reorder」用简单直观的上移/下移实现(比拖拽索引更易测、UI 也够用):`reorderProject(s, pid, dir)`、`reorderModule(s, pid, mid, dir)`、`reorderRequest(s, pid, mid, rid, dir)`,`dir` 为 `-1`(上移)或 `1`(下移),越界忽略。

- [ ] **Step 1: 写失败测试**

追加 import,并追加:

```js
import {
  reorderProject, reorderModule, reorderRequest,
} from "../../src/core/collections.js";

describe("reorderProject", () => {
  it("下移把项目与后一个交换", () => {
    let s = addProject(addProject(emptyState(), "a"), "b");
    const pidA = s.projects[0].id;
    s = reorderProject(s, pidA, 1);
    expect(s.projects.map((p) => p.name)).toEqual(["b", "a"]);
  });
  it("首个上移越界,原样返回", () => {
    let s = addProject(addProject(emptyState(), "a"), "b");
    const pidA = s.projects[0].id;
    expect(reorderProject(s, pidA, -1)).toEqual(s);
  });
});

describe("reorderModule", () => {
  it("下移模块", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(addModule(s, pid, "a"), pid, "b");
    const midA = s.projects[0].modules[0].id;
    s = reorderModule(s, pid, midA, 1);
    expect(s.projects[0].modules.map((m) => m.name)).toEqual(["b", "a"]);
  });
});

describe("reorderRequest", () => {
  it("下移请求", () => {
    let s = addProject(emptyState(), "p");
    const pid = s.projects[0].id;
    s = addModule(s, pid, "m");
    const mid = s.projects[0].modules[0].id;
    s = addRequest(s, pid, mid, { method: "GET", url: "https://a", headers: {}, body: "", name: "a" });
    s = addRequest(s, pid, mid, { method: "GET", url: "https://b", headers: {}, body: "", name: "b" });
    const ridA = s.projects[0].modules[0].requests[0].id;
    s = reorderRequest(s, pid, mid, ridA, 1);
    expect(s.projects[0].modules[0].requests.map((r) => r.name)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/collections.test.js`
Expected: FAIL,reorder 函数未定义。

- [ ] **Step 3: 写最小实现**

追加通用数组换位辅助 + 三个导出:

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/collections.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/collections.js test/core/collections.test.js
git commit -m "feat: collections 上移下移排序(TDD)"
```

---

## Task 7: 导入 / 导出

**Files:**
- Modify: `src/core/collections.js`
- Test: `test/core/collections.test.js`

- [ ] **Step 1: 写失败测试**

追加 import `exportState, importState`,并追加:

```js
import { exportState, importState } from "../../src/core/collections.js";

describe("exportState", () => {
  it("返回与状态等价的可序列化对象", () => {
    const s = addProject(emptyState(), "p");
    const out = exportState(s);
    expect(JSON.parse(JSON.stringify(out))).toEqual(s);
  });
});

describe("importState replace", () => {
  it("整棵替换现有数据", () => {
    const cur = addProject(emptyState(), "旧");
    const incoming = addProject(emptyState(), "新");
    const s = importState(cur, incoming, "replace");
    expect(s.projects.map((p) => p.name)).toEqual(["新"]);
  });
  it("结构非法(无 projects 数组)时原样返回", () => {
    const cur = addProject(emptyState(), "旧");
    expect(importState(cur, { foo: 1 }, "replace")).toEqual(cur);
  });
});

describe("importState merge", () => {
  it("同名项目合并模块,不同名追加项目", () => {
    let cur = addProject(emptyState(), "共享");
    const pid = cur.projects[0].id;
    cur = addModule(cur, pid, "已有模块");

    let incoming = addProject(emptyState(), "共享");
    const ipid = incoming.projects[0].id;
    incoming = addModule(incoming, ipid, "新模块");
    incoming = addProject(incoming, "独立项目");

    const s = importState(cur, incoming, "merge");
    const shared = s.projects.find((p) => p.name === "共享");
    expect(shared.modules.map((m) => m.name).sort()).toEqual(["已有模块", "新模块"]);
    expect(s.projects.map((p) => p.name)).toContain("独立项目");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/core/collections.test.js`
Expected: FAIL,`exportState`/`importState` 未定义。

- [ ] **Step 3: 写最小实现**

追加:

```js
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
  let result = { projects: state.projects.map((p) => ({ ...p, modules: [...p.modules] })) };
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/core/collections.test.js`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add src/core/collections.js test/core/collections.test.js
git commit -m "feat: collections 导入导出(replace/merge)(TDD)"
```

---

## Task 8: storage 持久化封装

**Files:**
- Modify: `src/core/collections.js`

storage 依赖 `chrome.storage.local`,与 `history.js`/`environments.js` 一样不写自动化单测(项目现状如此),仅补函数,构建期验证。

- [ ] **Step 1: 追加实现**

在 `src/core/collections.js` 末尾追加:

```js
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
```

- [ ] **Step 2: 运行全部 core 测试确认无回归**

Run: `npm test`
Expected: 全部 PASS(含既有 format/variables/history/errors/environments 与新增 collections)。

- [ ] **Step 3: 提交**

```bash
git add src/core/collections.js
git commit -m "feat: collections storage 持久化封装"
```

---

## Task 9: 侧边栏 HTML 结构与「保存到」弹窗

**Files:**
- Modify: `src/tab/tab.html`

- [ ] **Step 1: 在 `.layout` 内、`.left` 之前插入侧边栏与折叠按钮**

把 `src/tab/tab.html` 第 9 行 `<div class="layout">` 之后、第 10 行 `<section class="left">` 之前,插入:

```html
      <aside id="sidebar" class="sidebar">
        <div class="sidebar-head">
          <span class="sidebar-title">请求库</span>
          <button id="btn-add-project" title="新建项目">+ 项目</button>
          <button id="btn-import" title="导入 JSON">导入</button>
          <button id="btn-export" title="导出 JSON">导出</button>
        </div>
        <div id="collection-tree" class="collection-tree"></div>
      </aside>
      <button id="sidebar-toggle" class="sidebar-toggle" title="折叠/展开请求库">◀</button>
```

- [ ] **Step 2: 在工具栏「发送 ▶」按钮后加「保存到库」按钮**

把 `src/tab/tab.html` 中这一行:

```html
          <button id="btn-send" class="primary">发送 ▶</button>
```

改为(在其后加一个按钮):

```html
          <button id="btn-send" class="primary">发送 ▶</button>
          <button id="btn-save-collection" title="保存当前请求到请求库">保存到库 ⭑</button>
```

- [ ] **Step 3: 在 `env-modal` 之后、`<script>` 之前加「保存到」弹窗与「隐藏文件输入」**

把 `src/tab/tab.html` 结尾这一行 `<script type="module" src="./tab.js"></script>` 之前插入:

```html
    <div id="save-modal" class="modal hidden">
      <div class="modal-box save-box">
        <div class="modal-head">
          <span class="modal-title">保存到请求库</span>
          <button id="save-close" class="modal-close" title="关闭">✕</button>
        </div>
        <div class="save-body">
          <label class="save-row">
            <span>项目</span>
            <select id="save-project"></select>
            <button id="save-new-project" type="button">+ 新建</button>
          </label>
          <label class="save-row">
            <span>模块</span>
            <select id="save-module"></select>
            <button id="save-new-module" type="button">+ 新建</button>
          </label>
          <label class="save-row">
            <span>名称</span>
            <input id="save-name" placeholder="请求名称" />
          </label>
          <div class="save-actions">
            <button id="save-confirm" class="primary">保存</button>
          </div>
        </div>
      </div>
    </div>
    <input id="import-file" type="file" accept="application/json,.json" class="hidden" />
```

- [ ] **Step 4: 目视确认结构无误(无测试)**

打开 `src/tab/tab.html` 核对:`.layout` 首个子元素是 `#sidebar`,随后是 `#sidebar-toggle`,再是 `.left`;工具栏含 `#btn-save-collection`;文档末含 `#save-modal` 与 `#import-file`。

- [ ] **Step 5: 提交**

```bash
git add src/tab/tab.html
git commit -m "feat: 请求库侧边栏与保存弹窗 HTML 结构"
```

---

## Task 10: 侧边栏与弹窗样式

**Files:**
- Modify: `src/tab/tab.css`

- [ ] **Step 1: 在 `tab.css` 末尾追加样式**

```css
/* 请求库侧边栏 */
.sidebar { flex: 0 0 240px; min-width: 0; display: flex; flex-direction: column; border-right: 1px solid #e2e2e2; background: #fafafa; overflow: hidden; transition: flex-basis 0.15s; }
.layout.sidebar-collapsed .sidebar { flex-basis: 0; border-right: none; }
.sidebar-head { display: flex; align-items: center; gap: 4px; padding: 8px; border-bottom: 1px solid #eee; }
.sidebar-title { font-size: 13px; font-weight: 700; margin-right: auto; white-space: nowrap; }
.sidebar-head button { font-size: 11px; padding: 3px 6px; border: 1px solid #ccc; border-radius: 5px; background: #fff; cursor: pointer; white-space: nowrap; }
.sidebar-toggle { flex: 0 0 16px; border: none; border-right: 1px solid #e2e2e2; background: #eee; cursor: pointer; font-size: 10px; color: #666; padding: 0; }
.sidebar-toggle:hover { background: #ddd; }
.layout.sidebar-collapsed .sidebar-toggle { transform: scaleX(-1); }
.collection-tree { flex: 1; overflow: auto; padding: 6px; }
.collection-tree .ct-empty { color: #bbb; font-size: 12px; padding: 16px 6px; line-height: 1.6; }

/* 树节点通用 */
.ct-node { font-size: 13px; }
.ct-row { display: flex; align-items: center; gap: 4px; padding: 3px 4px; border-radius: 5px; white-space: nowrap; }
.ct-row:hover { background: #eef2ff; }
.ct-toggle { width: 14px; flex: 0 0 14px; cursor: pointer; color: #888; user-select: none; text-align: center; }
.ct-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; cursor: pointer; border: 1px solid transparent; border-radius: 4px; padding: 1px 4px; }
.ct-label:hover { border-color: #ddd; }
.ct-label:focus { border-color: #2563eb; outline: none; background: #fff; }
.ct-req .ct-label { color: #2563eb; }
.ct-actions { display: none; gap: 2px; }
.ct-row:hover .ct-actions { display: inline-flex; }
.ct-actions button { border: none; background: none; cursor: pointer; font-size: 12px; color: #888; padding: 0 2px; }
.ct-actions button:hover { color: #2563eb; }
.ct-actions button.ct-del:hover { color: #dc2626; }
.ct-children { padding-left: 14px; }
.ct-req-note { margin: 2px 0 4px 18px; width: calc(100% - 24px); box-sizing: border-box; font-size: 12px; border: 1px solid #eee; border-radius: 5px; padding: 3px 6px; resize: vertical; min-height: 26px; font-family: inherit; }

/* 保存到弹窗 */
.save-box { width: 420px; height: auto; }
.save-body { padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.save-row { display: flex; align-items: center; gap: 8px; }
.save-row > span { flex: 0 0 44px; font-size: 13px; color: #555; }
.save-row select, .save-row input { flex: 1; min-width: 0; padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; font-size: 13px; }
.save-row button { padding: 6px 10px; border: 1px solid #93c5fd; color: #2563eb; border-radius: 6px; background: #fff; cursor: pointer; white-space: nowrap; }
.save-actions { display: flex; justify-content: flex-end; }
.save-actions .primary { background: #2563eb; color: #fff; border: 1px solid #2563eb; padding: 7px 20px; border-radius: 6px; cursor: pointer; }
```

- [ ] **Step 2: 提交**

```bash
git add src/tab/tab.css
git commit -m "feat: 请求库侧边栏与保存弹窗样式"
```

---

## Task 11: tab.js —— 状态、树渲染与折叠

**Files:**
- Modify: `src/tab/tab.js`

- [ ] **Step 1: 顶部补 import**

把 `src/tab/tab.js` 顶部 import 段(第 1-11 行)之后追加一段:

```js
import {
  loadCollections, saveCollections,
  addProject, renameProject, removeProject,
  addModule, renameModule, removeModule,
  addRequest, renameRequest, updateRequestNote, removeRequest,
  moveRequest, reorderProject, reorderModule, reorderRequest,
  exportState, importState,
} from "../core/collections.js";
```

- [ ] **Step 2: 在文件末尾「初始化」段之前,追加请求库模块**

在 `src/tab/tab.js` 末尾的 `// ---- 初始化 ----` 注释之前,插入整段请求库逻辑:

```js
// ==== 请求库(项目 → 模块 → 请求)====
let colState = { projects: [] };
// 记录展开状态(id 集合),避免重渲染后全部折叠
const expanded = new Set();

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

// 通用:构造一行(toggle + 就地改名 label + 操作按钮)
function makeRow(kind, id, name, onRename, actions, onOpen) {
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

  const label = document.createElement("input");
  label.className = "ct-label";
  label.value = name;
  label.title = name;
  label.onchange = () => onRename(label.value);
  if (onOpen) label.ondblclick = onOpen; // 请求:双击回填(单击可编辑名)

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
    async (name) => { colState = renameProject(colState, p.id, name); await saveCol(); },
    [
      { icon: "＋", title: "新建模块", fn: async () => {
          const name = prompt("模块名称"); if (!name) return;
          colState = addModule(colState, p.id, name); expanded.add(p.id); await saveCol(); refreshTree();
        } },
      { icon: "↑", title: "上移", fn: async () => { colState = reorderProject(colState, p.id, -1); await saveCol(); refreshTree(); } },
      { icon: "↓", title: "下移", fn: async () => { colState = reorderProject(colState, p.id, 1); await saveCol(); refreshTree(); } },
      { icon: "🗑", title: "删除项目", danger: true, fn: async () => {
          const cnt = p.modules.reduce((s, m) => s + m.requests.length, 0);
          if (!confirm(`删除项目「${p.name}」? 将连同 ${p.modules.length} 个模块、${cnt} 个请求一起删除。`)) return;
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
    async (name) => { colState = renameModule(colState, p.id, m.id, name); await saveCol(); },
    [
      { icon: "＋", title: "新建请求", fn: async () => {
          const req = { method: "GET", url: "https://", headers: {}, body: "", name: "新请求" };
          colState = addRequest(colState, p.id, m.id, req); expanded.add(m.id); await saveCol(); refreshTree();
          // 回填模板到编辑器供编辑
          editor.setValue(toHttp(req));
        } },
      { icon: "↑", title: "上移", fn: async () => { colState = reorderModule(colState, p.id, m.id, -1); await saveCol(); refreshTree(); } },
      { icon: "↓", title: "下移", fn: async () => { colState = reorderModule(colState, p.id, m.id, 1); await saveCol(); refreshTree(); } },
      { icon: "🗑", title: "删除模块", danger: true, fn: async () => {
          if (!confirm(`删除模块「${m.name}」? 将连同 ${m.requests.length} 个请求一起删除。`)) return;
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

function renderRequest(p, m, r) {
  const node = document.createElement("div");
  node.className = "ct-node";
  const open = () => loadIntoEditor(r);
  const row = makeRow("req", r.id, r.name,
    async (name) => { colState = renameRequest(colState, p.id, m.id, r.id, name); await saveCol(); },
    [
      { icon: "▶", title: "回填到编辑器", fn: open },
      { icon: "✎", title: "编辑备注", fn: () => toggleNote(node, p, m, r) },
      { icon: "↑", title: "上移", fn: async () => { colState = reorderRequest(colState, p.id, m.id, r.id, -1); await saveCol(); refreshTree(); } },
      { icon: "↓", title: "下移", fn: async () => { colState = reorderRequest(colState, p.id, m.id, r.id, 1); await saveCol(); refreshTree(); } },
      { icon: "🗑", title: "删除请求", danger: true, fn: async () => {
          colState = removeRequest(colState, p.id, m.id, r.id); await saveCol(); refreshTree();
        } },
    ], open);
  node.appendChild(row);
  return node;
}

// 展开/收起某请求的备注编辑框
function toggleNote(node, p, m, r) {
  const exist = node.querySelector(".ct-req-note");
  if (exist) { exist.remove(); return; }
  const ta = document.createElement("textarea");
  ta.className = "ct-req-note";
  ta.placeholder = "填写备注…";
  ta.value = r.note || "";
  ta.onchange = async () => {
    colState = updateRequestNote(colState, p.id, m.id, r.id, ta.value);
    r.note = ta.value; // 同步本地引用,避免下次打开丢失
    await saveCol();
  };
  node.appendChild(ta);
  ta.focus();
}
```

- [ ] **Step 3: 接线折叠按钮与新建项目/导入/导出(仍在末尾追加)**

```js
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
```

- [ ] **Step 4: 在「初始化」段追加加载**

把 `src/tab/tab.js` 末尾:

```js
// ---- 初始化 ----
loadHistory().then(refreshHistory);
loadEnvironments().then((s) => { envState = s; refreshEnvSelect(); });
```

改为:

```js
// ---- 初始化 ----
loadHistory().then(refreshHistory);
loadEnvironments().then((s) => { envState = s; refreshEnvSelect(); });
loadCollections().then((s) => { colState = s; refreshTree(); });
```

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: 构建成功,无报错(验证 import 路径与语法)。

- [ ] **Step 6: 提交**

```bash
git add src/tab/tab.js
git commit -m "feat: 请求库侧边栏树渲染、折叠与导入导出接线"
```

---

## Task 12: 三入口接线 —— 保存弹窗(编辑器/历史)

**Files:**
- Modify: `src/tab/tab.js`

入口 3(库里新建)已在 Task 11 的模块「＋」按钮完成。本任务做入口 1(编辑器保存)与入口 2(历史另存),共用「保存到」弹窗。

- [ ] **Step 1: 在 tab.js 末尾追加「保存到」弹窗逻辑**

```js
// ==== 「保存到」弹窗:入口 1(编辑器)/入口 2(历史)共用 ====
const saveModal = $("save-modal");
let pendingReq = null; // 待保存的请求对象

// 打开弹窗,预填名称;req 为已解析的请求对象
function openSaveModal(req) {
  pendingReq = req;
  $("save-name").value = req.name || `${req.method} ${req.url}`;
  refreshSaveSelects();
  saveModal.classList.remove("hidden");
}
function closeSaveModal() { saveModal.classList.add("hidden"); pendingReq = null; }

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
  colState = addRequest(colState, pid, mid, { ...pendingReq, name: name || undefined });
  expanded.add(pid); expanded.add(mid);
  await saveCol(); refreshTree();
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
  openSaveModal(req);
};
```

- [ ] **Step 2: 入口 2 —— 给历史项加「另存到库」按钮**

`renderHlItem`(左下列表,`src/tab/tab.js` 约 186-235 行)与 `renderHistItem`(历史弹窗,约 284-334 行)都有一个 `loadBtn`「回填」。在这两处的 `loadBtn` 定义之后、`delBtn` 之前,各插入一个另存按钮。

`renderHlItem` 中,找到:

```js
  const loadBtn = document.createElement("button");
  loadBtn.className = "hl-btn load";
  loadBtn.textContent = "回填";
  loadBtn.onclick = () => loadIntoEditor(item);
```

在其后插入:

```js
  const saveBtn = document.createElement("button");
  saveBtn.className = "hl-btn load";
  saveBtn.textContent = "另存";
  saveBtn.title = "另存到请求库";
  saveBtn.onclick = () => openSaveModal(item);
```

并把该函数里 `row1.append(name, loadBtn, delBtn);` 改为 `row1.append(name, loadBtn, saveBtn, delBtn);`。

`renderHistItem` 中,找到 `actions.append(loadBtn, delBtn);` 上方的 `loadBtn` 定义:

```js
  const loadBtn = document.createElement("button");
  loadBtn.className = "load";
  loadBtn.textContent = "回填";
  loadBtn.onclick = () => { loadIntoEditor(item); closeHistoryModal(); };
```

在其后插入:

```js
  const saveBtn = document.createElement("button");
  saveBtn.className = "load";
  saveBtn.textContent = "另存";
  saveBtn.title = "另存到请求库";
  saveBtn.onclick = () => { openSaveModal(item); };
```

并把 `actions.append(loadBtn, delBtn);` 改为 `actions.append(loadBtn, saveBtn, delBtn);`。

- [ ] **Step 3: 构建验证**

Run: `npm run build`
Expected: 构建成功无报错。

- [ ] **Step 4: 运行全部单测确认无回归**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add src/tab/tab.js
git commit -m "feat: 请求库三入口接线(编辑器/历史另存共用保存弹窗)"
```

---

## Task 13: 手动验证(加载到浏览器)

**Files:** 无(纯手动验证)

自动化只覆盖 core 纯函数,UI 需人工确认。

- [ ] **Step 1: 构建**

Run: `npm run build`
Expected: 生成 `dist/`。

- [ ] **Step 2: 加载扩展**

打开 `chrome://extensions` → 开发者模式 → 加载已解压 → 选 `dist/` → 点工具栏图标打开标签页。

- [ ] **Step 3: 逐项走查**

- [ ] 左侧出现「请求库」侧边栏;点折叠按钮 ◀ 能收起/展开,刷新后记忆状态。
- [ ] 点「+ 项目」建项目;项目行「＋」建模块;模块行「＋」建请求(编辑器被回填为模板 `GET https://`)。
- [ ] 展开/折叠项目、模块箭头正常;刷新页面后展开状态与数据都在(持久化生效)。
- [ ] 就地改名:项目/模块/请求名称框改后失焦,刷新仍在。
- [ ] 请求行「▶」或双击名称回填到编辑器;「✎」展开备注框、写入后刷新仍在。
- [ ] 上移/下移 ↑↓ 对项目/模块/请求都生效。
- [ ] 删除项目/模块有二次确认并显示连带数量;删请求直接删。
- [ ] 工具栏「保存到库 ⭑」:编辑器写一个请求 → 弹窗选项目/模块(或弹窗内「+ 新建」)→ 保存 → 出现在树中。
- [ ] 历史面板(左下 + 弹窗)每条历史「另存」按钮 → 打开保存弹窗预填 → 保存成功。
- [ ] 导出:点「导出」下载 `curl2rest-collections.json`,内容正确。
- [ ] 导入:点「导入」选该文件 → 选「合并」或「替换」→ 树更新正确;导入非 JSON 文件有报错提示不崩溃。
- [ ] 原有功能无回归:发送请求、curl↔HTTP 转换、环境切换、历史记录、拖拽分隔线均正常。

- [ ] **Step 4: 如发现问题**

用 `superpowers:systematic-debugging` 定位修复,补测试后重新走查。全部通过再进入 Task 14。

---

## Task 14: 版本号、CHANGELOG 与文档

**Files:**
- Modify: `package.json`、`manifest.json`、`CHANGELOG.md`、`README.md`

按项目规范(见 memory:每次修改都提升版本号):新增功能,0.2.0 → **0.3.0**。

- [ ] **Step 1: 升版本号**

`package.json`:`"version": "0.2.0"` → `"version": "0.3.0"`
`manifest.json`:`"version": "0.2.0"` → `"version": "0.3.0"`(两处 version,注意 manifest 顶层的 version)

- [ ] **Step 2: 更新 CHANGELOG.md**

在 CHANGELOG 顶部加入 0.3.0 段(日期 2026-08-24),要点:
- 新增「请求库」:按项目 → 模块 → 请求两层维度手动整理收藏请求
- 常驻可折叠左侧边栏,树形展示,就地改名、上移下移、删除
- 三种保存入口:工具栏「保存到库」、历史「另存」、模块内「+ 请求」新建
- 请求可写备注;支持导入/导出 JSON(合并 / 替换两种模式)

- [ ] **Step 3: 更新 README.md**

在「功能」列表加一条:
- **请求库**:左侧边栏按「项目 → 模块 → 请求」整理常用请求,支持就地改名、排序、备注、导入/导出 JSON;可从编辑器或历史一键收藏。

「目录结构」的 `core/` 下补一行:`│   └── collections.js            # 请求库(项目/模块/请求)增删改/导入导出`。

- [ ] **Step 4: 运行测试 + 构建做最终确认**

Run: `npm test && npm run build`
Expected: 测试全绿、构建成功。

- [ ] **Step 5: 提交并打 tag**

```bash
git add package.json manifest.json CHANGELOG.md README.md
git commit -m "chore: 发布 0.3.0 —— 请求库(项目/模块/请求)管理"
git tag v0.3.0
```

---

## 自审记录

- **Spec 覆盖**:数据模型(Task 1-8)、三栏布局与侧边栏(Task 9-11)、折叠(Task 11)、三入口(Task 11 入口3 + Task 12 入口1/2)、重命名删除移动排序(Task 2-6, 11)、导入导出(Task 7, 11)、备注(Task 4, 11)、版本(Task 14)—— 全覆盖。
- **占位符**:无 TBD/TODO,每步含完整代码或命令。
- **类型一致性**:core 函数签名在 Task 11/12 调用处与 Task 1-8 定义一致(`addRequest(s,pid,mid,req)`、`reorderX(...,dir)`、`importState(s,incoming,mode)` 等);`loadIntoEditor`/`toHttp`/`parseRequest`/`substitute`/`activeVars` 均为 tab.js 既有函数。
- **备注**:入口 3 模板请求带 `method:"GET"/url:"https://"` 确保 `toHttp` 回填不报错(与 spec 一致)。
