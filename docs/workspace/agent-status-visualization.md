# Agent 状态检测与可视化

## 目标

让右侧终端区不再只是输出黑盒，而是能稳定告诉用户：Agent 正在运行、正在等待输入，还是刚刚完成一轮执行。

## 范围

本次只覆盖 Flowterm 当前已支持的终端 pane 模型，不引入新的 session rail 或布局模型。

- Rust 侧新增 `agent_detector.rs`
- PTY 输出流在后端完成识别与状态归一
- 前端通过独立 `agent:status` 事件接收每个 pane 的 Agent 状态
- 终端区顶部新增 28px 状态条，用于展示当前最重要的 Agent 状态

## 检测规则

优先支持 Claude Code，兼容 aider 的基础识别。

- `running`
  - 检测到 Claude Code / aider 标识文本
  - 检测到 ANSI spinner / 进度刷新输出（如 `\u001b[`、回车刷新、braille spinner 帧）
- `attention`
  - 检测到 `waiting for your input`、`press enter to continue`、`apply this change?` 等等待用户确认语义
- `completed`
  - 已进入过 `running` / `attention`，随后 shell prompt 再次出现
- `idle`
  - 尚未识别到 Agent，或新 session 初始状态

为避免把普通 shell 输出误识别为完成态，`completed` 只在“已识别到 Agent 活动后 + prompt 返回”时触发。

## 后端协议

新增事件：`flowterm://agent-status`

字段：

- `projectId`
- `paneId`
- `sessionId`
- `agent`：`claude-code | aider | unknown`
- `phase`：`idle | running | attention | completed`

同时保留现有 `terminal-state`：

- `running` / `attention` 继续驱动 pane 生命周期与项目级聚合状态
- `completed` 在终端粗粒度状态上回落为 `idle`

## 前端表现

状态条位于终端区顶部标题栏下方，高度固定 `28px`。

- `running`：绿色脉冲点 + `Claude Code 运行中`
- `attention`：琥珀色提示 + `等待你的输入`
- `completed`：柔和中性色 + `已完成，等待下一步`
- 无 Agent 状态时隐藏状态条，避免增加噪音

多 pane 并存时按优先级选取：`attention > running > completed > idle`。

## 约束

- Agent 状态必须按 pane 隔离，不能跨 pane 串线
- 重复状态事件不应在前端制造多余状态对象
- shell 关闭时保留 `terminal-state=exited`，Agent 状态回到 `idle`
