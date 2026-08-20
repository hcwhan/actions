
import * as core from "@actions/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readCacheKeyInputs } from "@/cache/lib/read-cache-keys.js";


vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

// mock core.getInput
const mockedGetInput = vi.mocked(core.getInput);

// 测试用 family-key
const FAMILY_KEY = "fa2-ck-serial";
// 测试用 cache-key
const CACHE_KEY = "fa2-ck-serial-v7-lock[abc]";

// 按 name 返回 family-key / cache-key mock 值
function mockCacheKeyInputs(familyKey: string, cacheKey: string): void {
  mockedGetInput.mockImplementation((name) => {
    if (name === "family-key") {
      return familyKey;
    }
    if (name === "cache-key") {
      return cacheKey;
    }
    throw new Error(`unexpected input: ${name}`);
  });
}

describe("read-cache-keys", () => {
  beforeEach(() => {
    mockedGetInput.mockReset();
  });

  it("readCacheKeyInputs 读取并校验 key 对", () => {
    mockCacheKeyInputs(FAMILY_KEY, CACHE_KEY);
    expect(readCacheKeyInputs()).toEqual({ familyKey: FAMILY_KEY, cacheKey: CACHE_KEY });
  });

  it("readCacheKeyInputs 要求 cache-key 以 family-key 为前缀", () => {
    mockCacheKeyInputs(FAMILY_KEY, "other-prefix-not-family");
    expect(() => readCacheKeyInputs()).toThrow(/必须以 family-key 为前缀/);
  });

  it("readCacheKeyInputs 要求 cache-key 严格长于 family-key", () => {
    mockCacheKeyInputs(FAMILY_KEY, FAMILY_KEY);
    expect(() => readCacheKeyInputs()).toThrow(/必须严格长于 family-key/);
  });

  it("readCacheKeyInputs 拒绝过短 key", () => {
    mockCacheKeyInputs("short", CACHE_KEY);
    expect(() => readCacheKeyInputs()).toThrow(/family-key 无效：过短/);

    mockCacheKeyInputs(FAMILY_KEY, "short");
    expect(() => readCacheKeyInputs()).toThrow(/cache-key 无效：过短/);
  });

  it("readCacheKeyInputs 拒绝超过 GHA 上限的 cache-key", () => {
    mockCacheKeyInputs(FAMILY_KEY, "a".repeat(489));
    expect(() => readCacheKeyInputs()).toThrow(/cache-key 无效：过长/);
  });

  it("readCacheKeyInputs 拒绝 cache-key 非法字符", () => {
    mockCacheKeyInputs(FAMILY_KEY, "invalid key with spaces");
    expect(() => readCacheKeyInputs()).toThrow(/cache-key 无效：包含非法字符/);
  });

  it("readCacheKeyInputs 拒绝 family-key 非法字符", () => {
    mockCacheKeyInputs("bad key!", CACHE_KEY);
    expect(() => readCacheKeyInputs()).toThrow(/family-key 无效：包含非法字符/);
  });
});
