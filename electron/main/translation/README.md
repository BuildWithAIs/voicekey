# Translation Module

- `translator.ts` — Core translation/polishing service: captures selected text via the platform clipboard shortcut, sends it as a JSON `selected_text` value with a language-neutral translation prompt and the shared target language, and replaces the selection via a plain-text paste (clipboard save/restore). Direct DeepSeek translation uses low-effort thinking for fidelity and idiomatic expression; other providers retain their reasoning-disable settings. Omarchy/Hyprland follows its universal clipboard convention (`Ctrl+C/V` for GUI apps, `Ctrl/Shift+Insert` for terminals); other platforms keep the native keyboard backend.
- `translator.test.ts` — Covers DeepSeek Flash, Anthropic, and OpenRouter Haiku 5.5 translation through the shared HTTP client, provider-specific reasoning settings, selected-text JSON escaping, plain-text replacement, and clipboard restoration.
- `translation-evaluation.json` — Synthetic live DeepSeek Flash comparison: 67 distinct cases across all ten targets and 48 additional repeated requests per variant. Records baseline/candidate settings, prompt hashes, source text, responses, mechanical checks, and evaluation limits; contains no credentials and is not loaded at runtime.

The prompt uses one API request and asks for a final native-language expression check without exposing drafts. Direct DeepSeek translation enables low-effort thinking; dictation processing keeps its existing settings. The recorded sample shows more reliable protected-content and uncertainty handling, with a modest increase in API latency. Most ordinary baseline translations were already good, and context-sensitive jargon may still sound literal; mechanical checks do not certify native fluency.

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
- `shared/llm-config.ts` — provider-specific endpoint selection and reasoning-disable parameters, including Anthropic Messages and OpenRouter Haiku 5.5
- `shared/constants.ts` — `buildTranslationSystemPrompt`, language-neutral rules for idiomatic expression, source tone, uncertainty, fragments, and protected content without fixed language-pair examples; `OPENAI_CHAT`
- `window/overlay.ts` — `showOverlay`, `updateOverlay`, `hideOverlay`
- `config-manager.ts` — `getLLMRefineConfig`, `getTranslationConfig`
