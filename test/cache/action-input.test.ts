import * as core from "@actions/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readCacheKeyInput, readCacheKeyInputs, readPathInput, readPositiveIntInput } from "../../src/cache/lib/action-input.js";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

const mockedGetInput = vi.mocked(core.getInput);

const FAMILY_KEY = "fa2-ck-gfx120x-serial";
const CACHE_KEY = "fa2-ck-gfx120x-serial-v7-lock[abc]";

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

describe("action-input", () => {
  beforeEach(() => {
    mockedGetInput.mockReset();
  });

  it("readCacheKeyInput 读取并校验 cache-key", () => {
    mockedGetInput.mockImplementation((name) => {
      if (name === "cache-key") {
        return CACHE_KEY;
      }
      throw new Error(`unexpected input: ${name}`);
    });
    expect(readCacheKeyInput()).toBe(CACHE_KEY);
  });

  it("readCacheKeyInput 拒绝过短 cache-key", () => {
    mockedGetInput.mockReturnValue("short");
    expect(() => readCacheKeyInput()).toThrow(/cache-key 无效：过短/);
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

  it("readPathInput 解析换行分隔路径", () => {
    mockedGetInput.mockReturnValue("C:\\a\\build\nC:\\b\\out");
    expect(readPathInput()).toEqual(["C:\\a\\build", "C:\\b\\out"]);
    expect(mockedGetInput).toHaveBeenCalledWith("path", { required: true });
  });

  it("readPathInput 拒绝空 path", () => {
    mockedGetInput.mockReturnValue("  \n  ");
    expect(() => readPathInput()).toThrow(/path 无效：至少需要一个目录/);
  });

  it("readPositiveIntInput 拒绝空值", () => {
    mockedGetInput.mockReturnValue("");
    expect(() => readPositiveIntInput("api-try-count")).toThrow(/api-try-count 无效：空值/);
  });

  it("readPositiveIntInput 拒绝小数与非整数", () => {
    mockedGetInput.mockReturnValue("3.9");
    expect(() => readPositiveIntInput("api-try-count")).toThrow(/api-try-count 无效：3.9/);

    mockedGetInput.mockReturnValue("10abc");
    expect(() => readPositiveIntInput("api-try-count")).toThrow(/api-try-count 无效：10abc/);

    mockedGetInput.mockReturnValue("0");
    expect(() => readPositiveIntInput("api-try-count")).toThrow(/api-try-count 无效：0/);
  });

  it("readCacheKeyInput 拒绝超过 GHA 上限的 cache-key", () => {
    mockedGetInput.mockReturnValue("a".repeat(489));
    expect(() => readCacheKeyInput()).toThrow(/cache-key 无效：过长/);
  });
});
