import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()] as any,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
    },
  },
  test: {
    name: 'renderer',
    globals: false,
    environment: 'happy-dom',
    setupFiles: ['./test/setup.renderer.ts'],
    include: ['src/**/__tests__/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'dist-electron', '.idea', '.git', '.cache', 'website/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'main',
          environment: 'node',
          setupFiles: ['./test/setup.main.ts'],
          include: ['electron/**/__tests__/**/*.{test,spec}.ts', 'electron/**/*.{test,spec}.ts'],
          exclude: ['src/**'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'dist-electron/',
        'website/**',
        'test/',
        '**/*.d.ts',
        '**/*.config.{ts,js}',
        '**/mockData',
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
  },
})
