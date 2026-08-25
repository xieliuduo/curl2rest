# curl2rest 浏览器插件 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Chrome/Edge (MV3) 浏览器插件,模仿 VSCode REST Client:在独立标签页左侧编辑 HTTP 报文或 curl 命令,点击发送,右侧展示响应;支持 curl↔HTTP 双向转换、环境变量替换、请求历史,错误以小白友好的方式展示。

**Architecture:** 标签页 UI 负责编辑/解析/展示,background service worker 负责发请求(绕过 CORS)并计时。核心解析/转换逻辑为纯函数模块(`src/core/`),可独立单元测试。UI 与 background 通过 `chrome.runtime.sendMessage` 通信,请求在 UI 侧解析成统一 `RequestObject` 后传递。

**Tech Stack:** Vite 5 + @crxjs/vite-plugin(MV3 打包)、CodeMirror 6(编辑器)、Vitest(单测)、chrome.storage.local(持久化)。

---

## 数据结构约定

统一中间表示,贯穿所有模块:

```js
/** @typedef {Object} RequestObject
 *  @property {string} method            HTTP 方法,大写,如 "POST"
 *  @property {string} url               完整 URL
 *  @property {Object<string,string>} headers  头部键值对(键原样保留)
 *  @property {string|null} body         请求体原始字符串,无则 null
 */
```

解析错误统一抛 `ParseError`,携带 `code`(用于查友好文案):

```js
export class ParseError extends Error {
  constructor(code, message) { super(message); this.name = "ParseError"; this.code = code; }
}
```

错误码集合(解析 + 网络,集中在 `errors.js`):
`PARSE_FIRST_LINE`、`PARSE_NO_URL`、`PARSE_CURL_NO_URL`、`NET_FAILED`、`NET_DNS`、`NET_TIMEOUT`、`NET_CORS`、`UNKNOWN`。

---

## File Structure

- `package.json` — 依赖与脚本(dev/build/test)
- `vite.config.js` — crxjs 插件 + 构建配置
- `manifest.json` — MV3 清单(crxjs 读取)
- `src/shared/messages.js` — 消息类型常量
- `src/core/errors.js` — `ParseError`、错误码→友好文案映射、`describeError`
- `src/core/format.js` — `detectFormat`/`parseHttp`/`parseCurl`/`parseRequest`/`toHttp`/`toCurl`
- `src/core/variables.js` — `substitute`(`{{key}}` 替换)
- `src/core/history.js` — 纯逻辑 `addEntry` + storage 读写封装
- `src/background/service-worker.js` — 收消息、fetch、计时、错误分类、回传
- `src/tab/tab.html` — 标签页骨架
- `src/tab/tab.css` — 样式(左右分栏、错误卡片)
- `src/tab/editor.js` — CodeMirror 封装(getValue/setValue)
- `src/tab/tab.js` — UI 主逻辑:解析→发送→渲染、转换按钮、环境、历史
- `test/core/format.test.js`、`test/core/variables.test.js`、`test/core/history.test.js`、`test/core/errors.test.js`

---

## Task 1: 项目脚手架与构建配置

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `manifest.json`
- Create: `src/tab/tab.html`(最小占位,后续任务填充)
- Create: `src/background/service-worker.js`(最小占位)

- [ ] **Step 1: 创建 `package.json`**

```json
{
  "name": "curl2rest",
  "version": "0.1.0",
  "description": "模仿 VSCode REST Client 的浏览器插件",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2.0.0-beta.28",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  },
  "dependencies": {
    "@codemirror/state": "^6.4.1",
    "@codemirror/view": "^6.34.0",
    "@codemirror/commands": "^6.6.0",
    "@codemirror/language": "^6.10.0",
    "codemirror": "^6.0.1"
  }
}
```

- [ ] **Step 2: 创建 `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "curl2rest",
  "version": "0.1.0",
  "description": "输入 HTTP 报文或 curl 命令,一键发送并查看响应",
  "action": { "default_title": "打开 curl2rest" },
  "background": { "service_worker": "src/background/service-worker.js", "type": "module" },
  "permissions": ["storage"],
  "host_permissions": ["<all_urls>"]
}
```

- [ ] **Step 3: 创建 `vite.config.js`**

```js
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" assert { type: "json" };

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { rollupOptions: { input: { tab: "src/tab/tab.html" } } },
});
```

- [ ] **Step 4: 创建占位 `src/tab/tab.html`**

```html
<!doctype html>
<html lang="zh">
  <head><meta charset="utf-8" /><title>curl2rest</title></head>
  <body><div id="app">loading...</div><script type="module" src="./tab.js"></script></body>
</html>
```

- [ ] **Step 5: 创建占位 `src/tab/tab.js`**

```js
document.getElementById("app").textContent = "curl2rest ready";
```

- [ ] **Step 6: 创建占位 `src/background/service-worker.js`**

```js
// 点击插件图标 → 打开标签页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/tab/tab.html") });
});
```

- [ ] **Step 7: 安装依赖并验证构建**

Run: `npm install && npm run build`
Expected: 生成 `dist/` 目录,无报错;`dist/manifest.json` 存在。

- [ ] **Step 8: Commit**

```bash
git add package.json vite.config.js manifest.json src/ .gitignore
git commit -m "chore: 初始化 curl2rest 插件脚手架与构建配置"
```

(同时创建 `.gitignore` 含 `node_modules/` 和 `dist/`。)

---

## Task 2: 错误文案模块 `errors.js`(TDD)

**Files:**
- Create: `src/core/errors.js`
- Test: `test/core/errors.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from "vitest";
import { ParseError, describeError } from "../../src/core/errors.js";

describe("describeError", () => {
  it("已知错误码返回友好的三段文案", () => {
    const d = describeError("NET_FAILED");
    expect(d.title).toBe("无法连接到服务器");
    expect(d.reason).toBeTruthy();
    expect(d.suggestion).toBeTruthy();
  });

  it("未知错误码回退到 UNKNOWN 文案", () => {
    const d = describeError("SOMETHING_WEIRD");
    expect(d.title).toBe("出了点意外,请求没成功");
  });

  it("ParseError 携带 code", () => {
    const e = new ParseError("PARSE_NO_URL", "no url");
    expect(e.code).toBe("PARSE_NO_URL");
    expect(e.name).toBe("ParseError");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/core/errors.test.js`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `src/core/errors.js`**

```js
export class ParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ParseError";
    this.code = code;
  }
}

// 错误码 → 面向小白用户的三段文案:发生了什么 / 可能原因 / 建议操作
export const ERROR_MESSAGES = {
  PARSE_FIRST_LINE: {
    title: "看不懂你输入的请求格式",
    reason: "请求的第一行不符合规范",
    suggestion: "首行应形如 `POST https://example.com HTTP/1.1`,或粘贴一条 curl 命令",
  },
  PARSE_NO_URL: {
    title: "没找到有效的网址",
    reason: "请求里缺少 URL 或 URL 格式不对",
    suggestion: "确认 URL 以 http:// 或 https:// 开头",
  },
  PARSE_CURL_NO_URL: {
    title: "curl 命令里没找到网址",
    reason: "这条 curl 命令缺少要请求的 URL",
    suggestion: "确认 curl 后面带了一个 http(s) 网址",
  },
  NET_FAILED: {
    title: "无法连接到服务器",
    reason: "网址写错了,或该服务器暂时无法访问",
    suggestion: "检查网址是否正确、网络是否正常、服务器是否在线",
  },
  NET_DNS: {
    title: "找不到这个网址对应的服务器",
    reason: "域名可能拼写错误或不存在",
    suggestion: "确认域名拼写正确",
  },
  NET_TIMEOUT: {
    title: "服务器太久没响应",
    reason: "请求超过了等待时间",
    suggestion: "稍后重试,或确认服务器是否正常",
  },
  NET_CORS: {
    title: "浏览器拦截了这次请求",
    reason: "这是权限问题",
    suggestion: "可把这个情况反馈给开发者",
  },
  UNKNOWN: {
    title: "出了点意外,请求没成功",
    reason: "遇到了预期之外的问题",
    suggestion: "请查看技术详情,或稍后重试",
  },
};

export function describeError(code) {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/core/errors.test.js`
Expected: PASS(3 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/core/errors.js test/core/errors.test.js
git commit -m "feat: 错误码到小白友好文案的映射模块"
```

---

## Task 3: HTTP 报文解析与生成 `format.js`(第一部分,TDD)

**Files:**
- Create: `src/core/format.js`
- Test: `test/core/format.test.js`

- [ ] **Step 1: 写失败测试(parseHttp + toHttp)**

```js
import { describe, it, expect } from "vitest";
import { parseHttp, toHttp } from "../../src/core/format.js";
import { ParseError } from "../../src/core/errors.js";

describe("parseHttp", () => {
  it("解析方法、URL、头部、body", () => {
    const text = [
      "POST https://example.com/comments HTTP/1.1",
      "content-type: application/json",
      "",
      '{"name":"sample"}',
    ].join("\n");
    const r = parseHttp(text);
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://example.com/comments");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.body).toBe('{"name":"sample"}');
  });

  it("无 body 时 body 为 null", () => {
    const r = parseHttp("GET https://example.com/a HTTP/1.1");
    expect(r.method).toBe("GET");
    expect(r.body).toBeNull();
  });

  it("省略方法时默认 GET", () => {
    const r = parseHttp("https://example.com/a");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://example.com/a");
  });

  it("首行缺少 URL 抛 PARSE_NO_URL", () => {
    expect(() => parseHttp("POST")).toThrow(ParseError);
    try { parseHttp("POST"); } catch (e) { expect(e.code).toBe("PARSE_NO_URL"); }
  });
});

describe("toHttp", () => {
  it("从 RequestObject 生成 HTTP 报文", () => {
    const out = toHttp({
      method: "POST",
      url: "https://example.com/c",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    });
    expect(out).toBe(
      'POST https://example.com/c HTTP/1.1\ncontent-type: application/json\n\n{"a":1}'
    );
  });

  it("无 body 不产生空行", () => {
    const out = toHttp({ method: "GET", url: "https://x.com", headers: {}, body: null });
    expect(out).toBe("GET https://x.com HTTP/1.1");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/core/format.test.js`
Expected: FAIL(函数未定义)。

- [ ] **Step 3: 实现 parseHttp + toHttp**

创建 `src/core/format.js`:

```js
import { ParseError } from "./errors.js";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** 解析 HTTP 报文格式 → RequestObject */
export function parseHttp(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const firstLine = (lines.shift() ?? "").trim();
  if (!firstLine) throw new ParseError("PARSE_FIRST_LINE", "请求首行为空");

  // 首行可能是 "METHOD URL HTTP/1.1" 或省略方法的 "URL"
  const parts = firstLine.split(/\s+/);
  let method, url;
  if (METHODS.includes(parts[0].toUpperCase())) {
    method = parts[0].toUpperCase();
    url = parts[1];
  } else {
    method = "GET";
    url = parts[0];
  }
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new ParseError("PARSE_NO_URL", "首行未找到有效 URL");
  }

  // 头部:直到空行
  const headers = {};
  let i = 0;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") { i++; break; }
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) headers[key] = val;
  }

  // 剩余为 body
  const rest = lines.slice(i).join("\n").trim();
  const body = rest.length ? rest : null;

  return { method, url, headers, body };
}

/** RequestObject → HTTP 报文文本 */
export function toHttp(obj) {
  const head = `${obj.method} ${obj.url} HTTP/1.1`;
  const headerLines = Object.entries(obj.headers || {}).map(([k, v]) => `${k}: ${v}`);
  let out = [head, ...headerLines].join("\n");
  if (obj.body != null && String(obj.body).length) out += `\n\n${obj.body}`;
  return out;
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/core/format.test.js`
Expected: PASS(6 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/core/format.js test/core/format.test.js
git commit -m "feat: HTTP 报文解析与生成 (parseHttp/toHttp)"
```

---

## Task 4: curl 解析与生成 `format.js`(第二部分,TDD)

**Files:**
- Modify: `src/core/format.js`
- Modify: `test/core/format.test.js`

- [ ] **Step 1: 追加失败测试(parseCurl + toCurl + detectFormat + parseRequest)**

在 `test/core/format.test.js` 顶部 import 增补:

```js
import {
  parseHttp, toHttp, parseCurl, toCurl, detectFormat, parseRequest,
} from "../../src/core/format.js";
```

追加用例:

```js
describe("detectFormat", () => {
  it("以 curl 开头识别为 curl", () => {
    expect(detectFormat("curl https://x.com")).toBe("curl");
    expect(detectFormat("  CURL -X GET https://x.com")).toBe("curl");
  });
  it("其他识别为 http", () => {
    expect(detectFormat("GET https://x.com HTTP/1.1")).toBe("http");
  });
});

describe("parseCurl", () => {
  it("解析基础 GET", () => {
    const r = parseCurl("curl https://example.com/a");
    expect(r.method).toBe("GET");
    expect(r.url).toBe("https://example.com/a");
    expect(r.body).toBeNull();
  });

  it("解析 -X、多个 -H、-d(有 body 默认为 POST)", () => {
    const cmd = `curl -X POST https://example.com/c \\
      -H "content-type: application/json" \\
      -H "authorization: Bearer t" \\
      -d '{"a":1}'`;
    const r = parseCurl(cmd);
    expect(r.method).toBe("POST");
    expect(r.url).toBe("https://example.com/c");
    expect(r.headers["content-type"]).toBe("application/json");
    expect(r.headers["authorization"]).toBe("Bearer t");
    expect(r.body).toBe('{"a":1}');
  });

  it("有 -d 但未指定 -X 时方法默认 POST", () => {
    const r = parseCurl(`curl https://x.com -d 'hi'`);
    expect(r.method).toBe("POST");
    expect(r.body).toBe("hi");
  });

  it("缺少 URL 抛 PARSE_CURL_NO_URL", () => {
    try { parseCurl("curl -X GET"); } catch (e) { expect(e.code).toBe("PARSE_CURL_NO_URL"); }
  });
});

describe("toCurl", () => {
  it("生成带 -X、-H、-d 的 curl", () => {
    const out = toCurl({
      method: "POST",
      url: "https://example.com/c",
      headers: { "content-type": "application/json" },
      body: '{"a":1}',
    });
    expect(out).toContain("curl -X POST 'https://example.com/c'");
    expect(out).toContain("-H 'content-type: application/json'");
    expect(out).toContain(`-d '{"a":1}'`);
  });
});

describe("parseRequest 往返一致", () => {
  const obj = {
    method: "POST", url: "https://example.com/c",
    headers: { "content-type": "application/json" }, body: '{"a":1}',
  };
  it("http 往返", () => {
    expect(parseRequest(toHttp(obj))).toEqual(obj);
  });
  it("curl 往返", () => {
    expect(parseRequest(toCurl(obj))).toEqual(obj);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/core/format.test.js`
Expected: FAIL(parseCurl 等未定义)。

- [ ] **Step 3: 实现 detectFormat/parseCurl/toCurl/parseRequest**

在 `src/core/format.js` 追加:

```js
/** 判断编辑器文本是 curl 还是 http 报文 */
export function detectFormat(text) {
  return /^\s*curl\b/i.test(text) ? "curl" : "http";
}

/** 把 curl 命令拆成 token,支持单/双引号与反斜杠续行 */
function tokenizeCurl(text) {
  const joined = text.replace(/\\\r?\n/g, " "); // 续行合并
  const tokens = [];
  const re = /'([^']*)'|"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m;
  while ((m = re.exec(joined)) !== null) {
    if (m[1] !== undefined) tokens.push(m[1]);
    else if (m[2] !== undefined) tokens.push(m[2].replace(/\\(.)/g, "$1"));
    else tokens.push(m[3]);
  }
  return tokens;
}

/** 解析 curl 命令 → RequestObject */
export function parseCurl(text) {
  const tokens = tokenizeCurl(text);
  if (tokens[0] && /^curl$/i.test(tokens[0])) tokens.shift();

  let method = null;
  let url = null;
  const headers = {};
  let body = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-X" || t === "--request") {
      method = (tokens[++i] || "GET").toUpperCase();
    } else if (t === "-H" || t === "--header") {
      const h = tokens[++i] || "";
      const idx = h.indexOf(":");
      if (idx !== -1) headers[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    } else if (t === "-d" || t === "--data" || t === "--data-raw" || t === "--data-binary") {
      body = tokens[++i] ?? "";
    } else if (t === "-u" || t === "--user") {
      const cred = tokens[++i] || "";
      headers["Authorization"] = "Basic " + btoa(cred);
    } else if (t === "--url") {
      url = tokens[++i];
    } else if (!t.startsWith("-") && /^https?:\/\//i.test(t)) {
      url = t;
    }
  }

  if (!url) throw new ParseError("PARSE_CURL_NO_URL", "curl 命令未找到 URL");
  if (!method) method = body != null ? "POST" : "GET";

  return { method, url, headers, body };
}

/** RequestObject → curl 命令文本 */
export function toCurl(obj) {
  const parts = [`curl -X ${obj.method} '${obj.url}'`];
  for (const [k, v] of Object.entries(obj.headers || {})) {
    parts.push(`-H '${k}: ${v}'`);
  }
  if (obj.body != null && String(obj.body).length) {
    parts.push(`-d '${obj.body}'`);
  }
  return parts.join(" \\\n  ");
}

/** 自动识别格式并解析 */
export function parseRequest(text) {
  return detectFormat(text) === "curl" ? parseCurl(text) : parseHttp(text);
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/core/format.test.js`
Expected: PASS(全部用例)。

- [ ] **Step 5: Commit**

```bash
git add src/core/format.js test/core/format.test.js
git commit -m "feat: curl 解析与生成、格式识别与往返一致 (parseCurl/toCurl/detectFormat)"
```

---

## Task 5: 环境变量替换 `variables.js`(TDD)

**Files:**
- Create: `src/core/variables.js`
- Test: `test/core/variables.test.js`

- [ ] **Step 1: 写失败测试**

```js
import { describe, it, expect } from "vitest";
import { substitute } from "../../src/core/variables.js";

describe("substitute", () => {
  it("替换 {{key}} 为对应值", () => {
    expect(substitute("GET {{host}}/a", { host: "https://x.com" }))
      .toBe("GET https://x.com/a");
  });
  it("多个变量与重复变量都替换", () => {
    expect(substitute("{{a}}-{{b}}-{{a}}", { a: "1", b: "2" })).toBe("1-2-1");
  });
  it("未定义的变量原样保留", () => {
    expect(substitute("{{x}}", {})).toBe("{{x}}");
  });
  it("允许键名带空格", () => {
    expect(substitute("{{ host }}", { host: "h" })).toBe("h");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/core/variables.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/core/variables.js`**

```js
/** 把文本中的 {{key}} 替换为 vars[key];未定义的原样保留 */
export function substitute(text, vars) {
  if (!text) return text;
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/core/variables.test.js`
Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/core/variables.js test/core/variables.test.js
git commit -m "feat: 环境变量 {{key}} 替换模块"
```

---

## Task 6: 历史记录逻辑 `history.js`(TDD)

**Files:**
- Create: `src/core/history.js`
- Test: `test/core/history.test.js`

- [ ] **Step 1: 写失败测试(纯逻辑 addEntry)**

```js
import { describe, it, expect } from "vitest";
import { addEntry } from "../../src/core/history.js";

describe("addEntry", () => {
  it("新条目插到最前", () => {
    const list = addEntry([], { url: "a" }, 50);
    expect(list[0].url).toBe("a");
  });
  it("超过上限时截断旧条目", () => {
    let list = [];
    for (let i = 0; i < 60; i++) list = addEntry(list, { url: String(i) }, 50);
    expect(list.length).toBe(50);
    expect(list[0].url).toBe("59"); // 最新在前
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/core/history.test.js`
Expected: FAIL。

- [ ] **Step 3: 实现 `src/core/history.js`**

```js
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
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/core/history.test.js`
Expected: PASS(2 个用例)。

- [ ] **Step 5: Commit**

```bash
git add src/core/history.js test/core/history.test.js
git commit -m "feat: 请求历史记录逻辑与持久化"
```

---

## Task 7: background service worker(发请求 + 计时 + 错误分类)

**Files:**
- Modify: `src/background/service-worker.js`
- Create: `src/shared/messages.js`

- [ ] **Step 1: 创建消息常量 `src/shared/messages.js`**

```js
export const MSG = {
  SEND_REQUEST: "SEND_REQUEST",
};
```

- [ ] **Step 2: 实现 service worker**

替换 `src/background/service-worker.js` 全部内容:

```js
import { MSG } from "../shared/messages.js";

// 点击图标 → 打开标签页
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("src/tab/tab.html") });
});

// 把 fetch 异常分类成错误码(供 UI 查友好文案)
function classifyError(err) {
  const msg = (err && err.message ? err.message : "").toLowerCase();
  if (msg.includes("failed to fetch") || msg.includes("networkerror")) return "NET_FAILED";
  if (msg.includes("name_not_resolved") || msg.includes("dns")) return "NET_DNS";
  if (msg.includes("timed out") || msg.includes("timeout")) return "NET_TIMEOUT";
  return "UNKNOWN";
}

async function doFetch(req) {
  const start = performance.now();
  const init = { method: req.method, headers: req.headers || {} };
  if (req.body != null && !["GET", "HEAD"].includes(req.method)) init.body = req.body;

  const resp = await fetch(req.url, init);
  const text = await resp.text();
  const timeMs = Math.round(performance.now() - start);
  const headers = {};
  resp.headers.forEach((v, k) => { headers[k] = v; });

  return {
    ok: true,
    status: resp.status,
    statusText: resp.statusText,
    headers,
    body: text,
    timeMs,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MSG.SEND_REQUEST) {
    doFetch(message.payload)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, errorType: classifyError(err), rawMessage: String(err) })
      );
    return true; // 异步响应
  }
});
```

- [ ] **Step 3: 构建验证无语法错误**

Run: `npm run build`
Expected: 构建成功,`dist/` 更新。

- [ ] **Step 4: Commit**

```bash
git add src/background/service-worker.js src/shared/messages.js
git commit -m "feat: background service worker 发请求、计时与错误分类"
```

---

## Task 8: CodeMirror 编辑器封装 `editor.js`

**Files:**
- Create: `src/tab/editor.js`

- [ ] **Step 1: 实现编辑器封装**

```js
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";

/** 创建编辑器,返回 { getValue, setValue } */
export function createEditor(parent, initialText = "") {
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc: initialText, extensions: [basicSetup] }),
  });
  return {
    getValue: () => view.state.doc.toString(),
    setValue: (text) =>
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/tab/editor.js
git commit -m "feat: CodeMirror 编辑器封装"
```

（此模块依赖 DOM,不做单元测试,由端到端手动验证。）

---

## Task 9: 标签页 UI —— HTML 骨架与样式

**Files:**
- Modify: `src/tab/tab.html`
- Create: `src/tab/tab.css`

- [ ] **Step 1: 编写 `src/tab/tab.html`**

```html
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <title>curl2rest</title>
    <link rel="stylesheet" href="./tab.css" />
  </head>
  <body>
    <div class="layout">
      <section class="left">
        <div class="toolbar">
          <select id="env-select" title="环境"></select>
          <button id="btn-to-curl">转为 curl</button>
          <button id="btn-to-http">转为 HTTP 格式</button>
          <button id="btn-send" class="primary">发送 ▶</button>
        </div>
        <div id="editor" class="editor"></div>
        <div class="history">
          <div class="history-title">历史记录</div>
          <ul id="history-list"></ul>
        </div>
      </section>
      <section class="right">
        <div id="status-bar" class="status-bar"></div>
        <div class="tabs">
          <button class="tab active" data-tab="body">Body</button>
          <button class="tab" data-tab="headers">Headers</button>
        </div>
        <pre id="panel-body" class="panel"></pre>
        <pre id="panel-headers" class="panel hidden"></pre>
        <div id="error-card" class="error-card hidden"></div>
      </section>
    </div>
    <script type="module" src="./tab.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 编写 `src/tab/tab.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, "PingFang SC", sans-serif; }
.layout { display: flex; height: 100vh; }
.left, .right { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.left { border-right: 1px solid #e2e2e2; }
.toolbar { display: flex; gap: 8px; padding: 8px; border-bottom: 1px solid #eee; align-items: center; }
.toolbar button, .toolbar select { padding: 6px 10px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; }
.toolbar .primary { background: #2563eb; color: #fff; border-color: #2563eb; }
.editor { flex: 1; overflow: auto; }
.editor .cm-editor { height: 100%; }
.history { max-height: 30%; overflow: auto; border-top: 1px solid #eee; padding: 8px; }
.history-title { font-size: 12px; color: #888; margin-bottom: 4px; }
#history-list { list-style: none; margin: 0; padding: 0; }
#history-list li { font-size: 13px; padding: 4px 6px; cursor: pointer; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#history-list li:hover { background: #f2f6ff; }
.status-bar { padding: 10px 12px; font-weight: 600; border-bottom: 1px solid #eee; }
.status-bar.s2 { color: #16a34a; } .status-bar.s3 { color: #2563eb; }
.status-bar.s4, .status-bar.s5 { color: #dc2626; }
.tabs { display: flex; gap: 4px; padding: 6px 8px; }
.tab { border: none; background: none; padding: 6px 10px; cursor: pointer; border-radius: 6px; }
.tab.active { background: #eef2ff; color: #2563eb; }
.panel { flex: 1; margin: 0; padding: 12px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-family: ui-monospace, Menlo, monospace; font-size: 13px; }
.hidden { display: none; }
.error-card { margin: 12px; padding: 16px; border: 1px solid #fca5a5; background: #fef2f2; border-radius: 8px; }
.error-card h3 { margin: 0 0 8px; color: #dc2626; }
.error-card .row { margin: 4px 0; font-size: 14px; }
.error-card .label { color: #888; margin-right: 6px; }
.error-card details { margin-top: 10px; }
.error-card pre { background: #fff; padding: 8px; border-radius: 6px; overflow: auto; font-size: 12px; }
```

- [ ] **Step 3: Commit**

```bash
git add src/tab/tab.html src/tab/tab.css
git commit -m "feat: 标签页 UI 骨架与样式(左右分栏、错误卡片)"
```

---

## Task 10: 标签页 UI 主逻辑 `tab.js`

**Files:**
- Modify: `src/tab/tab.js`

- [ ] **Step 1: 实现 `tab.js`**

```js
import { createEditor } from "./editor.js";
import { parseRequest, toHttp, toCurl } from "../core/format.js";
import { substitute } from "../core/variables.js";
import { describeError } from "../core/errors.js";
import { loadHistory, pushHistory } from "../core/history.js";
import { MSG } from "../shared/messages.js";

const SAMPLE = [
  "POST https://httpbin.org/post HTTP/1.1",
  "content-type: application/json",
  "",
  '{\n  "name": "sample",\n  "time": "Wed, 21 Oct 2015 18:27:50 GMT"\n}',
].join("\n");

const editor = createEditor(document.getElementById("editor"), SAMPLE);

const $ = (id) => document.getElementById(id);
const statusBar = $("status-bar");
const panelBody = $("panel-body");
const panelHeaders = $("panel-headers");
const errorCard = $("error-card");

// 环境:v1 从 storage 读一个简单的键值 map(可为空)
let envVars = {};
chrome.storage.local.get("curl2rest_env").then((g) => { envVars = g.curl2rest_env || {}; });

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
    const raw = substitute(editor.getValue(), envVars);
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
  await refreshHistory(await pushHistory({ ...req, at: Date.now() }));
}

// ---- 渲染响应 ----
function renderResponse(resp) {
  errorCard.classList.add("hidden");
  const cls = "s" + String(resp.status)[0];
  statusBar.className = "status-bar " + cls;
  const hint = resp.status >= 400 ? " · 服务器返回了错误状态" : "";
  statusBar.textContent = `${resp.status} ${resp.statusText} · ${resp.timeMs}ms${hint}`;

  // body:尝试 JSON 美化
  let body = resp.body;
  try { body = JSON.stringify(JSON.parse(resp.body), null, 2); } catch {}
  const LIMIT = 5 * 1024 * 1024;
  if (body.length > LIMIT) body = body.slice(0, LIMIT) + "\n…(响应内容过大,已只显示前 5MB)";
  panelBody.textContent = body;
  panelHeaders.textContent = Object.entries(resp.headers)
    .map(([k, v]) => `${k}: ${v}`).join("\n");
}

// ---- 渲染友好错误卡片 ----
function renderError(code, rawMessage) {
  const d = describeError(code);
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
    panelHeaders.classList.toggle("hidden", isBody);
  };
});

// ---- 历史记录 ----
async function refreshHistory(list) {
  const ul = $("history-list");
  ul.innerHTML = "";
  (list || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.method} ${item.url}`;
    li.onclick = () => editor.setValue(toHttp(item));
    ul.appendChild(li);
  });
}
loadHistory().then(refreshHistory);
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: Commit**

```bash
git add src/tab/tab.js
git commit -m "feat: 标签页主逻辑 —— 解析、发送、转换、历史、友好错误展示"
```

---

## Task 11: 端到端手动验证

**Files:** 无(手动测试)

- [ ] **Step 1: 构建并加载插件**

Run: `npm run build`
在 Chrome 打开 `chrome://extensions` → 开启"开发者模式" → "加载已解压的扩展程序" → 选择 `dist/` 目录。

- [ ] **Step 2: 验证核心请求**

点击插件图标 → 打开标签页 → 默认示例是 httpbin POST → 点"发送" → 右侧应显示 `200 OK · XXms` 与 JSON 响应体。

- [ ] **Step 3: 验证 curl 粘贴与发送**

编辑器清空,粘贴 `curl https://httpbin.org/get` → 发送 → 应得 200 与响应。

- [ ] **Step 4: 验证双向转换**

在 HTTP 报文状态点"转为 curl" → 内容变 curl;再点"转为 HTTP 格式" → 变回报文。

- [ ] **Step 5: 验证友好错误**

把 URL 改成 `https://nonexistent-domain-xxxxx.com` → 发送 → 右侧应显示友好错误卡片(标题/原因/建议 + 可折叠技术详情),而非崩溃或原始堆栈。

- [ ] **Step 6: 验证历史记录**

发送几次后,左下历史列表出现条目;点击某条应回填编辑器。

- [ ] **Step 7: 运行全部单测**

Run: `npm test`
Expected: 所有 core 单测通过。

- [ ] **Step 8: 更新 README 并 Commit**

在 `README.md` 写简要的安装/使用说明,然后:

```bash
git add README.md
git commit -m "docs: 补充 curl2rest 使用说明"
```

---

## Self-Review 结果

- **Spec 覆盖**:核心请求响应(T7/T10)、curl↔HTTP 转换(T3/T4/T10)、环境变量(T5/T10)、历史(T6/T10)、小白友好错误(T2/T10)、CORS 绕过(T7 background)、独立标签页(T1/T9)——全部覆盖。
- **占位符扫描**:无 TBD/TODO,每个代码步骤含完整代码。
- **类型一致性**:`RequestObject` 字段(method/url/headers/body)、函数名(parseRequest/toHttp/toCurl/detectFormat/substitute/addEntry/describeError)、消息常量(MSG.SEND_REQUEST)在各任务间一致。
- **修正**:`tab.js` 的 import 中误留了 `parseRequest as _pr`,实现时删除该冗余别名(只用 `parseRequest`)。
