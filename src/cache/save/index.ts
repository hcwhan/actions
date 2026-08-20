
import * as core from "@actions/core";

import { readBooleanInput, readPathInput, readPositiveIntInput, runAction } from "@/base/action-input.js";
import { errorMessage, toError } from "@/base/errors.js";
import { withRetry } from "@/base/retry.js";
import { readCacheKeyInputs } from "../lib/read-cache-keys.js";
import { deleteStaleFamilyKeys } from "../lib/cache-list.js";
import { pollUntilCacheExists } from "../lib/cache-verify.js";
import { buildVersionedCacheKey } from "../lib/cache-key-version.js";
import { isSaveRetryable, saveCacheOnce } from "../lib/save-cache.js";


// save action 主流程：save → verify → 清理同族旧 key
async function run(): Promise<void> {
  const paths = readPathInput();
  const { familyKey, cacheKey } = readCacheKeyInputs();
  const verifyTimeoutSec = readPositiveIntInput("verify-timeout-seconds");
  const verifyIntervalSec = readPositiveIntInput("verify-interval-seconds");
  const maxSaveAttempts = readPositiveIntInput("max-save-attempts");
  const cleanupStale = readBooleanInput("cleanup-stale");
  const apiTryCount = readPositiveIntInput("api-try-count");

  let cacheKeyFull = "";
  let successAttempt = 0;
  let lastError: unknown;

  for (let tryIndex = 1; tryIndex <= maxSaveAttempts; tryIndex++) {
    cacheKeyFull = buildVersionedCacheKey(cacheKey);
    core.info(
      `保存 cache 尝试 ${tryIndex}/${maxSaveAttempts}：family-key=${familyKey} cache-key=${cacheKey} cache-key-full=${cacheKeyFull} paths=${paths.join(", ")}`,
    );

    try {
      await withRetry({
        label: "保存 cache",
        do: () => saveCacheOnce(paths, cacheKeyFull),
        try: apiTryCount,
        isRetryable: isSaveRetryable,
      });

      const verified = await pollUntilCacheExists({
        cacheKeyFull,
        intervalSec: verifyIntervalSec,
        timeoutSec: verifyTimeoutSec,
        apiTryCount,
      });

      if (!verified) {
        throw new Error(`verify 失败：${verifyTimeoutSec}s 内 API 仍不可见 cache-key-full=${cacheKeyFull}`);
      }

      core.info(
        `已保存 cache：cache-key-full=${cacheKeyFull} verify=通过 尝试=${tryIndex}/${maxSaveAttempts}`,
      );
      successAttempt = tryIndex;
      break;
    } catch (error) {
      lastError = error;
      core.warning(`保存尝试 ${tryIndex}/${maxSaveAttempts} 失败: ${errorMessage(error)}`);
      if (!isSaveRetryable(error)) {
        break;
      }
    }
  }

  if (successAttempt === 0) {
    throw toError(lastError, "所有 save 尝试均失败");
  }

  if (cleanupStale) {
    const deleted = await deleteStaleFamilyKeys(familyKey, cacheKeyFull, { apiTryCount });
    core.info(`save 后已删除 family-key=${familyKey} 下 ${deleted} 条旧 cache`);
  }

  core.setOutput("cache-key-full", cacheKeyFull);
  core.setOutput("cache-saved", "true");
  core.setOutput("save-attempts", String(successAttempt));
}

runAction(run);
