# pi-hide-messages

Hide older Pi TUI chat messages without shrinking the underlying session context.

`pi-hide-messages` lets you keep long conversations readable by hiding older entries from the Pi terminal UI while preserving the session data needed to continue the conversation. It adds simple slash commands for manual control and can auto-hide older messages whenever a session starts or switches.

<img width="1360" height="752" alt="image" src="https://github.com/user-attachments/assets/50b6a2bf-99ba-48e2-a209-cb831156a321" />


> [!NOTE]
> Hidden messages are **not deleted**. They are only hidden from the Pi TUI display layer, so the underlying session data stays intact, the active model/agent still keeps the full conversation context, and `/restore-messages` brings the hidden entries back into view.

## Features

- **Branch-aware history hiding** for the active session path
- **Manual commands** for hiding or restoring visible chat history
- **Auto-hide on session start/switch** using a configurable visible-count threshold
- **Preserved conversation continuity** so recent assistant/tool/user context remains visible
- **No context loss for the model or agent** because hiding only changes what the TUI renders, not what the session stores
- **Project-level overrides** via `.pi/extensions/pi-hide-messages/config.json`

## Installation

### Local extension folder

Place this folder in one of Pi's auto-discovery locations:

```text
# Global default (when PI_CODING_AGENT_DIR is unset)
~/.pi/agent/extensions/pi-hide-messages

# Project-specific
.pi/extensions/pi-hide-messages
```

### npm package

```bash
pi install npm:pi-hide-messages
```

### Git repository

```bash
pi install git:github.com/MasuRii/pi-hide-messages
```

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `/hide-messages` | Hide older entries and keep the configured default visible count |
| `/hide-messages 20` | Hide older entries and keep the latest 20 visible chat items |
| `/restore-messages` | Restore all entries hidden by this extension for the current session |

### Behavior notes

- `defaultVisibleCount` is used when `/hide-messages` is called without arguments.
- `autoHideOnSessionStart` applies the same visibility rule whenever Pi opens or switches sessions.
- After `/restore-messages`, auto-hide stays paused for the active branch until `/hide-messages` is used again.

## Configuration

Runtime configuration is loaded from:

```text
# Global config default (respects PI_CODING_AGENT_DIR)
~/.pi/agent/extensions/pi-hide-messages/config.json

# Optional project override
.pi/extensions/pi-hide-messages/config.json
```

A starter template is included at `config/config.example.json`.

Project config overrides the global extension config when both are present.

### Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `debug` | boolean | `false` | Reserved compatibility flag. Keep disabled unless a future release documents debug output. |
| `defaultVisibleCount` | number | `10` | Positive integer count of visible chat items to keep when hiding older entries. |
| `autoHideOnSessionStart` | boolean | `true` | Automatically apply the default visibility limit when a session starts or switches. |

### Example

```json
{
  "debug": false,
  "defaultVisibleCount": 10,
  "autoHideOnSessionStart": true
}
```

## How it works

- The extension updates older session entries with `hidden: true` in the active session file.
- It patches Pi's interactive session rendering so hidden entries are omitted from the visible TUI history.
- Session data remains restorable, which keeps the extension focused on UI readability rather than destructive cleanup.
- Hidden entries still remain part of the session record, so the model and agent keep their full context even when those messages are not currently rendered in the TUI.

## Related Pi Extensions

- [pi-tool-display](https://github.com/MasuRii/pi-tool-display) — Compact tool rendering and diff visualization
- [pi-startup-redraw-fix](https://github.com/MasuRii/pi-startup-redraw-fix) — Fix terminal redraw glitches on startup
- [pi-image-tools](https://github.com/MasuRii/pi-image-tools) — Image attachment and inline preview
- [pi-smart-voice-notify](https://github.com/MasuRii/pi-smart-voice-notify) — Multi-channel TTS and sound notifications
