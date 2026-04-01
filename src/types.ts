export interface SessionHeaderEntry {
  type: "session";
  [key: string]: unknown;
}

export interface SessionTreeEntryBase {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  hidden?: boolean;
  [key: string]: unknown;
}

export interface SessionMessageEntry extends SessionTreeEntryBase {
  type: "message";
  message: AgentMessageLike;
}

export interface SessionCustomMessageEntry extends SessionTreeEntryBase {
  type: "custom_message";
  customType: string;
  content: unknown;
  display: boolean;
  details?: unknown;
}

export interface SessionBranchSummaryEntry extends SessionTreeEntryBase {
  type: "branch_summary";
  fromId: string;
  summary: string;
}

export interface SessionCompactionEntry extends SessionTreeEntryBase {
  type: "compaction";
  summary: string;
  firstKeptEntryId: string;
  tokensBefore: number;
  details?: unknown;
}

export type SessionTreeEntry =
  | SessionMessageEntry
  | SessionCustomMessageEntry
  | SessionBranchSummaryEntry
  | SessionCompactionEntry
  | SessionTreeEntryBase;

export type SessionFileEntry = SessionHeaderEntry | SessionTreeEntry;

export interface AgentMessageLike {
  role?: string;
  provider?: string;
  model?: string;
  display?: boolean;
  content?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface VisibleSessionContext {
  messages: AgentMessageLike[];
  thinkingLevel: string;
  model: { provider: string; modelId: string } | null;
}

export interface HideMessagesConfigFile {
  debug?: boolean;
  defaultVisibleCount?: number;
  autoHideOnSessionStart?: boolean;
}

export interface ResolvedHideMessagesConfig {
  configPath: string;
  debug: boolean;
  defaultVisibleCount: number;
  autoHideOnSessionStart: boolean;
}

export interface HideMessagesConfigLoadResult {
  config: ResolvedHideMessagesConfig;
  warnings: string[];
  projectConfigPath: string;
  globalConfigPath: string;
}

export interface HideMessagesPlan {
  entries: SessionFileEntry[];
  changed: boolean;
  hiddenEntryCount: number;
  visibleItemCount: number;
  retainedVisibleItemCount: number;
}

export type HideMessagesControlMode = "manual-hide" | "manual-restore";

export interface HideMessagesControlEntryData {
  mode: HideMessagesControlMode;
}

export interface RestoreMessagesPlan {
  entries: SessionFileEntry[];
  changed: boolean;
  restoredEntryCount: number;
}

export interface HideMessagesConfigController {
  getConfigResult(ctx: { cwd: string }): HideMessagesConfigLoadResult;
  reportWarnings(ctx: { hasUI: boolean; ui: { notify(message: string, level?: "info" | "warning" | "error"): void } }, configResult: HideMessagesConfigLoadResult): void;
}
