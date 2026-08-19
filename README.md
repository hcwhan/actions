# hcwhan/actions

可复用的 GitHub Actions 集合，提供带 UTC 时间后缀的**版本化 GHA cache** 工具（save / lookup / restore）。

三个 action 均使用 **Node 24** 运行时（`action.yml` 中 `using: node24`）。

## Cache actions

| Action      | 路径            | 作用                                                                  |
| ----------- | --------------- | --------------------------------------------------------------------- |
| **save**    | `cache/save`    | 追加 UTC 时间后缀 → save → 轮询 API verify → 可选 save 成功后清理同族旧 key |
| **lookup**  | `cache/lookup`  | 按 cache-key 前缀列举并解析最新 key（只读）                           |
| **restore** | `cache/restore` | 恢复 cache-key 槽位最新 key；可选 restore 成功后清理同族 key 下旧条目 |

### Key 格式

```
family-key   同族 key（delete 清理时 API 列举范围；>= 6 字符）
cache-key    缓存 key（lookup 列举前缀；restore 列举前缀且必须以 family-key 为前缀且更长；>= 6 字符）
实际写入 key = cache-key + -YYYY.MM.DD-HH.mm.ss-SSS（output 为 `cache-key-full`）
```

示例：

- `family-key`: `myapp-build-`
- `cache-key`: `myapp-build-linux-x64-deps[a1b2c3d4]`
- 实际 key: `myapp-build-linux-x64-deps[a1b2c3d4]-2026.08.18-22.15.39-123`

后缀为 UTC、固定宽度；日期/时间字段用 `.` 分隔（符合 GHA cache key 允许的字符集）。

`family-key` 与 `cache-key` 仅允许字母、数字及 `.` `_` `-` `[` `]`，长度均须 >= 6；`cache-key` 加上 24 字符 UTC 后缀后不得超过 GHA 512 字符上限。save / restore 还要求 `cache-key` 必须以 `family-key` 开头且严格更长；lookup 仅需 `cache-key`。

### 用法

典型 CI 执行顺序为：**restore**（job 开头）→ 构建 → **save**（job 末尾，`if: always()`）；**lookup** 为可选只读查询。

```yaml
permissions:
  actions: write
  contents: read

steps:
  - uses: hcwhan/actions/cache/save@v1
    if: always()                                 # 典型置于 job 末尾
    id: cache-save
    with:
      path: ./build
      family-key: ${{ env.CACHE_FAMILY_KEY }}
      cache-key: ${{ env.CACHE_KEY }}
      verify-timeout-seconds: "180"              # 可选，save 后轮询 cache API verify 的最长等待秒数
      verify-interval-seconds: "10"              # 可选，save 后每次 cache API verify 轮询的间隔秒数
      max-save-attempts: "3"                     # 可选，save+verify 失败后的最多尝试次数上限（超过则 step 失败）
      cleanup-stale: "true"                      # 可选，默认 true：save 成功后是否删除同族 key 下旧条目
      api-try-count: "3"                         # 可选，单次 saveCache / GitHub API 调用的最多尝试次数（含首次，默认 3 次）

  - uses: hcwhan/actions/cache/lookup@v1
    id: cache-lookup
    with:
      cache-key: ${{ env.CACHE_KEY }}
      api-try-count: "3"                         # 可选，单次 GitHub API 调用的最多尝试次数（含首次，默认 3 次）

  - uses: hcwhan/actions/cache/restore@v1
    id: cache-restore
    with:
      path: ./build
      family-key: ${{ env.CACHE_FAMILY_KEY }}
      cache-key: ${{ env.CACHE_KEY }}
      cleanup-stale: "true"                      # 可选，默认 true：restore 成功后是否删除同族 key 下旧条目
      api-try-count: "3"                         # 可选，单次 restoreCache / GitHub API 调用的最多尝试次数（含首次，默认 3 次）
```

同一 ref 下，建议每个 cache-key 槽位仅安排一个 writer；代码不强制互斥，并发 save 会写入不同时间后缀的 key。

## 开发

```bash
npm install
npm run typecheck
npm test
npm run test:watch   # 可选，vitest 监听模式
npm run build          # 构建全部 action 类型（当前等同 build:cache）
npm run build:cache    # 仅构建 cache actions
```

Node action 构建流程（`scripts/build-cache.mjs`）：`tsc` 编译 `src/cache` 下 entry + lib（多文件，与 `src/cache/lib` 一一对应，产物在 `dist/cache/`）→ esbuild 打包 3 个 `dist/vendor/*/index.js`（对应 `@actions/core`、`@actions/github`、`@actions/cache` 三个直接依赖；传递依赖 `@actions/http-client` 并入 `vendor/core`）→ 将 lib / entry 中的 `@actions/*` import 改写为 vendor 相对路径。
