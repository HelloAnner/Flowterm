# Flowterm UI Design Specification

> 版本：v0.1 · 日期：2026-03-29

---

## 设计哲学

Flowterm 的界面应当像一间刚好够用的工作室——没有多余的东西，但每一件都在正确的位置。

终端是主角。界面是舞台。设计的任务是让舞台消失。

参照风格：**OpenAI Atlas 本地客户端**的极简精致克制，结合 Dieter Rams 的工业设计原则。

---

## 1. Coding Principles

### 1.1 Less but Better（Dieter Rams Code）

- 剥离一切至最原始、最纯粹的形式
- 每个函数、变量、import 都必须证明其存在的价值
- 代码应"经久不衰、触手可及"——多年后依然可读
- 偏好少量精心设计的抽象，而非大量浅层封装

### 1.2 Organic Architecture（自然 × 结构）

- 架构从需求中有机生长，而非自上而下强加
- 命名温暖而人性化，而非冷冰冰的抽象行话
- 分层有意为之——每一层都映射一个理解阶段
- 闭环系统：每一个申请的资源都被释放

### 1.3 Ambient Intelligence（光即界面）

- 错误是环境信号，而非警报——清晰、平静、有帮助
- 日志随场景变换——开发时详细，生产时宁静
- 上下文感知行为：代码优雅地适应其所在环境
- 系统健康状态像自然光，而非闪烁的仪表盘

### 1.4 Invisible Infrastructure（技术服务于叙事）

- 基础设施隐形，如同 AR 隐形眼镜
- API 直觉到像自然手势
- 零配置默认即可运行
- 没有魔法，没有意外——一切都感觉"可信"

---

## 2. UI Design Principles

### 2.1 Considered, Uncluttered, Unobtrusive（克制、整洁、不打扰）

- 细腻质感胜过平淡的空白——温暖而不嘈杂
- 整洁的卡片布局中有清晰的文字——信息有其归属
- 界面反映用户身份与上下文
- 技术退场，直到被召唤

### 2.2 Warm Futurism（温暖的未来感，而非冷冽科幻）

- 色彩：大地色系、柔和琥珀、静默绿、自然白
- 有机质感与干净界面并存
- 圆角、曲线路径、中性光照
- 未来感应当是人性的、令人向往的

### 2.3 Narrative-Led Design（叙事驱动的设计）

- 上下文感知界面，随用户状态切换
- 渐进式披露：只展示当前"场景"所需的内容
- 过渡动效反映情绪旅程
- 空状态是叙事的一部分，而非中断

### 2.4 Unspoiled Beauty & Timelessness（纯粹之美与永恒）

- 充裕的留白——如同画廊墙壁上的艺术品之间的间距
- 框中框：卡片嵌入区块嵌入页面
- 每个界面都应该令人平静，而非令人焦虑
- 反射性对称营造宁静感

### 2.5 Gesture-Based, Human-First（手势优先，人为中心）

- 最小化 chrome 和控件——让内容呼吸
- 直接操作优先于点击按钮
- 非必要不展示数据仪表盘
- 交互是身体的自然延伸

---

## 3. Color System

### 3.1 核心色板

```
背景层（Background）
  --bg-base:        #0F0F0F   深暖黑，主背景
  --bg-elevated:    #161616   卡片/面板背景
  --bg-overlay:     #1E1E1E   悬浮层、下拉菜单

边界（Border）
  --border-subtle:  #2A2A2A   最轻的分隔线
  --border-default: #333333   常规边框

文字（Text）
  --text-primary:   #E8E3DC   温暖白，主文字（非纯白）
  --text-secondary: #8A8680   静默灰，次要信息
  --text-muted:     #555250   注释、占位符

强调色（Accent）
  --accent-amber:   #C8A96E   琥珀，主高亮（选中、激活状态）
  --accent-sage:    #7A9E8A   哑光绿，成功/运行状态
  --accent-clay:    #A06050   赤陶红，错误/删除状态
  --accent-glow:    #7BA7C8   蓝白，信息/链接

终端专用
  --terminal-bg:    #0C0C0C   终端区域，比主背景更深
  --terminal-cursor:#C8A96E   光标颜色，与 accent-amber 一致
```

### 3.2 使用原则

- **不使用纯黑（#000000）和纯白（#FFFFFF）**——过于冷硬
- 所有颜色带轻微暖调（红色分量略高于蓝色分量）
- Diff 颜色：`+` 新增用 `--accent-sage` 的 15% 透明背景，`-` 删除用 `--accent-clay` 的 15% 透明背景
- 避免使用荧光色、饱和度超过 60 的颜色

---

## 4. Typography

### 4.1 字体栈

```css
/* UI 界面字体 */
--font-ui: "Inter", "SF Pro Text", system-ui, sans-serif;

/* 代码 / 终端字体 */
--font-mono: "Berkeley Mono", "Geist Mono", "JetBrains Mono", monospace;

/* 标题（可选升级） */
--font-display: "ABC Diatype", "Inter", sans-serif;
```

### 4.2 字号体系

```
12px  --text-xs    标签、徽章、辅助说明
13px  --text-sm    文件树节点、Tab 名称、次要文字
14px  --text-base  主要 UI 文字
15px  --text-md    面板标题
18px  --text-lg    页面级标题（极少使用）
```

### 4.3 原则

- 行高：UI 文字 `1.5`，代码 `1.6`
- 字间距：标题轻微负值（`-0.01em`），正文 `0`
- 文字应感觉"雕刻而成"——有意图，非装饰

---

## 5. Spacing & Layout

### 5.1 间距单位

基准单位 `4px`，所有间距为其整数倍：

```
4px   --space-1   最小间隔（图标与文字）
8px   --space-2   行内元素间距
12px  --space-3   组件内边距
16px  --space-4   卡片 padding
24px  --space-6   区块间距
32px  --space-8   大区域间距
```

### 5.2 主界面布局比例

```
顶部 Tab 栏高度：       36px（紧凑，如浏览器）
左侧文件树默认宽度：    220px（可拖拽，最小 160px，最大 320px）
右侧终端默认宽度：      38%（可拖拽）
中间 Diff 面板：        剩余空间自动填充
三栏分隔线宽度：        1px（--border-subtle）
```

### 5.3 圆角

```
--radius-sm:   4px   输入框、标签
--radius-md:   6px   卡片、面板
--radius-lg:   10px  模态框、弹窗
--radius-full: 9999px 徽章、圆形按钮
```

---

## 6. Component Patterns

### 6.1 顶部 Tab 栏

```
┌──────────────────────────────────────────────────────────┐
│  ● flowterm   [  项目A  ] [  项目B ✦ ] [  项目C  ]  [+]  │
└──────────────────────────────────────────────────────────┘
```

- 背景：`--bg-base`，底部 1px `--border-subtle`
- 激活 Tab：文字 `--text-primary`，底部 1px `--accent-amber` 指示线
- 非激活 Tab：文字 `--text-secondary`，hover 时淡入 `--bg-elevated`
- Agent 运行中：Tab 名称右侧显示 `•` 动态脉冲点，颜色 `--accent-sage`
- 有未提交改动：显示 `✦` 静态标记，颜色 `--accent-amber`
- `+` 按钮：仅图标，无文字，hover 时亮度 +15%

### 6.2 文件树面板

- 背景：`--bg-elevated`
- 节点 hover：`--bg-overlay` 背景，高度 26px
- 文件状态标记（右对齐，`--text-secondary` 字号 11px）：
  - `M` 修改 → 颜色 `--accent-amber`
  - `A` 新增 → 颜色 `--accent-sage`
  - `D` 删除 → 颜色 `--accent-clay`
  - `?` 未追踪 → 颜色 `--text-muted`
- 被 Agent 实时改动的文件：左侧 2px 竖线，颜色 `--accent-amber`，带轻微发光

### 6.3 Diff 面板

- 背景：`--bg-base`
- 面板顶部：文件路径（`--text-secondary`）+ 模式切换 Toggle（实时 / Git）
- 新增行背景：`rgba(122, 158, 138, 0.12)` + 行号列 `rgba(122, 158, 138, 0.25)`
- 删除行背景：`rgba(160, 96, 80, 0.12)` + 行号列 `rgba(160, 96, 80, 0.25)`
- 行号字体：`--font-mono`，颜色 `--text-muted`，不干扰代码阅读
- 无改动时的空状态：居中展示，文案"等待 Agent 改动文件..."，`--text-muted`

### 6.4 终端区域

- 背景：`--terminal-bg`（比主背景更深，视觉上形成"沉入感"）
- 与其他面板的分隔：1px `--border-subtle`，无阴影
- 终端顶部状态条（仅 Agent 运行时显示，高度 24px）：
  - 运行中：`•` 脉冲 + "Claude Code 运行中" + 耗时，`--accent-sage` 色
  - 等待输入：`‣` + "等待你的输入"，`--accent-amber` 色
  - 已完成：`✓` + "完成"，自动 3 秒后淡出
- 终端内字体：`--font-mono`，16px，行高 1.6

---

## 7. Motion & Animation

保持克制。动效应当平静，而非表演。

```
--duration-instant:  80ms   状态切换（颜色、背景）
--duration-fast:    150ms   hover、focus
--duration-normal:  250ms   面板展开/收起、Tab 切换
--duration-slow:    400ms   模态框、初始进入动画

--easing-default: cubic-bezier(0.16, 1, 0.3, 1)   快入慢出，自然感
--easing-spring:  cubic-bezier(0.34, 1.56, 0.64, 1) 轻微弹性，仅用于小元素
```

**禁止：**
- 超过 400ms 的动画
- 循环动画（除 Agent 运行状态的 `•` 脉冲外）
- 抖动、弹跳、旋转等"表演性"动效

---

## 8. Design References

- **Dieter Rams** — "Less but better" 工业设计原则
- **Peter Zumthor** — 氛围建筑，材质诚实
- **James Turrell** — 光作为媒介，感知作为体验
- **Olafur Eliasson** — 自然元素在建构空间中的运用
- **Pentagram / Natasha Jen** — 系统性、纪律性的平面设计
- **Territory Studio** — 叙事驱动的屏幕图形
- **OpenAI Atlas** — 本地客户端的极简精致参照

---

## 9. Anti-Patterns（Flowterm 不是什么）

| ❌ 反模式 | ✅ 正确做法 |
|---------|-----------|
| 冷冽金属感、反乌托邦科幻美学 | 温暖大地色，有机质感 |
| 炫目的过场动画 | 克制的 80-250ms 过渡 |
| 不必要的数据仪表盘和指标 | 只在需要时展示信息 |
| 过度工程化的"聪明"抽象 | 直接、可读、可信 |
| 无温度的扁平极简 | 细腻质感，有呼吸感的留白 |
| 技术自我彰显 | 技术退场，直到被召唤 |
| 刺耳的错误提示 | 平静清晰的环境信号 |

---

## 10. Keywords

**温暖、有机、克制、整洁、环境感、永恒、可信、精致**

> 每一个界面决策都应当能够回答这个问题：
> "如果把这个元素去掉，用户会失去什么？"
> 如果答案是"不多"，就去掉它。
