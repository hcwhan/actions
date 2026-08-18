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
// 读取 GITHUB_TOKEN（list/delete cache 必需）
export function getGithubToken() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
        throw new Error("GITHUB_TOKEN 缺失");
    }
    return token;
}
//# sourceMappingURL=github-context.js.map