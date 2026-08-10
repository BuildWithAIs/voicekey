# pages/

## Microphone Selection

`SettingsPage.tsx` detects available audio-input devices in the renderer, lets
the user persist a selected microphone, and keeps the system default as the
unchanged fallback.

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘，显示 PTT 提示、历史统计汇总与区间趋势图。
- `SettingsPage.tsx` - 设置页：语言切换即时生效，其余设置走防抖自动保存；展示版本与更新状态，管理本地 SenseVoiceSmall/GLM ASR 切换（含本地模型按需下载与低音量模式）、DeepSeek/OpenRouter Provider-first 文本润色与翻译配置、OpenRouter 固定模型选择、旧版 custom-compatible 配置保留、整体输出英文开关、翻译/润色目标语言、连接校验/快捷键配置，支持开机自启后台启动开关；已保存或刚保存的 API Key 仅显示占位符，检测到旧版 `enc:` 密文时提示重新输入 Key，并提供日志查看入口。
- `settings-config.ts` - 设置页配置归一化与保存后密钥遮罩同步；仅替换本次已保存且未再次编辑的密钥，避免 IPC 往返覆盖并发输入。
- `settings-config.test.ts` - 设置页保存后密钥遮罩与并发编辑保留回归测试。
- `HistoryPage.tsx` - 历史记录页：搜索、排序、分组与首屏优先渲染，支持复制、删除与清空。
