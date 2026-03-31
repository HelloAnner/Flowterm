# Theme System

## 目标

Flowterm 的主题系统现在以 **JSON 主题包** 为唯一真相来源。

每个主题都描述同一套能力：

- UI 变量：页面背景、边框、文字、状态色、阴影与半透明层
- 终端变量：xterm 背景、前景、光标
- 代码变量：预览区语法高亮色板

这样切换主题时，工作台、终端、代码预览会一起切换，而不是各自维护一套颜色常量。

## 当前主题

- `flowterm-warm-dark`
  - 默认主题
  - 延续当前 Flowterm 的温暖深色语言
- `cursor-dark`
  - 更贴近 Cursor 当前那种干净、冷静的深色编辑器气质
- `ghostty-dark`
  - 更贴近 Ghostty 当前那种高对比、清爽的终端深色气质
- `github-dark-default`
  - 复刻 GitHub Dark Default 的整体表面、边框、蓝色强调和代码配色
- `tokyo-night`
  - 偏霓虹夜色、层次很清楚的现代编辑器深色主题
- `night-owl`
  - 更适合长时间编码的高对比深海蓝主题
- `nord`
  - 偏冷静、克制、雾感的北欧深色主题
- `one-dark-pro`
  - 偏经典编辑器系的中性深色
- `catppuccin-mocha`
  - 更柔和、偏奶油紫调的现代深色
- `dracula`
  - 高辨识度的紫粉深色主题
- `intellij-light`
  - 偏 IDE 风格的浅色主题
- `catppuccin-latte`
  - 更柔和、偏暖感的现代浅色主题

主题定义文件位于：

- `src/themes/flowterm-warm-dark.json`
- `src/themes/cursor-dark.json`
- `src/themes/ghostty-dark.json`
- `src/themes/github-dark-default.json`
- `src/themes/tokyo-night.json`
- `src/themes/night-owl.json`
- `src/themes/nord.json`
- `src/themes/one-dark-pro.json`
- `src/themes/catppuccin-mocha.json`
- `src/themes/dracula.json`
- `src/themes/intellij-light.json`
- `src/themes/catppuccin-latte.json`

## JSON 结构

每个主题都遵循这三个顶层字段：

```json
{
  "id": "github-dark-default",
  "label": "GitHub Dark Default",
  "colorScheme": "dark",
  "ui": {
    "bg-base": "#0d1117",
    "accent-amber": "#2f81f7"
  },
  "terminal": {
    "background": "#0d1117",
    "foreground": "#e6edf3",
    "cursor": "#58a6ff"
  },
  "syntax": {
    "keyword": "#ff7b72",
    "string": "#a5d6ff",
    "comment": "#8b949e"
  }
}
```

说明：

- `ui` 会被自动映射为 CSS 变量，例如 `bg-base -> --bg-base`
- `terminal` 直接传给 xterm
- `syntax` 会被转换成 `react-syntax-highlighter` 所需的 style object

## 运行时入口

主题注册表位于 `src/features/theme/theme-registry.ts`，负责：

- 注册内置主题
- 校验并读取主题 id
- 将 `ui` token 转成 CSS 变量
- 将 `syntax` token 转成代码高亮主题
- 将当前主题应用到 `document.documentElement`

App 启动后会：

1. 从 `localStorage` 读取上次选择的主题
2. 应用到 `document.documentElement`
3. 把当前主题同步传给终端与代码预览

## 命令面板入口

全局命令面板通过以下快捷键打开：

- macOS：`⌘⇧P`
- Windows / Linux：`Ctrl+Shift+P`

当前只开放一个顶层命令：

- `Preferences: Color Theme`

选择后会进入主题列表，选中任意主题会立即应用并持久化。

主题列表会按 `Dark` / `Light` 分组展示，避免深浅主题混在一起不好找。

实现文件：

- `src/components/command-palette.tsx`
- `src/App.tsx`

## 新增主题的方式

新增主题时只需要：

1. 在 `src/themes/` 下新增一个 JSON 文件
2. 在 `src/features/theme/theme-registry.ts` 中注册它，并放到合适的展示顺序里
3. 确保补齐 `ui`、`terminal`、`syntax` 三段 token

不要再在组件里新增硬编码颜色；优先补 token，再消费 token。
