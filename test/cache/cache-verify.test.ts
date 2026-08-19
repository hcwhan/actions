import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pollUntilCacheExists } from "../../src/cache/lib/cache-verify.js";

vi.mock("../../src/cache/lib/cache-list.js", () => ({
  cacheKeyFullExists: vi.fn(),
}));

import { cacheKeyFullExists } from "../../src/cache/lib/cache-list.js";

const mockedExists = vi.mocked(cacheKeyFullExists);

describe("cache-verify", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedExists.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("首次检查命中时立即返回 true", async () => {
    mockedExists.mockResolvedValue(true);
    await expect(
      pollUntilCacheExists({
        cacheKeyFull: "key-2026.08.18-01.00.00-000",
        intervalSec: 10,
        timeoutSec: 180,
        apiTryCount: 1,
      }),
    ).resolves.toBe(true);
    expect(mockedExists).toHaveBeenCalledTimes(1);
  });

  it("deadline 到达前不再 sleep 超过剩余时间", async () => {
    mockedExists.mockResolvedValue(false);
    const pollPromise = pollUntilCacheExists({
      cacheKeyFull: "key-2026.08.18-01.00.00-000",
      intervalSec: 10,
      timeoutSec: 1,
      apiTryCount: 1,
    });

    await vi.advanceTimersByTimeAsync(1000);
    await expect(pollPromise).resolves.toBe(false);
    expect(mockedExists.mock.calls.length).toBeGreaterThanOrEqual(1);
  });
});
