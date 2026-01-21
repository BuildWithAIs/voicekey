import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import pluginReact from 'eslint-plugin-react'
import pluginReactHooks from 'eslint-plugin-react-hooks'
import pluginReactRefresh from 'eslint-plugin-react-refresh'

// Prettier 相关
import eslintPluginPrettier from 'eslint-plugin-prettier'
import eslintConfigPrettier from 'eslint-config-prettier'

export default tseslint.config(
  // ============================================
  // 1. 基础配置
  // ============================================

  // ESLint 官方推荐配置
  eslint.configs.recommended,

  // TypeScript ESLint 推荐配置
  ...tseslint.configs.recommended,

  // ============================================
  // 2. 全局变量配置（Electron 多环境支持）
  // ============================================
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser, // React 渲染进程
        ...globals.node, // Electron 主进程
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },

  // ============================================
  // 3. React 配置
  // ============================================
  {
    files: ['**/*.{jsx,tsx}'],
    plugins: {
      react: pluginReact,
      'react-hooks': pluginReactHooks,
      'react-refresh': pluginReactRefresh,
    },
    settings: {
      react: {
        version: 'detect', // 自动检测 React 版本
      },
    },
    rules: {
      // React 基础规则
      ...pluginReact.configs.recommended.rules,
      ...pluginReact.configs['jsx-runtime'].rules, // React 17+ JSX Transform

      // React Hooks 规则
      ...pluginReactHooks.configs.recommended.rules,
      'react-hooks/immutability': 'off',

      // React Refresh 规则（Vite HMR）
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // 自定义 React 规则
      'react/prop-types': 'off', // TypeScript 已处理类型检查
      'react/react-in-jsx-scope': 'off', // React 17+ 不需要导入 React
    },
  },

  // ============================================
  // 4. TypeScript 项目特定配置
  // ============================================
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // TypeScript 规则调整
      '@typescript-eslint/no-explicit-any': 'warn', // 警告而不是错误
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ============================================
  // 5. 通用代码质量规则
  // ============================================
  {
    rules: {
      // 控制台和调试器
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'warn',

      // 代码质量
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'warn',
      'prefer-arrow-callback': 'warn',

      // 避免错误
      'no-duplicate-imports': 'error',
      'no-template-curly-in-string': 'warn',
    },
  },

  // ============================================
  // 6. Electron 主进程特定配置
  // ============================================
  {
    files: ['electron/**/*.{js,ts}'],
    rules: {
      // 主进程允许 console
      'no-console': 'off',

      // 主进程可能需要 require
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // ============================================
  // 7. Prettier 配置（必须放在最后！）
  // ============================================

  // 禁用与 Prettier 冲突的规则
  eslintConfigPrettier,

  // 开启 Prettier 插件，将格式问题作为错误抛出
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      prettier: eslintPluginPrettier,
    },
    rules: {
      // 🔴 关键配置：Prettier 格式问题作为 ESLint 错误
      'prettier/prettier': 'error',
    },
  },

  // ============================================
  // 8. 全局忽略文件
  // ============================================
  {
    ignores: [
      // 构建输出
      'dist/',
      'dist-electron/',
      'build/',

      // 依赖
      'node_modules/',

      // 缓存和临时文件
      '*.tsbuildinfo',
      '.vscode/',
      '.idea/',

      // 系统文件
      '.DS_Store',
      'Thumbs.db',

      // 配置文件（可选择性检查）
      'vite.config.ts',
      'vitest.config.ts',
      'eslint.config.mjs',
      'prettier.config.mjs',
      'commitlint.config.js',

      // Electron Builder 输出
      'electron-builder-effective-config.yaml',

      // 日志
      '*.log',
      'npm-debug.log*',
    ],
  },
)
