# Platform adapters

- `linux-environment.ts` — Detects Linux display sessions and resolves the current Hyprland
  socket without trusting renderer input.
- `hyprland-hotkeys.ts` — Converts Voice Key accelerators into managed Hyprland Lua bindings
  and provides pure helpers for updating the managed block.
- `hyprland-integration.ts` — Owns Omarchy/Hyprland socket2 events, reversible user binding
  installation, config validation, and `wl-copy` + `wtype` clipboard injection that preserves
  Omarchy's regular-window versus terminal semantics without depending on Electron's Wayland
  clipboard ownership or Hyprland key-name resolution.
- `linux-auto-launch.ts` — Manages the packaged app's XDG autostart desktop entry.
- `native-keyboard.ts` — Lazily loads `nut-js` for Windows, macOS, and Linux X11 so Wayland
  sessions do not initialize an incompatible native keyboard backend.

Privileged platform operations stay in the Electron main process. Renderer access is limited to
the explicit Linux integration IPC methods exposed to the settings window.
