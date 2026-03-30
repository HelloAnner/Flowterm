# Command Palette

## 目标

Command Palette 是 Flowterm 的全局动作入口。

它不替代常驻界面，而是把低频但关键的动作收拢到一个统一入口里，让用户在不离开当前上下文的情况下完成切换与操作。

设计目标：

- 行为尽量贴近 VS Code 的命令面板
- 键盘优先，鼠标只是补充
- 根命令尽量少，二级列表承接具体对象
- 所有命令都直接映射到现有 store action，不造新状态层

## 快捷键

- macOS：`⌘⇧P`
- Windows / Linux：`Ctrl+Shift+P`

## 当前命令结构

根层只放动作入口，不直接堆对象列表：

- `Preferences: Color Theme`
- `Projects: Open Project`
- `Projects: Switch Project`
- `Files: Open File`
- `Terminal: Split Terminal`

其中：

- `Preferences: Color Theme` 进入主题列表
- `Projects: Switch Project` 进入项目列表
- `Files: Open File` 进入当前项目文件列表
- `Projects: Open Project` 直接打开“添加本地项目”弹窗
- `Terminal: Split Terminal` 直接对当前项目执行分屏

## 屏幕模型

命令面板内部采用轻量 screen 模型：

- `root`
- `themes`
- `projects`
- `files`

规则：

- `Enter` 执行当前选中项
- `↑ / ↓` 切换选中项
- `Esc` 关闭；若当前在子列表，则先退回 root
- 子列表顶部显示标题，体验贴近 VS Code 的二级选择界面

## 数据来源

- 主题列表：`src/features/theme/theme-registry.ts`
- 项目列表：`useWorkspaceStore().projects`
- 文件列表：当前 `snapshot.files`
- 终端操作：当前 `activeProjectId`

Command Palette 自身不持有业务数据，只持有：

- 当前 screen
- 输入 query
- 当前高亮项索引

## 实现约束

- 组件只负责展示和交互，不直接读 Zustand
- 具体动作通过 props 回调注入
- 新增命令时，优先先判断是“直接动作”还是“进入某个对象列表”
- 不要在组件内部复制业务状态
