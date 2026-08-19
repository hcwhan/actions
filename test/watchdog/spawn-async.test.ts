
import { EventEmitter } from "node:events";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { forceKillProcessTree, spawnAsync } from "@/watchdog/lib/spawn-async.js";


vi.mock("node:child_process", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:child_process")>();
  return { ...orig, spawn: vi.fn(), spawnSync: vi.fn() };
});

// 构造 EventEmitter 型 mock 子进程
function mockChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  child.unref = vi.fn();
  return child;
}

describe("spawnAsync", () => {
  const origPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: origPlatform });
    vi.mocked(spawn).mockReset();
  });

  it("linux: spawn with detached: true", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const child = mockChild();
    vi.mocked(spawn).mockReturnValue(child);

    const handle = spawnAsync("cmd", ["arg"], "/tmp");

    expect(spawn).toHaveBeenCalledWith(
      "cmd",
      ["arg"],
      expect.objectContaining({
        cwd: "/tmp",
        env: process.env,
        stdio: "inherit",
        shell: false,
        detached: true,
      }),
    );
    expect(handle.child).toBe(child);
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("win32: spawn with detached: true", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const child = mockChild();
    vi.mocked(spawn).mockReturnValue(child);

    spawnAsync("cmd", ["arg"], "/tmp");

    expect(spawn).toHaveBeenCalledWith(
      "cmd",
      ["arg"],
      expect.objectContaining({
        cwd: "/tmp",
        env: process.env,
        stdio: "inherit",
        shell: false,
        detached: true,
      }),
    );
    expect(child.unref).not.toHaveBeenCalled();
  });

  it("completed resolves with exitCode and signal", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const child = mockChild();
    vi.mocked(spawn).mockReturnValue(child);

    const handle = spawnAsync("cmd", [], "/tmp");
    child.emit("exit", 0, null);

    await expect(handle.completed).resolves.toEqual({
      exitCode: 0,
      signal: null,
    });
  });
});

describe("forceKillProcessTree", () => {
  const origPlatform = process.platform;
  const killSpy = vi.spyOn(process, "kill");

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: origPlatform });
    vi.mocked(spawnSync).mockReset();
    killSpy.mockReset();
  });

  it("win32: 调用 taskkill", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.mocked(spawnSync).mockReturnValue({ status: 0 } as never);
    expect(forceKillProcessTree(1234)).toBe(true);
    expect(spawnSync).toHaveBeenCalledWith(
      "taskkill",
      ["/PID", "1234", "/T", "/F"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("linux: 先 kill 进程组", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    killSpy.mockReturnValue(true as never);
    expect(forceKillProcessTree(1234)).toBe(true);
    expect(killSpy).toHaveBeenCalledWith(-1234, "SIGKILL");
  });

  it("pid undefined 返回 false", () => {
    expect(forceKillProcessTree(undefined)).toBe(false);
  });
});
