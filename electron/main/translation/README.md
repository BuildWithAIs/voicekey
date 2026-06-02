# Translation Module

- `translator.ts` — Core translation/polishing service: captures selected text via Ctrl+C, calls LLM API with the configured system prompt, and replaces the selection via plain-text Ctrl+V (clipboard save/restore). No character-by-character deletion — relies on standard GUI behavior where Ctrl+V replaces selected text.

## Architecture

```
Translator.translate()
  → captureClipboard (save)
  → write copy sentinel
  → simulateCopy (Ctrl+C)
  → read selected text
  → requestChatCompletion (LLM API)
  → confirm selected text still matches original
  → clear clipboard and write translated/polished text as plain text
  → simulatePaste (Ctrl+V) → replaces selection in GUI apps
  → wait for GUI paste to consume clipboard
  → restoreClipboard
  → overlay feedback
```

## Design Decision: Direct Replacement

We use Ctrl+V to **replace** the currently-selected text rather than Esc + Backspace × N deletion. Rationale:

- In GUI applications (VS Code, Obsidian, Outlook, browsers), selecting text then pressing Ctrl+V natively replaces the selection with the clipboard content
- Character-by-character Backspace deletion was unreliable in input-box applications: Esc might not position the cursor at the end of the selection, causing Backspace to delete text _before_ the selection
- The trade-off is that terminal applications (where Ctrl+V may not replace selected text) are a secondary use case

The paste path intentionally writes only `text/plain` and waits before restoring the original clipboard. Apps such as Word, WeChat, and browser inputs may read clipboard data asynchronously; restoring rich clipboard contents too early can cause the app to paste stale HTML/RTF data instead of the translated or polished text.

Before both copy and paste, the module uses a temporary clipboard sentinel to detect failed copy operations or lost selections. If the selected text cannot be confirmed, translation stops and the original clipboard is restored.

## Dependencies

- `refine/openai-client.ts` — `requestChatCompletion`, `extractMessageContent`
- `shared/refine-url.ts` — `normalizeRefineBaseUrl`, `buildRefineChatEndpoint`
- `shared/constants.ts` — `BASE_TRANSLATION_SYSTEM_PROMPT`, `TARGET_LANGUAGES`, `OPENAI_CHAT`
- `window/overlay.ts` — `showOverlay`, `updateOverlay`, `hideOverlay`
- `config-manager.ts` — `getLLMRefineConfig`, `getTranslationConfig`
