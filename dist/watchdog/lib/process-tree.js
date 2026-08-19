import { spawnSync } from "node:child_process";
import * as core from "../../vendor/core/index.js";
import { errorMessage } from "../../base/errors.js";
import { sleep } from "../../base/retry.js";
// 进程树轮询间隔（毫秒）
const PROCESS_TREE_POLL_INTERVAL_MS = 1_000;
// 读取 pid -> ppid 映射（Windows：Win32_Process；Unix：ps）
function getProcessParentMap() {
    if (process.platform === "win32") {
        return getProcessParentMapWindows();
    }
    return getProcessParentMapUnix();
}
// Windows：Get-CimInstance Win32_Process
function getProcessParentMapWindows() {
    const script = "Get-CimInstance Win32_Process | ForEach-Object { \"{0},{1}\" -f $_.ProcessId,$_.ParentProcessId }";
    const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", shell: false });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const detail = (result.stderr ?? result.stdout ?? "").trim();
        throw new Error(detail || `powershell exit ${result.status ?? "unknown"}`);
    }
    return parseParentMapLines(result.stdout ?? "");
}
// Unix：ps -eo pid=,ppid=
function getProcessParentMapUnix() {
    const result = spawnSync("ps", ["-eo", "pid=", "ppid="], {
        encoding: "utf8",
        shell: false,
    });
    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        const detail = (result.stderr ?? result.stdout ?? "").trim();
        throw new Error(detail || `ps exit ${result.status ?? "unknown"}`);
    }
    return parseParentMapLines(result.stdout ?? "");
}
// 解析 "pid,ppid" 或 "pid ppid" 行
function parseParentMapLines(output) {
    const map = new Map();
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        const parts = trimmed.split(/[,\s]+/).filter((part) => part.length > 0);
        if (parts.length < 2) {
            continue;
        }
        const pid = Number.parseInt(parts[0], 10);
        const ppid = Number.parseInt(parts[1], 10);
        if (!Number.isFinite(pid) || !Number.isFinite(ppid) || pid <= 0) {
            continue;
        }
        map.set(pid, ppid);
    }
    return map;
}
// 列举 rootPid 子树中仍存活的 pid（含 root 若仍存活；root 已退出时仍含其后代）
export function listLiveProcessTreePids(rootPid) {
    const parentMap = getProcessParentMap();
    const inTree = new Set([rootPid]);
    let changed = true;
    while (changed) {
        changed = false;
        for (const [pid, ppid] of parentMap) {
            if (inTree.has(ppid) && !inTree.has(pid)) {
                inTree.add(pid);
                changed = true;
            }
        }
    }
    return [...inTree].filter((pid) => parentMap.has(pid));
}
// 进程树是否已清空
export function isProcessTreeEmpty(rootPid) {
    try {
        return listLiveProcessTreePids(rootPid).length === 0;
    }
    catch (err) {
        core.warning(`Watchdog: 检测进程树失败（视为未清空）：${errorMessage(err)}`);
        return false;
    }
}
// 等待进程树清空；超时返回 false
export async function waitForProcessTreeEmpty(rootPid, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (isProcessTreeEmpty(rootPid)) {
            return true;
        }
        await sleep(PROCESS_TREE_POLL_INTERVAL_MS);
    }
    return isProcessTreeEmpty(rootPid);
}
//# sourceMappingURL=process-tree.js.map