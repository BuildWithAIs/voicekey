// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import react from '@astrojs/react'

// https://astro.build/config
export default defineConfig({
  // GitHub Pages 部署配置
  site: 'https://BuildWithAIs.github.io',
  base: '/voicekey',

  // 输出模式：静态生成
  output: 'static',

  // Vite 配置
  vite: {
    plugins: [tailwindcss()],
  },

  // 集成
  integrations: [react()],

  // i18n 配置
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
})
