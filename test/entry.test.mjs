// 四个脚本经符号链接路径调用时也要真的执行（而不是静默退出 0）。
// 契约出处：README「pnpm check」与 scripts/check.mjs 文件头——检查失败要以非零退出码报告。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

test("经符号链接运行 check.mjs，坏数据仍以非零退出", () => {
  const dir = mkdtempSync(join(tmpdir(), "pluginradar-link-"));
  try {
    symlinkSync(repo, join(dir, "repo"));
    writeFileSync(join(dir, "bad.json"), JSON.stringify({ ideas: [] }));
    const r = spawnSync(process.execPath, [join(dir, "repo/scripts/check.mjs"), join(dir, "bad.json")], { encoding: "utf8" });
    assert.equal(r.status, 1, `应失败，实际 status=${r.status} stdout=${r.stdout} stderr=${r.stderr}`);
    assert.match(r.stderr, /ideas 必须是非空数组/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
