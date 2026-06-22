# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.16](https://github.com/BuildWithAIs/voicekey/compare/v0.1.15...v0.1.16) (2026-06-22)

### Features

- **settings:** consolidate refine & translation, unify target language ([99b1636](https://github.com/BuildWithAIs/voicekey/commit/99b1636c1cbf66cffd25a19b41cc513974991e50))
- **ui:** redesign home, settings, and history pages ([9ef8fc4](https://github.com/BuildWithAIs/voicekey/commit/9ef8fc44664dfd7d2802289ba41d1f210fcd9c74))

### Bug Fixes

- **hotkey:** prevent bare-modifier PTT from misfiring on combo hotkeys ([90483c7](https://github.com/BuildWithAIs/voicekey/commit/90483c768ade582aaf9408ecca84db47a33e1d10))

### [0.1.15](https://github.com/BuildWithAIs/voicekey/compare/v0.1.14...v0.1.15) (2026-06-03)

### Features

- **translation:** enhance translation system prompt for clarity and functionality ([6c2b6b0](https://github.com/BuildWithAIs/voicekey/commit/6c2b6b002b8792fd0e3a16e6d44488e902fc8ab3))

### [0.1.14](https://github.com/BuildWithAIs/voicekey/compare/v0.1.13...v0.1.14) (2026-06-02)

### Features

- **refine:** enhance transcript handling for empty or minimal inputs ([5b8fa68](https://github.com/BuildWithAIs/voicekey/commit/5b8fa687a5272b6230b1f78a77a3c2010780485e))
- **stats:** add today's session statistics and peak day tracking ([7b1f555](https://github.com/BuildWithAIs/voicekey/commit/7b1f555a517fa1f47e7eb45ee11faef0a94f854e))

### Bug Fixes

- **translation:** harden selected text replacement ([0622874](https://github.com/BuildWithAIs/voicekey/commit/06228744c35dc4f8918be9379e002e14c29d5917))

### [0.1.13](https://github.com/BuildWithAIs/voicekey/compare/v0.1.12...v0.1.13) (2026-04-20)

### Features

- **hud:** split processing into transcribe and refine stages ([810e512](https://github.com/BuildWithAIs/voicekey/commit/810e512c6775f7ddfe54a139dbee9d134bfb05ac))
- **refine:** add remote glossary refresh ([8b77a1b](https://github.com/BuildWithAIs/voicekey/commit/8b77a1b41d9496b51cf3f58d50cbec0d942942a5))
- **ui:** distinguish ASR and LLM refinement stages in HUD ([dd0b027](https://github.com/BuildWithAIs/voicekey/commit/dd0b027d15bce5074be68353f679d212594f418d))

### [0.1.12](https://github.com/BuildWithAIs/voicekey/compare/v0.1.11...v0.1.12) (2026-03-30)

### Features

- add optional English output mode for transcript refine ([bc658dd](https://github.com/BuildWithAIs/voicekey/commit/bc658ddc64ff337dd6e3a480eae06646360f2e4f))
- **refine:** improve structured formatting and multiline injection ([466f219](https://github.com/BuildWithAIs/voicekey/commit/466f219d9046264caf6a5f3cfb5686d038782907))
- simplify refine base url config ([881ae4e](https://github.com/BuildWithAIs/voicekey/commit/881ae4e89b50c35d043e3e050e54de0f3f2cfa0c))

### [0.1.11](https://github.com/BuildWithAIs/voicekey/compare/v0.1.10...v0.1.11) (2026-03-29)

### Features

- **audio:** support 3-minute chunked glm asr sessions ([31df453](https://github.com/BuildWithAIs/voicekey/commit/31df4537e22090b7e81310eb033609811fc07d04))
- improve refine prompt guidance ([633385a](https://github.com/BuildWithAIs/voicekey/commit/633385a0df49fa6ce62deb18fa72fcde055afec8))

### [0.1.10](https://github.com/BuildWithAIs/voicekey/compare/v0.1.9...v0.1.10) (2026-03-29)

### Features

- **settings:** improve autosave status feedback ([d691c9f](https://github.com/BuildWithAIs/voicekey/commit/d691c9f84ba8a966f8b2966f4d17ae8bbe24c55a))

### Bug Fixes

- keep auto launch startup in background ([bdd677e](https://github.com/BuildWithAIs/voicekey/commit/bdd677e4243dfed15d37a3bcacba6cc31e16dea8))

### [0.1.9](https://github.com/BuildWithAIs/voicekey/compare/v0.1.8...v0.1.9) (2026-03-29)

### Features

- **chart:** enhance localization for chart labels and range selector ([0137700](https://github.com/BuildWithAIs/voicekey/commit/0137700f2e02ecdf0a2744a0c41ad45552734e07))
- refactor text refinement flow ([b65bae1](https://github.com/BuildWithAIs/voicekey/commit/b65bae1f8f61964353e05a583303fd27d2b8cc31))

### Bug Fixes

- **security:** defer API key encryption migration to after app.ready ([59c173f](https://github.com/BuildWithAIs/voicekey/commit/59c173f47be0a21476eb76f2230f40e7799a5ffd))
- **security:** encrypt API keys with safeStorage and remove keystroke logging ([1655d6f](https://github.com/BuildWithAIs/voicekey/commit/1655d6f1ad57ef00e270138e1f9f6e3b2da1de24))

### [0.1.8](https://github.com/BuildWithAIs/voicekey/compare/v0.1.7...v0.1.8) (2026-03-12)

### Features

- **audio:** add low-volume enhancement mode ([2aae04d](https://github.com/BuildWithAIs/voicekey/commit/2aae04d07e266ba3b1dc00b21499164f3b51ea97))
- **llm:** add glm refine mvp with asr reuse ([6b094cd](https://github.com/BuildWithAIs/voicekey/commit/6b094cd03774fcdb6fbb96bc0a0aab86f1cf7d0a))
- **website:** add automatic version detection from GitHub releases ([b6c756b](https://github.com/BuildWithAIs/voicekey/commit/b6c756b2aa971cf3b60b8a94364a1cdf3b536427))

### Bug Fixes

- **website:** add localStorage caching to reduce GitHub API calls ([41cdf6d](https://github.com/BuildWithAIs/voicekey/commit/41cdf6d43d914dcaf874db867be4ebec18bfc4f2))

### [0.1.7](https://github.com/BuildWithAIs/voicekey/compare/v0.1.6...v0.1.7) (2026-01-26)

### Features

- add official website project structure ([6aa2678](https://github.com/BuildWithAIs/voicekey/commit/6aa26781f06db42e57381044faf2f70fb515ca62))
- **i18n:** auto-sync system locale when language setting is 'system' ([4618ead](https://github.com/BuildWithAIs/voicekey/commit/4618eadad3f247cc4db8890bf507b03da009714e))
- **i18n:** implement real-time language sync across all windows ([91a2b5b](https://github.com/BuildWithAIs/voicekey/commit/91a2b5b3fa4dd4b98bead22103bac0d626cbb1ff))
- **website:** add bilingual support and deploy workflow ([f4daca9](https://github.com/BuildWithAIs/voicekey/commit/f4daca91f82bded24ef0a4e12ce40c2543c4d5e2))
- **website:** add canonical URLs, hreflang, and 404 page ([d5f4773](https://github.com/BuildWithAIs/voicekey/commit/d5f47735c0b7bb3dc6ec6900ebb0b1be62746c73))
- **website:** add light/dark theme toggle ([3481d18](https://github.com/BuildWithAIs/voicekey/commit/3481d18978085fe413be91c7f1a6738775b7c28e))
- **website:** add sitemap generation and improve favicon setup ([bc0401b](https://github.com/BuildWithAIs/voicekey/commit/bc0401b32b9b94423cf377132038c8f3a79a5384))
- **website:** redesign with geek-style aesthetic ([1a4fe84](https://github.com/BuildWithAIs/voicekey/commit/1a4fe8409a3ce8052ebe8c8648acd36df06966ba))

### Bug Fixes

- **i18n:** improve fallback language resolution in renderer ([0ee7adc](https://github.com/BuildWithAIs/voicekey/commit/0ee7adc1f0deab9703a053b1ecd8bb66292233ae))
- **website:** add localStorage error handling for private browsing ([4f3d72a](https://github.com/BuildWithAIs/voicekey/commit/4f3d72a32252cdb0034f256ce403cd704bb9d60c))
- **website:** correct site URL and improve deployment workflow ([795ed1a](https://github.com/BuildWithAIs/voicekey/commit/795ed1a5143b61cc2d1be45e271a36b3a2aae7ee))

### [0.1.6](https://github.com/BuildWithAIs/voicekey/compare/v0.1.5...v0.1.6) (2026-01-25)

### Features

- **logging:** add persistent logging system with retention and UI ([05314f0](https://github.com/BuildWithAIs/voicekey/commit/05314f053f700a932650576db62d81649158ac0d))
- **session:** add cancellation checks in audio processing pipeline ([5133a8a](https://github.com/BuildWithAIs/voicekey/commit/5133a8a840126d6bbd0e6757ab4a0707b3ba88bf))
- **session:** implement cancel session functionality ([037f178](https://github.com/BuildWithAIs/voicekey/commit/037f178cb247cda7a0285f366359ed38fe789397))

### Bug Fixes

- **logging:** correct archiveLog callback to use LogFile.path property ([47ba0af](https://github.com/BuildWithAIs/voicekey/commit/47ba0afc599d707c13c6e19304365e9a8efc600a))

### [0.1.5](https://github.com/BuildWithAIs/voicekey/compare/v0.1.4...v0.1.5) (2026-01-22)

### [0.1.4](https://github.com/BuildWithAIs/voicekey/compare/v0.1.3...v0.1.4) (2026-01-22)

### [0.1.3](https://github.com/BuildWithAIs/voicekey/compare/v0.0.6...v0.1.3) (2026-01-22)

### [0.0.6](https://github.com/BuildWithAIs/voicekey/compare/v0.0.5...v0.0.6) (2026-01-22)

### 0.0.5 (2026-01-22)

### Features

- init commit ([4a9f11a](https://github.com/BuildWithAIs/voicekey/commit/4a9f11a903fb65682909cd18f2f4467a43fa07db))
- **update-check:** add startup update check ([d240577](https://github.com/BuildWithAIs/voicekey/commit/d2405771e3947ea6771ca4f5ea9c784f9d013d32))

## [0.1.2] - 2026-01-21

- Initial public release.

[0.1.2]: https://github.com/BuildWithAIs/voicekey/releases/tag/v0.1.2
