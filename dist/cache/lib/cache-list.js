import * as core from "../../vendor/core/index.js";
import { errorMessage } from "../../base/errors.js";
import { createOctokit, getGithubRepoContext } from "../../base/github-context.js";
import { withRetry } from "../../base/retry.js";
import { pickNewestVersionedKey } from "./cache-key-version.js";
// cache 列举分页上限（per_page=100，最多 1600 条）
const MAX_CACHE_LIST_PAGES = 16;
// 分页拉取匹配前缀的全部 cache 条目（跳过 id 或 key 缺失项）
async function paginateActionsCaches(prefix, apiTryCount, retryLabel) {
    const octokit = createOctokit();
    return withRetry({
        label: retryLabel,
        do: async () => {
            const { owner, repo, ref } = getGithubRepoContext();
            const records = [];
            let page = 1;
            let fetchedCount = 0;
            while (page <= MAX_CACHE_LIST_PAGES) {
                const response = await octokit.rest.actions.getActionsCacheList({
                    owner,
                    repo,
                    ref,
                    key: prefix,
                    per_page: 100,
                    page,
                });
                const totalCount = response.data.total_count;
                const batch = response.data.actions_caches;
                if (totalCount === 0) {
                    break;
                }
                for (const entry of batch) {
                    if (entry.id === undefined || !entry.key) {
                        continue;
                    }
                    records.push({ id: entry.id, key: entry.key });
                }
                fetchedCount += batch.length;
                if (fetchedCount >= totalCount) {
                    break;
                }
                if (page === MAX_CACHE_LIST_PAGES) {
                    throw new Error(`cache 列举前缀=${prefix} 超过 ${MAX_CACHE_LIST_PAGES} 页（最多 ${MAX_CACHE_LIST_PAGES * 100} 条）上限`);
                }
                page += 1;
            }
            return records;
        },
        try: apiTryCount,
    });
}
// 按 cacheKeyFull 前缀列举，确认完整 key 已可见
export async function cacheKeyFullExists(cacheKeyFull, options) {
    const { apiTryCount } = options;
    const entries = await paginateActionsCaches(cacheKeyFull, apiTryCount, "查询 cacheKeyFull");
    return entries.some((entry) => entry.key === cacheKeyFull);
}
// 按 cacheKey 前缀列举，取时间戳最新的完整 key
export async function resolveNewestCacheKey(cacheKey, options) {
    const { apiTryCount } = options;
    const entries = await paginateActionsCaches(cacheKey, apiTryCount, "列出 cacheKey 条目");
    const keys = entries.map((entry) => entry.key);
    return pickNewestVersionedKey(keys, cacheKey);
}
// 按 cache id 删除单条远端条目
async function deleteCacheById(cacheId, apiTryCount) {
    const octokit = createOctokit();
    const { owner, repo } = getGithubRepoContext();
    await withRetry({
        label: `删除 cache id=${cacheId}`,
        do: async () => {
            await octokit.rest.actions.deleteActionsCacheById({
                owner,
                repo,
                cache_id: cacheId,
            });
        },
        try: apiTryCount,
    });
}
// 删除同族 key 下除 keepCacheKeyFull 外的全部条目；返回删除数量；失败仅警告不抛出
export async function deleteStaleFamilyKeys(familyKey, keepCacheKeyFull, options) {
    const { apiTryCount } = options;
    try {
        const entries = await paginateActionsCaches(familyKey, apiTryCount, "列出 familyKey 条目");
        let deleted = 0;
        for (const entry of entries) {
            if (entry.key === keepCacheKeyFull) {
                continue;
            }
            try {
                await deleteCacheById(entry.id, apiTryCount);
                deleted += 1;
            }
            catch (error) {
                core.warning(`删除 cache id=${entry.id} key=${entry.key} 失败: ${errorMessage(error)}`);
            }
        }
        return deleted;
    }
    catch (error) {
        core.warning(`cleanup 列举/删除 family-key=${familyKey} 失败: ${errorMessage(error)}`);
        return 0;
    }
}
//# sourceMappingURL=cache-list.js.map