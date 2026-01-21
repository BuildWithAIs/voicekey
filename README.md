# Voice Key

Desktop voice-to-text transcription app with global hotkey support and automatic text injection.

## Features

- **Push-to-Talk**: Hold Space (or custom key) to record voice
- **Voice Transcription**: GLM ASR integration for speech-to-text
- **Auto Injection**: Simulates keyboard input to inject text into any application
- **Global Hotkeys**: Works system-wide using low-level keyboard hooks
- **Settings UI**: Configure API keys, language, and recording options

## Tech Stack

**Core**

- Electron 30 + Vite + React 18 + TypeScript
- shadcn/ui (Radix primitives) + Tailwind CSS

**Audio & Input**

- `uiohook-napi`: Global keyboard hooks for PTT
- `@nut-tree-fork/nut-js`: Cross-platform text injection
- `fluent-ffmpeg`: Audio format conversion (WAV → MP3)

**Data & Config**

- `electron-store`: Persistent configuration
- `zustand`: Client-side state management

## Development

```bash
npm run dev           # Start dev server with hot reload
npm run build         # Build production app
npm run quality       # Run all checks (lint + format + type-check)
```

## Release Workflow

Tagging a version (e.g. `v0.1.0`) triggers GitHub Actions to build unsigned macOS and Windows
installers and draft a release with the artifacts attached. The workflow lives in
`.github/workflows/release.yml`.

## Project Structure

```
.
├── electron/
│   ├── main/           # Main process (Node.js)
│   │   ├── main.ts              # App lifecycle & IPC handlers
│   │   ├── hotkey-manager.ts    # Global hotkey registration
│   │   ├── iohook-manager.ts    # Low-level keyboard hooks (PTT)
│   │   ├── asr-provider.ts      # ASR service integration
│   │   ├── text-injector.ts     # Keyboard simulation
│   │   └── config-manager.ts    # Settings persistence
│   ├── preload/        # IPC bridge
│   └── shared/         # Types & constants
└── src/
    ├── components/     # React components
    ├── pages/          # Routes (Home, Settings, History)
    └── layouts/        # App shell
```

## Implementation Status

| Module         | Status | Notes                             |
| -------------- | ------ | --------------------------------- |
| Hotkey Manager | ✅     | Global hooks via `uiohook-napi`   |
| Audio Recorder | ✅     | Web Audio API + FFmpeg conversion |
| ASR Provider   | 🟡     | GLM only (multi-provider planned) |
| Text Injector  | ✅     | Cross-platform via `nut-js`       |
| Settings UI    | ✅     | React + electron-store            |
| HUD Overlay    | ❌     | Uses system notifications         |

## Configuration

Settings are stored in `~/.config/voice-key/config.json` (or OS-specific path).

Required:

- GLM API Key ([get one here](https://open.bigmodel.cn/))

Optional:

- Language preference (default: auto-detect)
- Custom ASR endpoint

## License

This project is licensed under the [Elastic License 2.0](LICENSE).
