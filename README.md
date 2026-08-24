# curl2rest

模仿 VSCode REST Client 的浏览器插件(Chrome / Edge,Manifest V3)。
在独立标签页左侧输入 **HTTP 报文**或 **curl 命令**,点击发送,右侧查看响应;支持 curl ↔ HTTP 双向转换、环境变量替换与请求历史。

## 功能

- **发送请求**:粘贴 HTTP 报文或 curl 命令,一键发送,右侧显示状态码、耗时、响应头与响应体(JSON 自动美化)。
- **绕过 CORS**:请求由后台 service worker 发出,可请求任意接口,不受网页级跨域限制。
- **双向转换**:`转为 curl` / `转为 HTTP 格式` 按钮就地转换编辑器内容。
- **环境变量**:文本中用 `{{host}}` 引用变量,发送前自动替换。
- **历史记录**:自动保存最近 50 条请求,点击可回填重放。
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

## 目录结构

```
src/
├── background/service-worker.js  # 发请求、计时、错误分类
├── core/                         # 纯函数,可单测
│   ├── format.js                 # 解析/生成/格式识别/双向转换
│   ├── variables.js              # {{key}} 变量替换
│   ├── history.js                # 历史记录逻辑与持久化
│   └── errors.js                 # 错误码 → 友好文案
├── shared/messages.js            # 消息类型常量
└── tab/                          # 标签页 UI
    ├── tab.html / tab.css / tab.js
    └── editor.js                 # CodeMirror 封装
```

## v1 暂不支持

多请求文件(`###` 分隔)、curl 文件上传(`-F/--form`)、非 curl 语言的代码片段生成。
