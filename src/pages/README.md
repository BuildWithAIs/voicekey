# pages/

## Microphone Selection

`SettingsPage.tsx` detects available audio-input devices in the renderer, lets
the user persist a selected microphone, and keeps the system default as the
unchanged fallback.

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘，显示 PTT 提示、历史统计汇总与区间趋势图。
- `SettingsPage.tsx` - 设置页：语言切换即时生效，其余设置走防抖自动保存；展示版本与更新状态，管理本地 SenseVoiceSmall/GLM ASR 切换（含本地模型按需下载与低音量模式）、手动 OpenAI-compatible 文本润色 Base URL 配置、整体输出英文开关、翻译/润色目标语言与可清空编辑的 system prompt、醒目的轻量模型建议与连接校验/快捷键配置，支持开机自启后台启动开关、ASR 与润色 Key 明文显隐，并提供日志查看入口。
- `HistoryPage.tsx` - 历史记录页：搜索、排序、分组与首屏优先渲染，支持复制、删除与清空。
