# Flowterm PRD — 终端优先的 Vibe Coding 控制台

> 版本：v0.2 · 日期：2026-03-29 · 状态：草稿

---

## 1. 背景与问题

### 1.1 时代背景

终端正在经历 50 年来的首次重大进化。AI Agent（Claude Code、aider、OpenCode 等）正在成为开发者的主力协作者，而它们的主战场就是终端。不是因为开发者主动选择，而是因为 Agent 别无选择——它们通过 CLI 执行命令、读写文件、调试代码。

我们拥有能够推理复杂代码库、生成完整组件、自主修复生产问题的模型，却还在 1980 年代设计的终端模拟器中运行它们。**工具还没有跟上工作流的步伐。**

### 1.2 核心痛点

独立开发者在使用 AI Agent 进行 Vibe Coding 时，面临两个没有被解决的核心问题：

**问题一：纯终端模式下代码改动不可见**
用 Claude Code 等 CLI Agent 工作时，Agent 在后台改文件，开发者完全不知道改了什么、改了哪里。这种黑盒体验导致失控感，难以 review、难以 debug、难以信任。

**问题二：切回 IDE 体验割裂**
切到 VS Code 才能看 Diff，但每个项目都要开一个单独的窗口。多项目并行时来回切换极其痛苦，上下文频繁中断。

### 1.3 机会

Vibe Coding 平台正在分化为两类：
- **全栈 Vibe Coding 平台**（Lovable、Bolt）：面向无代码用户
- **AI 驱动的代码编辑器**（Cursor、Zed）：面向开发者，但编辑器优先，终端是附属品

**第三种形态尚未被占据：终端优先的 Vibe Coding 控制台。** 终端是主角，可视化是增强，不是替代。

---

## 2. 产品定位

**Flowterm** 是一款基于 Tauri 构建的本地高性能终端控制台，专为 AI 驱动的 Vibe Coding 工作流设计。

**一句话定位：** 在终端里运行 AI Agent，在同一个窗口里看清它在做什么。

**不是什么：**
- 不是 VS Code 的替代品（没有代码编辑能力）
- 不是 AI 编程助手（不内置模型，接管已有 Agent 的运行环境）
- 不是团队协作工具（MVP 阶段面向个人开发者）

---

## 3. 目标用户

**主要用户（MVP）：独立开发者 / 个人**

- 重度使用 Claude Code、aider、OpenCode 等 CLI AI Agent
- 同时维护多个项目（3～10 个）
- 习惯终端操作，但渴望更好的可视化反馈
- 对工具性能敏感，厌倦臃肿的 IDE

**用户核心诉求：**
> "我想知道 Agent 在做什么，但我不想离开终端去另一个窗口看。"

---

## 4. 竞品分析

| 维度 | NTM | cmux | Cursor | Antigravity | Zed | **Flowterm** |
|------|-----|------|--------|-------------|-----|-------------|
| 终端为核心 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 多项目切换 | ⚠️ | ✅ | ❌ | ⚠️ | ⚠️ | ✅ |
| 多 Agent 管理 | ✅ | ⚠️ | ❌ | ✅ | ⚠️ | ✅ |
| Diff 可视化 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| 项目结构感知 | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Markdown 架构可视化 | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| 跨平台 | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| 轻量高性能 | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |

**核心差异化：** Flowterm 是唯一同时满足「终端为核心 + Diff 可视化 + Markdown 架构感知」的工具。

---

## 5. 产品设计

### 5.1 整体布局

```
┌─────────────────────────────────────────────────────────┐
│  [项目A] [项目B] [项目C ×] [+ 新建]           ⚙ 设置   │  ← 顶部项目 Tab 栏
├──────────────┬──────────────────────┬───────────────────┤
│              │                      │                   │
│   文件树      │     Diff 面板         │    终端区域        │
│   面板        │                      │                   │
│              │                      │                   │
│              │                      │                   │
└──────────────┴──────────────────────┴───────────────────┘
```

三个区域比例默认为 **2 : 5 : 3**，支持拖拽调整宽度。

---

### 5.2 顶部项目 Tab 栏

**设计参考：** 浏览器标签页（Chrome / Arc）

**功能：**
- 每个 Tab 对应一个本地项目目录，支持自定义命名
- 点击 Tab 切换项目，下方三个面板同步刷新
- `+` 按钮打开目录选择器，添加新项目
- Tab 支持右键菜单：重命名、移除、在 Finder 中打开
- Tab 状态指示：Agent 运行中（动态图标）、有未提交改动（小圆点）

**持久化：** 所有项目 Tab 和对应的终端状态跨重启保存（本地 SQLite）

---

### 5.3 左侧：文件树面板

**功能：**
- 展示当前项目的目录结构，类似 VS Code 的 Explorer
- 高亮显示被 Agent 改动过的文件（红色 = 删除，绿色 = 新增，黄色 = 修改）
- 点击文件名，在中间工作区预览面板中打开该文件的只读预览
- 支持折叠/展开，自动忽略 `node_modules`、`.git` 等常见目录（可配置）
- 显示文件的 git 状态标识（M / A / D / ?）

---

### 5.4 中间：工作区预览面板

**这是产品最核心的差异化能力。**

**单一模式，统一展示当前工作区文件：**
- 监听项目目录下所有文件变更（FSEvents / inotify）
- 点击文件后始终展示该文件的当前内容
- 文件有未提交改动时，使用 unified diff 风格渲染
- 文件没有改动时，展示全文只读预览
- watcher 触发后只刷新当前文件预览，不全量重算所有文件 diff

**预览渲染：** 使用只读语法化文本排版与 Git 风格行号。大文件采用虚拟滚动，保证几千行文件依然丝滑浏览。不做 inline 编辑，编辑依然交给 Agent。

---

### 5.5 右侧：终端区域

**这是产品的核心，终端体验决定产品的天花板。**

**目标：** 提供与原生 Ghostty 无差异的终端体验，专为跑 AI Agent CLI 工具优化。

#### 终端后端架构：可插拔设计

Flowterm 采用可插拔终端后端，根据用户本地安装的终端自动检测并切换：

| 后端 | 渲染方式 | 前提条件 | 推荐度 |
|------|---------|---------|--------|
| **libghostty**（首选） | Metal GPU 原生渲染 | 本地安装 Ghostty | ⭐⭐⭐ 最佳 |
| **xterm.js**（内置兜底） | WebGL / Canvas | 无需安装 | ⭐⭐ 默认 |

**libghostty 嵌入方案（已验证可行）：**
- Ghostty 官方提供 `libghostty` C ABI 库，暴露完整的终端渲染 API
- macOS 上通过 `ghostty_surface_t` + Metal layer 实现原生 GPU 渲染，已有 Kytos 项目验证（约 1500 行 Swift 胶水代码）
- Tauri 中通过 Rust FFI 调用 `libghostty-vt`（稳定版），负责 VT 协议解析和状态管理，渲染层通过 Swift 原生 View 嵌入 WebView 旁边
- 继承 Ghostty 全部特性：字体渲染、CJK 输入、真彩色、连字、120fps

**后端切换逻辑：**
```
启动时检测 → Ghostty 已安装？
    ↓ 是              ↓ 否
libghostty 后端    xterm.js 后端
(Metal 渲染)      (WebGL 渲染)

用户可在设置中手动指定后端，支持热切换（重建 session）
```

**功能：**
- 每个项目 Tab 至少维护一个独立的终端 session，切换 Tab 时进程保活，不销毁
- 终端区域内每个拆分 pane 都是独立 shell：独立 PTY、独立 cwd、独立 history、独立输入输出流
- 支持在终端区域内垂直分割（运行多个 Agent 或同时看日志）
- Agent 运行时状态可视化：检测 Claude Code / aider 的输出模式，在终端顶部显示简洁状态条（运行中 / 等待输入 / 完成）

---

### 5.6 未来功能（Post-MVP）

以下功能不进入 MVP，但在架构设计时需预留扩展点：

| 功能 | 描述 |
|------|------|
| Markdown 架构可视化 | 将 CLAUDE.md、设计文档渲染为结构图，展示 Agent 的上下文全貌 |
| 多 Agent 并行管理 | 同时管理多个 Agent session，独立控制每个 Agent 的启停 |
| Agent 行为时间线 | 以时间轴形式记录 Agent 的每次文件操作，支持回放 |
| 项目模板 | 一键初始化带有 CLAUDE.md 的项目结构 |

---

## 6. 技术架构

### 6.1 技术选型

**MVP 平台：macOS（Apple Silicon + Intel），后续扩展 Windows / Linux**

| 层 | 技术 | 选择理由 |
|----|------|---------|
| 桌面框架 | **Tauri 2.0** | Rust 后端，内存占用低，macOS 原生支持 |
| 前端 | **React + TypeScript** | 生态成熟，适合复杂 UI 状态管理 |
| 终端后端（首选） | **libghostty**（C FFI via Rust） | Metal GPU 渲染，完整 VT 支持，已有 Kytos 验证 |
| 终端后端（兜底） | **xterm.js** | 内置，无需依赖，WebGL 渲染 |
| 终端渲染层（macOS） | **Swift + NSView + Metal** | libghostty 需要 AppKit 渲染上下文，Swift 胶水层约 1500 行 |
| PTY 管理 | **Rust portable-pty** | 跨平台伪终端，在 Tauri 后端管理进程 |
| 文件监听 | **notify-rs**（Rust） | 跨平台文件系统事件，低延迟 |
| Diff 渲染 | **similar（Rust）+ 前端展示** | 高性能 diff 计算，结果传给前端渲染 |
| 本地存储 | **SQLite via rusqlite** | 保存项目列表、Tab 状态、session 历史 |
| Git 集成 | **git2-rs** | 原生 libgit2 绑定，读取 git 状态和 diff |

### 6.2 数据流

```
用户操作 → React 前端（WebView）
    ↕ Tauri IPC（invoke / event）
Rust 后端
    ├── PTY Manager（管理终端进程，wraps portable-pty）
    ├── Terminal Backend Router
    │     ├── libghostty（Ghostty 已安装时）
    │     │     └── Swift 原生 Layer → NSView + Metal → 叠加在 WebView 上
    │     └── xterm.js（兜底，运行在 WebView 内）
    ├── File Watcher（监听文件变更 → 推送 event 到前端）
    ├── Git Engine（读取 diff / status → 推送到前端）
    └── State DB（SQLite，持久化项目/session 状态）
```

**关键技术点：libghostty 与 Tauri WebView 共存**

Tauri 的主窗口是一个 WKWebView。libghostty 渲染的 Metal 视图以 `NSView` 形式创建，通过 `addSubview` 叠加在 WKWebView 之上，布局坐标由 Rust/Swift 层负责同步（响应 Tauri 的窗口 resize 事件）。React 侧只负责渲染文件树、工作区预览面板、Tab 栏等 UI 元素，终端区域留白由 Swift 层填充。

### 6.3 性能目标

- 启动时间 < 500ms（冷启动）
- 内存占用 < 150MB（空载，3 个项目 Tab）
- 当前文件预览刷新延迟 < 100ms（文件变更到 UI 更新）
- 终端输入延迟 < 5ms（击键到显示）

---

## 7. MVP 范围

### 7.1 MVP 必须有（Must Have）

- [ ] 顶部项目 Tab 栏（添加、切换、重命名、删除项目）
- [ ] 左侧文件树（展示目录结构，高亮改动文件）
- [ ] 中间工作区预览面板（工作区单模式，按需读取当前文件）
- [ ] 右侧终端（完整终端功能，项目切换时 session 保活，分屏 pane 相互独立）
- [ ] 三栏宽度可拖拽调整
- [ ] 项目状态持久化（重启恢复）

### 7.2 MVP 不做（Out of Scope）

- 内置 AI 模型或 API 调用
- 代码编辑能力
- 多人协作
- 云端同步
- Markdown 可视化
- Agent 自动化控制

---

## 8. 成功指标

| 指标 | MVP 目标 |
|------|---------|
| 冷启动时间 | < 500ms |
| 内存占用（3 项目） | < 150MB |
| Diff 刷新延迟 | < 100ms |
| 用户留存（7日） | > 60%（内测用户） |
| 核心反馈 | "终端体验没有退化" |

---

## 9. 风险与假设

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| libghostty API 仍在演进，有 Breaking Change | 高 | 锁定具体 Ghostty 版本；用 libghostty-vt（稳定层）做 VT 解析，渲染层单独封装易于升级 |
| NSView 叠加在 WKWebView 上的布局同步复杂 | 高 | 参考 Kytos 的实现（已开源），预留 2 周专项调试时间 |
| 用户未安装 Ghostty | 低 | 自动降级到内置 xterm.js，体验无损，设置里提示安装 Ghostty 以获得最佳体验 |
| 文件监听在大型项目性能退化 | 中 | 遵循 .gitignore 规则过滤，限制监听深度，默认忽略 node_modules |
| 与现有 Agent CLI 工具兼容性 | 低 | Agent 在标准 PTY 中运行，Flowterm 不干预其行为 |

---

## 10. 附录

### 产品名

**Flowterm** — Flow（心流状态）+ Term（终端），寓意在终端中进入专注的 AI 编程心流。

### 参考产品与技术资源

- [libghostty 官方博客](https://mitchellh.com/writing/libghostty-is-coming) — Mitchell Hashimoto 的嵌入 API 设计思路
- [libghostty-vt 文档](https://libghostty.tip.ghostty.org/) — 稳定 VT 解析层 API
- [Kytos](https://jwintz.gitlabpages.inria.fr/jwintz/blog/2026-03-14-kytos-terminal-on-ghostty/) — macOS 原生 App 嵌入 libghostty 的完整实现参考（Swift + Metal）
- [Ghostling](https://github.com/ghostty-org/ghostling) — 官方单文件最小化终端实现
- [NTM](https://github.com/nicholasgasior/ntm) — 终端多 Agent 管理参考
- [VS Code Source Control](https://code.visualstudio.com/docs/sourcecontrol/overview) — Diff 面板 UX 参考
- [Arc Browser](https://arc.net) — Tab 管理 UX 参考
