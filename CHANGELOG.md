# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.0.4](https://github.com/BuildWithAIs/voicekey-private/compare/v0.0.3...v0.0.4) (2026-01-19)

### [0.0.3](https://github.com/BuildWithAIs/voicekey-private/compare/v0.0.2...v0.0.3) (2026-01-19)

### Features

- add unified error handling and update logo ([9af08fd](https://github.com/BuildWithAIs/voicekey-private/commit/9af08fd5d253855f5e2d8e10a5849f22e7ba7b74))

### Bug Fixes

- update icon paths and use Vite asset import for logo ([24e316a](https://github.com/BuildWithAIs/voicekey-private/commit/24e316a876e7b24aa06b2deeb2342b4fc566c4e3))

### [0.0.2](https://github.com/BuildWithAIs/voicekey-private/compare/v0.0.1...v0.0.2) (2026-01-19)

### 0.0.1 (2026-01-19)

### Features

- add app logo and dock icon support ([b352436](https://github.com/BuildWithAIs/voicekey-private/commit/b3524368e73e91403f60f91474b04b26659c94eb))
- add more shadcn/ui components ([bf70383](https://github.com/BuildWithAIs/voicekey-private/commit/bf70383cea06854d965d1f943b7d344923a1e84f))
- add shadcn/ui components (avatar, dialog, select, command, kbd, sonner, spinner) ([a182b15](https://github.com/BuildWithAIs/voicekey-private/commit/a182b15542c34e83081dd9bf59bc02bf86e0b845))
- adjust css ([791202b](https://github.com/BuildWithAIs/voicekey-private/commit/791202b50f73cb14f439ceeab4e7045a165f4fc0))
- **build:** configure electron-builder and vite for production ([cb27007](https://github.com/BuildWithAIs/voicekey-private/commit/cb270070d0708266e5024328d159a682c41a4547))
- **history:** add transcription history feature ([0b72094](https://github.com/BuildWithAIs/voicekey-private/commit/0b72094a100afb1ce4367ddf19cd94e0070e63db))
- **hotkey:** add configurable hotkey settings UI ([7b9cb51](https://github.com/BuildWithAIs/voicekey-private/commit/7b9cb518cb9288660ac1faba3512cb9e3b1314cb))
- **hotkey:** add debounce to prevent accidental PTT trigger ([ab71733](https://github.com/BuildWithAIs/voicekey-private/commit/ab71733488591ee5417ef6135dd5da18e1fa9fe2))
- **hotkey:** enhance key detection and accelerator parsing ([fbbb28b](https://github.com/BuildWithAIs/voicekey-private/commit/fbbb28b925b3989911ee177d780259906c38a27b))
- **hotkey:** implement PTT key release detection with uiohook ([e31d5c1](https://github.com/BuildWithAIs/voicekey-private/commit/e31d5c1547731fcadcb466d0ab33591305adb569))
- Implement initial Electron voice-to-text application with audio recording, settings management, hotkey support, and ASR integration. ([869ae37](https://github.com/BuildWithAIs/voicekey-private/commit/869ae37c37ca89a7a6cb45083082b6e941799f0c))
- integrate Tailwind CSS v4 and shadcn/ui ([fa76c93](https://github.com/BuildWithAIs/voicekey-private/commit/fa76c931351fbcd29ffef42aaa088c5fc02c4186))
- make settings window fullscreen and optimize macOS behavior ([94b7c2d](https://github.com/BuildWithAIs/voicekey-private/commit/94b7c2dab63d57a99c5f2c39595ea515e3082389))
- redesign home page UI with Tailwind theme ([6d1801a](https://github.com/BuildWithAIs/voicekey-private/commit/6d1801aeb5f6c30520ed59b127337315c996b283))
- **ui:** replace notifications with recording status overlay ([1c9e949](https://github.com/BuildWithAIs/voicekey-private/commit/1c9e9493dffe9425dd4224a58fe307b119655930))

### Bug Fixes

- address code review feedback ([2434524](https://github.com/BuildWithAIs/voicekey-private/commit/24345248b8c9d9fe15ad6b46de8a3db6f504e21e))
- code review issue ([3d77e17](https://github.com/BuildWithAIs/voicekey-private/commit/3d77e174d405f55c426fcf6776d81eb41cddce74))
- **history:** use recording duration instead of processing time ([be4dffb](https://github.com/BuildWithAIs/voicekey-private/commit/be4dffb0b6c638b809b858ba9b2631a6c759a87f))
- **hotkey:** use ref to avoid effect re-run on every keypress ([0120a94](https://github.com/BuildWithAIs/voicekey-private/commit/0120a944e4a3ca7b0d6a4772f87884b0184c4d4e))
- **hotkey:** validate single main key in hotkey combinations ([83b560f](https://github.com/BuildWithAIs/voicekey-private/commit/83b560fd7c601bf372a5830a2cbcf2b23819901e))
- **overlay:** enable interactive buttons with selective mouse event forwarding ([d2ff995](https://github.com/BuildWithAIs/voicekey-private/commit/d2ff995a46d611480c9fdb4f2a676c4906851636))
- **overlay:** optimize resource release and waveform generation ([c02f6bd](https://github.com/BuildWithAIs/voicekey-private/commit/c02f6bd9572b51ceac1e44fd93f96a9ee623701a))
- **recording:** properly release media resources to prevent microphone occupation ([cde3f9b](https://github.com/BuildWithAIs/voicekey-private/commit/cde3f9bd3a0cdf5f0c00a6a25c6d023a8c7d7528))
- **settings:** avoid overwriting hotkey config when saving ASR ([1d70faf](https://github.com/BuildWithAIs/voicekey-private/commit/1d70fafff5dcd198d5975696c5c1789c3bab5dd7))
- test connection with current config and reorganize docs ([62f1358](https://github.com/BuildWithAIs/voicekey-private/commit/62f13586ba74352fecde98e3a30a0e716f30211c))
- **text-injector:** enhance clipboard handling with structured snapshot ([6e47319](https://github.com/BuildWithAIs/voicekey-private/commit/6e473192a1839a358ec4bbba4956d32045cedd97))
- update tray icon to use voice-key branding and add code review doc ([c457120](https://github.com/BuildWithAIs/voicekey-private/commit/c45712086fa79617cf58dfc430090a09907047d6))
- **windows:** inject text via clipboard paste ([e6ddb6d](https://github.com/BuildWithAIs/voicekey-private/commit/e6ddb6d9540616ffc01faba9ffd41fdce3b27749))
