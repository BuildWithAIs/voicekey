<div align="center">
  <a href="https://github.com/BuildWithAIs/voicekey">
    <img src="imgs/logo.png" alt="Voice Key logo" width="96" height="96">
  </a>

  <h1>Voice Key</h1>

  <p><strong>Privacy-first push-to-talk voice input for Windows, macOS, and Linux.</strong></p>

  <p>
    Hold a hotkey, speak, and release. Voice Key transcribes on your device, optionally cleans up
    the text with your own LLM provider, and inserts the result into the focused application.
  </p>

  <p>
    <a href="README.zh-CN.md">简体中文</a>
    · <a href="https://buildwithais.github.io/voicekey/">Website</a>
    · <a href="https://github.com/BuildWithAIs/voicekey/releases/latest">Download</a>
    · <a href="https://github.com/BuildWithAIs/voicekey/issues">Issues</a>
  </p>

  <p>
    <a href="https://github.com/BuildWithAIs/voicekey/actions/workflows/ci.yml"><img src="https://github.com/BuildWithAIs/voicekey/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
    <a href="https://github.com/BuildWithAIs/voicekey/releases/latest"><img src="https://img.shields.io/github/v/release/BuildWithAIs/voicekey" alt="Latest release"></a>
    <a href="LICENSE"><img src="https://img.shields.io/github/license/BuildWithAIs/voicekey" alt="MIT license"></a>
    <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-2f363d" alt="Supported platforms">
  </p>
</div>

> [!NOTE]
> Voice Key is under active development. Current release builds are not code-signed, so Windows
> SmartScreen or macOS Gatekeeper may show a warning during installation.

## Why Voice Key

Voice Key turns speech into text without changing the way you work. It stays in the background,
starts recording only while you hold the push-to-talk key, and pastes the final text wherever your
cursor is active.

- **Local-first transcription** — raw audio is processed on your device with downloadable ONNX
  models; no ASR API key is required.
- **Two recognition modes** — choose a compact classic workflow or live partial transcription with
  local punctuation.
- **Optional text cleanup** — connect OpenAI, DeepSeek, OpenRouter, or a custom OpenAI-compatible
  endpoint using your own API key.
- **Translation in place** — translate selected text and replace it in the current application with
  a dedicated shortcut.
- **Desktop-native workflow** — configurable global hotkeys, microphone selection, a status HUD,
  launch-at-login support, update checks, and focused-app text injection.
- **Local history** — search, copy, inspect, and delete recent transcripts; records are retained on
  the device for up to 90 days.
- **English and Chinese interface** — switch the application language from Settings.

## How it works

```text
Hold the PTT hotkey
        ↓
Capture microphone audio
        ↓
Run local speech recognition
        ↓
Optionally refine or translate the final text with your LLM provider
        ↓
Insert the result into the focused application and save local history
```

The Electron main process owns microphone sessions, model files, hotkeys, credentials, history,
updates, and text injection. Speech recognition runs in worker threads so model inference does not
block the application UI.

### Recognition modes

| Mode          | Local models                                                     | Experience                                                                                | Approximate download |
| ------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| **Classic**   | SenseVoiceSmall int8                                             | Transcribes after recording; best for a compact, simple setup                             | 240 MB               |
| **Streaming** | Streaming Paraformer bilingual int8 + CT-Transformer punctuation | Shows partial text while speaking and adds Chinese/English punctuation locally at the end | 298 MB               |

The modes are mutually exclusive. Model files are downloaded only when requested from Settings,
stored under Electron's per-user application data directory, and verified against pinned file sizes
and SHA-256 hashes.

## Installation

Download the latest build from
[GitHub Releases](https://github.com/BuildWithAIs/voicekey/releases/latest).

| Platform                    | Package                         | Notes                                                  |
| --------------------------- | ------------------------------- | ------------------------------------------------------ |
| Windows x64                 | Installer (`.exe`)              | SmartScreen may warn because the package is unsigned.  |
| macOS Intel / Apple silicon | Disk image (`.dmg`)             | Microphone and Accessibility permissions are required. |
| Linux x86_64                | AppImage                        | Recommended for general Linux X11 distributions.       |
| Omarchy / Arch Linux x86_64 | pacman package (`.pkg.tar.zst`) | Includes a managed Hyprland integration workflow.      |

### First run

1. Open **Settings** and select a microphone.
2. Download either the **Classic** or **Streaming** local recognition model.
3. Optionally configure an LLM provider for transcript cleanup and translation.
4. Focus any text field, hold the push-to-talk hotkey, speak, and release to insert the result.

The default push-to-talk shortcut is `Control+Shift+Space` on Windows and Linux, and `Option`
(`Alt`) on macOS. All shortcuts can be changed in Settings.

### Windows

If SmartScreen appears, select **More info**, verify that the package came from this repository's
Releases page, and then select **Run anyway**.

### macOS

The application needs:

- **Microphone** access to record speech.
- **Accessibility** access to monitor the push-to-talk shortcut and insert text into other apps.

If macOS reports that the unsigned application is damaged, move it to `/Applications` and run:

```bash
xattr -cr "/Applications/Voice Key.app"
```

Then enable Voice Key under **System Settings → Privacy & Security → Accessibility**.

### Linux and Omarchy

For a general x86_64 Linux distribution, make the downloaded AppImage executable and launch it:

```bash
chmod +x "/path/to/Voice Key-Linux.AppImage"
"/path/to/Voice Key-Linux.AppImage"
```

Some recent distributions do not include FUSE 2 by default. If the AppImage reports a missing
`libfuse.so.2`, install your distribution's `fuse2` or `libfuse2` package, or use AppImage's
extract-and-run mode:

```bash
APPIMAGE_EXTRACT_AND_RUN=1 "/path/to/Voice Key-Linux.AppImage"
```

For Omarchy or Arch Linux, install the downloaded package:

```bash
sudo pacman -U "/path/to/voice-key-package.pkg.tar.zst"
```

On Omarchy/Hyprland, open **Settings → Linux & Omarchy Integration** and select
**Install integration**. Voice Key manages only a marked block in
`~/.config/hypr/bindings.lua`, checks for shortcut conflicts, keeps a backup, reloads Hyprland,
and rolls back the change if validation fails.

During text injection, the integration exposes temporary clipboard text through
`wl-copy --sensitive` and sends the paste shortcut with the `wtype` Wayland virtual keyboard. The
pacman package declares both tools as dependencies.

Linux X11 uses the standard global-keyboard and text-injection backend. Other Wayland compositors
do not yet provide complete push-to-talk press/release support; use an X11 session if you are not
running the supported Hyprland integration path.

## Privacy and data flow

Local transcription does not upload microphone audio. Optional cloud features have a narrower,
explicit scope:

- **Transcript cleanup** sends the final recognized text—not the raw audio—to the configured LLM
  provider.
- **Translation** sends the selected text to that provider and replaces the selection with the
  response.
- **History and model files** remain in the application's local user-data directory.
- **API keys** are managed by the Electron main process and are excluded from application logs.

If you need a fully offline workflow, leave transcript cleanup and translation disabled.

## Build from source

### Prerequisites

- [Node.js 20](https://nodejs.org/)
- npm
- Platform build tools required by Electron's native dependencies

### Development

```bash
git clone https://github.com/BuildWithAIs/voicekey.git
cd voicekey
npm ci
npm run dev
```

Useful commands:

```bash
npm run quality       # lint, formatting, type checks, and tests
npm run type-check    # TypeScript only
npm test              # unit tests
npm run build         # production build and platform package
```

Packaged artifacts are written to `release/<version>/`. The marketing website is an independent
Astro project under `website/`; use the `website:*` npm scripts to work on it.

## Project structure

```text
electron/
  main/       Electron lifecycle, audio, ASR, hotkeys, LLM workflows, history, and injection
  preload/    Typed contextBridge API exposed to renderer windows
  shared/     Cross-process types, constants, model metadata, and localization
src/
  components/ React UI, recorder bridge, HUD, charts, and reusable primitives
  pages/      Home, Settings, and History screens
website/      Astro marketing site for GitHub Pages
public/       Runtime assets used by the desktop renderer
build/        Installer icons and packaging resources
```

Directory-level README files provide a more detailed ownership map. Start with
[`electron/README.md`](electron/README.md) and [`src/README.md`](src/README.md) when tracing a
runtime or UI change.

## Contributing

Contributions are welcome. Before opening a pull request:

1. Search [existing issues](https://github.com/BuildWithAIs/voicekey/issues) or open a focused issue
   for a bug or proposal.
2. Keep privileged operations in the Electron main process and validate renderer-provided IPC
   payloads.
3. Update the relevant directory README when behavior or module ownership changes materially.
4. Run `npm run quality` and include the platforms or runtime paths you verified in the PR.
5. Use a [Conventional Commits](https://www.conventionalcommits.org/) style commit message.

Please do not include API keys, transcript contents, or raw recordings in issues or logs.

## License

Voice Key is available under the [MIT License](LICENSE).
