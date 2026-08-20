
import * as core from "@actions/core";
import * as cache from "@actions/cache";

import { readBooleanInput, readPathInput, readPositiveIntInput, runAction } from "@/base/action-input.js";
import { withRetry } from "@/base/retry.js";
import { readCacheKeyInputs } from "../lib/read-cache-keys.js";
import { deleteStaleFamilyKeys, resolveNewestCacheKey } from "../lib/cache-list.js";


// restore action outputs 结构
interface RestoreOutputs {
  exists: boolean;
  used: boolean;
  cacheKeyFull: string;
}

// 写入 restore action 全部 outputs
function applyRestoreOutputs(outputs: RestoreOutputs): void {
  core.setOutput("cache-exists", outputs.exists ? "true" : "false");
  core.setOutput("cache-used", outputs.used ? "true" : "false");
  core.setOutput("cache-key-full", outputs.cacheKeyFull);
}

// only-lookup 模式：只读解析最新 key
async function runOnlyLookup(cacheKey: string, apiTryCount: number) {
  core.info(`lookup cache：cache-key=${cacheKey}`);
  const cacheKeyFull = await resolveNewestCacheKey(cacheKey, { apiTryCount });
  const exists = cacheKeyFull !== null;

  if (exists) {
    core.info(`找到 cache：cache-key=${cacheKey} cache-key-full=${cacheKeyFull}`);
  } else {
    core.info(`未找到 cache：cache-key=${cacheKey}`);
  }

  return { exists, cacheKeyFull: cacheKeyFull ?? "" };
}

// restore action 主流程：lookup 最新 → restore → 可选清理同族旧 key
async function run(): Promise<void> {
  const paths = readPathInput();
  const { familyKey, cacheKey } = readCacheKeyInputs();
  const onlyLookup = readBooleanInput("only-lookup");
  const apiTryCount = readPositiveIntInput("api-try-count");

  if (onlyLookup) {
  const { exists, cacheKeyFull } = await runOnlyLookup(cacheKey, apiTryCount);
    applyRestoreOutputs({ exists, used: false, cacheKeyFull });
    return;
  }

  const cleanupStale = readBooleanInput("cleanup-stale");

  core.info(`恢复 cache：family-key=${familyKey} cache-key=${cacheKey}`);
  const cacheKeyFull = await resolveNewestCacheKey(cacheKey, { apiTryCount });

  if (cacheKeyFull === null) {
    core.info(`无可恢复的 cache：family-key=${familyKey} cache-key=${cacheKey}`);
    applyRestoreOutputs({ exists: false, used: false, cacheKeyFull: "" });
    return;
  }

  core.info(`恢复 cache：cache-key-full=${cacheKeyFull}`);
  const restoredCacheKeyFull = await withRetry({
    label: "恢复 cache",
    do: () => cache.restoreCache(paths, cacheKeyFull, []),
    try: apiTryCount,
  });

  const used = restoredCacheKeyFull === cacheKeyFull;
  if (!used) {
    applyRestoreOutputs({ exists: true, used: false, cacheKeyFull });
    throw new Error(
      `restoreCache 未命中预期 cache-key-full（预期=${cacheKeyFull}，实际=${restoredCacheKeyFull ?? "<无>"}）`,
    );
  }

  if (cleanupStale) {
    const deleted = await deleteStaleFamilyKeys(familyKey, cacheKeyFull, { apiTryCount });
    core.info(`restore 后已删除 family-key=${familyKey} 下 ${deleted} 条旧 cache`);
  }

  core.info(
    `已恢复 cache：cache-key-full=${cacheKeyFull} paths=${paths.join(", ")}`,
  );
  applyRestoreOutputs({ exists: true, used: true, cacheKeyFull });
}

runAction(run);
