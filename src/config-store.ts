import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExtensionContext } from "@mariozechner/pi-coding-agent";

import {
  CONFIG_BASENAME,
  DEFAULT_CONFIG_FILE,
  EXTENSION_ID,
} from "./constants.js";
import { resolvePiAgentDir } from "./agent-dir.js";
import type {
  HideMessagesConfigFile,
  HideMessagesConfigLoadResult,
  ResolvedHideMessagesConfig,
} from "./types.js";

function getGlobalConfigPath(): string {
  return join(resolvePiAgentDir(), "extensions", EXTENSION_ID, CONFIG_BASENAME);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  if (value === undefined) {
    return "undefined";
  }

  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function createWarning(path: string, reason: string, fallback: unknown): string {
  return `Invalid ${CONFIG_BASENAME} value '${path}': ${reason}. Using ${formatValue(fallback)}.`;
}

function getConfigCwd(ctx: Pick<ExtensionContext, "cwd">): string {
  return ctx.cwd || process.cwd();
}

function getProjectConfigPath(cwd: string): string {
  return join(cwd, ".pi", "extensions", EXTENSION_ID, CONFIG_BASENAME);
}

function readRawConfigRecord(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    return {};
  }

  const raw = readFileSync(filePath, "utf-8");
  if (!raw.trim()) {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected a JSON object in '${filePath}'.`);
  }

  return parsed;
}

function readConfigFile(filePath: string, warnings: string[]): HideMessagesConfigFile {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const record = readRawConfigRecord(filePath);
    return {
      debug: normalizeBoolean(record.debug, "debug", DEFAULT_CONFIG_FILE.debug, warnings),
      defaultVisibleCount: normalizeVisibleCount(record.defaultVisibleCount, warnings),
      autoHideOnSessionStart: normalizeBoolean(
        record.autoHideOnSessionStart,
        "autoHideOnSessionStart",
        DEFAULT_CONFIG_FILE.autoHideOnSessionStart,
        warnings,
      ),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warnings.push(`Failed to read '${filePath}': ${message}`);
    return {};
  }
}

function normalizeBoolean(
  value: unknown,
  path: string,
  fallback: boolean,
  warnings: string[],
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "boolean") {
    return value;
  }

  warnings.push(createWarning(path, "expected a boolean", fallback));
  return undefined;
}

function normalizeVisibleCount(value: unknown, warnings: string[]): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || (value as number) < 1) {
    warnings.push(
      createWarning(
        "defaultVisibleCount",
        "expected a positive integer",
        DEFAULT_CONFIG_FILE.defaultVisibleCount,
      ),
    );
    return undefined;
  }

  return value as number;
}

function mergeConfigFile(
  base: ResolvedHideMessagesConfig,
  override: HideMessagesConfigFile,
): ResolvedHideMessagesConfig {
  return {
    ...base,
    debug: override.debug ?? base.debug,
    defaultVisibleCount: override.defaultVisibleCount ?? base.defaultVisibleCount,
    autoHideOnSessionStart: override.autoHideOnSessionStart ?? base.autoHideOnSessionStart,
  };
}

export function loadHideMessagesConfig(
  ctx: Pick<ExtensionContext, "cwd">,
): HideMessagesConfigLoadResult {
  const cwd = getConfigCwd(ctx);
  const projectConfigPath = getProjectConfigPath(cwd);
  const globalConfigPath = getGlobalConfigPath();
  const warnings: string[] = [];

  const globalConfig = readConfigFile(globalConfigPath, warnings);
  const projectConfig = readConfigFile(projectConfigPath, warnings);

  let config: ResolvedHideMessagesConfig = {
    configPath: projectConfigPath,
    debug: DEFAULT_CONFIG_FILE.debug,
    defaultVisibleCount: DEFAULT_CONFIG_FILE.defaultVisibleCount,
    autoHideOnSessionStart: DEFAULT_CONFIG_FILE.autoHideOnSessionStart,
  };

  config = mergeConfigFile(config, globalConfig);
  config = mergeConfigFile(config, projectConfig);
  config.configPath = existsSync(projectConfigPath) ? projectConfigPath : globalConfigPath;

  return { config, warnings, projectConfigPath, globalConfigPath };
}
