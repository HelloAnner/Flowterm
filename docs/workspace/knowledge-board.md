# 项目知识看板设计文档

> 版本：v0.2 · 日期：2026-03-31 · 状态：设计中

---

## 1. 设计目标

解决「项目知识的结构化沉淀与高效检索」问题。将扁平的、线性的终端输出转化为多维的、关联的知识网络。

核心思路：**终端静默采集 → 智能分析 → 模块分发 → 多视图呈现**

---

## 2. 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              终端层（前端）                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Terminal Pane                              │   │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │   │
│  │  │   Shell PTY  │───▶│ Output Stream│───▶│  xterm.js    │          │   │
│  │  │              │    │ (静默采集)    │    │  (渲染)      │          │   │
│  │  └──────────────┘    └──────────────┘    └──────────────┘          │   │
│  │                           │                                        │   │
│  │                           ▼ (IPC)                                  │   │
│  │                    ┌──────────────┐                                │   │
│  │                    │ 后台记录队列  │ ◀── 用户无感知                  │   │
│  │                    └──────────────┘                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼ (存储触发时机)
┌─────────────────────────────────────────────────────────────────────────────┐
│                              采集与处理层                                     │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │   Raw Output     │───▶│   Temp Storage   │───▶│  AI Analysis     │      │
│  │   (原始输出)      │    │   (临时存储)      │    │  (智能分析)       │      │
│  └──────────────────┘    └──────────────────┘    └────────┬─────────┘      │
│                                                           │                │
│                           ┌───────────────────────────────┘                │
│                           ▼                                                │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                    Module Distribution Engine                        │  │
│  │                         (模块分发引擎)                                │  │
│  │                                                                      │  │
│  │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │  │
│  │   │  Timeline    │  │   Kanban     │  │    Graph     │  │   Arch   │ │  │
│  │   │   (必须)      │  │   (并行)      │  │   (并行)      │  │ (选择性) │ │  │
│  │   └──────────────┘  └──────────────┘  └──────────────┘  └──────────┘ │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              持久化层                                        │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐      │
│  │  knowledge_cards │    │ card_relations   │    │   card_views     │      │
│  │   (卡片主表)      │    │   (关系表)        │    │  (视图分配表)     │      │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. 终端静默采集系统

### 3.1 核心原则

**终端保持纯粹，用户对此无感知。**

- 所有采集逻辑在后台运行，不干扰终端正常操作
- 不修改终端 UI，不添加额外按钮或提示
- 不占用主线程，异步处理所有采集逻辑
- 采集过程零延迟，不影响终端输入输出性能

### 3.2 采集机制

```typescript
// 终端输出流监听（前端）
interface TerminalOutputCapture {
  // 监听 xterm.js 的 onData 事件
  onTerminalData: (data: string) => void

  // 数据缓冲（避免频繁 IPC）
  buffer: string[]
  bufferSize: number        // 默认 4096 字符
  flushInterval: number     // 默认 5 秒

  // 发送到后台
  flushToBackend: () => void
}
```

**采集流程：**

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 终端输出    │────▶│ 缓冲区累积  │────▶│ 后台队列    │────▶│ 临时存储    │
│ (字符流)    │     │ (5秒/4KB)   │     │ (异步)      │     │ (SQLite)    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                   │
                                                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         存储触发时机                                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐  │
│  │ 会话结束         │  │ 对话结束         │  │ 用户主动中断 (Ctrl+C)    │  │
│  │ (终端关闭)       │  │ (Agent 完成)     │  │ (Claude Code 退出)      │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 数据存储策略

**非实时存储，批量处理：**

| 存储阶段 | 时机 | 内容 | 处理方式 |
|---------|------|------|----------|
| **临时存储** | 持续 | 原始输出片段 | 写入 `raw_terminal_outputs` 表，保留 7 天 |
| **持久化存储** | 触发时机 | 分析后的卡片 | 写入 `knowledge_cards` 表，长期保留 |

```sql
-- 临时存储表（原始输出）
CREATE TABLE raw_terminal_outputs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    pane_id TEXT NOT NULL,
    content TEXT NOT NULL,              -- 原始输出内容
    captured_at INTEGER NOT NULL,       -- 采集时间
    is_processed BOOLEAN DEFAULT FALSE, -- 是否已处理
    processed_at INTEGER,               -- 处理时间
    expires_at INTEGER NOT NULL         -- 过期时间（7天后）
);

-- 索引
CREATE INDEX idx_raw_outputs_session ON raw_terminal_outputs(session_id);
CREATE INDEX idx_raw_outputs_unprocessed ON raw_terminal_outputs(is_processed) WHERE is_processed = FALSE;
```

---

## 4. 模块分发引擎

### 4.1 引擎架构

模块分发引擎负责将 AI 分析生成的卡片并行分发到多个视图模块：

```
┌─────────────────────────────────────────────────────────────────┐
│                    Module Distribution Engine                   │
│                                                                 │
│  ┌─────────────┐                                                │
│  │ Input Queue │ ◀── AI 分析后的卡片                            │
│  └──────┬──────┘                                                │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    View Router                           │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ 卡片内容分析 → 确定目标视图                      │   │   │
│  │  │                                                  │   │   │
│  │  │ • 所有卡片 → Timeline (必须)                    │   │   │
│  │  │ • 有明确类型 → Kanban (并行)                    │   │   │
│  │  │ • 有关联关系 → Graph (并行)                     │   │   │
│  │  │ • 有文件路径 → Architecture (选择性)             │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│         │                                                       │
│         │ 并行分发                                               │
│         ▼                                                       │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐ │
│  │   Timeline   │   Kanban     │    Graph     │ Architecture │ │
│  │   Handler    │   Handler    │   Handler    │   Handler    │ │
│  └──────────────┴──────────────┴──────────────┴──────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 视图分配策略

**并行分发，各视图独立决策：**

```typescript
interface ViewDistributionStrategy {
  // 时间线视图：所有卡片必须加入
  timeline: {
    enabled: true           // 强制启用
    sorting: 'chronological' // 按时间排序
  }

  // 看板视图：按卡片类型分栏
  kanban: {
    enabled: true
    columnMapping: {
      'bug': 'Bugs'
      'pitfall': 'Pitfalls'
      'decision': 'Decisions'
      'insight': 'Insights'
      'task': 'Tasks'
    }
  }

  // 图谱视图：有关联的卡片加入
  graph: {
    enabled: true
    includeIf: (card: KnowledgeCard) => card.relations.length > 0 || card.filePath !== undefined
  }

  // 架构视图：有文件路径的卡片加入
  architecture: {
    enabled: true
    includeIf: (card: KnowledgeCard) => card.filePath !== undefined
    // 如果卡片没有文件路径，可以选择性丢弃或放入"未分类"
  }
}
```

**视图分配决策表：**

| 卡片特征 | Timeline | Kanban | Graph | Architecture |
|---------|----------|--------|-------|--------------|
| 所有卡片 | ✅ 必须 | ✅ 按类型 | ✅ 如有关系 | ⚠️ 如有路径 |
| 有文件路径 | ✅ | ✅ | ✅ | ✅ 加入 |
| 有关联关系 | ✅ | ✅ | ✅ 突出显示 | ⚠️ |
| 无路径/无关系 | ✅ | ✅ | ✅ | ❌ 丢弃 |

### 4.3 视图融合机制

新卡片进入后，需要与现有视图融合：

```typescript
interface ViewFusionEngine {
  // 时间线融合：直接追加
  fuseTimeline: (existing: TimelineEvent[], newCard: KnowledgeCard) => TimelineEvent[]

  // 看板融合：按类型放入对应列
  fuseKanban: (existing: KanbanColumn[], newCard: KnowledgeCard) => KanbanColumn[]

  // 图谱融合：计算新节点位置，保持现有布局
  fuseGraph: (existing: GraphData, newCard: KnowledgeCard, relations: CardRelation[]) => GraphData

  // 架构融合：叠加到文件树节点
  fuseArchitecture: (existing: FileNode[], newCard: KnowledgeCard) => FileNode[]
}
```

**图谱布局保持策略：**

```
新卡片加入前：                    新卡片加入后：

    ┌───┐                            ┌───┐
    │ A │                            │ A │◀──┐
    └─┬─┘                            └─┬─┘   │ 保持原有布局
      │                                │     │ (A-B-C 位置不变)
      ▼                                ▼     │
    ┌───┐        ┌───┐               ┌───┐  │ ┌───┐
    │ B │◀──────▶│ C │               │ B │◀─┴─│ D │ (新卡片)
    └───┘        └───┘               └───┘    └─┬─┘
                                                  │
                                              ┌───┘
                                              ▼
                                            ┌───┐
                                            │ C │ (位置微调)
                                            └───┘
```

---

## 5. 转换机制

### 5.1 自动转换（后台定时）

**定时任务调度：**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Background Scheduler                        │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ 每 10 分钟   │───▶│ 检查未处理   │───▶│ 批量 AI 分析 │         │
│  │ 静默运行    │    │ 原始输出    │    │ 生成卡片    │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│                                               │                 │
│                                               ▼                 │
│                                        ┌─────────────┐         │
│                                        │ 模块分发引擎 │         │
│                                        │ 并行分发    │         │
│                                        └─────────────┘         │
└─────────────────────────────────────────────────────────────────┘
```

**Rust 定时任务实现：**

```rust
// src/scheduler.rs
pub struct CardGenerationScheduler {
    interval: Duration,        // 默认 10 分钟
    is_running: Arc<AtomicBool>,
}

impl CardGenerationScheduler {
    pub fn start(&self, state: FlowtermState) {
        let is_running = self.is_running.clone();

        tokio::spawn(async move {
            let mut interval = tokio::time::interval(self.interval);

            loop {
                interval.tick().await;

                if !is_running.load(Ordering::Relaxed) {
                    break;
                }

                // 1. 获取未处理的原始输出
                let raw_outputs = state.db.get_unprocessed_outputs().await;

                // 2. 批量 AI 分析
                let cards = ai_service.analyze_batch(raw_outputs).await;

                // 3. 保存卡片
                for card in cards {
                    state.db.save_card(&card).await;

                    // 4. 触发模块分发
                    state.distribution_engine.distribute(card).await;
                }

                // 5. 标记原始输出为已处理
                state.db.mark_outputs_processed(raw_outputs).await;

                // 6. 通知前端更新
                state.app.emit("knowledge:batch_updated", ()).ok();
            }
        });
    }
}
```

### 5.2 手动强制转换

**看板界面刷新按钮：**

```
┌────────────────────────────────────────────────────────────────────┐
│ 🔍 搜索知识卡片...                    [📋 看板] [🗺️ 图谱] [⏱️ 时间线] │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐                                                  │
│  │ 📁 筛选器     │     ┌──────────────────────────────────────┐   │
│  │              │     │  🔄 刷新                             │   │
│  │ □ Bugs (5)   │     │  ──────────────────────────────────  │   │
│  │ □ 坑点 (3)   │     │  发现 3 条新输出待处理                │   │
│  │              │     │                                      │   │
│  │              │     │  [立即转换] 或等待 10 分钟后自动处理   │   │
│  │              │     │                                      │   │
│  │              │     │  上次更新: 2 分钟前                   │   │
│  └──────────────┘     └──────────────────────────────────────┘   │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**手动转换 Tauri Command：**

```rust
/// 手动触发转换（用户点击刷新按钮）
#[tauri::command]
async fn force_card_generation(
    state: State<'_, FlowtermState>,
    project_id: String,
) -> Result<GenerationResult, String> {
    // 1. 获取该项目所有未处理的原始输出
    let raw_outputs = state
        .db
        .get_unprocessed_outputs_for_project(&project_id)
        .await
        .map_err(|e| e.to_string())?;

    if raw_outputs.is_empty() {
        return Ok(GenerationResult {
            processed_count: 0,
            generated_cards: vec![],
            message: "没有待处理的新内容".to_string(),
        });
    }

    // 2. AI 分析（同步执行，用户等待）
    let cards = state
        .ai_service
        .analyze_batch(&raw_outputs)
        .await
        .map_err(|e| e.to_string())?;

    // 3. 保存并分发
    let mut generated_cards = vec![];
    for card in cards {
        let saved = state.db.save_card(&card).await.map_err(|e| e.to_string())?;
        state.distribution_engine.distribute(&saved).await;
        generated_cards.push(saved);
    }

    // 4. 标记为已处理
    state
        .db
        .mark_outputs_processed(&raw_outputs)
        .await
        .map_err(|e| e.to_string())?;

    // 5. 通知前端
    state
        .app
        .emit("knowledge:cards_generated", &generated_cards)
        .ok();

    Ok(GenerationResult {
        processed_count: raw_outputs.len(),
        generated_cards,
        message: format!("处理了 {} 条输出，生成 {} 张卡片",
            raw_outputs.len(),
            generated_cards.len()
        ),
    })
}
```

---

## 6. 核心概念

### 2.1 知识卡片（Knowledge Card）

知识卡片**仅来源于终端输出**，通过后台静默采集、AI 分析生成。

```
┌─────────────────────────────────────────┐
│ 🐛 Bug #37: useEffect 闭包陷阱          │  ← 标题 + 类型图标 + ID
│─────────────────────────────────────────│
│ 来源: Claude Code @ 2026-03-28 14:32    │  ← 终端会话信息
│─────────────────────────────────────────│
│ 模块: src/hooks/useSync.ts              │  ← 结构化元数据
│ 标签: [React] [闭包] [状态管理]         │
│ 严重度: ●●●○○                           │
│ 状态: ✅ 已解决                          │
│─────────────────────────────────────────│
│ 现象: 定时器回调中拿到的 state 永远是   │  ← Level 2: 摘要
│       初始值...                          │
│─────────────────────────────────────────│
│ ▸ 展开查看详情                           │  ← 渐进式披露入口
│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
│ ▸ 查看原始终端输出                        │  ← 可追溯原始内容
└─────────────────────────────────────────┘
```

**为什么卡片优于 Markdown：**

- 每张卡片是原子知识单元，可独立检索
- 结构化字段支持过滤、排序、分组
- 可建立关联关系（卡片间互相引用）
- 视觉上一目了然，无需滚动长文档
- **自动采集**：终端输出自动捕获，用户无感知

### 2.2 卡片类型

| 类型 | 图标 | 用途 | 默认字段 |
|------|------|------|----------|
| **Bug** | 🐛 | 记录遇到的问题及解决方案 | 现象、根因、方案、复现步骤 |
| **坑点** | ⚡ | 记录易错点、踩过的坑 | 场景、问题、规避方案 |
| **架构决策** | 📐 | 记录技术选型、设计决策 | 背景、方案对比、决策理由 |
| **洞察** | 💡 | 记录有价值的发现和思考 | 发现、影响、后续行动 |
| **任务** | 📋 | 记录待办事项 | 优先级、截止日期、关联卡片 |

---

## 3. 交互与组件设计

### 3.1 侧边栏入口

左侧边栏新增两个图标按钮：

```
┌─────────┐
│ 📁      │  ← 文件树（已存在）
│ 24      │
├─────────┤
│ 📋      │  ← 看板视图（新增）
│ 12      │     显示卡片总数
└─────────┘
```

**交互细节：**

- 图标使用 `LayoutGrid`（Lucide）
- 选中态：边框高亮 + 背景色变化
- hover 时显示 tooltip："知识看板 · {totalCards}"
- 当有新卡片被捕获时，图标右上角显示小圆点提示

### 3.2 主视图区域

```
┌────────────────────────────────────────────────────────────────────┐
│ 🔍 搜索知识卡片...                    [📋 看板] [🗺️ 图谱] [⏱️ 时间线] │  ← 视图切换
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ 📁 筛选器     │  │              │  │              │              │
│  │              │  │   主视图      │  │   详情面板    │              │
│  │ □ Bugs (5)   │  │              │  │  (可选展开)   │              │
│  │ □ 坑点 (3)   │  │  根据选中视图  │  │              │              │
│  │ □ 架构决策(2) │  │  展示不同布局  │  │              │              │
│  │ □ 洞察 (1)   │  │              │  │              │              │
│  │              │  │              │  │              │              │
│  │ ───────────  │  │              │  │              │              │
│  │ 🏷️ 标签       │  │              │  │              │              │
│  │ [React] [状态]│  │              │  │              │              │
│  │              │  │              │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
│                                                                    │
├────────────────────────────────────────────────────────────────────┤
│  📊 12 张卡片 · 最后更新 2 分钟前                      [+ 新建卡片]  │  ← 底部状态栏
└────────────────────────────────────────────────────────────────────┘
```

**布局比例：**

- 左侧筛选器：200px（固定，可折叠）
- 中间主视图：flex-1（自适应）
- 右侧详情面板：320px（可选展开，默认收起）

### 3.3 视图切换器

三个视图通过 Tab 切换，状态保存在 `ProjectWorkspaceState` 中：

```typescript
type KnowledgeViewMode = 'kanban' | 'graph' | 'timeline'
```

---

## 4. 四大视图详解

### 4.1 📋 看板视图（Kanban View）

**用途：** 日常管理，快速浏览和分类

```
┌─────────────┬─────────────┬──────────────┬──────────────┐
│   🐛 Bugs   │  ⚡ 坑点     │  📐 架构决策  │  💡 洞察     │
│     (5)     │    (3)      │     (2)      │     (1)      │
├─────────────┼─────────────┼──────────────┼──────────────┤
│ ┌─────────┐ │ ┌─────────┐ │ ┌──────────┐ │ ┌──────────┐ │
│ │ Bug #37  │ │ │ 坑点 #8  │ │ │ 决策 #5   │ │ │ 洞察 #3   │ │
│ │ 闭包陷阱 │ │ │ pnpm    │ │ │ 状态管理  │ │ │ 性能模式  │ │
│ │ ✅ 已解决 │ │ │ 幽灵依赖 │ │ │ 选型思路  │ │ │ 提取      │ │
│ └─────────┘ │ └─────────┘ │ └──────────┘ │ └──────────┘ │
│ ┌─────────┐ │ ┌─────────┐ │              │              │
│ │ Bug #38  │ │ │ 坑点 #9  │ │              │              │
│ │ 竞态条件 │ │ │ Turbo   │ │              │              │
│ │ 🔄 进行中 │ │ │ 缓存失效 │ │              │              │
│ └─────────┘ │ └─────────┘ │              │              │
└─────────────┴─────────────┴──────────────┴──────────────┘
```

**交互细节：**

- 卡片支持拖拽切换分类（使用 `@dnd-kit/core`）
- 列标题显示数量，hover 时显示「+」按钮快速添加
- 空列显示占位提示：「拖拽卡片到此处」或「点击添加」
- 卡片按创建时间倒序排列

**组件选择：**

- 拖拽：@dnd-kit/core（轻量、现代、React 原生）
- 卡片：自研组件，保持与整体设计系统一致

### 4.2 🗺️ 图谱视图（Graph View）

**用途：** 展示知识之间的关联关系，这是最关键的差异化视图

```
                    ┌──────────┐
              ┌────▶│ 架构决策#5 │◀───┐
              │     │ 状态管理  │    │
              │     └──────────┘    │
              │          │          │
         触发了       指导了      影响了
              │          │          │
        ┌─────┴───┐ ┌────┴────┐ ┌──┴───────┐
        │ Bug #37  │ │ Bug #38  │ │ 坑点 #8   │
        │ 闭包陷阱 │ │ 竞态条件 │ │ 幽灵依赖  │
        └─────────┘ └─────────┘ └──────────┘
              │                       │
           属于                     属于
              │                       │
        ┌─────┴──────┐         ┌─────┴──────┐
        │ useSync.ts  │         │ package.json│
        │ src/hooks/  │         │ 依赖管理    │
        └────────────┘         └────────────┘
```

**节点类型：**

| 节点 | 形状 | 颜色 |
|------|------|------|
| 卡片 | 圆角矩形 | 根据类型（Bug=红、坑点=黄、决策=蓝、洞察=绿） |
| 文件 | 文件夹图标 | 灰色 |
| 标签 | 圆形 | 主题色 |

**边（关系）类型：**

| 关系 | 含义 | 样式 |
|------|------|------|
| 触发了 | A 导致 B 发生 | 实线箭头 |
| 指导了 | A 的决策指导 B 的实现 | 虚线箭头 |
| 影响了 | A 对 B 有影响 | 点线箭头 |
| 属于 | 卡片属于某文件/模块 | 细实线 |
| 依赖于 | A 依赖于 B | 双向箭头 |
| 解决了 | A 解决了 B | 粗实线 + 对勾标记 |

**交互细节：**

- 支持画布拖拽平移、滚轮缩放
- 点击节点：右侧展开详情面板
- 双击节点：进入「聚焦模式」，只显示该节点及关联节点
- hover 边：显示关系类型标签
- 支持框选多个节点批量操作

**组件选择：**

- @xyflow/react（原 React Flow）— 生态最好，自定义节点能力强
- 或自研 SVG + d3-force（如需力导向物理效果）

### 4.3 ⏱️ 时间线视图（Timeline View）

**用途：** 按时间维度回溯项目历程，适合复盘

```
2026-03-28                    2026-03-29                    2026-03-30
    │                             │                             │
    ▼                             ▼                             ▼
────●─────────────────────────────●─────────────────────────────●────
    │                             │                             │
    ├─ 🐛 Bug #37 闭包陷阱        ├─ ⚡ 坑点 #9 缓存失效        ├─ 📐 决策 #6
    │  └─ 来源: Claude 对话       │  └─ 来源: 手动记录          │  └─ 重构方案
    │                             │                             │
    ├─ 📐 决策 #5 状态管理选型     ├─ 🐛 Bug #38 竞态条件        │
    │                             │                             │
```

**交互细节：**

- 水平时间轴，支持拖拽平移、缩放
- 同一天的事件垂直堆叠
- 点击事件：弹出详情卡片
- 支持按类型过滤（只显示 Bug、只显示决策等）
- 支持标记里程碑（Milestone）

**组件选择：**

- 自研 CSS Grid/Flexbox 实现，无需重型库

### 4.4 🏗️ 架构视图（Architecture View）

**用途：** 将项目文件结构可视化，并在每个模块上叠加知识标注

```
┌─ src/
│  ├─ hooks/
│  │  ├─ useSync.ts ─── 🐛×2  ⚡×1  ← 点击展开相关卡片
│  │  └─ useAuth.ts ─── ⚡×1
│  ├─ components/
│  │  ├─ Dashboard/ ─── 📐×1
│  │  └─ Editor/ ──── 🐛×1  ⚡×2
│  └─ services/
│     └─ api.ts ───── ⚡×3  📐×1  ← 热点模块，标红
```

**视图模式：**

1. **树形模式**（默认）：传统文件树 + 标注
2. **热力图模式**：Treemap，面积代表知识密度
3. **依赖模式**：展示模块间的依赖关系 + 知识标注

**交互细节：**

- 点击文件/文件夹：右侧展开关联卡片列表
- 颜色编码：Bug 密度高 → 红色，决策多 → 蓝色
- 支持搜索定位文件

**组件选择：**

- 文件树：react-arborist（虚拟化，大文件树不卡）
- Treemap：@nivo/treemap

---

## 5. 渐进式展示（Progressive Disclosure）

```
┌─────────────────────────────────────────┐
│ Level 1: 一行摘要                        │
│ "useEffect 闭包导致 state 过期"          │
│                                         │
│ ▸ 展开查看详情                           │
│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
│ Level 2: 结构化字段                      │
│ 现象 / 根因 / 方案 / 关联               │
│                                         │
│ ▸ 查看原始对话                           │
│┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄│
│ Level 3: 完整的终端输出原文               │
│ (这里才放 Markdown 渲染)                 │
└─────────────────────────────────────────┘
```

**设计原则：**

- 默认只展示 Level 1，减少认知负荷
- 点击展开 Level 2，展示结构化内容
- Level 3 按需加载，保持性能

---

## 6. 数据结构

### 6.1 知识卡片（KnowledgeCard）

```typescript
// 卡片类型枚举
export type CardType = 'bug' | 'pitfall' | 'decision' | 'insight' | 'task'

// 卡片状态
export type CardStatus = 'open' | 'in-progress' | 'resolved' | 'closed'

// 严重程度
export type Severity = 1 | 2 | 3 | 4 | 5

// 知识卡片接口
export interface KnowledgeCard {
  // 基础信息
  id: string                    // 唯一标识，如 "bug-37"
  type: CardType               // 卡片类型
  title: string                // 标题
  summary: string              // Level 1: 一行摘要

  // 元数据
  projectId: string            // 所属项目
  filePath?: string            // 关联文件路径
  lineRange?: { start: number; end: number }  // 代码行范围

  // 分类与标签
  tags: string[]               // 标签列表
  status: CardStatus           // 状态
  severity?: Severity          // 严重度（Bug/坑点适用）

  // 结构化内容（Level 2）
  fields: CardFields           // 根据类型变化

  // 原始内容（Level 3）
  sourceText?: string          // 原始 Markdown 内容
  sourceSessionId?: string     // 来源终端会话

  // 时间戳
  createdAt: number            // 创建时间
  updatedAt: number            // 更新时间
  resolvedAt?: number          // 解决时间
}

// 类型特定的字段
export type CardFields =
  | BugFields
  | PitfallFields
  | DecisionFields
  | InsightFields
  | TaskFields

export interface BugFields {
  phenomenon: string           // 现象描述
  rootCause?: string           // 根因分析
  solution?: string            // 解决方案
  reproduceSteps?: string[]    // 复现步骤
}

export interface PitfallFields {
  scenario: string             // 场景描述
  problem: string              // 问题描述
  workaround: string           // 规避方案
  prevention?: string          // 预防措施
}

export interface DecisionFields {
  background: string           // 决策背景
  options: DecisionOption[]    // 备选方案
  decision: string             // 最终决策
  rationale: string            // 决策理由
}

export interface DecisionOption {
  name: string
  pros: string[]
  cons: string[]
}

export interface InsightFields {
  discovery: string            // 发现内容
  impact: string               // 影响范围
  actionItems?: string[]       // 后续行动
}

export interface TaskFields {
  priority: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: number
  relatedCards: string[]       // 关联卡片ID
}
```

### 6.2 卡片关系（CardRelation）

```typescript
// 关系类型
export type RelationType =
  | 'triggered'      // 触发了
  | 'guided'         // 指导了
  | 'influenced'     // 影响了
  | 'belongs-to'     // 属于（文件/模块）
  | 'depends-on'     // 依赖于
  | 'resolves'       // 解决了
  | 'relates-to'     // 相关联

// 卡片关系
export interface CardRelation {
  id: string
  sourceCardId: string         // 源卡片
  targetCardId: string         // 目标卡片
  type: RelationType           // 关系类型
  description?: string         // 关系描述
  createdAt: number
}
```

### 6.3 看板状态（KanbanState）

```typescript
export interface KanbanState {
  // 当前视图
  viewMode: KnowledgeViewMode

  // 筛选器状态
  filters: {
    types: CardType[]          // 类型筛选
    tags: string[]             // 标签筛选
    status: CardStatus[]       // 状态筛选
    searchQuery: string        // 搜索关键词
  }

  // UI 状态
  selectedCardId: string | null
  isDetailPanelOpen: boolean
  graphViewport: {            // 图谱视图状态
    x: number
    y: number
    zoom: number
  }
  timelineRange: {            // 时间线视图范围
    start: number
    end: number
  }
}

// 添加到 ProjectWorkspaceState
export interface ProjectWorkspaceState {
  selectedFilePath: string | null
  terminalPaneSizes: number[]
  treeExpandedPaths: Record<string, boolean>

  // 新增：看板状态
  kanbanState?: KanbanState
}
```

---

## 7. 后端接口设计

### 7.1 数据库 Schema

```sql
-- 知识卡片表
CREATE TABLE knowledge_cards (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                    -- bug, pitfall, decision, insight, task
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    file_path TEXT,
    line_start INTEGER,
    line_end INTEGER,
    tags_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'open',   -- open, in-progress, resolved, closed
    severity INTEGER,                      -- 1-5
    fields_json TEXT NOT NULL,             -- 类型特定的结构化字段
    source_text TEXT,                      -- 原始 Markdown 内容
    source_session_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER
);

-- 卡片关系表
CREATE TABLE card_relations (
    id TEXT PRIMARY KEY,
    source_card_id TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
    target_card_id TEXT NOT NULL REFERENCES knowledge_cards(id) ON DELETE CASCADE,
    type TEXT NOT NULL,                    -- triggered, guided, influenced, etc.
    description TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(source_card_id, target_card_id, type)
);

-- 标签表（用于标签建议）
CREATE TABLE card_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tag TEXT NOT NULL,
    color TEXT,                            -- 可选的标签颜色
    usage_count INTEGER DEFAULT 1,
    UNIQUE(project_id, tag)
);

-- 索引
CREATE INDEX idx_cards_project ON knowledge_cards(project_id);
CREATE INDEX idx_cards_type ON knowledge_cards(type);
CREATE INDEX idx_cards_status ON knowledge_cards(status);
CREATE INDEX idx_cards_file_path ON knowledge_cards(file_path);
CREATE INDEX idx_relations_source ON card_relations(source_card_id);
CREATE INDEX idx_relations_target ON card_relations(target_card_id);
```

### 7.2 Tauri Commands

```rust
// ========== 卡片 CRUD ==========

/// 创建知识卡片
#[tauri::command]
fn create_knowledge_card(
    state: State<FlowtermState>,
    project_id: String,
    card: CreateKnowledgeCardRequest,
) -> Result<KnowledgeCard, String>

/// 获取项目下所有卡片
#[tauri::command]
fn list_knowledge_cards(
    state: State<FlowtermState>,
    project_id: String,
    filters: Option<CardFilters>,
) -> Result<Vec<KnowledgeCard>, String>

/// 获取单张卡片详情
#[tauri::command]
fn get_knowledge_card(
    state: State<FlowtermState>,
    card_id: String,
) -> Result<KnowledgeCard, String>

/// 更新卡片
#[tauri::command]
fn update_knowledge_card(
    state: State<FlowtermState>,
    card_id: String,
    updates: UpdateKnowledgeCardRequest,
) -> Result<KnowledgeCard, String>

/// 删除卡片
#[tauri::command]
fn delete_knowledge_card(
    state: State<FlowtermState>,
    card_id: String,
) -> Result<(), String>

// ========== 卡片关系 ==========

/// 创建卡片关系
#[tauri::command]
fn create_card_relation(
    state: State<FlowtermState>,
    relation: CreateCardRelationRequest,
) -> Result<CardRelation, String>

/// 获取卡片的所有关系
#[tauri::command]
fn get_card_relations(
    state: State<FlowtermState>,
    card_id: String,
) -> Result<CardRelationGraph, String>

/// 删除卡片关系
#[tauri::command]
fn delete_card_relation(
    state: State<FlowtermState>,
    relation_id: String,
) -> Result<(), String>

// ========== 智能捕获（从终端） ==========

/// 分析终端输出，自动提取知识卡片候选
#[tauri::command]
fn extract_card_candidates(
    state: State<FlowtermState>,
    project_id: String,
    session_id: String,
    output_text: String,
) -> Result<Vec<CardCandidate>, String>

/// 确认并保存捕获的卡片
#[tauri::command]
fn confirm_card_extraction(
    state: State<FlowtermState>,
    project_id: String,
    candidate: CardCandidate,
) -> Result<KnowledgeCard, String>

// ========== 标签管理 ==========

/// 获取项目下所有标签
#[tauri::command]
fn list_card_tags(
    state: State<FlowtermState>,
    project_id: String,
) -> Result<Vec<CardTag>, String>

/// 获取标签建议（基于已有标签和文件内容）
#[tauri::command]
fn suggest_card_tags(
    state: State<FlowtermState>,
    project_id: String,
    context: String,
) -> Result<Vec<String>, String>
```

### 7.3 数据结构（Rust）

```rust
// 请求/响应结构
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateKnowledgeCardRequest {
    pub card_type: CardType,
    pub title: String,
    pub summary: String,
    pub file_path: Option<String>,
    pub line_range: Option<LineRange>,
    pub tags: Vec<String>,
    pub severity: Option<u8>,
    pub fields: CardFields,
    pub source_text: Option<String>,
    pub source_session_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardFilters {
    pub types: Option<Vec<CardType>>,
    pub tags: Option<Vec<String>>,
    pub status: Option<Vec<CardStatus>>,
    pub search_query: Option<String>,
    pub file_path: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardRelationGraph {
    pub nodes: Vec<CardNode>,
    pub edges: Vec<CardEdge>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCandidate {
    pub suggested_type: CardType,
    pub title: String,
    pub summary: String,
    pub confidence: f32,           // 置信度 0-1
    pub suggested_tags: Vec<String>,
    pub source_snippet: String,    // 原始文本片段
}

// 枚举类型
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CardType {
    Bug,
    Pitfall,
    Decision,
    Insight,
    Task,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CardStatus {
    Open,
    InProgress,
    Resolved,
    Closed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RelationType {
    Triggered,
    Guided,
    Influenced,
    BelongsTo,
    DependsOn,
    Resolves,
    RelatesTo,
}
```

---

## 8. 前端组件架构

### 8.1 组件层次

```
KnowledgeBoard               # 看板主组件
├── KnowledgeSidebar         # 左侧筛选器
│   ├── TypeFilter          # 类型筛选
│   ├── TagFilter           # 标签筛选
│   └── StatusFilter        # 状态筛选
├── KnowledgeToolbar         # 顶部工具栏
│   ├── SearchInput         # 搜索框
│   ├── ViewSwitcher        # 视图切换
│   └── NewCardButton       # 新建卡片
├── KanbanView              # 看板视图
│   └── KanbanColumn        # 看板列
│       └── KnowledgeCard   # 知识卡片
├── GraphView               # 图谱视图
│   └── GraphCanvas         # 图谱画布
├── TimelineView            # 时间线视图
│   └── TimelineTrack       # 时间轴
├── ArchitectureView        # 架构视图
│   └── FileTreeWithOverlay # 文件树+标注
└── DetailPanel             # 右侧详情面板
    ├── CardDetail          # 卡片详情
    └── RelationEditor      # 关系编辑器
```

### 8.2 状态管理

使用 Zustand 扩展现有 `workspace-store`：

```typescript
// stores/kanban-store.ts
import { create } from 'zustand'

interface KanbanStore {
  // 数据
  cards: KnowledgeCard[]
  relations: CardRelation[]
  isLoading: boolean

  // 本地状态
  filters: CardFilters
  viewMode: KnowledgeViewMode
  selectedCardId: string | null

  // Actions
  loadCards: (projectId: string) => Promise<void>
  createCard: (card: CreateCardRequest) => Promise<void>
  updateCard: (id: string, updates: UpdateCardRequest) => Promise<void>
  deleteCard: (id: string) => Promise<void>
  setFilters: (filters: Partial<CardFilters>) => void
  setViewMode: (mode: KnowledgeViewMode) => void
  selectCard: (id: string | null) => void
}
```

### 8.3 技术栈选型

| 功能 | 库 | 理由 |
|------|-----|------|
| 拖拽 | @dnd-kit/core | 轻量、现代、React 原生设计 |
| 图谱 | @xyflow/react | 生态最好，自定义节点能力强 |
| 富文本 | @tiptap/react | 块编辑器，可扩展性极强 |
| 代码高亮 | shiki | 静态高亮，性能好，主题丰富 |
| 图表 | @nivo/treemap | 声明式 API，视觉效果现代 |
| 搜索 | flexsearch | 纯前端全文搜索，性能极好 |
| 文件树 | react-arborist | 虚拟化，大文件树不卡 |
| 动画 | framer-motion | 卡片展开/切换的过渡动画 |

---

## 9. 卡片捕获流程

### 9.1 从终端输出自动捕获

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ 终端输出     │────▶│ 智能分析     │────▶│ 候选卡片     │
│ 文本流      │     │ (AI/规则)   │     │ 列表        │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                        ┌──────────────────────┘
                        ▼
               ┌─────────────────┐
               │ 用户确认/编辑    │
               │ (底部弹出卡片)   │
               └────────┬────────┘
                        ▼
               ┌─────────────────┐
               │ 保存到看板       │
               │ (自动提取标签    │
               │  关联文件等)     │
               └─────────────────┘
```

### 9.2 手动创建

```
1. 点击 [+ 新建卡片] 或快捷键 Cmd+N
2. 弹出创建对话框
3. 选择类型 → 自动切换字段模板
4. 填写内容（支持 Markdown）
5. 选择关联文件（可选，从当前项目文件树选择）
6. 添加标签（支持自动建议）
7. 保存
```

---

## 10. 迭代计划

### Phase 1: 终端采集基础

- [ ] 终端输出静默采集（前端缓冲 + IPC）
- [ ] 临时存储表设计与实现
- [ ] 存储时机触发器（会话结束/对话结束/Ctrl+C）
- [ ] 后台定时任务框架（10分钟间隔）

### Phase 2: AI 分析与卡片生成

- [ ] AI 分析服务集成
- [ ] 卡片类型识别（Bug/坑点/决策/洞察）
- [ ] 结构化字段提取
- [ ] 手动强制转换接口与 UI

### Phase 3: 模块分发与视图

- [ ] 模块分发引擎架构
- [ ] 时间线视图（必须视图）
- [ ] 看板视图（并行视图）
- [ ] 图谱视图（并行视图）
- [ ] 架构视图（选择性视图）

### Phase 4: 关系与图谱增强

- [ ] 卡片关系自动识别
- [ ] 图谱布局保持算法
- [ ] 视图融合机制
- [ ] 渐进式展示优化

### Phase 5: 系统集成

- [ ] 侧边栏看板入口
- [ ] 文件树卡片标注
- [ ] 搜索与过滤增强
- [ ] 性能优化

---

## 11. 与现有系统的集成

### 11.1 与终端的集成

- 在终端 header 添加「捕获」按钮
- 选中终端文本后右键菜单：「添加到看板」
- Agent 状态变化时自动捕获上下文

### 11.2 与文件树的集成

- 文件树中显示文件关联的卡片数量
- 点击数量展开该文件的卡片列表
- 右键文件：「查看相关知识」

### 11.3 与项目工作区的集成

- 看板状态保存到 `ProjectWorkspaceState`
- 切换项目时自动加载对应看板
- 支持跨项目卡片搜索（未来）

---

## 12. 性能考虑

- 卡片数据分页加载，虚拟滚动
- 图谱使用 Canvas/SVG 优化，节点数限制（先 100 个）
- 图片懒加载，原始内容（Level 3）按需获取
- 搜索使用 flexsearch 本地索引，无需服务端查询

---

> **设计原则回顾：**
> - 温暖有机的界面，符合 Flowterm 整体风格
> - 渐进式披露，减少认知负荷
> - 从扁平文档到多维知识网络的转化
> - 技术退后，让知识本身成为主角
