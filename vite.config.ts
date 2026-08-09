import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pkg from './package.json'

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
          entry: {
            main: 'electron/main/main.ts',
            'local-asr-worker': 'electron/main/local-asr-worker.ts',
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              emptyOutDir: false,
              rolldownOptions: {
                output: {
                  format: 'esm',
                  entryFileNames: '[name].mjs',
                },
                external: [
                  '@nut-tree-fork/nut-js',
                  'uiohook-napi',
                  'fluent-ffmpeg',
                  '@ffmpeg-installer/ffmpeg',
                  'sherpa-onnx',
                ],
              },
            },
          },
        },
        preload: {
          input: path.join(__dirname, 'electron/preload/preload.ts'),
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: isDev,
              emptyOutDir: false,
              rolldownOptions: {
                output: {
                  format: 'cjs',
                  entryFileNames: 'preload.cjs',
                },
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
