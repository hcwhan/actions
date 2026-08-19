
import { type ChildProcess } from "node:child_process";

import * as core from "@actions/core";

import { errorMessage } from "@/base/errors.js";
import { isProcessTreeEmpty, waitForProcessTreeEmpty } from "./process-tree.js";
import { forceKillProcessTree, sendGracefulAbortToProcessTree } from "./spawn-async.js";


// 优雅中止重试间隔（毫秒）
const ABORT_RETRY_INTERVAL_MS = 60_000;
// 优雅中止最大尝试次数
const MAX_ABORT_ATTEMPTS = 5;


// 优雅中止进程树：SIGINT 重试后必要时强杀；返回是否进入强杀
async function abortChild(child: ChildProcess): Promise<boolean> {
  const rootPid = child.pid;
  if (rootPid === undefined) {
    core.warning("Watchdog: abortChild 跳过（子进程无 pid）");
    return false;
  }

  try {
    for (let attempt = 1; attempt <= MAX_ABORT_ATTEMPTS; attempt++) {
      if (isProcessTreeEmpty(rootPid)) {
        return false;
      }

      core.info(
        `Watchdog: 第 ${attempt}/${MAX_ABORT_ATTEMPTS} 次优雅中止尝试，发送 SIGINT（进程树 root pid=${rootPid}）`,
      );
      sendGracefulAbortToProcessTree(child, rootPid, attempt);

      const isEmpty = await waitForProcessTreeEmpty(rootPid, ABORT_RETRY_INTERVAL_MS);
      if (isEmpty) {
        core.info(`Watchdog: 进程树已清空（root pid=${rootPid}）`);
        return false;
      }
    }

    if (isProcessTreeEmpty(rootPid)) {
      return false;
    }

    core.info(
      `Watchdog: ${MAX_ABORT_ATTEMPTS} 次优雅中止已耗尽，强制终止进程树 pid=${rootPid}`,
    );
    if (!forceKillProcessTree(rootPid)) {
      core.warning(
        `Watchdog: 强制终止可能失败，进程树可能仍在运行（root pid=${rootPid}）`,
      );
    }

    await waitForProcessTreeEmpty(rootPid, ABORT_RETRY_INTERVAL_MS);

    if (!isProcessTreeEmpty(rootPid)) {
      core.warning(
        `Watchdog: 强制终止后进程树仍有残留（root pid=${rootPid}）`,
      );
    }

    // 表示进入强杀流程，不表示 kill 一定成功
    return true;
  } catch (err) {
    core.warning(`Watchdog: 中止子进程失败：${errorMessage(err)}`);
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
    core.info(
      `Watchdog: 任务已运行 ${Date.now() - jobStartMs}ms >= ${limitMs}ms，开始优雅中止`,
    );

    aborted = true;
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
