import { spawn, spawnSync } from "node:child_process";
import * as core from "../../vendor/core/index.js";
import { errorMessage } from "../../base/errors.js";
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
// 向子进程发送 SIGINT；失败时返回 false
export function sendChildSigint(child) {
    if (child.pid === undefined) {
        core.warning("Watchdog: 跳过 sendChildSigint（子进程无 pid）");
        return false;
    }
    try {
        return child.kill("SIGINT");
    }
    catch (err) {
        core.warning(`Watchdog: child.kill(SIGINT) 失败：${errorMessage(err)}`);
        return false;
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