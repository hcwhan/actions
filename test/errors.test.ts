import { describe, expect, it } from "vitest";

import { errorMessage, toError } from "../src/lib/errors.js";

describe("errors", () => {
  it("errorMessage 提取 Error.message", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("errorMessage 将非 Error 转为字符串", () => {
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("42");
  });

  it("toError 保留原 Error", () => {
    const original = new Error("keep");
    expect(toError(original, "fallback")).toBe(original);
  });

  it("toError 用 fallback 包装非 Error", () => {
    expect(toError("plain", "fallback").message).toBe("fallback");
  });
});
