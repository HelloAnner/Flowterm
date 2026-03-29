# Flowterm — 技术架构设计

> 版本：v0.1 · 日期：2026-03-29 · 状态：草稿

---

## 1. 整体架构概览

Flowterm 是一款 **Tauri 2.0** 桌面应用，采用前后端分离 + Rust 原生后端的架构。

```
┌─────────────────────────── Tauri 应用进程 ──────────────────────────────┐
│                                                                          │
│  ┌──────────────── WebView (WKWebView) ─────────────────┐               │
│  │  React 前端                                           │               │
│  │  ┌──────────┐  ┌───────────────┐  ┌───────────────┐  │               │
│  │  │ Tab Bar  │  │  File Tree    │  │  Diff Panel   │  │               │
│  │  │ (36px)   │  │  (220px)      │  │  (fill)       │  │               │
│  │  └──────────┘  └───────────────┘  └───────────────┘  │               │
│  │                                   [终端区域留白 430px] │               │
│  └───────────────────────────────────────────────────────┘               │
│                                                                          │
│  ┌──────────────── Swift 原生层 (macOS) ───────────────────┐             │
│  │  NSView + Metal Layer (libghostty 渲染，叠加在 WebView 上)│             │
│  │  布局坐标由 Rust ↔ Swift 桥同步                          │             │
│  └────────────────────────────────────────────────────────┘             │
│                                                                          │
│  ┌──────────────── Rust 后端 ──────────────────────────────┐             │
│  │  PTY Manager │ File Watcher │ Git Engine │ State DB      │             │
│  │  Terminal Backend Router (libghostty / xterm.js 切换)    │             │
│  └────────────────────────────────────────────────────────┘             │
└──────────────────────────────────────────────────────────────────────────┘
```

**核心原则：** React 负责所有 Chrome UI（Tab 栏、文件树、工作区预览面板），终端区域在 WebView 中留白，由 Swift/Metal 原生层填充。两层通过 Rust 协调布局。

---

## 2. 技术选型

### 2.1 选型总表

| 层 | 技术 | 版本 | 选型理由 |
|----|------|------|---------|
| 桌面框架 | **Tauri 2.0** | 2.x | Rust 后端，内存占用显著低于 Electron；macOS 原生 WKWebView |
| 前端框架 | **React + TypeScript** | React 18 | 生态成熟，状态管理方案丰富；团队熟悉度高 |
| 前端状态 | **Zustand** | 5.x | 轻量无 boilerplate，适合 Tauri 事件驱动场景 |
| 终端后端（首选） | **libghostty** (C FFI) | 与 Ghostty 版本锁定 | Metal GPU 渲染，完整 VT 支持，字体/CJK/连字全覆盖 |
| 终端后端（兜底） | **xterm.js** | 5.x | WebGL 渲染，零安装依赖，内置于 app bundle |
| 终端渲染（macOS） | **Swift + NSView + Metal** | Swift 5 | libghostty 要求 AppKit 渲染上下文，Swift 胶水约 1500 行 |
| PTY 管理 | **portable-pty** (Rust) | 0.8 | 跨平台伪终端，Tauri 后端进程管理 |
| 文件监听 | **notify-rs** (Rust) | 6.x | 跨平台封装，macOS 用 FSEvents，延迟 < 50ms |
| Diff 计算 | **similar** (Rust) | 2.x | Myers diff 算法，高性能，结果序列化传前端 |
| 本地数据库 | **SQLite via rusqlite** | 0.31 | 轻量嵌入式，存储项目/session/历史状态 |
| Git 集成 | **git2-rs** | 0.19 | libgit2 原生绑定，读取 status/diff，无需 git CLI |
| Diff UI 渲染 | **react-syntax-highlighter** | — | 语法高亮，配合自定义 Diff 行渲染 |

### 2.2 关键选型决策

#### Tauri vs Electron

Tauri 使用系统 WebView（macOS 上为 WKWebView），不打包 Chromium，启动内存 < 50MB（vs Electron ~200MB）。Flowterm 要求冷启动 < 500ms、空载内存 < 150MB，Electron 无法满足。

#### libghostty vs 纯 xterm.js

|  | libghostty | xterm.js |
|--|-----------|---------|
| 渲染方式 | Metal GPU | WebGL / Canvas |
| 字体渲染 | subpixel AA，连字 | 有限支持 |
| 输入延迟 | < 2ms | ~5ms |
| CJK 输入 | 完整 IME 支持 | 部分问题 |
| 依赖 | 需用户安装 Ghostty | 内置 |
| 集成复杂度 | 高（Swift + Rust FFI） | 低 |

**决策**：双后端可插拔，启动时检测 Ghostty 安装，自动选择；用户可在设置覆盖。

#### Zustand vs Redux

Flowterm 状态主要来自 Tauri 事件推送（文件变更、git 状态、terminal 输出），Zustand 的 `subscribe` + immer 模式适配事件流，且无 Redux 的样板代码。

---

## 3. 前端架构

### 3.1 目录结构

```
src/
├── app/                    # 应用顶层，路由 & 初始化
├── components/
│   ├── tab-bar/            # 顶部项目 Tab 栏
│   ├── file-tree/          # 左侧文件树面板
│   ├── preview-panel/      # 中间工作区预览面板
│   ├── terminal-area/      # 终端区域占位 & 状态条
│   └── ui/                 # 原子 UI 组件（Button, Badge, Toggle...）
├── stores/
│   ├── project.store.ts    # 项目列表、当前激活 Tab
│   ├── file.store.ts       # 文件树状态、变更高亮
│   ├── preview.store.ts    # 当前文件预览状态
│   └── terminal.store.ts   # Agent 状态、分屏布局
├── hooks/
│   ├── useTauriEvents.ts   # 统一监听 Tauri 后端事件
│   ├── useFileWatcher.ts   # 文件变更事件订阅
│   └── useGitStatus.ts     # Git 状态轮询 & 事件
├── lib/
│   ├── tauri.ts            # Tauri invoke / event 封装
│   └── diff.ts             # Diff 数据解析、行渲染工具
└── styles/
    ├── tokens.css          # 设计 Token（颜色、间距、字体）
    └── global.css
```

### 3.2 布局实现

从 Pencil 设计提取的精确布局参数：

```
窗口默认：1440 × 900px
┌─────────────────────────── Tab Bar (36px) ────────────────────────────┐
│ bg: #0F0F0F  border-bottom: 1px #2A2A2A                               │
│ active tab: bg #161616, border-bottom: 2px #C8A96E (amber)            │
└────────────────────────────────────────────────────────────────────────┘
┌────────────────────────────── Content Area (fill) ────────────────────┐
│ ┌─ File Tree ──┐ ┌─── Preview Panel ─────────┐ ┌── Terminal ────────┐ │
│ │  w: 220px    │ │  w: fill_container         │ │  w: 430px          │ │
│ │  bg: #161616 │ │  bg: #0F0F0F               │ │  bg: #0C0C0C       │ │
│ │  右边框: 1px  │ │  右边框: 1px #2A2A2A       │ │                    │ │
│ │  #2A2A2A     │ │                            │ │  Status Bar: 28px  │ │
│ │              │ │  Header: 36px              │ │  bg: #111111        │ │
│ │  Header:36px │ │  Body: fill (padding 8,0)  │ │                    │ │
│ └──────────────┘ └────────────────────────────┘ └────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

三栏通过 CSS `display: flex` + `ResizablePanelGroup`（react-resizable-panels）实现拖拽。

### 3.3 Tauri IPC 协议

前后端通信需要按数据频率分层，避免把所有链路都塞进同一种机制里：

- `invoke`：请求-响应型操作，适合项目管理、Git 查询、会话创建等低频命令
- `event`：低频广播型通知，适合文件变更、Git 状态、布局变化、设置变更
- `Channel`：高频流式数据，适合 PTY 输出、终端状态流、后续可能的大块日志/下载流

**注意：** Tauri `event` 的负载是 JSON，适合“小消息、多订阅者”，不适合终端这种高频低延迟数据流。终端输出如果走 `event`，在大输出量下会更容易出现卡顿、积压和序列化开销问题。

建议协议划分如下：

```typescript
// invoke：命令型请求
invoke('project_add', { path })
invoke('project_switch', { projectId })
invoke('terminal_write', { sessionId, data })
invoke('git_refresh', { projectId })

// event：状态广播
type FlowEvent =
  | { type: 'file:changed'; payload: FileChangeEvent }
  | { type: 'git:status'; payload: GitStatusEvent }
  | { type: 'agent:status'; payload: AgentStatusEvent }
  | { type: 'layout:resize'; payload: LayoutResizeEvent }
  | { type: 'terminal:backend-changed'; payload: BackendChangedEvent }
  | { type: 'terminal:error'; payload: TerminalErrorEvent }

// Channel：高频终端流
type TerminalStreamEvent =
  | { event: 'data'; data: { sessionId: string; chunk: string } }
  | { event: 'exit'; data: { sessionId: string; exitCode: number | null; signal: string | null } }
  | { event: 'title'; data: { sessionId: string; title: string } }
```

前后端通过 Tauri 的 `invoke`、`event` 和 `Channel` 协作通信：

```typescript
// 前端创建高频终端流 Channel
const onTerminalEvent = new Channel<TerminalStreamEvent>()
onTerminalEvent.onmessage = (message) => {
  // 写入 xterm.js 或同步终端状态
}

await invoke('terminal_attach', {
  sessionId,
  onEvent: onTerminalEvent,
})
```

**实现原则：**
- UI 面板状态变化可以广播
- 终端字节流必须单播到当前窗口/当前 pane
- 后端发往前端的数据结构要稳定，避免把底层库原始结构直接暴露给 React

---

## 4. Rust 后端架构

### 4.1 模块划分

```
src-tauri/src/
├── main.rs                 # Tauri app 初始化，命令注册
├── lib.rs
├── pty/
│   ├── manager.rs          # PTY 会话管理，create/kill/resize
│   ├── session.rs          # 单个 PTY 会话（进程 + IO 线程）
│   └── agent_detector.rs   # 检测 Claude Code / aider 输出模式
├── terminal/
│   ├── backend.rs          # 后端路由（libghostty / xterm.js 选择）
│   ├── ghostty.rs          # libghostty FFI 封装
│   └── xterm.rs            # xterm.js 通信协议（Channel/IPC）
├── watcher/
│   ├── file_watcher.rs     # notify-rs 封装，事件过滤 & 防抖
│   └── gitignore_filter.rs # 遵循 .gitignore 过滤规则
├── git/
│   ├── engine.rs           # git2-rs 封装，status / diff 查询
│   └── diff_format.rs      # Diff 数据序列化（传给前端的格式）
├── db/
│   ├── store.rs            # SQLite 连接池，迁移管理
│   ├── project.rs          # 项目 CRUD
│   └── session.rs          # 终端 session 持久化
└── commands/               # Tauri #[tauri::command] 声明
    ├── project_cmds.rs
    ├── terminal_cmds.rs
    ├── diff_cmds.rs
    └── git_cmds.rs
```

### 4.2 PTY 管理

每个项目 Tab 默认持有一个主 PTY session；终端分屏后，每个 pane 都持有自己的 PTY session（通过 `portable-pty` 创建），切换 Tab 时这些进程统一保活：

```rust
pub struct PtySession {
    pub id: SessionId,           // UUID
    pub project_id: ProjectId,
    pub child: Box<dyn Child>,   // 子进程句柄
    pub writer: PtyWriter,       // 写入端（键盘输入）
    pub reader_thread: JoinHandle<()>, // 读取线程，推送终端输出流
}
```

**Agent 状态检测**：`agent_detector.rs` 用正则匹配 PTY 输出流，识别 Claude Code 的特征字符串（`Esc[`、spinner 模式、"waiting for your input" 等），派发 `agent:status` 事件，驱动前端状态条。

### 4.3 命令边界

建议尽早固定命令边界，避免后续前端直接耦合底层模块：

```rust
// project
project_add(path)
project_remove(project_id)
project_list()
project_switch(project_id)

// terminal
terminal_create(project_id, pane_id)
terminal_attach(session_id, on_event)
terminal_write(session_id, data)
terminal_resize(session_id, cols, rows, pixel_width, pixel_height)
terminal_kill(session_id)
terminal_set_backend(backend)

// file / diff
file_tree_load(project_id, root)
diff_get_file(project_id, path, mode)
diff_get_recent_changes(project_id)

// git
git_refresh(project_id)
git_stage(project_id, path)
git_unstage(project_id, path)
```

**注意：**
- `terminal_attach` 应该是幂等的，重复 attach 需要先清理旧订阅
- `terminal_resize` 既要传字符尺寸，也要传像素尺寸，给 libghostty 和 xterm.js 各自使用
- Git 命令只做最小能力，不演进成完整 Git 客户端

### 4.4 文件监听管道

```
notify-rs (FSEvents)
    → 防抖 50ms（合并同一文件多次写入）
    → gitignore 过滤（排除 .git / node_modules）
    → similar 计算 diff（与上次快照对比）
    → 序列化 FileChangeEvent
    → Tauri emit → 前端 file:changed 事件
```

文件快照存储在内存 `HashMap<PathBuf, Vec<u8>>`，session 结束时清空（不持久化到 DB）。

### 4.5 Git 集成

通过 `git2-rs` 直接读取 libgit2，无需 fork git 进程：

```rust
// git status：获取工作区文件状态
pub fn get_status(repo_path: &Path) -> Vec<FileStatus>

// git diff：工作区 vs HEAD 的 diff
pub fn get_workdir_diff(repo_path: &Path) -> Vec<FileDiff>

// 按文件 diff：点击文件树时按需加载
pub fn get_file_diff(repo_path: &Path, file_path: &Path) -> FileDiff
```

Git 状态在 **两种触发方式** 下刷新：
1. 文件监听检测到 `.git/` 目录变化时（commit/stage 触发）
2. 前端主动调用 `invoke('git_refresh')` 时

---

## 5. 终端后端：libghostty 集成

这是整个项目技术复杂度最高的部分。

### 5.1 架构概述

```
┌─────────────────────────────────────────────────────────┐
│  Rust (src-tauri)                                        │
│  libghostty-vt (C FFI via bindgen)                       │
│    VT 协议解析 + 终端状态管理（稳定层）                    │
│                          ↕ Swift bridge (via C ABI)      │
│  Swift 原生层                                            │
│    ghostty_surface_t  →  NSView  →  Metal CAMetalLayer   │
│    布局：收到 Rust layout:resize 事件后更新 frame         │
└─────────────────────────────────────────────────────────┘
```

### 5.2 关键技术：NSView 叠加 WKWebView

Tauri 主窗口是 `NSWindow`，内含 `WKWebView`。libghostty 的 Metal 渲染 View 以 `addSubview` 叠加：

```swift
// Swift 伪代码
class FlowTerminalView: NSView {
    var metalLayer: CAMetalLayer
    var surface: OpaquePointer  // ghostty_surface_t

    func updateFrame(_ rect: NSRect) {
        self.frame = rect
        // 通知 libghostty 更新渲染尺寸
        ghostty_surface_set_size(surface, UInt32(rect.width), UInt32(rect.height))
    }
}

// 在 Tauri 窗口创建后注入
func embedTerminalView(window: NSWindow, rect: NSRect) {
    let termView = FlowTerminalView(frame: rect)
    window.contentView?.addSubview(termView)
}
```

**布局同步**：Rust 监听 Tauri `window-resized` 事件和前端拖拽事件，计算终端区域的绝对坐标，通过 Swift bridge 更新 `FlowTerminalView.frame`。

### 5.3 兜底方案：xterm.js

当 Ghostty 未安装时，终端区域改由 React 内的 `<XTermWrapper>` 组件渲染。兜底链路优先使用 Tauri `Channel`，不额外引入本地 WebSocket 服务：

```
React (xterm.js)
  ├── term.onData(...)          → invoke('terminal_write')
  ├── FitAddon / WebglAddon
  └── Channel<TerminalStreamEvent> ← Rust PTY Manager
```

两套后端的 **PTY 管理层保持不变**，只是渲染层切换，保证功能一致性。

**xterm.js 建议能力：**
- `@xterm/addon-fit`：跟随容器尺寸变化自动计算列宽/行高
- `@xterm/addon-webgl`：优先启用 GPU 渲染，失败时自动回退 Canvas
- `@xterm/addon-unicode-graphemes`：补齐复杂 Unicode / emoji / 组合字符显示

**不建议首版引入本地 WS 的原因：**
- 增加一层本地端口管理、冲突处理和安全面
- 对单窗口桌面应用没有明显收益
- PTY 输出本身已经可通过 Tauri `Channel` 稳定承载

### 5.4 原生终端层注意事项

libghostty 方案除了渲染，还要处理以下几个工程边界：

- **坐标系统一**：React 返回的是逻辑像素，Swift/Metal 需要同时感知逻辑尺寸和 backing scale factor，避免 Retina 下出现模糊和点击偏移
- **焦点切换**：点击终端区域后，键盘焦点必须真实落到原生 `NSView`；切回文件树和 Diff 面板时需要把焦点交回 WebView
- **层级关系**：原生 `NSView` 叠在 `WKWebView` 上方后，React 里的 tooltip、菜单、拖拽辅助线不能穿透终端区域，需要显式避开或提升为原生层
- **线程模型**：AppKit / Metal 视图创建与尺寸更新必须放在主线程，PTY 读写和 diff 计算放在后台线程
- **销毁顺序**：先 detach session，再销毁 surface / view，避免窗口关闭时出现悬空指针
- **字体一致性**：libghostty 和 xterm.js 至少要在字号、行高、配色、光标样式上尽量贴齐，降低后端切换的跳变感

---

## 6. 数据模型

### 6.1 SQLite Schema

```sql
-- 项目列表（跨重启持久化）
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,   -- UUID
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,
    tab_order   INTEGER NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

-- 终端 session（进程信息，重启时恢复工作目录）
CREATE TABLE terminal_sessions (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    cwd         TEXT NOT NULL,      -- 终端当前工作目录
    env         TEXT,               -- JSON 序列化的环境变量覆盖
    layout      TEXT,               -- JSON：分屏配置
    updated_at  INTEGER NOT NULL
);

-- 应用配置
CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL
);
-- 示例 key: 'terminal_backend' = 'libghostty' | 'xterm'
--           'theme'           = 'dark'
```

### 6.2 状态持久化边界

需要明确“什么会恢复，什么不会恢复”，否则后续用户预期会失控：

- **会持久化**
  - 项目列表、排序、最近激活项目
  - 每个项目的终端布局、上次工作目录、用户设置的终端后端
  - UI 偏好，如面板宽度、Diff 模式、忽略规则

- **不会持久化**
  - PTY 进程本身
  - 实时 Diff 的内存快照
  - 临时的 Agent 检测状态

应用重启后，应当恢复“界面状态”和“工作上下文”，但 **重新创建 shell session**，而不是尝试恢复旧进程。

### 6.3 前端状态结构（Zustand）

```typescript
// project.store.ts
interface ProjectStore {
  projects: Project[]
  activeProjectId: string | null
  setActive: (id: string) => void
  addProject: (path: string) => Promise<void>
  removeProject: (id: string) => void
}

// diff.store.ts
interface DiffStore {
  mode: 'realtime' | 'git'
  changes: FileChange[]       // 实时文件变更列表
  selectedFile: string | null
  currentDiff: FileDiff | null
  toggleMode: () => void
  selectFile: (path: string) => void
}

// terminal.store.ts
interface TerminalStore {
  sessions: Record<string, TerminalSession>   // sessionId → session
  agentStatus: Record<string, AgentStatus>    // projectId → 聚合状态
  paneOrderByProject: Record<string, string[]> // projectId → paneId[]
  paneStateByProject: Record<string, Record<string, TerminalPaneState>>
}
```

### 6.4 文件监听与 Diff 边界

实时 Diff 方案需要提前约束边界，否则大型项目下容易失控：

- Diff 只针对文本文件，二进制文件显示为 `binary changed`
- 超大文件需要截断处理，例如 `> 1MB` 不做逐行 diff，只显示摘要
- 文件重命名优先当作 `delete + add` 处理，MVP 不强求 rename 检测
- symlink、权限变化、软删除需要单独标记，不与普通内容变更混淆
- 快照缓存需要设置上限，避免长时间运行导致内存持续增长

建议缓存策略：

```text
单文件快照上限：1MB
单项目快照总量上限：64MB
超限策略：LRU 淘汰 + 当前选中文件豁免
```

---

## 7. 数据流

### 7.1 主流程：Agent 改文件 → Diff 面板更新

```
1. Agent (Claude Code) 在 PTY 中运行
2. Agent 写文件 → FSEvents 触发 notify-rs
3. Rust watcher: 防抖 50ms → similar 计算 diff → emit 'file:changed'
4. React useTauriEvents 监听 → 更新 diff.store
5. DiffPanel 组件响应 store 变化 → 重新渲染 diff 视图
```

端到端目标延迟 < 100ms（FSEvents 延迟 ~10ms + diff 计算 ~5ms + IPC ~5ms + React 渲染 ~30ms）。

### 7.2 Tab 切换流程

```
1. 用户点击 Tab → React 调用 invoke('project_switch', { projectId: id })
2. Rust：更新 active_project_id
3. Rust：通知 Swift 层更新终端 View（切换到对应 session 的 surface）
4. Rust：触发新项目的 git status 刷新
5. 前端：project.store.setActive → 文件树、Diff 面板同步刷新
```

PTY 进程在切换时 **不销毁**，保持在后台运行。

### 7.3 分屏终端

终端区域支持垂直分割，最多 3 个 pane（来自 Multi Terminal 设计帧）：

```
每个 pane = 独立 PTY session + 独立 shell 进程 + 独立 cwd/history + 独立 libghostty surface
pane 间分隔线：4px，bg #0A0A0A，上下 1px border #222222
分屏状态存储在 terminal_sessions.layout 字段（JSON）
```

### 7.4 错误恢复流程

关键链路需要定义失败后的退路，而不是只定义 happy path：

```text
libghostty 初始化失败
  → 记录错误日志
  → 自动切换到 xterm.js
  → 前端提示“已降级到兼容终端后端”

PTY 创建失败
  → 当前 pane 显示错误态
  → 保留项目上下文，不影响其他 Tab

文件监听失效
  → 标记 realtime diff 不可用
  → Git 模式继续可用
  → 提供手动 refresh
```

错误处理原则：
- 单个项目失败不能拖垮整个应用
- 单个 pane 失败不能拖垮整个终端区域
- 降级过程必须可观测，不能静默吞错

---

## 8. 性能设计

| 目标 | 设计手段 |
|------|---------|
| 冷启动 < 500ms | 延迟初始化文件监听（Tab 激活时才启动）；SQLite 连接池预热 |
| 内存 < 150MB | 文件树只渲染可见节点（虚拟列表）；Diff 快照只保留当前 session |
| Diff 刷新 < 100ms | notify-rs FSEvents + 防抖 50ms；similar 增量 diff（非全量） |
| 终端输入 < 5ms | libghostty Metal 渲染在独立 NSView，不经过 JS 事件循环 |

**文件监听性能优化**：
- 遵循 `.gitignore` 规则，`node_modules`、`.git`、`dist` 等目录不监听
- 监听深度限制（默认 8 层）
- 单个项目监听事件限流 100 events/s，超出批量合并处理

### 8.1 额外性能注意项

- **终端背压**：PTY 输出需要分块写入前端，前端消费不过来时要允许丢弃不可见 pane 的历史输出，避免无限堆积
- **文件树懒加载**：目录节点按展开时读取，避免首次进入大型仓库就全量遍历
- **Git 按需计算**：文件级 diff 按点击加载，全量 diff 只在 Git 模式激活时刷新
- **布局节流**：拖拽分栏时，前端传给 Rust/Swift 的 resize 信号要节流，避免每帧都做原生布局重算
- **前后台分工**：Rust 负责 diff 和 git 计算，React 只做渲染，不在前端重复计算大块文本差异

---

## 9. 工程注意事项

### 9.1 日志与可观测性

MVP 阶段就需要有最小闭环日志，否则终端/文件监听类问题很难排查：

- Rust：结构化日志，至少包含 `project_id`、`session_id`、模块名、耗时
- Swift：原生层单独日志前缀，重点记录 view 生命周期、focus、resize、surface 初始化失败
- 前端：只记录交互与渲染异常，不打印大量终端内容，避免日志污染

建议把以下指标纳入 debug 面板或开发日志：
- 启动耗时
- 当前终端后端
- PTY 会话数
- 文件监听事件吞吐
- 最近一次 Diff 计算耗时

### 9.2 打包与依赖边界

- `libghostty` 版本需要锁定，不能无约束跟随系统 Ghostty 更新
- 首版只承诺 macOS，Windows / Linux 不提前抽象过度
- 如果 `libghostty` 依赖外部安装，需要在设置页明确展示检测结果、版本信息和降级原因
- xterm.js 兜底路径必须始终可用，不能把“首选后端”做成“唯一可用后端”

### 9.3 安全与权限

- 项目目录的访问应通过用户显式选择获得，不扫描全盘
- 日志中避免打印完整环境变量，防止 token 泄漏
- 终端历史如需持久化，必须明确可关闭，默认不保存命令内容
- 打开目录、在 Finder 中显示、读取 Git 仓库时都要以项目根目录为边界，避免路径穿越

### 9.4 MVP 明确不做

为了保证架构收敛，以下能力明确不进入 MVP：

- 恢复应用退出前的 PTY 进程
- 完整 Git 客户端能力
- 跨窗口共享同一个终端会话
- 二进制文件 Diff 预览
- 多平台统一原生终端后端抽象

---

## 10. 关键风险与决策记录

| 风险 | 影响 | 决策 |
|------|------|------|
| libghostty API 仍在演进 | 高 | 锁定 Ghostty 版本；VT 解析用 `libghostty-vt`（稳定层），渲染层单独封装 |
| NSView 叠加 WKWebView 布局同步 | 高 | 参考 Kytos 开源实现；预留 2 周专项调试；failsafe：降级 xterm.js |
| Swift ↔ Rust 桥接 ABI 稳定性 | 中 | 使用 C ABI 中间层（`extern "C"`），避免 Swift ABI 变更影响 |
| 大型项目文件监听性能 | 中 | gitignore 过滤 + 深度限制 + 限流，benchmark 测试 10K 文件项目 |
| xterm.js 高频输出背压 | 低 | 使用 Tauri Channel 分块传输；不可见 pane 允许裁剪历史输出 |

---

## 11. MVP 开发阶段规划

```
阶段 1（基础框架，2 周）
  ├── Tauri 2.0 项目初始化
  ├── React 三栏布局（静态）
  ├── SQLite schema 初始化
  └── PTY 管理器（xterm.js 后端）

阶段 2（核心功能，3 周）
  ├── 项目 Tab 栏（增删切换，持久化）
  ├── 文件树面板（目录读取，虚拟列表）
  ├── 文件监听 + Diff 面板（实时模式）
  └── Git diff 集成（Git 模式）

阶段 3（终端增强，2 周）
  ├── libghostty FFI + Swift 渲染层
  ├── NSView 叠加布局同步
  ├── Agent 状态检测（Claude Code）
  └── 终端分屏（最多 3 pane）

阶段 4（打磨，1 周）
  ├── 设计 Token 落地（颜色、间距、动效）
  ├── 性能 benchmark（启动、内存、Diff 延迟）
  └── 边界场景测试（大型项目、快速文件变更）
```

---

## 12. 参考资源

- [libghostty 官方博客](https://mitchellh.com/writing/libghostty-is-coming) — 嵌入 API 设计
- [libghostty-vt 文档](https://libghostty.tip.ghostty.org/) — 稳定 VT 解析层
- [Kytos](https://jwintz.gitlabpages.inria.fr/jwintz/blog/2026-03-14-kytos-terminal-on-ghostty/) — macOS 原生 libghostty 集成完整参考
- [Ghostling](https://github.com/ghostty-org/ghostling) — 官方最小化终端实现
- [portable-pty](https://docs.rs/portable-pty) — Rust PTY 库
- [notify-rs](https://github.com/notify-rs/notify) — 跨平台文件监听
- [similar](https://docs.rs/similar) — Rust diff 计算库
- [git2-rs](https://github.com/rust-lang/git2-rs) — libgit2 Rust 绑定
