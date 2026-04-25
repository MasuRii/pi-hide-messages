import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIDE_MESSAGES_COMMAND,
  HIDE_MESSAGES_CONTROL_CUSTOM_TYPE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE,
  HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE,
  RESTORE_MESSAGES_COMMAND,
} from "../src/constants.js";
import {
  parseJsonlSession,
  serializeJsonlSession,
} from "../src/session-visibility.js";
import type {
  HideMessagesControlEntryData,
  SessionFileEntry,
  SessionTreeEntry,
  VisibleSessionContext,
} from "../src/types.js";

const distRoot = fileURLToPath(new URL("..", import.meta.url));
const patchFlag = "__piHideMessagesRenderPatched";
const originalRenderKey = "__piHideMessagesOriginalRenderSessionContext";

type NotificationLevel = "info" | "warning" | "error";

type Notification = {
  level: NotificationLevel;
  message: string;
};

type RuntimeState = {
  leafId: string | null;
  liveEntries: SessionTreeEntry[];
};

type StubInteractiveMode = {
  lastRender?: {
    options?: { populateHistory?: boolean; updateFooter?: boolean };
    sessionContext: VisibleSessionContext;
  };
  renderCalls?: Array<{
    options?: { populateHistory?: boolean; updateFooter?: boolean };
    sessionContext: VisibleSessionContext;
  }>;
  renderSessionContext?(
    sessionContext: VisibleSessionContext,
    options?: { populateHistory?: boolean; updateFooter?: boolean },
  ): void;
  sessionManager?: {
    getEntries(): SessionTreeEntry[];
    getLeafId(): string | null;
  };
};

type RegisteredCommand = {
  description: string;
  handler: (args: string, ctx: CommandContextStub) => Promise<void> | void;
};

type CommandContextStub = {
  cwd: string;
  hasUI: boolean;
  reload(): Promise<void>;
  sessionManager: {
    getEntries(): SessionTreeEntry[];
    getLeafId(): string | null;
    getSessionFile(): string;
  };
  ui: {
    notify(message: string, level?: NotificationLevel): void;
  };
};

function createTempRoot(label: string): string {
  const root = join(
    distRoot,
    ".test-tmp",
    `${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(root, { recursive: true });
  return root;
}

function installPiCodingAgentStub(stubPackageRoot: string): void {
  mkdirSync(stubPackageRoot, { recursive: true });
  writeFileSync(
    join(stubPackageRoot, "package.json"),
    JSON.stringify(
      {
        name: "@mariozechner/pi-coding-agent",
        type: "module",
        exports: "./index.js",
      },
      null,
      2,
    ),
    "utf-8",
  );
  writeFileSync(
    join(stubPackageRoot, "index.js"),
    [
      "export class InteractiveMode {",
      "  renderSessionContext(sessionContext, options) {",
      "    const call = { sessionContext, options };",
      "    if (!Array.isArray(this.renderCalls)) {",
      "      this.renderCalls = [];",
      "    }",
      "    this.renderCalls.push(call);",
      "    this.lastRender = call;",
      "  }",
      "}",
    ].join("\n"),
    "utf-8",
  );
}

function resetInteractiveModePrototype(InteractiveMode: { prototype: StubInteractiveMode }): void {
  const prototype = InteractiveMode.prototype as StubInteractiveMode & Record<string, unknown>;
  delete prototype[patchFlag];
  delete prototype[originalRenderKey];
  prototype.renderSessionContext = function renderSessionContext(
    this: StubInteractiveMode,
    sessionContext: VisibleSessionContext,
    options?: { populateHistory?: boolean; updateFooter?: boolean },
  ): void {
    const call = { sessionContext, options };
    if (!Array.isArray(this.renderCalls)) {
      this.renderCalls = [];
    }
    this.renderCalls.push(call);
    this.lastRender = call;
  };
}

function buildSessionEntries(): SessionFileEntry[] {
  const start = 1_700_000_000_000;
  const messages: Array<{ id: string; parentId: string | null; role: string }> = [
    { id: "user-1", parentId: null, role: "user" },
    { id: "assistant-1", parentId: "user-1", role: "assistant" },
    { id: "user-2", parentId: "assistant-1", role: "user" },
    { id: "assistant-2", parentId: "user-2", role: "assistant" },
  ];

  return [
    { type: "session", id: "session-1", cwd: "C:/runtime-validation" },
    ...messages.map((entry, index) => ({
      type: "message" as const,
      id: entry.id,
      parentId: entry.parentId,
      timestamp: new Date(start + index * 1_000).toISOString(),
      message: { role: entry.role, content: [] },
    })),
  ];
}

function readTreeEntries(sessionFilePath: string): SessionTreeEntry[] {
  return parseJsonlSession(readFileSync(sessionFilePath, "utf-8")).filter(
    (entry): entry is SessionTreeEntry => entry.type !== "session",
  );
}

function getHiddenIds(entries: readonly SessionTreeEntry[]): string[] {
  return entries.filter((entry) => entry.hidden === true).map((entry) => entry.id);
}

function buildUnfilteredContext(entries: readonly SessionTreeEntry[]): VisibleSessionContext {
  return {
    messages: entries
      .filter(
        (entry): entry is SessionTreeEntry & { type: "message"; message: VisibleSessionContext["messages"][number] } =>
          entry.type === "message",
      )
      .map((entry) => entry.message),
    thinkingLevel: "off",
    model: null,
  };
}

function createInteractiveModeInstance(
  InteractiveMode: new () => StubInteractiveMode,
  state: RuntimeState,
): StubInteractiveMode {
  const instance = new InteractiveMode();
  instance.sessionManager = {
    getEntries: () => state.liveEntries,
    getLeafId: () => state.leafId,
  };
  return instance;
}

function buildCommandContext(
  cwd: string,
  sessionFilePath: string,
  notifications: Notification[],
  state: RuntimeState,
  reloads: { count: number },
): CommandContextStub {
  return {
    cwd,
    hasUI: true,
    async reload(): Promise<void> {
      reloads.count += 1;
    },
    sessionManager: {
      getEntries: () => state.liveEntries,
      getLeafId: () => state.leafId,
      getSessionFile: () => sessionFilePath,
    },
    ui: {
      notify(message: string, level: NotificationLevel = "info"): void {
        notifications.push({ message, level });
      },
    },
  };
}

test("pi-hide-messages remains compatible with v0.68.0 startup, reload, and resume render flows", async () => {
  const tempRoot = createTempRoot("runtime-validation");
  const nodeModulesRoot = join(distRoot, "node_modules");
  const nodeModulesExisted = existsSync(nodeModulesRoot);
  const stubPackageRoot = join(nodeModulesRoot, "@mariozechner", "pi-coding-agent");
  installPiCodingAgentStub(stubPackageRoot);

  try {
    const { InteractiveMode } = await import("@mariozechner/pi-coding-agent");
    const { applyHideMessagesRenderPatch } = await import("../src/render-patch.js");
    const { default: hideMessagesExtension } = await import("../index.js");

    resetInteractiveModePrototype(InteractiveMode as never);

    const firstPatchResult = applyHideMessagesRenderPatch();
    const secondPatchResult = applyHideMessagesRenderPatch();
    assert.deepEqual(firstPatchResult, { patched: true, alreadyPatched: false });
    assert.deepEqual(secondPatchResult, { patched: false, alreadyPatched: true });

    resetInteractiveModePrototype(InteractiveMode as never);

    const sessionFilePath = join(tempRoot, "session.jsonl");
    writeFileSync(sessionFilePath, serializeJsonlSession(buildSessionEntries()), "utf-8");

    const projectConfigPath = join(
      tempRoot,
      ".pi",
      "extensions",
      "pi-hide-messages",
      "config.json",
    );
    mkdirSync(join(tempRoot, ".pi", "extensions", "pi-hide-messages"), { recursive: true });
    writeFileSync(
      projectConfigPath,
      JSON.stringify(
        {
          debug: false,
          defaultVisibleCount: 2,
          autoHideOnSessionStart: true,
        },
        null,
        2,
      ),
      "utf-8",
    );

    const notifications: Notification[] = [];
    const commands = new Map<string, RegisteredCommand>();
    const sessionStartHandlers: Array<(event: { type: string; reason: string }, ctx: CommandContextStub) => Promise<void> | void> = [];
    const reloads = { count: 0 };
    let controlSequence = 0;

    const state: RuntimeState = {
      leafId: "assistant-2",
      liveEntries: readTreeEntries(sessionFilePath),
    };

    const rebuildRuntimeStateFromFile = (): void => {
      state.liveEntries = readTreeEntries(sessionFilePath);
      state.leafId = state.liveEntries[state.liveEntries.length - 1]?.id ?? null;
    };

    const commandContext = buildCommandContext(tempRoot, sessionFilePath, notifications, state, reloads);

    const pi = {
      appendEntry<T = unknown>(customType: string, data?: T): void {
        controlSequence += 1;
        const entry = {
          type: "custom",
          id: `control-${controlSequence}`,
          parentId: state.leafId,
          timestamp: new Date(1_700_000_010_000 + controlSequence * 1_000).toISOString(),
          customType,
          data,
        } as SessionTreeEntry;

        state.liveEntries = [...state.liveEntries, entry];
        state.leafId = entry.id;

        const nextEntries = [...parseJsonlSession(readFileSync(sessionFilePath, "utf-8")), entry];
        writeFileSync(sessionFilePath, serializeJsonlSession(nextEntries), "utf-8");
      },
      on(
        eventName: string,
        handler: (event: { type: string; reason: string }, ctx: CommandContextStub) => Promise<void> | void,
      ): void {
        if (eventName === "session_start") {
          sessionStartHandlers.push(handler);
        }
      },
      registerCommand(name: string, definition: RegisteredCommand): void {
        commands.set(name, definition);
      },
    };

    hideMessagesExtension(pi as never);

    assert.ok(commands.has(HIDE_MESSAGES_COMMAND));
    assert.ok(commands.has(RESTORE_MESSAGES_COMMAND));
    assert.equal(sessionStartHandlers.length, 1);

    await sessionStartHandlers[0]!({ type: "session_start", reason: "resume" }, commandContext);
    assert.deepEqual(getHiddenIds(state.liveEntries), ["user-1", "assistant-1"]);
    assert.deepEqual(getHiddenIds(readTreeEntries(sessionFilePath)), ["user-1", "assistant-1"]);

    const hiddenRenderInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      state,
    );
    hiddenRenderInstance.renderSessionContext?.(
      buildUnfilteredContext(state.liveEntries),
      { populateHistory: true, updateFooter: true },
    );
    assert.deepEqual(
      hiddenRenderInstance.lastRender?.sessionContext.messages.map((message) => message.role),
      ["user", "assistant"],
    );

    await commands.get(RESTORE_MESSAGES_COMMAND)?.handler("", commandContext);
    assert.equal(reloads.count, 1);
    assert.deepEqual(getHiddenIds(state.liveEntries), []);

    rebuildRuntimeStateFromFile();
    assert.equal(state.leafId, "control-1");
    const restoreControl = state.liveEntries[state.liveEntries.length - 1] as SessionTreeEntry & {
      customType?: string;
      data?: HideMessagesControlEntryData;
    };
    assert.equal(restoreControl.customType, HIDE_MESSAGES_CONTROL_CUSTOM_TYPE);
    assert.deepEqual(restoreControl.data, { mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_RESTORE });

    await sessionStartHandlers[0]!({ type: "session_start", reason: "reload" }, commandContext);
    assert.deepEqual(getHiddenIds(state.liveEntries), []);

    const restoredRenderInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      state,
    );
    restoredRenderInstance.renderSessionContext?.(buildUnfilteredContext(state.liveEntries));
    assert.deepEqual(
      restoredRenderInstance.lastRender?.sessionContext.messages.map((message) => message.role),
      ["user", "assistant", "user", "assistant"],
    );

    await commands.get(HIDE_MESSAGES_COMMAND)?.handler("2", commandContext);
    assert.equal(reloads.count, 2);
    assert.deepEqual(getHiddenIds(state.liveEntries), ["user-1", "assistant-1"]);

    rebuildRuntimeStateFromFile();
    assert.equal(state.leafId, "control-2");
    const hideControl = state.liveEntries[state.liveEntries.length - 1] as SessionTreeEntry & {
      customType?: string;
      data?: HideMessagesControlEntryData;
    };
    assert.equal(hideControl.customType, HIDE_MESSAGES_CONTROL_CUSTOM_TYPE);
    assert.deepEqual(hideControl.data, { mode: HIDE_MESSAGES_CONTROL_MODE_MANUAL_HIDE });

    await sessionStartHandlers[0]!({ type: "session_start", reason: "resume" }, commandContext);
    assert.deepEqual(getHiddenIds(state.liveEntries), ["user-1", "assistant-1"]);

    const resumedRenderInstance = createInteractiveModeInstance(
      InteractiveMode as new () => StubInteractiveMode,
      state,
    );
    resumedRenderInstance.renderSessionContext?.(buildUnfilteredContext(state.liveEntries));
    assert.deepEqual(
      resumedRenderInstance.lastRender?.sessionContext.messages.map((message) => message.role),
      ["user", "assistant"],
    );

    assert.equal(
      notifications.some((entry) => entry.message.includes("failed to patch TUI message rendering")),
      false,
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
    rmSync(stubPackageRoot, { recursive: true, force: true });
    if (!nodeModulesExisted) {
      rmSync(nodeModulesRoot, { recursive: true, force: true });
    }
  }
});
