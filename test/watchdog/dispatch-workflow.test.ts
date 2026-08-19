
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createOctokit, getGithubRepoContext } from "@/base/github-context.js";
import * as retry from "@/base/retry.js";
import { dispatchRetryWorkflow } from "@/watchdog/lib/dispatch-workflow.js";


vi.mock("@/base/github-context.js", () => ({
  createOctokit: vi.fn(),
  getGithubRepoContext: vi.fn(),
  getGithubRefName: vi.fn(),
}));

// mock createOctokit
const mockedCreateOctokit = vi.mocked(createOctokit);
// mock getGithubRepoContext
const mockedGetGithubRepoContext = vi.mocked(getGithubRepoContext);

describe("dispatchRetryWorkflow", () => {
  const createWorkflowDispatch = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(retry, "sleep");
    createWorkflowDispatch.mockReset();
    mockedGetGithubRepoContext.mockReturnValue({
      owner: "hcwhan",
      repo: "actions",
      ref: "refs/heads/main",
    });
    mockedCreateOctokit.mockReturnValue({
      rest: {
        actions: {
          createWorkflowDispatch,
        },
      },
    } as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("createWorkflowDispatch 连续 3 次失败时不发生第 4 次调用", async () => {
    createWorkflowDispatch.mockRejectedValue(new Error("API error"));

    const promise = dispatchRetryWorkflow({
      workflowFile: "build.yml",
      ref: "main",
      retryCount: 2,
      dispatchInputs: { use_cache: "true" },
    });
    const expectation = expect(promise).rejects.toThrow(/API error/);
    await vi.runAllTimersAsync();
    await expectation;

    expect(createWorkflowDispatch).toHaveBeenCalledTimes(3);
  });

  it("成功 dispatch 后等待 5 分钟并 throw", async () => {
    createWorkflowDispatch.mockResolvedValue(undefined);

    const promise = dispatchRetryWorkflow({
      workflowFile: "build.yml",
      ref: "main",
      retryCount: 0,
      dispatchInputs: { ninja_workers: "8" },
    });
    const expectation = expect(promise).rejects.toThrow(/retry run 未在 5 分钟内取消当前 run/);
    await vi.runAllTimersAsync();
    await expectation;

    expect(createWorkflowDispatch).toHaveBeenCalledTimes(1);
    expect(createWorkflowDispatch).toHaveBeenCalledWith({
      owner: "hcwhan",
      repo: "actions",
      workflow_id: "build.yml",
      ref: "main",
      inputs: { ninja_workers: "8", retry_count: "1" },
    });
    expect(retry.sleep).toHaveBeenCalledTimes(1);
    expect(retry.sleep).toHaveBeenCalledWith(5 * 60_000);
  });
});
