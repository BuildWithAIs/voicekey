# pages/

## Microphone Selection

`SettingsPage.tsx` detects available audio-input devices in the renderer, lets
the user persist a selected microphone, and keeps the system default as the
unchanged fallback. If Chromium or the OS replaces a saved device ID,
Settings automatically rebinds it only when exactly one currently available
device has the same exposed label; ambiguous duplicate labels still require an
explicit user choice.

路由页面组件目录。

## 文件

- `HomePage.tsx` - 首页仪表盘，显示 PTT 提示、历史统计汇总与区间趋势图。
- `SettingsPage.tsx` - 设置页：语言切换即时生效，其余设置防抖自动保存；用产品化文案分别管理标准与实时识别模型，支持按需下载、查看/打开统一存储目录、确认后删除，并在删除实时模型时同步关闭实时识别；本机低于实时识别建议配置时仅在下载前确认一次但不拦截；同时管理麦克风、低音量模式、版本更新、快捷键、开机自启、Linux/Omarchy 集成状态与安全安装/更新/移除，以及 OpenAI/DeepSeek/OpenRouter 文本润色与翻译连接、固定模型、密钥按需显示和 Provider 切换校验。
- `settings-config.ts` - 设置页配置归一化、润色连接字段完整性判断、连接变更后的润色功能开关 reconcile（完整保留/恢复、不完整快照后关闭）、按连接指纹（provider/端点/模型/密钥）短时缓存连接检测结果（TTL 内切回不再重复实测）与保存后密钥遮罩同步；仅替换本次已保存且未再次编辑的密钥，避免 IPC 往返覆盖并发输入。
- `settings-config.test.ts` - 设置页润色连接完整性、Provider 切换功能开关 reconcile、连接指纹稳定性/失效与检测缓存 TTL、保存后密钥遮罩与并发编辑保留回归测试。
- `HistoryPage.tsx` - 历史记录页：搜索、排序、分组与首屏优先渲染，支持复制、删除与清空。
