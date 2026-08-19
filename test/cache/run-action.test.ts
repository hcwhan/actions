import * as core from "@actions/core";
import { describe, expect, it, vi } from "vitest";

import { runAction } from "../../src/cache/lib/action-input.js";

vi.mock("@actions/core", () => ({
  getInput: vi.fn(),
  setOutput: vi.fn(),
  setFailed: vi.fn(),
}));

const mockedSetFailed = vi.mocked(core.setFailed);

describe("runAction", () => {
  it("失败时向 setFailed 传递 Error 以保留 stack", async () => {
    const boom = new Error("boom");
    runAction(async () => {
      throw boom;
    });
    await vi.waitFor(() => {
      expect(mockedSetFailed).toHaveBeenCalledWith(boom);
    });
  });
});
