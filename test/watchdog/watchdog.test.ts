
import { EventEmitter } from "node:events";
import { type ChildProcess } from "node:child_process";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createWatchdog } from "@/watchdog/lib/watchdog.js";
import {
  isProcessTreeEmpty,
  waitForProcessTreeEmpty,
} from "@/watchdog/lib/process-tree.js";
import {
  forceKillProcessTree,
  sendGracefulAbortToProcessTree,
} from "@/watchdog/lib/spawn-async.js";


vi.mock("@/watchdog/lib/process-tree.js", () => ({
  isProcessTreeEmpty: vi.fn(),
  waitForProcessTreeEmpty: vi.fn(),
}));

vi.mock("@/watchdog/lib/spawn-async.js", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/watchdog/lib/spawn-async.js")>();
  return {
    ...orig,
    forceKillProcessTree: vi.fn(() => true),
    sendGracefulAbortToProcessTree: vi.fn(),
  };
});

// 与 watchdog 实现一致的优雅中止重试间隔
const ABORT_RETRY_INTERVAL_MS = 60_000;
// 与 watchdog 实现一致的最大中止尝试次数
const MAX_ABORT_ATTEMPTS = 5;

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
    vi.mocked(isProcessTreeEmpty).mockReturnValue(false);
    vi.mocked(waitForProcessTreeEmpty).mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.mocked(isProcessTreeEmpty).mockReset();
    vi.mocked(waitForProcessTreeEmpty).mockReset();
    vi.mocked(forceKillProcessTree).mockReset();
    vi.mocked(sendGracefulAbortToProcessTree).mockReset();
  });

  it("deadline 触发 abort 且进程树清空", async () => {
    const limitMs = 5_000;
    const jobStartMs = Date.now();
    const child = mockRunningChild();
    const handle = createWatchdog(child, jobStartMs, limitMs);

    await vi.advanceTimersByTimeAsync(limitMs);
    const settled = handle.waitEnded();

    await vi.runAllTimersAsync();
    await expect(settled).resolves.toEqual({
      aborted: true,
      forceKilled: false,
    });
    expect(sendGracefulAbortToProcessTree).toHaveBeenCalledWith(child, 1234, 1);
    expect(waitForProcessTreeEmpty).toHaveBeenCalledWith(1234, ABORT_RETRY_INTERVAL_MS);
  });

  it("deadline 触发且进程树已空时 aborted 为 true、不发送 SIGINT", async () => {
    vi.mocked(isProcessTreeEmpty).mockReturnValue(true);

    const limitMs = 5_000;
    const jobStartMs = Date.now();
    const child = mockRunningChild();
    const handle = createWatchdog(child, jobStartMs, limitMs);

    await vi.advanceTimersByTimeAsync(limitMs);

    await expect(handle.waitEnded()).resolves.toEqual({
      aborted: true,
      forceKilled: false,
    });
    expect(sendGracefulAbortToProcessTree).not.toHaveBeenCalled();
  });

  it("5 次 SIGINT 等待后强杀进程树", async () => {
    vi.mocked(waitForProcessTreeEmpty).mockResolvedValue(false);

    const limitMs = 1_000;
    const jobStartMs = Date.now();
    const child = mockRunningChild();
    const handle = createWatchdog(child, jobStartMs, limitMs);

    await vi.advanceTimersByTimeAsync(limitMs);
    const settled = handle.waitEnded();

    await vi.runAllTimersAsync();
    await expect(settled).resolves.toEqual({
      aborted: true,
      forceKilled: true,
    });
    expect(sendGracefulAbortToProcessTree).toHaveBeenCalledTimes(MAX_ABORT_ATTEMPTS);
    for (let attempt = 1; attempt <= MAX_ABORT_ATTEMPTS; attempt++) {
      expect(sendGracefulAbortToProcessTree).toHaveBeenNthCalledWith(attempt, child, 1234, attempt);
    }
    expect(waitForProcessTreeEmpty).toHaveBeenCalledTimes(MAX_ABORT_ATTEMPTS + 1);
    expect(forceKillProcessTree).toHaveBeenCalledWith(1234);
  });
});
