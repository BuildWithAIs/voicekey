/**
 * 环境变量与路径配置
 *
 * 从 main.ts 提取，供所有主进程模块共享
 * 使用初始化函数避免模块顶层副作用
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 路径常量（惰性初始化）
let _appRoot = ''
let _mainDist = ''
let _rendererDist = ''
let _vitePublic = ''
let _initialized = false

/**
 * 初始化环境变量
 * 必须在应用启动时调用一次
 */
export function initEnv(): void {
  if (_initialized) {
    console.log('[Env] Already initialized, skipping')
    return
  }

  // 目录结构
  _appRoot = path.join(__dirname, '..')
  process.env.APP_ROOT = _appRoot

  _mainDist = path.join(_appRoot, 'dist-electron')
  _rendererDist = path.join(_appRoot, 'dist')

  _vitePublic = process.env['VITE_DEV_SERVER_URL'] ? path.join(_appRoot, 'public') : _rendererDist

  process.env.VITE_PUBLIC = _vitePublic

  _initialized = true
  console.log('[Env] Initialized:', {
    APP_ROOT: _appRoot,
    MAIN_DIST: _mainDist,
    RENDERER_DIST: _rendererDist,
    VITE_PUBLIC: _vitePublic,
    VITE_DEV_SERVER_URL: process.env['VITE_DEV_SERVER_URL'] || '(production)',
  })
}

/**
 * 检查是否已初始化，未初始化则抛出错误
 */
function ensureInitialized(): void {
  if (!_initialized) {
    throw new Error('[Env] Environment not initialized. Call initEnv() first in main.ts')
  }
}

// ============ 导出的常量（getter 函数） ============

/**
 * Vite 开发服务器 URL（开发模式）或 undefined（生产模式）
 */
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

/**
 * 应用根目录
 */
export function getAppRoot(): string {
  ensureInitialized()
  return _appRoot
}

/**
 * 主进程编译输出目录
 */
export function getMainDist(): string {
  ensureInitialized()
  return _mainDist
}

/**
 * 渲染进程编译输出目录
 */
export function getRendererDist(): string {
  ensureInitialized()
  return _rendererDist
}

/**
 * 静态资源目录
 */
export function getVitePublic(): string {
  ensureInitialized()
  return _vitePublic
}
