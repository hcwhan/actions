import * as core from "../../vendor/core/index.js";
import { readPositiveIntInput, runAction } from "../../base/action-input.js";
import { readCacheKeyInput } from "../lib/read-cache-keys.js";
import { resolveNewestCacheKey } from "../lib/cache-list.js";
// lookup action 主流程：只读解析最新 key
async function run() {
    const cacheKey = readCacheKeyInput();
    const apiTryCount = readPositiveIntInput("api-try-count");
    core.info(`lookup cache：cache-key=${cacheKey}`);
    const cacheKeyFull = await resolveNewestCacheKey(cacheKey, { apiTryCount });
    const exists = cacheKeyFull !== null;
    if (exists) {
        core.info(`找到 cache：cache-key=${cacheKey} cache-key-full=${cacheKeyFull}`);
    }
    else {
        core.info(`未找到 cache：cache-key=${cacheKey}`);
    }
    core.setOutput("cache-exists", exists ? "true" : "false");
    core.setOutput("cache-key-full", cacheKeyFull ?? "");
}
runAction(run);
//# sourceMappingURL=index.js.map