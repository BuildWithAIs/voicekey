# pages/

## Microphone Selection

`SettingsPage.tsx` detects available audio-input devices in the renderer, lets
the user persist a selected microphone, and keeps the system default as the
unchanged fallback.

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘，显示 PTT 提示、历史统计汇总与区间趋势图。
- `SettingsPage.tsx` - 设置页：语言切换即时生效，其余设置走防抖自动保存；展示版本与更新状态，管理本地 SenseVoiceSmall 模型按需下载、麦克风和低音量模式，按 OpenAI → DeepSeek → OpenRouter 排列文本润色与翻译 Provider，提供官方 GPT-5.6 Luna/DeepSeek V4 Flash/固定 OpenRouter 模型选择、旧版 custom-compatible 配置保留、整体输出英文开关、翻译/润色目标语言、连接校验/快捷键配置及开机自启后台启动开关；启用润色、翻译快捷键或目标语言翻译前会验证当前润色连接，配置缺失或连接失败时保持关闭并提示用户；已保存或刚保存的 LLM API Key 默认显示占位符，点击眼睛时从主进程按需读取当前版本保存的原文，并提供日志查看入口。
- `settings-config.ts` - 设置页配置归一化、润色连接字段完整性判断与保存后密钥遮罩同步；仅替换本次已保存且未再次编辑的密钥，避免 IPC 往返覆盖并发输入。
- `settings-config.test.ts` - 设置页润色连接完整性、保存后密钥遮罩与并发编辑保留回归测试。
- `HistoryPage.tsx` - 历史记录页：搜索、排序、分组与首屏优先渲染，支持复制、删除与清空。
