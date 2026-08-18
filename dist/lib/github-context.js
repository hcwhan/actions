import * as core from "../vendor/core/index.js";
import { context } from "../vendor/github/index.js";
// 从 @actions/github context 读取仓库坐标
export function getGithubRepoContext() {
    const { owner, repo } = context.repo;
    const ref = context.ref;
    if (!owner || !repo) {
        throw new Error("GitHub 仓库上下文缺失或无效");
    }
    if (!ref) {
        throw new Error("GitHub ref 上下文缺失");
    }
    return { owner, repo, ref };
}
// 读取 GitHub token（list/delete cache 必需；composite 嵌套调用时需经 github-token input 传入）
export function getGithubToken() {
    const fromInput = core.getInput("github-token").trim();
    if (fromInput) {
        return fromInput;
    }
    const token = process.env.GITHUB_TOKEN?.trim();
    if (!token) {
        throw new Error("GITHUB_TOKEN 缺失（请设置 github-token input 或 GITHUB_TOKEN 环境变量）");
    }
    return token;
}
//# sourceMappingURL=github-context.js.map