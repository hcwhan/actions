import { context } from "@actions/github";

// 当前 workflow 仓库坐标（Octokit / cache API 共用）
 interface GithubRepoContext {
  owner: string;
  repo: string;
  ref: string;
}

// 从 @actions/github context 读取仓库坐标
export function getGithubRepoContext(): GithubRepoContext {
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
export function getGithubToken(): string {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN 缺失");
  }
  return token;
}
