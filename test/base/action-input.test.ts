import * as core from "@actions/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { readBooleanInput, readPathInput, readPositiveIntInput } from "@/base/action-input.js";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

const mockedGetInput = vi.mocked(core.getInput);

describe("action-input", () => {
  beforeEach(() => {
    mockedGetInput.mockReset();
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

  it("readBooleanInput 解析 true/false", () => {
    mockedGetInput.mockReturnValue("true");
    expect(readBooleanInput("cleanup-stale")).toBe(true);

    mockedGetInput.mockReturnValue("FALSE");
    expect(readBooleanInput("cleanup-stale")).toBe(false);
  });

  it("readBooleanInput 拒绝空值与非法值", () => {
    mockedGetInput.mockReturnValue("");
    expect(() => readBooleanInput("cleanup-stale")).toThrow(/cleanup-stale 无效：空值/);

    mockedGetInput.mockReturnValue("yes");
    expect(() => readBooleanInput("cleanup-stale")).toThrow(/cleanup-stale 无效：yes/);
  });
});
