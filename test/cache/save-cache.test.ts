import * as cache from "@actions/cache";
import { context } from "@actions/github";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CacheSaveSkippedError, saveCacheOnce } from "../../src/cache/lib/save-cache.js";

vi.mock("@actions/cache", () => ({
  saveCache: vi.fn(),
}));

vi.mock("@actions/github", () => ({
  context: {
    eventName: "push",
    payload: {},
  },
}));

const mockedSaveCache = vi.mocked(cache.saveCache);

describe("save-cache", () => {
  beforeEach(() => {
    mockedSaveCache.mockReset();
    delete process.env.ACTIONS_CACHE_MODE;
    context.eventName = "push";
    context.payload = {};
  });

  it("saveCache 成功时不抛出", async () => {
    mockedSaveCache.mockResolvedValue(42);
    await expect(saveCacheOnce(["./build"], "my-cache-key-2026.08.18-01.00.00-000")).resolves.toBeUndefined();
  });

  it("ACTIONS_CACHE_MODE=read 时立即失败且不可重试", async () => {
    process.env.ACTIONS_CACHE_MODE = "read";
    await expect(saveCacheOnce(["./build"], "my-cache-key-2026.08.18-01.00.00-000")).rejects.toSatisfy(
      (error: unknown) => error instanceof CacheSaveSkippedError && error.retryable === false,
    );
    expect(mockedSaveCache).not.toHaveBeenCalled();
  });

  it("fork PR 时立即失败且不可重试", async () => {
    Object.assign(context, {
      eventName: "pull_request",
      payload: { pull_request: { head: { repo: { fork: true } } } },
    });
    await expect(saveCacheOnce(["./build"], "foo-2026.08.18-01.00.00-000")).rejects.toSatisfy(
      (error: unknown) => error instanceof CacheSaveSkippedError && error.retryable === false,
    );
    expect(mockedSaveCache).not.toHaveBeenCalled();
  });

  it("cacheId=-1 时可重试", async () => {
    mockedSaveCache.mockResolvedValue(-1);
    await expect(saveCacheOnce(["./build"], "foo-2026.08.18-01.00.00-000")).rejects.toSatisfy(
      (error: unknown) => error instanceof CacheSaveSkippedError && error.retryable === true,
    );
  });
});
