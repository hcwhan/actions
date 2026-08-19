
import { type ChildProcess } from "node:child_process";

import * as core from "@actions/core";

import { errorMessage } from "@/base/errors.js";
import { sleep } from "@/base/retry.js";
import { forceKillProcessTree, sendChildSigint } from "./spawn-async.js";


// 优雅中止重试间隔（毫秒）
const ABORT_RETRY_INTERVAL_MS = 60_000;
// 优雅中止最大尝试次数
const MAX_ABORT_ATTEMPTS = 3;

// 子进程是否仍在运行
function isChildRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null;
}

// 优雅中止子进程：SIGINT 重试后必要时强杀；返回是否进入强杀
async function abortChild(child: ChildProcess): Promise<boolean> {
  try {
    for (let attempt = 1; attempt <= MAX_ABORT_ATTEMPTS; attempt++) {
      if (!isChildRunning(child)) {
        return false;
      }

      core.info(
        `Watchdog: 第 ${attempt}/${MAX_ABORT_ATTEMPTS} 次优雅中止尝试，发送 SIGINT（child.kill）`,
      );
      if (!sendChildSigint(child)) {
        core.warning(
          `Watchdog: 第 ${attempt}/${MAX_ABORT_ATTEMPTS} 次 SIGINT 发送失败`,
        );
      }

      await sleep(ABORT_RETRY_INTERVAL_MS);
    }

    if (!isChildRunning(child)) {
      return false;
    }

    core.info(
      `Watchdog: ${MAX_ABORT_ATTEMPTS} 次优雅中止已耗尽，强制终止 pid=${child.pid}`,
    );
    if (!forceKillProcessTree(child.pid)) {
      core.warning(
        `Watchdog: 强制终止可能失败，子进程可能仍在运行（pid=${child.pid}）`,
      );
    }
    // 表示进入强杀流程，不表示 kill 一定成功
    return true;
  } catch (err) {
    core.warning(`Watchdog: 优雅中止子进程失败：${errorMessage(err)}`);
    return false;
  }
}


// 创建 Watchdog 实例：超时后 SIGINT 优雅中止，耗尽后强杀进程树
export function createWatchdog(
  child: ChildProcess,
  jobStartMs: number,
  limitMs: number,
) {
  let aborted = false;
  let forceKilled = false;

  let isAborting = false;
  let abortPromise: Promise<void> = Promise.resolve();


  // 如果正在中止中，则拦截父 Node 收到的 SIGINT
  const onSigint = (): void => {
    if (isAborting) {
      core.info("Watchdog: 中止过程中收到 SIGINT（Node 进程保持运行）");
      return;
    }
    process.exit(130);
  };
  process.on("SIGINT", onSigint);


  const runAbortChild = async (): Promise<void> => {
    isAborting = true;
    forceKilled = await abortChild(child);
    isAborting = false;
  };

  const deadlineTimer = setTimeout((): void => {
    if (!isChildRunning(child)) {
      return;
    }

    aborted = true;
    core.info(
      `Watchdog: 任务已运行 ${Date.now() - jobStartMs}ms >= ${limitMs}ms，开始优雅中止`,
    );

    abortPromise = runAbortChild();
  }, jobStartMs + limitMs - Date.now());


  const stop = (): void => {
    isAborting = false;
    clearTimeout(deadlineTimer);
    process.removeListener("SIGINT", onSigint);
  };


  return {
    waitEnded: async () => {
      try {
        await abortPromise;
        return { aborted, forceKilled };
      } finally {
        stop();
      }
    },
  };
}
