import { useEffect, useState } from 'react'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import SettingsPage from './pages/SettingsPage'
import HistoryPage from './pages/HistoryPage'
import { AudioRecorder } from './components/AudioRecorder'
import { HUD } from './components/HUD'

function App() {
  const [currentRoute, setCurrentRoute] = useState(window.location.hash.slice(1) || '')

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(window.location.hash.slice(1) || '')
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 后台窗口（无 hash）：只渲染录音组件
  // backgroundWindow 加载 http://localhost:5173/ (无 hash)
  if (!currentRoute || currentRoute === '/') {
    return <AudioRecorder />
  }

  // Overlay 窗口
  if (currentRoute === '/overlay') {
    return <HUD />
  }

  // 其他窗口：渲染完整 UI
  const getPage = () => {
    switch (currentRoute) {
      case '/settings':
        return <SettingsPage />
      case '/history':
        return <HistoryPage />
      case '/home':
      default:
        return <HomePage />
    }
  }

  return <MainLayout currentRoute={currentRoute}>{getPage()}</MainLayout>
}

export default App
