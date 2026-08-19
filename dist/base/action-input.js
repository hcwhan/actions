import * as core from "../vendor/core/index.js";
import { errorMessage } from "./errors.js";
// 解析 action 正整数 input（拒绝小数、尾随字符、0）
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
// 解析非负整数 input（0 合法）
function parseNonNegativeInt(value, name) {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
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
// 读取非负整数 action input（默认值由 action.yml 声明）
export function readNonNegativeIntInput(name) {
    return parseNonNegativeInt(core.getInput(name), name);
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
// action 入口统一 catch
export function runAction(fn) {
    fn().catch((error) => {
        core.setFailed(error instanceof Error ? error : errorMessage(error));
    });
}
//# sourceMappingURL=action-input.js.map