export const EXTENSION_ID = "pi-hide-messages";
export const CONFIG_BASENAME = "config.json";
export const HIDE_MESSAGES_COMMAND = "hide-messages";
export const RESTORE_MESSAGES_COMMAND = "restore-messages";
export const HIDE_MESSAGES_CONTROL_CUSTOM_TYPE = "pi-hide-messages.control";
export const HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE = "manual-hide" as const;
export const HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE = "manual-restore" as const;
export const HIDE_MESSAGES_USAGE = `Usage: /${HIDE_MESSAGES_COMMAND} [visible-count]`;
export const HIDE_MESSAGES_DESCRIPTION =
  "Hide older TUI messages while preserving full LLM session context.";
export const RESTORE_MESSAGES_DESCRIPTION =
  "Restore previously hidden TUI messages for the current session.";
export const DEFAULT_CONFIG_FILE = {
  debug: false,
  defaultVisibleCount: 10,
  autoHideOnSessionStart: true,
} as const;
