# main/

## Microphone Selection

The selected microphone is stored by `config-manager.ts` as part of ASR config.
`audio/session-manager.ts` reads that value when a recording session starts and
forwards the device ID to the hidden recording renderer. An empty value keeps the
existing system-default microphone behavior.

Electron 主进程目录，负责窗口管理、IPC、录音编排、ASR/润色调用与文本注入。

## 文件列表

- `main.ts` - 应用入口，初始化窗口、托盘、IPC、服务与录音流程；经典本地 ASR Provider 首次使用时再初始化；仅打包后的应用注册系统开机自启，Windows/macOS 使用 Electron 登录项，Linux 使用用户级 XDG autostart，开发环境不会写入裸 Electron 启动项。
- `i18n.ts` - 主进程 `i18next` 初始化与语言广播。
- `env.ts` - 开发/生产环境资源路径解析。
- `config-manager.ts` - 基于 `electron-store` 的配置持久化，含旧版润色 Base URL 配置到 OpenAI/DeepSeek/OpenRouter/custom-compatible 的迁移与润色输出英文开关迁移；各 Provider 独立保存 API Key，普通配置读取只返回占位符，设置窗口可通过受限 IPC 按需读取原文；无法读取的旧版 `enc:` 密文不会作为有效 Key 使用。
- `logger.ts` - `electron-log` 初始化与日志保留策略。
- `history-manager.ts` - 转录历史存储与统计。
- `hotkey-manager.ts` - Electron `globalShortcut` 管理。
- `iohook-manager.ts` - Windows、macOS 与 Linux X11 的 `uiohook-napi` 键盘监听；原生模块按需加载，Hyprland Wayland 不初始化该后端。
- `asr-provider.ts` - 本地 ASR Provider 入口，调用 SenseVoiceSmall int8 并规范化识别结果。
- `asr-model-storage.ts` - 统一管理 `userData/local-asr` 模型根目录；支持从设置页打开目录，并仅允许递归删除白名单中的直接子目录。
- `asr-model-storage.test.ts` - 模型删除路径保护回归测试，覆盖允许的直接子目录以及根目录、嵌套目录和目录外路径拒绝。
- `download-sources.ts` - 按配置顺序尝试模型下载源；首选源失败后自动切换备用源，全部失败才返回错误。
- `local-asr-manager.ts` - 经典模式的 SenseVoiceSmall int8 ONNX 模型状态检测、原路径按需下载、SHA-256 校验、显式删除与 worker 线程中文识别；连续 20 分钟无任务时释放模型内存，删除前也会先终止 worker。
- `local-asr-worker.ts` - Worker 线程内创建并缓存 `sherpa-onnx` recognizer，执行模型校验与本地 WAV 转写，避免阻塞主进程。
- `streaming-asr-manager.ts` - 管理 Streaming Paraformer 与 CT-Transformer 标点模型目录，复用已安装权重并只补下载缺少的组件；负责校验、显式成组删除、流式会话、PCM 队列、最终标点编排和 Paraformer worker 的 20 分钟空闲卸载。
- `streaming-asr-worker.ts` - Worker 线程内缓存在线 Paraformer recognizer，顺序接收 PCM、处理端点、合并分段并输出低延迟 partial 与原始 final text。
- `streaming-punctuation-manager.ts` - 录音开始时并行预热独立标点 worker，final text 补标点后立即终止 worker 归还 WASM 内存；校验、失败和取消路径也保证释放。
- `streaming-punctuation-worker.ts` - Worker 线程内运行 CT-Transformer 中英标点模型；规范化异常重复的句末标点，并校验去除标点后的文本内容完全一致，避免模型误删词语。
- `streaming-punctuation-text.ts` - 标点输出规范化和内容一致性校验的纯函数，便于独立回归测试。
- `refine/` - 文本润色模块，使用 OpenAI-compatible Chat Completions 做后处理、动态 prompt 组装、远程术语表缓存刷新与连接校验。
- `translation/` - 文本翻译模块，通过快捷键复制选中文本 → LLM API 翻译 → 粘贴替换，复用润色 API 配置。
- `text-injector.ts` - 跨平台文本注入入口；Windows/macOS/Linux X11 按需加载 `@nut-tree-fork/nut-js`，Omarchy/Hyprland 使用短暂存活的 `wl-copy --sensitive` 剪贴板与 `wtype` Wayland 虚拟键盘以保证多语言和多行文本保真，并避开 Electron Wayland 剪贴板所有权及输入法虚拟键盘导致的 Hyprland 按键名解析失败。
- `updater-manager.ts` - GitHub Releases 更新检查。
- `audio/` - 录音会话与分段转写流水线。
- `hotkey/` - 快捷键解析与 PTT 行为绑定。
- `tray/` - 托盘菜单与本地化刷新。
- `window/` - 后台窗口、设置窗口与 HUD 管理。
- `notification/` - 系统通知封装。
- `ipc/` - IPC 处理器模块。
- `platform/` - Linux 会话检测、Hyprland socket2/受管理配置、合成器剪贴板快捷键、XDG 自启动与延迟原生键盘后端。
