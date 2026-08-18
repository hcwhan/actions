import { cacheKeyFullExists } from "./cache-list.js";
import { sleep } from "./retry.js";
// 轮询直到 cacheKeyFull 在 API 中可见或超时；见到则 true
export async function pollUntilCacheExists(options) {
    const { cacheKeyFull, apiTryCount, intervalSec, timeoutSec } = options;
    const deadline = Date.now() + timeoutSec * 1000;
    const intervalMs = intervalSec * 1000;
    while (true) {
        if (await cacheKeyFullExists(cacheKeyFull, { apiTryCount })) {
            return true;
        }
        if (Date.now() >= deadline) {
            return false;
        }
        await sleep(Math.min(intervalMs, deadline - Date.now()));
    }
}
//# sourceMappingURL=cache-verify.js.map