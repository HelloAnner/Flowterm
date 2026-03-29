# macOS 安装链路

## 目标

`make install` 在 macOS 上承担桌面应用安装职责，而不是只安装前端依赖。

执行后应完成以下动作：

- 先检查并补齐前端依赖，避免因为 `node_modules` 过期导致 Tauri 构建失败
- 调用 Tauri 构建产出 macOS `.app` bundle
- 将最新产物安装到应用目录，默认使用 `/Applications`
- 如果目标目录里已经存在同名 `.app`，先移除旧版本，再安装新版本

## 边界

- 仅支持 macOS；非 macOS 环境直接失败，并给出明确提示
- 默认应用名来自 `src-tauri/tauri.conf.json` 的 `productName`
- 安装目录允许通过 `FLOWTERM_INSTALL_DIR` 覆盖，便于无 sudo 场景安装到 `~/Applications`

## 实现约束

- `Makefile` 里保留独立的依赖安装目标，不再让 `install` 与 “仅安装依赖” 语义混淆
- 具体安装逻辑收敛到单一脚本，便于测试和后续维护
- 替换安装时使用系统可识别的 `.app` 复制方式，保证 bundle 结构完整
