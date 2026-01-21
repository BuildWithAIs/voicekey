# ui/

shadcn/ui 组件库，基于 Radix UI 原语构建的可复用 UI 组件集合。

## 组件列表

所有组件使用 Tailwind CSS 样式，支持主题变量和响应式设计。

### 布局组件

- `card.tsx` - 卡片容器（Card, CardHeader, CardTitle, CardContent）
- `separator.tsx` - 分隔线

### 表单组件

- `button.tsx` - 按钮（多种变体：default, destructive, outline, secondary, ghost, link）
- `input.tsx` - 文本输入框
- `label.tsx` - 表单标签
- `select.tsx` - 下拉选择器
- `switch.tsx` - 开关切换

### 反馈组件

- `alert.tsx` - 警告/提示框
- `dialog.tsx` - 模态对话框
- `sonner.tsx` - Toast 通知（基于 Sonner 库）
- `tooltip.tsx` - 工具提示

### 数据展示

- `avatar.tsx` - 头像组件
- `badge.tsx` - 徽章标签
- `kbd.tsx` - 键盘按键显示
- `skeleton.tsx` - 骨架屏加载占位
- `spinner.tsx` - 加载动画

### 交互组件

- `command.tsx` - 命令面板（快捷键搜索）

## 使用方式

所有组件通过 `@/components/ui/xxx` 导入：

```tsx
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
```

## 主题

组件样式依赖 `src/index.css` 中定义的 CSS 变量，支持亮色/暗色主题切换。
