
import { EventEmitter } from "node:events";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

import * as core from "@actions/core";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forceKillProcessTree,
  sendGracefulAbortToProcessTree,
  spawnAsync,
} from "@/watchdog/lib/spawn-async.js";
import { listLiveProcessTreePids } from "@/watchdog/lib/process-tree.js";


vi.mock("@actions/core", () => ({
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:child_process")>();
  return { ...orig, spawn: vi.fn(), spawnSync: vi.fn() };
});

vi.mock("@/watchdog/lib/process-tree.js", () => ({
  listLiveProcessTreePids: vi.fn(() => []),
}));

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

  it("win32: spawn with detached: false (stdio inherit for GHA logs)", () => {
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
        detached: false,
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

describe("sendGracefulAbortToProcessTree SIGINT delivery", () => {
  const origPlatform = process.platform;
  const killSpy = vi.spyOn(process, "kill");

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: origPlatform });
    killSpy.mockReset();
  });

  function mockChildWithPid(pid: number): ChildProcess {
    return Object.assign(new EventEmitter(), {
      pid,
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    }) as unknown as ChildProcess;
  }

  it("root 已退出（signal）时跳过 root SIGINT", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    killSpy.mockReturnValue(true as never);

    const child = Object.assign(new EventEmitter(), {
      pid: 2000,
      exitCode: null,
      signalCode: "SIGINT",
      kill: vi.fn(() => true),
    }) as unknown as ChildProcess;

    sendGracefulAbortToProcessTree(child, 2000, 1);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it("win32：process.kill(pid, SIGINT)", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    killSpy.mockReturnValue(true as never);
    sendGracefulAbortToProcessTree(mockChildWithPid(2000), 2000, 1);
    expect(killSpy).toHaveBeenCalledWith(2000, "SIGINT");
  });

  it("unix：先 process.kill(-pid, SIGINT)", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    killSpy.mockReturnValue(true as never);
    sendGracefulAbortToProcessTree(mockChildWithPid(1234), 1234, 1);
    expect(killSpy).toHaveBeenCalledWith(-1234, "SIGINT");
  });

  it("unix 进程组 ESRCH 时不回退单 pid", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    killSpy.mockImplementation((target: number) => {
      if (target === -1234) {
        const err = new Error("kill ESRCH") as NodeJS.ErrnoException;
        err.code = "ESRCH";
        throw err;
      }
      return true as never;
    });

    sendGracefulAbortToProcessTree(mockChildWithPid(1234), 1234, 1);
    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith(-1234, "SIGINT");
  });

  it("unix 进程组失败时回退单 pid", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    killSpy.mockImplementation((target: number) => {
      if (target === -1234) {
        throw new Error("EPERM");
      }
      return true as never;
    });

    sendGracefulAbortToProcessTree(mockChildWithPid(1234), 1234, 1);
    expect(killSpy).toHaveBeenCalledWith(-1234, "SIGINT");
    expect(killSpy).toHaveBeenCalledWith(1234, "SIGINT");
  });

  it("未送达时打 warning", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    killSpy.mockReturnValue(false as never);
    sendGracefulAbortToProcessTree(mockChildWithPid(2000), 2000, 1);
    expect(killSpy).toHaveBeenCalledWith(2000, "SIGINT");
  });

  it("ESRCH 时不打日志", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.mocked(core.info).mockClear();
    vi.mocked(core.warning).mockClear();
    killSpy.mockImplementation(() => {
      const err = new Error("kill ESRCH") as NodeJS.ErrnoException;
      err.code = "ESRCH";
      throw err;
    });

    sendGracefulAbortToProcessTree(mockChildWithPid(2000), 2000, 1);

    expect(killSpy).toHaveBeenCalledWith(2000, "SIGINT");
    expect(core.info).not.toHaveBeenCalled();
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("非 ESRCH 抛错时打 warning", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.mocked(core.info).mockClear();
    vi.mocked(core.warning).mockClear();
    killSpy.mockImplementation(() => {
      throw new Error("EPERM");
    });

    sendGracefulAbortToProcessTree(mockChildWithPid(2000), 2000, 1);

    expect(killSpy).toHaveBeenCalledWith(2000, "SIGINT");
    expect(core.warning).toHaveBeenCalledWith(
      "Watchdog: 向 pid=2000 发送 SIGINT 结果：失败，EPERM",
    );
  });
});

describe("sendGracefulAbortToProcessTree", () => {
  const origPlatform = process.platform;
  const killSpy = vi.spyOn(process, "kill");

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: origPlatform });
    killSpy.mockReset();
    vi.mocked(listLiveProcessTreePids).mockReset();
  });

  it("第 1 次仅对 root 发 SIGINT", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    }) as unknown as ChildProcess;
    killSpy.mockReturnValue(true as never);

    sendGracefulAbortToProcessTree(child, 1234, 1);
    expect(killSpy).toHaveBeenCalledWith(1234, "SIGINT");
    expect(listLiveProcessTreePids).not.toHaveBeenCalled();
  });

  it("第 2 次 root 已退出时仅对后代 pid 发 SIGINT", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.mocked(listLiveProcessTreePids).mockReturnValue([2000, 2001]);
    killSpy.mockReturnValue(true as never);

    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      exitCode: 1,
      signalCode: null,
      kill: vi.fn(() => false),
    }) as unknown as ChildProcess;

    sendGracefulAbortToProcessTree(child, 1234, 2);
    expect(killSpy).not.toHaveBeenCalledWith(1234, "SIGINT");
    expect(killSpy).toHaveBeenCalledWith(2000, "SIGINT");
    expect(killSpy).toHaveBeenCalledWith(2001, "SIGINT");
  });

  it("第 2 次 root 仍存活时跳过重复 SIGINT", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.mocked(listLiveProcessTreePids).mockReturnValue([1234, 2000]);
    killSpy.mockReturnValue(true as never);

    const child = Object.assign(new EventEmitter(), {
      pid: 1234,
      exitCode: null,
      signalCode: null,
      kill: vi.fn(() => true),
    }) as unknown as ChildProcess;

    sendGracefulAbortToProcessTree(child, 1234, 2);
    expect(killSpy).toHaveBeenCalledTimes(2);
    expect(killSpy).toHaveBeenNthCalledWith(1, 1234, "SIGINT");
    expect(killSpy).toHaveBeenNthCalledWith(2, 2000, "SIGINT");
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
