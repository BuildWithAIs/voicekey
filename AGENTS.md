# Voice Key Development Guide

## Overview

Voice Key is an Electron + React + TypeScript desktop app for push-to-talk voice
input, transcription, optional text refinement/translation, history, and text
injection into the focused application.

## Current Structure

```text
voicekey/
  electron/
    main/
      audio/          Recording session lifecycle, chunk conversion, ASR pipeline.
      hotkey/         Hotkey parsing and push-to-talk bindings.
      ipc/            Config, session, history, log, updater, and overlay IPC handlers.
      notification/   System notification wrapper.
      refine/         OpenAI-compatible text refinement and glossary cache.
      translation/    Selected-text translation workflow.
      tray/           Tray menu and localized labels.
      window/         Hidden recorder, settings, and HUD windows.
      asr-provider.ts Local SenseVoice transcription provider.
      config-manager.ts electron-store config and encrypted API key migration.
      history-manager.ts Transcript history and stats storage.
      iohook-manager.ts Low-level keyboard hook integration.
      local-asr-manager.ts On-demand local SenseVoice model download and sherpa runtime.
      main.ts        App startup, services, windows, tray, IPC, and hotkeys.
      text-injector.ts nut-js based text injection.
      updater-manager.ts GitHub Releases update checks.
    preload/         contextBridge API exposed to renderer windows.
    shared/          Shared constants, types, i18n resources, and URL helpers.
  src/
    components/      React UI, HUD, recorder bridge, charts, logs, and hotkey widgets.
    components/ui/   shadcn/ui primitives.
    layouts/         Main app shell.
    lib/             Renderer utilities, stats, logger, theme, hotkey helpers.
    pages/           Home, Settings, and History routes.
    App.tsx          Window-type routing for settings, HUD, and hidden recorder.
    main.tsx         Renderer entrypoint.
  website/           Astro static marketing site for GitHub Pages.
  public/            Desktop app static assets.
  build/             Installer icons and packaging assets.
```

Key root config files:

- `package.json` / `package-lock.json` - root npm scripts and app dependencies.
- `vite.config.ts` - React renderer plus Electron main/preload builds.
- `electron-builder.json5` - packaging config.
- `eslint.config.mjs`, `prettier.config.mjs`, `commitlint.config.js` - quality tooling.
- `components.json` - shadcn/ui configuration.

## Documentation Rules

Directory `README.md` files are part of the working map for this repo.

When reading code:

1. Read the target directory `README.md` before opening implementation files.
2. Read parent READMEs if the ownership or flow is unclear.
3. Use README file descriptions as a map, then verify against live code.

When changing code:

1. Update the relevant directory README when file purpose, behavior, exports, or
   directory structure changes materially.
2. Keep README descriptions concise and current; do not preserve historical plans.
3. If adding a new directory, add a short README for it.

## Commands

Development:

```bash
npm run dev
npm run preview
```

Build:

```bash
npm run build
```

Quality:

```bash
npm run lint
npm run lint:fix
npm run format
npm run format:check
npm run type-check
npm run quality
```

Website:

```bash
npm run website:install
npm run website:dev
npm run website:build
npm run website:preview
```

Single-file examples:

```bash
npm run lint -- src/App.tsx
npm run lint -- electron/main/
npm run format -- src/App.tsx
npm run type-check
```

## Code Style

- Prettier: no semicolons, single quotes, trailing commas, 100-column width,
  2-space indentation, final newline.
- TypeScript strict mode is enabled.
- Avoid `any`; use concrete types or `unknown`.
- Unused parameters should be prefixed with `_`.
- Prefer existing module boundaries and helper APIs over new abstractions.
- Keep main-process ownership of privileged operations: filesystem, config,
  hotkeys, ASR, refinement, translation, history, updater, and text injection.
- Validate IPC payloads in the main process before using renderer-provided data.

## UI And Styling

- Follow `src/index.css` theme variables.
- Use existing shadcn/ui primitives and local component patterns.
- Keep settings and operational UI dense, clear, and task-focused.
- Avoid marketing-page patterns inside the desktop app shell.

## Security And Privacy

- Treat renderer data as untrusted at IPC boundaries.
- Do not log API keys, transcript bodies, or raw audio contents.
- Keep API keys in main-process config and never expose plaintext credentials to renderer windows; persistence deliberately avoids OS credential stores so managed macOS Keychains cannot block the app.
- Preserve the GitHub Releases URL allowlist for update links.
- Local ASR model assets stay under `app.getPath('userData')`, not bundled into
  the installer.

## Windows Encoding

Use UTF-8 for files and I/O. PowerShell may display Chinese text as mojibake;
verify with UTF-8-aware reads before concluding file content is corrupt.
