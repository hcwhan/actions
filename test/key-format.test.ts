import { describe, expect, it, vi } from "vitest";

import { buildVersionedCacheKey, pickNewestVersionedKey } from "../src/lib/key-format.js";

const FAMILY_KEY = "fa2-ck-gfx120x-serial";
const CACHE_KEY = "fa2-ck-gfx120x-serial-v7-lock[abc]";

describe("key-format", () => {
  it("buildVersionedCacheKey 追加 UTC 后缀 -YYYY.MM.DD-HH.mm.ss-SSS", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 7, 18, 22, 15, 39, 123)));
    const key = buildVersionedCacheKey(CACHE_KEY);
    expect(key).toBe(`${CACHE_KEY}-2026.08.18-22.15.39-123`);
    vi.useRealTimers();
  });

  it("同族 key 列表中按 cache-key 前缀取最新", () => {
    const otherSlot = `${FAMILY_KEY}-ninja[build]`;
    const keys = [`${CACHE_KEY}-2026.08.18-01.00.00-000`, `${CACHE_KEY}-2026.08.18-22.15.39-123`, `${CACHE_KEY}-2026.08.18-12.00.00-000`, `${otherSlot}-2026.08.18-99.99.99-999`];
    expect(pickNewestVersionedKey(keys, CACHE_KEY)).toBe(`${CACHE_KEY}-2026.08.18-22.15.39-123`);
  });

  it("pickNewestVersionedKey 忽略非法 UTC 后缀", () => {
    const keys = [`${CACHE_KEY}-2026.08.18-99.99.99-999`, `${CACHE_KEY}-2026.08.18-01.00.00-000`];
    expect(pickNewestVersionedKey(keys, CACHE_KEY)).toBe(`${CACHE_KEY}-2026.08.18-01.00.00-000`);
  });
});
