# curl2rest

模仿 VSCode REST Client 的浏览器插件(Chrome / Edge,Manifest V3)。
在独立标签页左侧输入 **HTTP 报文**或 **curl 命令**,点击发送,右侧查看响应;支持 curl ↔ HTTP 双向转换、环境变量替换与请求历史。

## 功能

- **发送请求**:粘贴 HTTP 报文或 curl 命令,一键发送,右侧显示状态码、耗时、响应头与响应体。
- **绕过 CORS**:请求由后台 service worker 发出,可请求任意接口,不受网页级跨域限制。
- **双向转换**:`转为 curl` / `转为 HTTP 格式` 按钮就地转换编辑器内容。
- **请求体格式化**:请求回填或转换为 HTTP 格式时,可解析的 JSON 请求体自动按 2 空格缩进并换行展示;其他格式保持原样。
- **双主题**:支持 Light / Dark 两种完整主题,首次打开跟随系统设置,手动切换后自动记忆。
- **响应面板增强**:中间分隔线可拖拽调整左右宽度;JSON 响应渲染为可折叠树,支持逐节点复制;可一键复制整个响应体或响应头。
- **环境变量**:文本中用 `{{host}}` 引用变量,发送前自动替换。
- **历史管理面板**:按请求内容去重并保留最近 30 条,显示请求时间;从请求库发送时沿用请求库名称并显示项目/模块路径,临时请求自动命名为 METHOD URL;点击历史请求卡片即可切换到该请求,并支持重命名、备注、搜索、另存与删除。
- **请求库**:左侧边栏按「项目 → 模块 → 请求」两层维度整理常用请求,支持选中高亮、就地改名、排序、按编号移动,以及导入/导出 JSON;选中请求时所属模块和项目同步显示关联状态,编辑器内容和下方备注都会自动保存到对应请求。
- **友好错误**:请求出错时展示"发生了什么 / 可能原因 / 建议操作",技术细节可折叠查看。

## 输入格式示例

HTTP 报文:

```
POST https://example.com/comments HTTP/1.1
content-type: application/json

{
    "name": "sample",
    "time": "Wed, 21 Oct 2015 18:27:50 GMT"
}
```

curl 命令:

```
curl -X POST https://example.com/comments \
  -H "content-type: application/json" \
  -d '{"name":"sample"}'
```

## 开发与安装

```bash
npm install      # 安装依赖
npm test         # 运行 core 模块单元测试
npm run build    # 构建到 dist/
npm run dev      # 开发模式(热更新)
```

**加载到浏览器:**

1. 执行 `npm run build` 生成 `dist/` 目录。
2. 打开 `chrome://extensions`(Edge 为 `edge://extensions`)。
3. 打开右上角"开发者模式"。
4. 点击"加载已解压的扩展程序",选择项目下的 `dist/` 目录。
5. 点击工具栏的 curl2rest 图标,即在新标签页打开。

## 技术栈

Vite 5 + @crxjs/vite-plugin(MV3 打包)、CodeMirror 6(编辑器)、Vitest(单测)、chrome.storage.local(持久化)。

## 版本与发布

- 版本号遵循[语义化版本](https://semver.org/lang/zh-CN/),单一数据源为 `package.json` 的 `version` 字段。
- 构建时 Vite 会把该版本号注入 UI(标签页工具栏右侧显示 `vX.Y.Z`)。
- 每次发布前:
  1. 更新 `package.json` 与 `manifest.json` 的 `version`(保持一致)。
  2. 在 `CHANGELOG.md` 把"未发布"内容归入新版本号并写上日期。
  3. 提交并打 tag:`git tag v0.1.0`。
- 变更记录见 [CHANGELOG.md](./CHANGELOG.md)。

## 目录结构

```
src/
├── background/service-worker.js  # 发请求、计时、错误分类
├── core/                         # 纯函数,可单测
│   ├── format.js                 # 解析/生成/格式识别/双向转换
│   ├── variables.js              # {{key}} 变量替换
│   ├── history.js                # 历史记录逻辑与持久化
│   ├── environments.js           # 多环境变量增删改与持久化
│   ├── collections.js            # 请求库(项目/模块/请求)增删改/移动/排序/导入导出
│   └── errors.js                 # 错误码 → 友好文案
├── shared/messages.js            # 消息类型常量
└── tab/                          # 标签页 UI
    ├── tab.html / tab.css / tab.js
    ├── json-tree.js              # JSON 可折叠树渲染
    └── editor.js                 # CodeMirror 封装
```

## v1 暂不支持

多请求文件(`###` 分隔)、curl 文件上传(`-F/--form`)、非 curl 语言的代码片段生成。
