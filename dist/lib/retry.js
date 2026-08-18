import * as core from "../vendor/core/index.js";
import { errorMessage, toError } from "./errors.js";
// 异步 sleep
export async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// 瞬态失败时线性退避重试；末次仍失败则抛出
export async function withRetry(options) {
    const { label, do: fn } = options;
    const tryCount = options.try ?? 3;
    const delayMs = options.delayMs ?? 1000;
    const isRetryable = options.isRetryable ?? (() => true);
    let lastError;
    for (let tryIndex = 1; tryIndex <= tryCount; tryIndex++) {
        try {
            return await fn();
        }
        catch (error) {
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
//# sourceMappingURL=retry.js.map