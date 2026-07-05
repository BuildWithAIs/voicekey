import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 新增
import pkg from './package.json'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    plugins: [
      react(),
      tailwindcss(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`.
          entry: 'electron/main/main.ts',
          vite: {
            build: {
              rollupOptions: {
                output: {
                  format: 'esm',
                  entryFileNames: 'main.mjs',
                },
                external: [
                  '@nut-tree-fork/nut-js',
                  'uiohook-napi',
                  'node-record-lpcm16',
                  'fluent-ffmpeg',
                  '@ffmpeg-installer/ffmpeg',
                  'sherpa-onnx',
                ],
              },
            },
          },
        },
        preload: {
          // Shortcut of `build.rollupOptions.input`.
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
          input: path.join(__dirname, 'electron/preload/preload.ts'),
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: isDev,
              emptyOutDir: false,
              rollupOptions: {
                output: {
                  format: 'cjs', // Preload 必须是 CJS，Electron 沙箱不支持 ESM
                  entryFileNames: 'preload.cjs',
                },
                // preload 里如果也引用到 native/二进制相关，同样 external
                external: [
                  '@nut-tree-fork/nut-js',
                  'uiohook-napi',
                  'fluent-ffmpeg',
                  '@ffmpeg-installer/ffmpeg',
                ],
              },
            },
          },
        },
        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: {},
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@electron': path.resolve(__dirname, './electron'),
      },
    },
  }
})
