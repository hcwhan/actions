import * as core from "../vendor/core/index.js";
import * as cache from "../vendor/cache/index.js";
import { readBooleanInput, readCacheKeyInputs, readPathInput, readPositiveIntInput, runAction } from "../lib/action-input.js";
import { deleteStaleFamilyKeys, resolveNewestCacheKey } from "../lib/cache-list.js";
import { withRetry } from "../lib/retry.js";
function applyRestoreOutputs(outputs) {
    core.setOutput("cache-exists", outputs.exists ? "true" : "false");
    core.setOutput("cache-used", outputs.used ? "true" : "false");
    core.setOutput("cache-key-full", outputs.cacheKeyFull);
}
// restore action 主流程：lookup 最新 → restore → 可选清理同族旧 key
async function run() {
    const paths = readPathInput();
    const { familyKey, cacheKey } = readCacheKeyInputs();
    const cleanupStale = readBooleanInput("cleanup-stale");
    const apiTryCount = readPositiveIntInput("api-try-count");
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
        throw new Error(`restoreCache 未命中预期 cache-key-full（预期=${cacheKeyFull}，实际=${restoredCacheKeyFull ?? "<无>"}）`);
    }
    if (cleanupStale) {
        const deleted = await deleteStaleFamilyKeys(familyKey, cacheKeyFull, { apiTryCount });
        core.info(`restore 后已删除 family-key=${familyKey} 下 ${deleted} 条旧 cache`);
    }
    applyRestoreOutputs({ exists: true, used: true, cacheKeyFull });
}
runAction(run);
//# sourceMappingURL=index.js.map