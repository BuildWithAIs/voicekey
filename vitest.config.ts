import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseExclude = [
  'node_modules',
  'dist',
  'dist-electron',
  '.idea',
  '.git',
  '.cache',
  'website/**',
]

export default defineConfig({
  plugins: [react()] as any,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
    },
  },
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'dist-electron/',
        'website/**',
        'test/**',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/mockData',
        'src/components/ui/**',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'threads',
    maxWorkers: 4,
    mockReset: true,
    restoreMocks: true,
    projects: [
      {
        test: {
          name: 'renderer',
          environment: 'happy-dom',
          setupFiles: ['./test/setup.renderer.ts'],
          include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
          exclude: baseExclude,
        },
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
            '@electron': path.resolve(__dirname, './electron'),
          },
        },
      },
      {
        test: {
          name: 'main',
          environment: 'node',
          setupFiles: ['./test/setup.main.ts'],
          include: ['electron/**/__tests__/**/*.{test,spec}.ts', 'electron/**/*.{test,spec}.ts'],
          exclude: [...baseExclude, 'src/**'],
        },
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
            '@electron': path.resolve(__dirname, './electron'),
          },
        },
      },
    ],
  },
})
