import { spawn, spawnSync } from "node:child_process";
// 异步 spawn 子进程；全平台 detached: true（Unix 便于进程组强杀；Windows 与 taskkill /T 配合）
export function spawnAsync(command, args, cwd) {
    const child = spawn(command, args, {
        cwd,
        env: process.env,
        stdio: "inherit",
        shell: false,
        detached: true,
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
        console.warn("Watchdog: sendChildSigint skipped (child has no pid)");
        return false;
    }
    try {
        return child.kill("SIGINT");
    }
    catch (err) {
        console.warn(`Watchdog: child.kill(SIGINT) failed: ${err instanceof Error ? err.message : String(err)}`);
        return false;
    }
}
// 强杀进程树：Windows taskkill /T /F；Unix 先杀进程组再杀单进程
export function forceKillProcessTree(pid) {
    if (pid === undefined) {
        console.warn("Watchdog: forceKillProcessTree skipped (pid undefined)");
        return false;
    }
    if (process.platform === "win32") {
        console.log(`Watchdog: force killing process tree pid=${pid} via taskkill /T /F`);
        const result = spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
            shell: false,
            encoding: "utf8",
        });
        if (result.error) {
            console.warn(`Watchdog: taskkill failed pid=${pid}: ${result.error instanceof Error ? result.error.message : String(result.error)}`);
            return false;
        }
        if (result.status === 0 || result.status === 128) {
            console.log(`Watchdog: taskkill pid=${pid} exit status=${result.status ?? "null"}`);
            return true;
        }
        console.warn(`Watchdog: taskkill pid=${pid} unexpected exit status=${result.status ?? "null"}`);
        return false;
    }
    else {
        console.log(`Watchdog: force killing process group -pid=${pid} via SIGKILL`);
        try {
            process.kill(-pid, "SIGKILL");
            console.log(`Watchdog: killed process group -pid=${pid}`);
            return true;
        }
        catch (err) {
            console.warn(`Watchdog: kill(-${pid}, SIGKILL) failed: ${err instanceof Error ? err.message : String(err)}; retrying pid=${pid}`);
            try {
                process.kill(pid, "SIGKILL");
                console.log(`Watchdog: killed pid=${pid}`);
                return true;
            }
            catch (retryErr) {
                console.warn(`Watchdog: kill(${pid}, SIGKILL) failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`);
                return false;
            }
        }
    }
}
//# sourceMappingURL=spawn-async.js.map