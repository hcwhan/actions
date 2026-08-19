import { spawn, spawnSync } from "node:child_process";
import * as core from "../../vendor/core/index.js";
import { errorMessage } from "../../base/errors.js";
import { listLiveProcessTreePids } from "./process-tree.js";
// 异步 spawn 子进程；Unix detached:true 便于进程组强杀；Windows detached:false 保 stdio 继承（GHA 日志）
export function spawnAsync(command, args, cwd) {
    const detached = process.platform !== "win32";
    const child = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: "inherit",
        shell: false,
        detached,
    });
    const completed = new Promise((resolve, reject) => {
        child.on("error", reject);
        child.on("exit", (exitCode, signal) => resolve({ exitCode, signal }));
    });
    return { child, completed };
}
// 向 pid 发送 SIGINT，发送前/成功/失败均打日志；成功返回 true
function sendSigintWithLog(pid) {
    const killLabel = `kill(${pid}, SIGINT)`;
    const beforeText = pid < 0
        ? `向进程组 -pid=${-pid} 发送 SIGINT`
        : `向 pid=${pid} 发送 SIGINT`;
    try {
        core.info(`Watchdog: ${beforeText}`);
        if (!process.kill(pid, "SIGINT")) {
            core.warning(`Watchdog: ${killLabel} 未送达`);
            return false;
        }
        else {
            core.info(`Watchdog: ${killLabel} 已送达`);
            return true;
        }
    }
    catch (err) {
        core.warning(`Watchdog: ${killLabel} 失败：${errorMessage(err)}`);
        return false;
    }
}
// 向指定 pid 发送 SIGINT；Windows 用 process.kill；Unix 先进程组 -pid，失败再单 pid
function sendAbortSignal(pid) {
    if (process.platform === "win32") {
        sendSigintWithLog(pid);
    }
    else {
        const isOk = sendSigintWithLog(-pid);
        if (!isOk) {
            sendSigintWithLog(pid);
        }
    }
}
// 优雅中止进程树：每轮对 root 发 SIGINT；第 2 次起对进程树中其余 pid 也发 SIGINT
export function sendGracefulAbortToProcessTree(child, rootPid, attempt) {
    if (child.pid !== undefined) {
        sendAbortSignal(child.pid);
    }
    if (attempt >= 2) {
        for (const pid of listLiveProcessTreePids(rootPid)) {
            if (pid === child.pid) {
                continue;
            }
            sendAbortSignal(pid);
        }
    }
}
// 强杀进程树：Windows taskkill /T /F；Unix 先杀进程组再杀单进程
export function forceKillProcessTree(pid) {
    if (pid === undefined) {
        core.warning("Watchdog: 跳过 forceKillProcessTree（pid 未定义）");
        return false;
    }
    if (process.platform === "win32") {
        core.info(`Watchdog: 通过 taskkill /T /F 强制终止进程树 pid=${pid}`);
        const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
            shell: false,
            encoding: "utf8",
        });
        if (result.error) {
            core.warning(`Watchdog: taskkill 失败 pid=${pid}：${errorMessage(result.error)}`);
            return false;
        }
        if (result.status === 0 || result.status === 128) {
            core.info(`Watchdog: taskkill pid=${pid} 退出状态=${result.status ?? "null"}`);
            return true;
        }
        core.warning(`Watchdog: taskkill pid=${pid} 意外退出状态=${result.status ?? "null"}`);
        return false;
    }
    else {
        core.info(`Watchdog: 通过 SIGKILL 强制终止进程组 -pid=${pid}`);
        try {
            process.kill(-pid, "SIGKILL");
            core.info(`Watchdog: 已终止进程组 -pid=${pid}`);
            return true;
        }
        catch (err) {
            core.warning(`Watchdog: kill(-${pid}, SIGKILL) 失败：${errorMessage(err)}；重试 pid=${pid}`);
            try {
                process.kill(pid, "SIGKILL");
                core.info(`Watchdog: 已终止 pid=${pid}`);
                return true;
            }
            catch (retryErr) {
                core.warning(`Watchdog: kill(${pid}, SIGKILL) 失败：${errorMessage(retryErr)}`);
                return false;
            }
        }
    }
}
//# sourceMappingURL=spawn-async.js.map