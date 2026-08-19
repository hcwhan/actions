
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  isProcessTreeEmpty,
  listLiveProcessTreePids,
} from "@/watchdog/lib/process-tree.js";


vi.mock("node:child_process", async (importOriginal) => {
  const orig = await importOriginal<typeof import("node:child_process")>();
  return { ...orig, spawnSync: vi.fn() };
});

describe("listLiveProcessTreePids", () => {
  const origPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: origPlatform });
    vi.mocked(spawnSync).mockReset();
  });

  it("unix: 返回 root 及其后代中仍存活的 pid", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: [
        "1 0",
        "100 1",
        "200 100",
        "201 100",
        "300 1",
      ].join("\n"),
      stderr: "",
    } as never);

    expect(listLiveProcessTreePids(100)).toEqual([100, 200, 201]);
  });

  it("unix: root 已退出但后代仍存活", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: [
        "1 0",
        "200 100",
        "201 100",
      ].join("\n"),
      stderr: "",
    } as never);

    expect(listLiveProcessTreePids(100)).toEqual([200, 201]);
  });

  it("win32: 解析 powershell 输出", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: "100,1\n200,100\n201,100\n",
      stderr: "",
    } as never);

    const pids = listLiveProcessTreePids(100);

    expect(spawnSync).toHaveBeenCalledWith(
      "powershell",
      expect.arrayContaining(["-NoProfile", "-NonInteractive", "-Command"]),
      expect.objectContaining({ shell: false }),
    );
    expect(pids).toEqual([100, 200, 201]);
  });
});

describe("isProcessTreeEmpty", () => {
  const origPlatform = process.platform;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: origPlatform });
    vi.mocked(spawnSync).mockReset();
  });

  it("无存活进程时返回 true", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: "1 0\n",
      stderr: "",
    } as never);

    expect(isProcessTreeEmpty(100)).toBe(true);
  });
});
