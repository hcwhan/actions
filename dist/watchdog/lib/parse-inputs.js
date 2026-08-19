// 小时 → 毫秒换算
const MS_PER_HOUR = 60 * 60 * 1000;
// 解析 args JSON 数组 input
export function parseArgsInput(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw.trim() || "[]");
    }
    catch {
        throw new Error(`args 无效：非合法 JSON`);
    }
    if (!Array.isArray(parsed)) {
        throw new Error(`args 无效：须为 JSON 数组`);
    }
    for (const item of parsed) {
        if (typeof item !== "string") {
            throw new Error(`args 无效：数组元素须均为 string`);
        }
    }
    return parsed;
}
// 解析 job-start-time output（毫秒时间戳）
export function parseJobStartMs(raw) {
    const ms = Number(raw.trim());
    if (!Number.isFinite(ms)) {
        throw new Error(`job-start-time 无效：${raw}`);
    }
    return ms;
}
// 解析 limit-hours input 为毫秒上限
export function parseLimitHoursInput(raw) {
    const hours = Number.parseFloat(raw.trim());
    if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error(`limit-hours 无效：${raw}`);
    }
    return hours * MS_PER_HOUR;
}
// 解析 dispatch-inputs JSON 对象为 string 键值对
export function parseDispatchInputs(raw) {
    const trimmed = raw.trim();
    let obj;
    if (trimmed) {
        try {
            obj = JSON.parse(trimmed);
        }
        catch {
            throw new Error("dispatch-inputs 无效：非合法 JSON");
        }
    }
    else {
        obj = {};
    }
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
        throw new Error("dispatch-inputs 须为 JSON 对象");
    }
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (typeof v !== "string") {
            throw new Error(`dispatch-inputs.${k} 须为 string`);
        }
        out[k] = v;
    }
    return out;
}
//# sourceMappingURL=parse-inputs.js.map