import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { loadHideMessagesConfig } from "../src/config-store.js";

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function withTempAgentDir(run: (tempHome: string) => void): void {
  const tempHome = mkdtempSync(join(tmpdir(), "pi-hide-messages-config-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

  process.env.PI_CODING_AGENT_DIR = join(tempHome, ".pi", "agent");

  try {
    run(tempHome);
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }

    rmSync(tempHome, { recursive: true, force: true });
  }
}

test("loadHideMessagesConfig reads the documented global config path", () => {
  withTempAgentDir((tempHome) => {
    const cwd = join(tempHome, "workspace", "project");
    mkdirSync(cwd, { recursive: true });

    const globalConfigPath = join(
      tempHome,
      ".pi",
      "agent",
      "extensions",
      "pi-hide-messages",
      "config.json",
    );
    writeJson(globalConfigPath, {
      defaultVisibleCount: 100,
    });

    const result = loadHideMessagesConfig({ cwd });

    assert.equal(result.config.defaultVisibleCount, 100);
    assert.equal(result.config.configPath, globalConfigPath);
    assert.equal(result.globalConfigPath, globalConfigPath);
  });
});

test("project config overrides the documented global config path", () => {
  withTempAgentDir((tempHome) => {
    const cwd = join(tempHome, "workspace", "project");
    const globalConfigPath = join(
      tempHome,
      ".pi",
      "agent",
      "extensions",
      "pi-hide-messages",
      "config.json",
    );
    const projectConfigPath = join(cwd, ".pi", "extensions", "pi-hide-messages", "config.json");

    mkdirSync(cwd, { recursive: true });
    writeJson(globalConfigPath, {
      defaultVisibleCount: 100,
    });
    writeJson(projectConfigPath, {
      defaultVisibleCount: 200,
    });

    const result = loadHideMessagesConfig({ cwd });

    assert.equal(result.config.defaultVisibleCount, 200);
    assert.equal(result.config.configPath, projectConfigPath);
  });
});
