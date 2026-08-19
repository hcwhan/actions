
import * as core from "@actions/core";
import { context, getOctokit } from "@actions/github";


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

// 从 GITHUB_REF_NAME 读取分支/tag 名（dispatch ref 默认值）
export function getGithubRefName(): string {
  const refName = process.env.GITHUB_REF_NAME?.trim();
  if (!refName) {
    throw new Error("GITHUB_REF_NAME 缺失");
  }
  return refName;
}

// 读取 GitHub token（list/delete cache 必需；composite 嵌套调用时需经 github-token input 传入）
function getGithubToken(): string {
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

// 带 GITHUB_TOKEN 的 Octokit 客户端（含 GHA 代理 / GHES 适配）
export function createOctokit() {
  return getOctokit(getGithubToken());
}
