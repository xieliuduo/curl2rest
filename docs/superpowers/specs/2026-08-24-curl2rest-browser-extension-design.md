# curl2rest 浏览器插件 —— 设计文档

日期:2026-08-24
状态:已批准,待实现

## 1. 目标

构建一个 Chrome/Edge 浏览器插件,模仿 VSCode REST Client 的核心体验:

- 用户在编辑器中输入一段 HTTP 报文(如下),点击"发送",右侧面板展示请求结果。

  ```
  POST https://example.com/comments HTTP/1.1
  content-type: application/json

  {
      "name": "sample",
      "time": "Wed, 21 Oct 2015 18:27:50 GMT"
  }
  ```

- 用户也可粘贴一条 **curl 命令**直接发送。
- 支持编辑器内容在 **HTTP 报文格式 ↔ curl 命令**之间一键双向转换。

## 2. 关键决策(已确认)

| 决策项 | 选择 |
|--------|------|
| UI 形态 | 独立浏览器标签页(左输入 / 右结果) |
| 目标浏览器 | Chrome / Edge,基于 Manifest V3 |
| 跨域处理 | background service worker 内 `fetch` 发请求,绕过网页级 CORS |
| 技术栈 | 原生 JS + Vite 构建,编辑器用 CodeMirror |
| v1 功能 | 核心请求/响应、请求历史记录、环境变量替换、curl↔HTTP 双向转换 |
| v1 暂不做 | 多请求文件(`###` 分隔)、curl 的 `-F/--form` 文件上传 |

## 3. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│  浏览器标签页 (tab.html) —— 点击插件图标打开               │
│  ┌──────────────────────┬──────────────────────────────┐ │
│  │  左侧:请求编辑器      │  右侧:响应面板                │ │
│  │  (CodeMirror)         │  ┌─ 状态栏 200 OK · 142ms ─┐ │ │
│  │  [转curl][转HTTP]     │  ├─ Tab: Body │ Headers ──┤ │ │
│  │  [环境 ▼][发送]       │  │  高亮的响应内容           │ │ │
│  │  ── 历史记录列表 ──    │  └───────────────────────┘ │ │
│  └──────────────────────┴──────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
         │ chrome.runtime.sendMessage(解析后的 RequestObject)
         ▼
┌─────────────────────────────────────────────────────────┐
│  background service worker                                │
│  收到请求 → 变量替换 → fetch(绕过 CORS) → 计时 → 回传响应   │
└─────────────────────────────────────────────────────────┘
```

**职责边界:**

- **标签页 UI**:编辑、格式识别/转换、触发发送、展示结果、管理历史与环境。不直接发网络请求。
- **background service worker**:唯一发网络请求的地方。靠 `host_permissions: ["<all_urls>"]` 绕过网页级 CORS,统计耗时,回传结构化响应。
- **通信**:通过 `chrome.runtime.sendMessage`。请求在 UI 侧解析成结构化的 `RequestObject` 后再传给 background。

## 4. 解析与转换层(核心模块)

一个独立的纯函数模块(不碰 DOM、不碰网络,便于单元测试)。

```
                  ┌─────────────────────────────┐
   编辑器文本 ──▶ │  detectFormat()             │  判断 http 报文 / curl
                  └──────────┬──────────────────┘
                             │
              ┌──────────────┴───────────────┐
              ▼                               ▼
     parseHttp(text)                   parseCurl(text)
              │                               │
              └──────────────┬────────────────┘
                             ▼
                   RequestObject (统一中间表示)
                   { method, url, headers, body }
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼               ▼
        发给 background   toHttp(obj)    toCurl(obj)
```

**统一中间表示 `RequestObject`:**

```js
{
  method: "POST",                       // HTTP 方法
  url: "https://example.com/comments",  // 完整 URL
  headers: { "content-type": "application/json" },  // 头部键值对
  body: "{ ... }"                       // 请求体原始字符串,可为 null
}
```

**函数清单:**

- `detectFormat(text) → "http" | "curl"`:识别当前编辑器格式(以 `curl` 开头判定为 curl,否则按 HTTP 报文处理)。
- `parseHttp(text) → RequestObject`:解析 HTTP 报文格式(首行方法+URL+可选协议版本,随后头部,空行后为 body)。
- `parseCurl(text) → RequestObject`:解析 curl 命令。
- `toHttp(obj) → string`:生成 HTTP 报文文本。
- `toCurl(obj) → string`:生成 curl 命令文本。

**curl 解析范围(v1):** `-X/--request`、`-H/--header`、`-d/--data`/`--data-raw`/`--data-binary`、`-u/--user`、`--url`、以及反斜杠(`\`)换行的多行命令。冷门 flag(`-F/--form` 文件上传等)v1 跳过。

**UI 体现:** 编辑器上方 `转为 curl` / `转为 HTTP 格式` 两个按钮,点击就地替换编辑器内容;发送时自动 `detectFormat`,无需手动切换。

## 5. 环境变量替换

- 用户可定义多套环境,每套是一组键值对(如 `host = https://api.dev.com`)。
- 编辑器中用 `{{host}}` 引用。
- 发送前对 URL / headers / body 做字符串替换,替换后再解析发送。
- 环境配置持久化到 `chrome.storage.local`,顶部下拉框切换当前环境。
- v1 采用简单的 `{{key}}` → 值 的整体字符串替换,不支持嵌套变量或函数。

## 6. 请求历史记录

- 每次成功发送后,把 `RequestObject`(+ 时间戳)存入 `chrome.storage.local`,保留最近 N 条(如 50)。
- 左侧下方列表展示历史,点击某条即把内容回填编辑器,可再次发送(重放)。

## 7. 数据流(一次完整请求)

1. 用户在编辑器输入/粘贴 → 点击"发送"。
2. UI:取编辑器文本 → 环境变量替换 → `detectFormat` → `parseHttp`/`parseCurl` → `RequestObject`。
3. UI:`chrome.runtime.sendMessage({ type: "SEND_REQUEST", payload: RequestObject })`。
4. background:`fetch` 发送,记录起止时间 → 组装 `{ status, statusText, headers, body, timeMs }`。
5. background:回传响应给 UI。
6. UI:右侧面板渲染状态栏 + Body/Headers 分页,按 content-type 高亮;写入历史记录。

## 8. 错误处理

- **解析失败**(格式非法):UI 侧捕获,右侧面板红色提示具体错误(如"无法解析请求首行"),不发请求。
- **网络失败**(DNS/超时/连接拒绝):background 捕获 `fetch` 异常,回传错误对象,UI 面板展示错误信息而非崩溃。
- **非 2xx 响应**:正常展示,状态栏用颜色区分(2xx 绿、3xx 蓝、4xx/5xx 红)。
- **超大响应体**:v1 设一个展示上限(如 5MB),超出则截断并提示。

## 9. 目录结构(预期)

```
curl2rest/
├── manifest.json            # MV3 清单
├── vite.config.js
├── package.json
├── src/
│   ├── background/
│   │   └── service-worker.js # 发请求、计时、回传
│   ├── tab/
│   │   ├── tab.html
│   │   ├── tab.js            # UI 主逻辑、消息收发
│   │   ├── editor.js         # CodeMirror 封装
│   │   └── tab.css
│   ├── core/                 # 纯函数,可单测
│   │   ├── format.js         # detectFormat / parseHttp / parseCurl / toHttp / toCurl
│   │   ├── variables.js      # 环境变量替换
│   │   └── history.js        # 历史记录读写
│   └── shared/
│       └── messages.js       # 消息类型常量
└── test/
    └── core/                 # core 模块单元测试
```

## 10. 测试策略

- **core 模块**(format / variables / history)是纯函数,用单元测试全面覆盖:
  - `parseHttp` / `parseCurl` 各种输入(含边界:无 body、多头部、多行 curl)。
  - `toHttp` / `toCurl` 输出正确性。
  - 往返一致性:`parseHttp(toHttp(obj))` 应等价于 `obj`,curl 同理。
  - 变量替换的各种场景。
- **端到端**:加载插件后手动验证——发送真实请求、curl 粘贴、双向转换、历史重放、环境切换。
- 遵循全局规范:未证明能跑通不标记完成。

## 11. v1 明确不做(YAGNI)

- 多请求文件(`###` 分隔)。
- curl 的文件上传(`-F/--form`)。
- 响应保存到文件、代码片段生成(除 curl 外的语言)。
- 请求认证的图形化配置(OAuth 等)——v1 靠手写 header。
