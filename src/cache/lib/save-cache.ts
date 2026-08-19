import * as cache from "@actions/cache";
import { context } from "@actions/github";

// saveCache 返回 cacheId < 0 时抛出；retryable=false 表示重试无意义（只读 token / cache-mode 等）
export class CacheSaveSkippedError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "CacheSaveSkippedError";
    this.retryable = retryable;
  }
}

// ACTIONS_CACHE_MODE=read|none 时 save 必失败，提前拦截
function getCacheModeWriteBlockReason(): string | null {
  const mode = (process.env.ACTIONS_CACHE_MODE ?? "").trim().toLowerCase();
  if (mode === "read" || mode === "none") {
    return `ACTIONS_CACHE_MODE=${mode} 不允许写入 cache`;
  }
  return null;
}

// fork PR 的 GITHUB_TOKEN 对 cache 通常为只读（@actions/cache 会返回 cacheId=-1 并 warning）
function isForkPullRequestWriteBlocked(): boolean {
  if (context.eventName !== "pull_request") {
    return false;
  }
  const payload = context.payload as { pull_request?: { head?: { repo?: { fork?: boolean } } } };
  return payload.pull_request?.head?.repo?.fork === true;
}

function buildSaveSkippedMessage(cacheKeyFull: string, reason: string): string {
  return (
    `cache.saveCache 未写入（cache-key-full=${cacheKeyFull}）：${reason}。` +
    `@actions/cache 已在上方日志记录详情（搜索 "Failed to save" / "cache write denied"）`
  );
}

// CacheSaveSkippedError 是否值得继续重试
export function isSaveRetryable(error: unknown): boolean {
  return !(error instanceof CacheSaveSkippedError) || error.retryable;
}

// 单次 saveCache：成功返回；cacheId < 0 时抛出带 retryable 标记的 CacheSaveSkippedError
export async function saveCacheOnce(paths: string[], cacheKeyFull: string): Promise<void> {
  const modeBlock = getCacheModeWriteBlockReason();
  if (modeBlock) {
    throw new CacheSaveSkippedError(buildSaveSkippedMessage(cacheKeyFull, modeBlock), false);
  }

  if (isForkPullRequestWriteBlocked()) {
    throw new CacheSaveSkippedError(
      buildSaveSkippedMessage(cacheKeyFull, "fork PR 的 cache token 为只读"),
      false,
    );
  }

  const cacheId = await cache.saveCache(paths, cacheKeyFull);
  if (cacheId < 0) {
    throw new CacheSaveSkippedError(
      buildSaveSkippedMessage(
        cacheKeyFull,
        "可能为 key 争用、配额限制或其他 transient 失败（只读 token 时见 cache write denied）",
      ),
      true,
    );
  }
}
