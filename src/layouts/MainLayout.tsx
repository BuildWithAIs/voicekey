import { ReactNode, useEffect, useState } from 'react'
import { Home, Settings, History, Sun, Moon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/useTheme'
import { VoiceWave } from '@/components/VoiceWave'
import { HotkeyKeys } from '@/components/HotkeyKeys'

interface MainLayoutProps {
  children: ReactNode
  currentRoute: string
}

/** 可重新着色的品牌 V 标记。 */
function VMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5.4 5 L12 18.4 L18.6 5"
        stroke="currentColor"
        strokeWidth={4.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function MainLayout({ children, currentRoute }: MainLayoutProps) {
  const { t } = useTranslation()
  const { theme, setTheme } = useTheme()
  const [pttKey, setPttKey] = useState('')

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .getConfig()
      .then((config) => {
        if (!cancelled) setPttKey(config?.hotkey?.pttKey ?? '')
      })
      .catch((error) => console.error('Failed to load config:', error))
    return () => {
      cancelled = true
    }
  }, [])

  const navigate = (path: string) => {
    window.location.hash = path
  }
  const isMac = window.electronAPI.platform === 'darwin'
  const fallbackPtt = isMac ? 'Alt' : 'Control+Shift+Space'

  const navItems = [
    { path: '/home', label: t('nav.home'), icon: Home },
    { path: '/settings', label: t('nav.settings'), icon: Settings },
    { path: '/history', label: t('nav.history'), icon: History },
  ]

  return (
    <div className="flex h-screen flex-col bg-sidebar">
      {/* 顶部拖拽区域（macOS 交通灯留白） */}
      {isMac ? <div className="drag-region h-12 shrink-0 bg-sidebar" /> : null}

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧栏 */}
        <aside className="flex w-[232px] flex-col bg-sidebar px-3.5 pb-4">
          {/* 品牌 */}
          <div className="no-drag flex items-center gap-2.5 px-2 pb-4 pt-1">
            <span className="vk-brand-gradient grid h-9 w-9 place-items-center rounded-[11px] text-white shadow-[0_10px_22px_-8px_var(--primary)]">
              <VMark className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-[15px] font-bold tracking-tight text-sidebar-foreground">
                {t('app.name')}
              </span>
              <span className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                {t('app.tagline')}
              </span>
            </span>
          </div>

          {/* 导航 */}
          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive =
                currentRoute === item.path ||
                (currentRoute === '/' && item.path === '/home') ||
                (currentRoute === '' && item.path === '/home')
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={cn(
                    'no-drag relative flex cursor-pointer items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium transition-colors',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'text-sidebar-foreground/70 hover:bg-accent hover:text-sidebar-foreground',
                  )}
                >
                  {isActive && (
                    <span className="absolute -left-3.5 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                  )}
                  <Icon className="h-[18px] w-[18px] opacity-90" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="flex-1" />

          {/* 待命状态卡 */}
          <div className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-secondary-foreground">
              <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-green-500" />
              {t('home.hero.standby')}
            </div>
            <div className="my-2.5 h-[26px] text-primary">
              <VoiceWave bars={22} active={false} level={0.5} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{t('home.hero.holdToTalk')}</span>
              <HotkeyKeys value={pttKey || fallbackPtt} />
            </div>
          </div>

          {/* 版本 + 主题切换 */}
          <div className="mt-3 flex items-center justify-between px-1">
            <span className="font-mono text-[11px] text-muted-foreground">v{__APP_VERSION__}</span>
            <div className="no-drag flex items-center gap-0.5 rounded-full border bg-secondary p-0.5">
              <button
                onClick={() => setTheme('light')}
                title={t('theme.light')}
                className={cn(
                  'grid h-[22px] w-[26px] cursor-pointer place-items-center rounded-full transition-colors',
                  theme === 'light'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Sun className="h-[14px] w-[14px]" />
              </button>
              <button
                onClick={() => setTheme('dark')}
                title={t('theme.dark')}
                className={cn(
                  'grid h-[22px] w-[26px] cursor-pointer place-items-center rounded-full transition-colors',
                  theme === 'dark'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Moon className="h-[14px] w-[14px]" />
              </button>
            </div>
          </div>
        </aside>

        {/* 右侧内容 */}
        <main className="flex-1 p-3 pl-0">
          <div className="h-full overflow-hidden rounded-2xl border bg-background">
            <div className="vk-scroll h-full overflow-auto">{children}</div>
          </div>
        </main>
      </div>
    </div>
  )
}
