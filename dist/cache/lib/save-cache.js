import * as cache from "../../vendor/cache/index.js";
import { context } from "../../vendor/github/index.js";
// saveCache 返回 cacheId < 0 时抛出；retryable=false 表示重试无意义（只读 token / cache-mode 等）
export class CacheSaveSkippedError extends Error {
    retryable;
    constructor(message, retryable) {
        super(message);
        this.name = "CacheSaveSkippedError";
        this.retryable = retryable;
    }
}
// ACTIONS_CACHE_MODE=read|none 时 save 必失败，提前拦截
function getCacheModeWriteBlockReason() {
    const mode = (process.env.ACTIONS_CACHE_MODE ?? "").trim().toLowerCase();
    if (mode === "read" || mode === "none") {
        return `ACTIONS_CACHE_MODE=${mode} 不允许写入 cache`;
    }
    return null;
}
// fork PR 的 GITHUB_TOKEN 对 cache 通常为只读（@actions/cache 会返回 cacheId=-1 并 warning）
function isForkPullRequestWriteBlocked() {
    if (context.eventName !== "pull_request") {
        return false;
    }
    const payload = context.payload;
    return payload.pull_request?.head?.repo?.fork === true;
}
// 构造 save 跳过/失败的可读错误信息
function buildSaveSkippedMessage(cacheKeyFull, reason) {
    return (`cache.saveCache 未写入（cache-key-full=${cacheKeyFull}）：${reason}。` +
        `@actions/cache 已在上方日志记录详情（搜索 "Failed to save" / "cache write denied"）`);
}
// CacheSaveSkippedError 是否值得继续重试
export function isSaveRetryable(error) {
    return !(error instanceof CacheSaveSkippedError) || error.retryable;
}
// 单次 saveCache：成功返回；cacheId < 0 时抛出带 retryable 标记的 CacheSaveSkippedError
export async function saveCacheOnce(paths, cacheKeyFull) {
    const modeBlock = getCacheModeWriteBlockReason();
    if (modeBlock) {
        throw new CacheSaveSkippedError(buildSaveSkippedMessage(cacheKeyFull, modeBlock), false);
    }
    if (isForkPullRequestWriteBlocked()) {
        throw new CacheSaveSkippedError(buildSaveSkippedMessage(cacheKeyFull, "fork PR 的 cache token 为只读"), false);
    }
    const cacheId = await cache.saveCache(paths, cacheKeyFull);
    if (cacheId < 0) {
        throw new CacheSaveSkippedError(buildSaveSkippedMessage(cacheKeyFull, "可能为 key 争用、配额限制或其他 transient 失败（只读 token 时见 cache write denied）"), true);
    }
}
//# sourceMappingURL=save-cache.js.map