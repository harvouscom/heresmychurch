import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const script = resolve("scripts/check-deploy-ref.mjs");
let root: string, checkout: string;
const git = (...args: string[]) => execFileSync("git", args, { cwd: checkout, stdio: "pipe" });
const check = () => {
  const env = { ...process.env }; delete env.HMC_DEPLOY_FORCE;
  return spawnSync(process.execPath, [script], { cwd: checkout, env, encoding: "utf8" });
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "hmc-release-check-"));
  const remote = join(root, "remote.git"); checkout = join(root, "checkout");
  execFileSync("git", ["init", "--bare", remote], { stdio: "pipe" });
  execFileSync("git", ["init", "-b", "main", checkout], { stdio: "pipe" });
  git("config", "user.email", "release-test@example.org"); git("config", "user.name", "Release test");
  writeFileSync(join(checkout, "README.md"), "Current design\n");
  git("add", "."); git("commit", "-m", "Current merged design");
  git("remote", "add", "origin", remote); git("push", "-u", "origin", "main");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
describe("production release source", () => {
  it("accepts a clean checkout at the current merged main commit", () => expect(check().status).toBe(0));
  it("rejects an unmerged feature branch even when main is its ancestor", () => {
    git("checkout", "-b", "codex/email");
    writeFileSync(join(checkout, "email.txt"), "Email feature\n");
    git("add", "."); git("commit", "-m", "Unmerged feature");
    const result = check(); expect(result.status).toBe(1); expect(result.stderr).toContain("not the current merged origin/main");
  });
  it("rejects uncommitted workspace changes", () => {
    writeFileSync(join(checkout, "README.md"), "New uncommitted design\n");
    const result = check(); expect(result.status).toBe(1); expect(result.stderr).toContain("uncommitted changes");
  });
  it("rejects an older clean commit after main advances", () => {
    const old = git("rev-parse", "HEAD").toString().trim();
    writeFileSync(join(checkout, "README.md"), "Updated merged design\n");
    git("add", "."); git("commit", "-m", "Newer design"); git("push", "origin", "main"); git("checkout", "--detach", old);
    expect(check().status).toBe(1);
  });
});
