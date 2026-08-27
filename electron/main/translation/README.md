# Translation Module

- `translator.ts` — Core translation/polishing service: captures selected text via the platform clipboard shortcut, calls the configured OpenAI/DeepSeek/OpenRouter/custom-compatible LLM API with the built-in native-quality translation prompt and the shared target language, applies the same Provider-aware reasoning policy used by refinement, and replaces the selection via a plain-text paste (clipboard save/restore). Omarchy/Hyprland follows its universal clipboard convention (`Ctrl+C/V` for GUI apps, `Ctrl/Shift+Insert` for terminals); other platforms keep the native keyboard backend.

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
- On Omarchy/Hyprland, terminal-tagged windows use `Ctrl+Insert` and `Shift+Insert`, so terminal replacement follows the compositor's existing universal clipboard model

The paste path intentionally writes only `text/plain` and waits before restoring the original clipboard. Apps such as Word, WeChat, and browser inputs may read clipboard data asynchronously; restoring rich clipboard contents too early can cause the app to paste stale HTML/RTF data instead of the translated or polished text.

Before both copy and paste, the module uses a temporary clipboard sentinel to detect failed copy operations or lost selections. If the selected text cannot be confirmed, translation stops and the original clipboard is restored.

## Dependencies

- `refine/openai-client.ts` — `requestChatCompletion`, `extractMessageContent`
- `shared/refine-url.ts` — `normalizeRefineBaseUrl`, `buildRefineChatEndpoint`
- `shared/constants.ts` — `buildTranslationSystemPrompt`, native-quality translation guidance, `OPENAI_CHAT`
- `window/overlay.ts` — `showOverlay`, `updateOverlay`, `hideOverlay`
- `config-manager.ts` — `getLLMRefineConfig`, `getTranslationConfig`
