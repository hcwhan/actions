import * as core from "@actions/core";

import { errorMessage, toError } from "./errors.js";


// 异步 sleep
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


// withRetry 参数：label 必传，do 为待执行异步函数，try 为最多尝试次数
interface RetryOptions<T> {
  label: string;
  do: () => Promise<T>;
  try?: number;
  delayMs?: number;
  isRetryable?: (error: unknown) => boolean;
}

// 瞬态失败时线性退避重试；末次仍失败则抛出
export async function withRetry<T>(options: RetryOptions<T>): Promise<T> {
  const { label, do: fn } = options;
  const tryCount = options.try ?? 3;
  const delayMs = options.delayMs ?? 1000;
  const isRetryable = options.isRetryable ?? (() => true);

  let lastError: unknown;
  for (let tryIndex = 1; tryIndex <= tryCount; tryIndex++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      core.warning(`${label} 失败（第 ${tryIndex}/${tryCount} 次）: ${errorMessage(error)}`);
      if (!isRetryable(error)) {
        throw toError(error, `${label} 失败（不可重试）`);
      }
      if (tryIndex < tryCount) {
        await sleep(delayMs * tryIndex);
      }
    }
  }

  throw toError(lastError, `${label} 在 ${tryCount} 次尝试后仍失败`);
}
