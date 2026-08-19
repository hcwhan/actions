
import * as core from "@actions/core";

import { runAction } from "@/base/action-input.js";
import { sleep } from "@/base/retry.js";
import { parseArgsInput, parseJobStartMs, parseLimitHoursInput } from "../lib/parse-inputs.js";
import { spawnAsync } from "../lib/spawn-async.js";
import { createWatchdog } from "../lib/watchdog.js";


// 写入 run action 全部 outputs
function setRunOutputs(opts: {
  shouldRetry: boolean;
  aborted: boolean;
  forceKilled: boolean;
  taskSucceeded: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}): void {
  core.setOutput("should-retry", opts.shouldRetry ? "true" : "false");
  core.setOutput("aborted", opts.aborted ? "true" : "false");
  core.setOutput("force-killed", opts.forceKilled ? "true" : "false");
  core.setOutput("task-succeeded", opts.taskSucceeded ? "true" : "false");
  core.setOutput("exit-code", opts.exitCode === null ? "" : String(opts.exitCode));
  if (opts.signal) {
    core.info(`子进程 signal=${opts.signal}`);
  }
}

// run action 主流程：spawn 子进程 + Watchdog 超时中止
async function run(): Promise<void> {
  const cwd = core.getInput("working-directory", { required: true });
  const command = core.getInput("command", { required: true });
  const args = parseArgsInput(core.getInput("args") || "[]");
  const jobStartMs = parseJobStartMs(core.getInput("job-start-time", { required: true }));
  const limitMs = parseLimitHoursInput(core.getInput("limit-hours") || "5");

  const handle = spawnAsync(command, args, cwd);
  const watchdog = createWatchdog(handle.child, jobStartMs, limitMs);

  let exitCode: number | null = null;
  let signal: NodeJS.Signals | null = null;
  let aborted = false;
  let forceKilled = false;
  try {
    ({ exitCode, signal } = await handle.completed);
  } finally {
    ({ aborted, forceKilled } = await watchdog.waitEnded());
  }

  await sleep(5 * 1000);

  const taskSucceeded = exitCode === 0;
  const shouldRetry = aborted && !forceKilled && !taskSucceeded;
  setRunOutputs({ shouldRetry, aborted, forceKilled, taskSucceeded, exitCode, signal });

  if (!taskSucceeded) {
    if (aborted) {
      if (!forceKilled) {
        throw new Error("任务被 Watchdog 优雅中止");
      } else {
        throw new Error("任务优雅中止失败，被 Watchdog 强制中止");
      }
    } else {
      throw new Error(`任务失败: exitCode=${exitCode ?? signal ?? "未知"}`);
    }
  }
}

runAction(run);
