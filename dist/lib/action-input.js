import * as core from "../vendor/core/index.js";
import { errorMessage } from "./errors.js";
import { MAX_CACHE_KEY_BASE_LENGTH } from "./key-format.js";
// 解析 action 正整数 input（拒绝小数、尾随字符、零）
function parsePositiveInt(value, name) {
    const trimmed = value.trim();
    if (!trimmed) {
        throw new Error(`${name} 无效：空值`);
    }
    if (!/^[1-9]\d*$/.test(trimmed)) {
        throw new Error(`${name} 无效：${value}`);
    }
    return Number.parseInt(trimmed, 10);
}
// 解析 action 布尔 input
function parseBoolean(value, name) {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        throw new Error(`${name} 无效：空值`);
    }
    if (trimmed === "true") {
        return true;
    }
    if (trimmed === "false") {
        return false;
    }
    throw new Error(`${name} 无效：${value}`);
}
// 读取正整数 action input（默认值由 action.yml 声明）
export function readPositiveIntInput(name) {
    return parsePositiveInt(core.getInput(name), name);
}
// 读取布尔 action input（默认值由 action.yml 声明）
export function readBooleanInput(name) {
    return parseBoolean(core.getInput(name), name);
}
// 读取 path action input（必填，支持换行分隔多路径）
export function readPathInput() {
    return parsePathInput(core.getInput("path", { required: true }));
}
// 解析换行分隔的 path input
function parsePathInput(pathInput) {
    const paths = pathInput
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    if (paths.length === 0) {
        throw new Error("path 无效：至少需要一个目录");
    }
    return paths;
}
// 读取并校验 cache-key（lookup 等仅需 cache-key 的 action）
export function readCacheKeyInput() {
    const cacheKey = core.getInput("cache-key", { required: true }).trim();
    validateCacheKeyPart(cacheKey, "cache-key");
    return cacheKey;
}
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
        throw new Error(`${name} 无效：过长（${trimmed.length} 字符）；加上时间后缀后不得超过 ${MAX_CACHE_KEY_BASE_LENGTH + 24} 字符`);
    }
}
// action 入口统一 catch
export function runAction(fn) {
    fn().catch((error) => {
        core.setFailed(error instanceof Error ? error : errorMessage(error));
    });
}
//# sourceMappingURL=action-input.js.map