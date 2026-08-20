import * as core from "../../vendor/core/index.js";
import { MAX_CACHE_KEY_BASE_LENGTH, VERSIONED_TIMESTAMP_SUFFIX_LENGTH } from "./cache-key-version.js";
// 读取并校验 family-key / cache-key
export function readCacheKeyInputs() {
    const familyKey = core.getInput("family-key", { required: true }).trim();
    const cacheKey = core.getInput("cache-key", { required: true }).trim();
    validateCacheKeyPart(familyKey, "family-key");
    validateCacheKeyPart(cacheKey, "cache-key");
    if (!cacheKey.startsWith(familyKey)) {
        throw new Error(`cache-key 必须以 family-key 为前缀（family-key=${familyKey}, cache-key=${cacheKey}）`);
    }
    if (cacheKey.length <= familyKey.length) {
        throw new Error(`cache-key 必须严格长于 family-key（family-key=${familyKey}, cache-key=${cacheKey}）`);
    }
    return { familyKey, cacheKey };
}
// 校验 key 片段长度与字符集
function validateCacheKeyPart(key, name) {
    const trimmed = key.trim();
    if (trimmed.length < 6) {
        throw new Error(`${name} 无效：过短（${trimmed.length} 字符）；至少需要 6 个字符`);
    }
    if (!/^[a-zA-Z0-9._\[\]-]+$/.test(trimmed)) {
        throw new Error(`${name} 无效：包含非法字符（允许：字母数字 . _ - [ ]）`);
    }
    if (name === "cache-key" && trimmed.length > MAX_CACHE_KEY_BASE_LENGTH) {
        throw new Error(`${name} 无效：过长（${trimmed.length} 字符）；加上时间后缀后不得超过 ${MAX_CACHE_KEY_BASE_LENGTH + VERSIONED_TIMESTAMP_SUFFIX_LENGTH} 字符`);
    }
}
//# sourceMappingURL=read-cache-keys.js.map