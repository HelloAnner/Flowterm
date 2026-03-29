# 终端 Pane 隔离

## 目标

右侧终端区域在分屏后，行为要和常见终端软件一致：每个 pane 都是一个真正独立的终端会话，而不是同一个终端内容的重复渲染。

## 约束

- 每个 pane 对应一个独立 PTY 和独立 shell 进程
- 每个 pane 拥有自己的 `sessionId`
- 输入只能写入当前 pane 对应的 `sessionId`
- 输出、状态、history 只能回流到对应 pane
- pane 关闭时，只销毁该 pane 的 PTY，不影响同项目下其他 pane
- 项目切换时，已有 pane 继续保活

## 前后端协议

### attach

- `attach_terminal(projectId, paneId?)` 用于拿到某个 pane 的终端附着信息
- 未提供 `paneId` 时，默认附着主 pane
- 已存在的 `paneId` 幂等返回；不存在时创建新 session

返回值需要包含：

- `projectId`
- `paneId`
- `sessionId`
- `history`
- `shellLabel`
- `state`

### 流式事件

终端输出和状态事件必须同时携带：

- `projectId`
- `paneId`
- `sessionId`

前端只允许把事件写回匹配 `sessionId` 的 pane，避免旧事件或串线事件污染其他 pane。

## 前端状态

终端状态按项目分组，但 pane 独立存储：

- `paneOrderByProject[projectId]` 负责布局顺序
- `paneStateByProject[projectId][paneId]` 负责该 pane 的初始 `history`、`state`、`sessionId`

高频终端输出不进入全局 store：

- `attach_terminal` 返回的 `history` 只用于 pane 首次附着或项目切换后的重建
- 运行中的输出流直接按 `sessionId` 写入对应 xterm 实例
- 若 pane 尚未挂载，输出先在前端做短暂 backlog，待该 `sessionId` 订阅后一次性补写
- 重复的 `running` 状态事件不应继续制造新的前端状态对象

不再使用“项目一份 history + 分屏数量”的模型。

## 关闭行为

- 关闭 pane 时调用 `close_terminal(sessionId)`
- store 只移除该 pane
- 若项目只剩一个 pane，不允许继续关闭，保留主终端
