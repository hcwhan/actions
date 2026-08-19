
import { type ChildProcess } from "node:child_process";

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

      console.log(
        `Watchdog: abort attempt ${attempt}/${MAX_ABORT_ATTEMPTS}, sending SIGINT (child.kill)`,
      );
      if (!sendChildSigint(child)) {
        console.warn(
          `Watchdog: SIGINT attempt ${attempt}/${MAX_ABORT_ATTEMPTS} failed`,
        );
      }

      await sleep(ABORT_RETRY_INTERVAL_MS);
    }

    if (!isChildRunning(child)) {
      return false;
    }

    console.log(
      `Watchdog: ${MAX_ABORT_ATTEMPTS} abort attempts exhausted, force killing pid=${child.pid}`,
    );
    if (!forceKillProcessTree(child.pid)) {
      console.warn(
        `Watchdog: force kill may have failed; child may still be running (pid=${child.pid})`,
      );
    }
    // 表示进入强杀流程，不表示 kill 一定成功
    return true;
  } catch (err) {
    console.warn("Watchdog: abortChild failed", err);
    return false;
  }
}

// 看门狗中止结果
interface WatchdogAbortState {
  aborted: boolean;
  forceKilled: boolean;
}

// 看门狗句柄：等待中止完成并读取状态（完成后自动清理）
interface WatchdogHandle {
  waitAbortSettled: () => Promise<WatchdogAbortState>;
}


// 创建看门狗：超时后 SIGINT 优雅中止，耗尽后强杀进程树
export function createWatchdog(
  child: ChildProcess,
  jobStartMs: number,
  limitMs: number,
): WatchdogHandle {
  let aborted = false;
  let forceKilled = false;

  let isAborting = false;
  let abortPromise: Promise<void> = Promise.resolve();


  // 如果正在中止中，则拦截父 Node 收到的 SIGINT
  const onSigint = (): void => {
    if (isAborting) {
      console.log("Watchdog: received SIGINT while aborting (Node stays alive)");
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
    console.log(
      `Watchdog: job elapsed ${Date.now() - jobStartMs}ms >= ${limitMs}ms, beginning graceful abort`,
    );

    abortPromise = runAbortChild();
  }, jobStartMs + limitMs - Date.now());


  const stop = (): void => {
    isAborting = false;
    clearTimeout(deadlineTimer);
    process.removeListener("SIGINT", onSigint);
  };


  return {
    waitAbortSettled: async () => {
      try {
        await abortPromise;
        return { aborted, forceKilled };
      } finally {
        stop();
      }
    },
  };
}
