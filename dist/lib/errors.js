// 从 unknown 提取可读错误信息
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
// 将 unknown 规范为 Error；已是 Error 则原样返回
export function toError(error, fallbackMessage) {
    return error instanceof Error ? error : new Error(fallbackMessage);
}
//# sourceMappingURL=errors.js.map