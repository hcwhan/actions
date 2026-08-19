
import { EventEmitter } from "node:events";
import { type ChildProcess } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWatchdog } from "@/watchdog/lib/watchdog.js";
import { forceKillProcessTree } from "@/watchdog/lib/spawn-async.js";


vi.mock("@/watchdog/lib/spawn-async.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/watchdog/lib/spawn-async.js")>();
  return { ...orig, forceKillProcessTree: vi.fn(() => true) };
});

// 与 watchdog 实现一致的优雅中止重试间隔
const ABORT_RETRY_INTERVAL_MS = 60_000;
// 与 watchdog 实现一致的最大中止尝试次数
const MAX_ABORT_ATTEMPTS = 3;

// 构造仍在运行的 mock 子进程
function mockRunningChild(): ChildProcess {
  return Object.assign(new EventEmitter(), {
    pid: 1234,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => true),
  }) as unknown as ChildProcess;
}

describe("createWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(forceKillProcessTree).mockReset();
  });

  it("deadline triggers abort when child is running", async () => {
    const limitMs = 5_000;
    const jobStartMs = Date.now();
    const child = mockRunningChild();
    const handle = createWatchdog(child, jobStartMs, limitMs);

    await vi.advanceTimersByTimeAsync(limitMs);
    Object.defineProperty(child, "exitCode", { value: 1, configurable: true });
    await vi.advanceTimersByTimeAsync(ABORT_RETRY_INTERVAL_MS);

    await expect(handle.waitAbortSettled()).resolves.toEqual({
      aborted: true,
      forceKilled: false,
    });
  });

  it("deadline after child exited keeps aborted false", async () => {
    const limitMs = 5_000;
    const jobStartMs = Date.now();
    const child = mockRunningChild();
    const handle = createWatchdog(child, jobStartMs, limitMs);

    Object.defineProperty(child, "exitCode", { value: 0, configurable: true });

    await vi.advanceTimersByTimeAsync(limitMs);

    await expect(handle.waitAbortSettled()).resolves.toEqual({
      aborted: false,
      forceKilled: false,
    });
  });

  it("3 SIGINT attempts then force kill sets forceKilled true", async () => {
    const limitMs = 1_000;
    const jobStartMs = Date.now();
    const child = mockRunningChild();
    const handle = createWatchdog(child, jobStartMs, limitMs);

    await vi.advanceTimersByTimeAsync(limitMs);
    await vi.advanceTimersByTimeAsync(ABORT_RETRY_INTERVAL_MS * MAX_ABORT_ATTEMPTS);

    await expect(handle.waitAbortSettled()).resolves.toEqual({
      aborted: true,
      forceKilled: true,
    });
    expect(child.kill).toHaveBeenCalledTimes(3);
    expect(child.kill).toHaveBeenCalledWith("SIGINT");
    expect(forceKillProcessTree).toHaveBeenCalledWith(1234);
  });
});
