# Terminal Session Rail

## 目标

在现有右侧终端区基础上补充一个更清晰的会话管理层：

- 保留当前终端区内的拆分能力
- 新增独立的终端会话入口 rail，位于终端区最右侧
- 每个 rail item 代表一个单独终端会话，不承载嵌套布局
- 当前激活会话可在主终端区中继续纵向或横向拆分
- 终端会话支持重命名
- rail 支持拖拽拉宽，允许从紧凑图标态扩展为带标题态

## 交互模型

### 1. 终端区结构

右侧终端区分成三个层次：

1. 顶部终端工具栏
2. 主终端工作区
3. 会话 rail

默认关系：

- 主终端工作区占主要宽度
- 会话 rail 吸附在最右侧
- rail 初始为紧凑宽度，显示小图标 tab
- 用户拖宽后，rail 展示会话标题、状态点和轻量操作

### 2. 顶部工具栏动作

顶部工具栏提供三个动作：

- `新增会话`
  作用：创建一个新的独立终端会话，并在右侧 rail 中追加一个 item，同时切换到该会话
- `纵向拆分`
  作用：将当前主终端工作区按上下结构拆成两个 pane
- `横向拆分`
  作用：将当前主终端工作区按左右结构拆成两个 pane

约束：

- 拆分只作用于当前激活会话对应的主工作区
- rail 中其他会话保持单会话入口身份，不自动同步拆分
- 用户切换 rail item 时，主工作区切换到对应会话的布局快照

### 3. 会话 rail

rail 是独立的会话入口栏，不是 pane 树的一部分。

紧凑态：

- 仅显示终端图标
- 通过状态点区分 `running / attention / idle`
- hover 展示会话名 tooltip

展开态：

- 显示会话标题
- 显示状态点
- 可显示一行次级信息，如 shell 或最近命令来源
- 当前项有更强的边框与底色

交互：

- 点击 item：切换当前会话
- 双击标题或从上下文菜单进入：重命名
- 支持新增、关闭、重命名
- 支持宽度拖拽，宽度应持久化

建议宽度：

- 紧凑态：`44px`
- 舒适态：`160px`
- 最大态：`240px`

### 4. 重命名

重命名采用就地编辑，不弹窗。

行为：

- 激活态标题替换为输入框
- `Enter` 提交
- `Escape` 取消
- 失焦提交当前值
- 空值回退到默认名，如 `claude-code`、`terminal-2`

### 5. 布局与视觉

视觉保持 Flowterm 现有的 warm terminal 语言：

- 主终端区延续深色沉浸背景
- rail 背景略高于主终端区一层，作为“被收纳的会话列”
- 分隔线使用低对比边界，不做高亮 chrome
- 激活项使用暖琥珀描边或细线，避免强按钮感

### 6. 状态持久化

每个项目下需要额外持久化：

- session 顺序
- session 标题
- session rail 宽度
- 当前激活 session
- 每个 session 的主工作区布局树

## 推荐实现方向

前端状态从当前的单层 `paneOrder + panesById` 提升为两层：

- `sessions`
  表示 rail 中的独立终端会话列表
- `workspace layout`
  表示某个 session 对应的拆分树

推荐模型：

- `projectTerminal.sessionsById`
- `projectTerminal.sessionOrder`
- `projectTerminal.activeSessionId`
- `projectTerminal.railWidth`
- `projectTerminal.layoutsBySessionId`

其中每个 `layout` 节点支持：

- `leaf`：绑定单个 pane
- `split-horizontal`
- `split-vertical`

## 本次 Pencil 设计范围

本次视觉稿需要明确展示：

- 新的 `新增会话` 图标
- `纵向拆分` 与 `横向拆分` 两个独立图标
- 右侧 rail 的紧凑态
- 右侧 rail 的展开态
- rail 拖宽后的宽度关系
- 一个会话处于重命名态
- 主工作区存在横向拆分案例
- 主工作区存在纵向拆分案例
