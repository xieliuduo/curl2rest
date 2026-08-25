# 请求库管理(项目 → 模块 → 请求)设计

日期:2026-08-24
状态:已确认,待实现

## 背景与目标

curl2rest 现有「历史记录」是**自动**保存每次发送的请求(流水账)。本功能新增一套**手动**整理的请求库,按「项目 → 模块 → 请求」两层维度归类收藏请求,类似 Postman 的 Collection。

两套功能**完全独立**:历史保持原样不变,请求库是全新的数据 + UI。

## 需求确认

- 层级:固定两层 —— **项目 → 模块 → 请求**(不做任意嵌套)
- 保存来源(三种入口):
  1. 从编辑器保存当前请求
  2. 从历史「另存到库」
  3. 库里直接新建
- 面板位置:**常驻左侧边栏**,可折叠
- 管理操作:重命名 + 删除(基础)、移动 + 排序、导入 / 导出 JSON、请求备注

## 架构方案

采用**嵌套树数据模型(方案 A)**:复刻现有 `environments.js` 的范式 —— 单一状态对象 + 不可变纯函数 + `chrome.storage.local` 持久化封装。理由:两层结构固定,嵌套树最直观,与项目现有 core 模块风格一致,维护成本最低。扁平归一化模型对两层场景是过度设计(YAGNI)。

---

## 第 1 节:数据模型与 core 模块

新增 `src/core/collections.js`,单一 storage key `curl2rest_collections`。

### 状态结构

```js
{
  projects: [
    {
      id, name,
      modules: [
        {
          id, name,
          requests: [
            { id, name, note, method, url, headers, body }
          ]
        }
      ]
    }
  ]
}
```

请求字段沿用 `parseRequest` 产出的 `method/url/headers/body`,外加 `id/name/note` —— 与 `history.js` 条目基本同构,故「历史另存到库」只是搬字段。

### 纯函数(全部不可变,不改原状态)

- `emptyState()` → `{ projects: [] }`
- 项目:`addProject(s, name)` / `renameProject(s, pid, name)` / `removeProject(s, pid)`
- 模块:`addModule(s, pid, name)` / `renameModule(s, pid, mid, name)` / `removeModule(s, pid, mid)`
- 请求:`addRequest(s, pid, mid, req)` / `renameRequest(s, pid, mid, rid, name)` / `updateRequestNote(s, pid, mid, rid, note)` / `removeRequest(s, pid, mid, rid)`
- 整理:
  - `moveRequest(s, fromPid, fromMid, toPid, toMid, rid)` —— 请求在模块/项目间移动
  - `reorder(s, level, ...)` —— 项目/模块/请求同序调整(具体签名实现时定,倾向按 id 上移/下移)
- 导入导出:
  - `exportState(s)` → 返回可序列化对象(即整棵树)
  - `importState(s, incoming, mode)`,`mode ∈ {"replace", "merge"}`
    - `replace`:整棵替换
    - `merge`:按 name 合并同名项目/模块,请求追加
- 持久化:`loadCollections()` / `saveCollections(s)`(封装 `chrome.storage.local`)

### id 生成

复用 `history.js` 的思路 `Date.now().toString(36) + Math.random().toString(36).slice(2,8)`。

---

## 第 2 节:布局与侧边栏 UI

### 整体布局(两栏 → 三栏)

```
.sidebar | .left(编辑器+历史) | gutter | .right(响应)
```

### tab.html 结构

```html
<aside id="sidebar" class="sidebar">
  <div class="sidebar-head">
    <span>请求库</span>
    <button id="btn-add-project">+ 项目</button>
    <button id="btn-import">导入</button>
    <button id="btn-export">导出</button>
  </div>
  <div id="collection-tree" class="collection-tree"></div>
</aside>
<button id="sidebar-toggle" class="sidebar-toggle">◀</button>
```

### 折叠

点 `sidebar-toggle` 给 `.layout` 加 `.sidebar-collapsed` 类(侧边栏宽度收到 0、箭头翻转),状态存 `localStorage`(`curl2rest_sidebar`),复刻现有分隔线记忆比例的写法。

### 树渲染(collection-tree)

- 项目 → 模块 → 请求三级缩进列表;项目/模块可展开折叠(纯 DOM,不引库,思路同 `json-tree.js`)
- 每级右侧 hover 出操作按钮:
  - 项目:`+模块`、重命名、删除
  - 模块:`+请求`、重命名、删除
  - 请求:回填(点名字即回填)、重命名、备注、删除
- 删除项目/模块 `confirm()` 二次确认,提示"将连同其下 N 项一起删除"
- 重命名:**就地 input**(与历史面板改名一致,失焦保存)
- 空态:无项目时显示"还没有项目,点『+ 项目』开始整理"

---

## 第 3 节:保存来源(三种入口)与交互

### 入口 1 —— 从编辑器保存当前请求

工具栏「发送 ▶」旁加「保存到库 ⭑」按钮。点击后:
- 复用 `parseRequest` 解析当前编辑器内容(失败弹现有错误卡片)
- 弹出轻量「保存到」小弹窗:项目下拉 + 模块下拉 + 名称输入(默认 `METHOD URL`),下拉旁各有「+ 新建」当场建项目/模块
- 确认 → `addRequest` 落库 → 刷新侧边栏

### 入口 2 —— 从历史另存

历史面板(左下列表 + 历史弹窗)每条历史项操作区加「另存到库」按钮,复用入口 1 的「保存到」弹窗,预填该历史字段。

### 入口 3 —— 库里直接新建

侧边栏模块的「+请求」按钮:在该模块下 `addRequest` 一条模板请求(默认名"新请求",带最小可用字段 `method: "GET"`、`url: "https://"`、空 headers、空 body,确保 `toHttp` 能正常回填不报错),并回填编辑器供编辑;之后用「保存到库」覆盖保存或就地改名。(选最简做法,不额外接「保存到」弹窗。)

### 回填

点侧边栏任一请求名 → `toHttp(request)` 写入编辑器(与历史「回填」一致)。

### 关键复用

三种入口最终汇聚到同一个「保存到」弹窗组件 + `addRequest`,避免重复逻辑。

---

## 错误处理

- 编辑器内容解析失败:沿用现有 `renderError` 错误卡片
- 导入 JSON:校验结构(必须有 `projects` 数组),非法则提示且不覆盖现有数据
- 删除:项目/模块二次确认,请求可直接删(与历史一致)

## 测试

新增 `test/core/collections.test.js`,覆盖所有纯函数:增删改、移动、排序、导入 replace/merge、异常 id 处理(不存在的 pid/mid/rid 不崩溃)。UI 层不做自动化测试(项目现状即如此),手动加载 dist 验证。

## 版本

按项目规范,完成后 bump 版本号(0.2.0 → 0.3.0,新增功能)、更新 CHANGELOG、manifest 与 package.json 保持一致、打 tag。

## v1 不做

- 任意层级嵌套
- 请求库云同步 / 团队实时协作(导出 JSON 已覆盖手动共享)
- 请求变量/脚本(pre-request script 等)
