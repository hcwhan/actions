
import * as core from "@actions/core";

import { runAction, readNonNegativeIntInput } from "@/base/action-input.js";
import { getGithubRefName } from "@/base/github-context.js";
import { dispatchRetryWorkflow } from "../lib/dispatch-workflow.js";
import { parseDispatchInputs } from "../lib/parse-inputs.js";


// dispatch-retry action 主流程：校验 inputs 后 dispatch 重试 workflow
async function run(): Promise<void> {
  const shouldRetry = core.getInput("should-retry", { required: true }).trim();
  if (shouldRetry !== "true") {
    throw new Error(`should-retry 须为 true（当前：${shouldRetry || "空"}）`);
  }

  const useCache = core.getInput("use-cache", { required: true }).trim();
  if (useCache !== "true") {
    throw new Error(`use-cache 须为 true（当前：${useCache || "空"}）`);
  }

  const retryCount = readNonNegativeIntInput("retry-count");
  const maxRetryCount = readNonNegativeIntInput("max-retry-count");
  if (retryCount >= maxRetryCount) {
    throw new Error(`retry-count (${retryCount}) 须小于 max-retry-count (${maxRetryCount})`);
  }

  const workflowFile = core.getInput("workflow-file", { required: true }).trim();
  if (!workflowFile) {
    throw new Error("workflow-file 无效：空值");
  }

  const ref = core.getInput("ref").trim() || getGithubRefName();
  const dispatchInputs = parseDispatchInputs(core.getInput("dispatch-inputs") || "{}");

  await dispatchRetryWorkflow({
    workflowFile,
    ref,
    dispatchInputs,
    retryCount,
  });
}

runAction(run);
