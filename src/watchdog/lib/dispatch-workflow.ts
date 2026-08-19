
import * as core from "@actions/core";

import { createOctokit, getGithubRepoContext } from "@/base/github-context.js";
import { sleep, withRetry } from "@/base/retry.js";


// createWorkflowDispatch 最多尝试次数
const DISPATCH_ATTEMPTS = 3;
// dispatch 重试线性退避基数（毫秒）：30s、60s
const DISPATCH_RETRY_DELAY_MS = 30_000;
// dispatch 后等待 concurrency 取消当前 run 的超时（分钟）
const CANCEL_WAIT_MINUTES = 5;

// dispatch 重试 workflow 并等待当前 run 被取消
export async function dispatchRetryWorkflow(opts: {
  workflowFile: string;
  ref: string;
  dispatchInputs: Record<string, string>;
  retryCount: number;
}): Promise<void> {
  const { owner, repo } = getGithubRepoContext();
  const octokit = createOctokit();
  const nextRetryCount = opts.retryCount + 1;

  await withRetry({
    label: "createWorkflowDispatch",
    try: DISPATCH_ATTEMPTS,
    delayMs: DISPATCH_RETRY_DELAY_MS,
    do: async () => {
      await octokit.rest.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: opts.workflowFile,
        ref: opts.ref,
        inputs: { ...opts.dispatchInputs, retry_count: String(nextRetryCount) },
      });
      core.info(`已 dispatch retry_count=${nextRetryCount}`);
    },
  });

  core.info(`等待 ${CANCEL_WAIT_MINUTES} 分钟以便 concurrency 取消当前 run…`);
  await sleep(CANCEL_WAIT_MINUTES * 60_000);
  throw new Error(`retry run 未在 ${CANCEL_WAIT_MINUTES} 分钟内取消当前 run`);
}
