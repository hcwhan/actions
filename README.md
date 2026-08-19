# hcwhan/actions

可复用的 GitHub Actions 集合（`kit/` 套件）：

- **cache** — 带 UTC 时间后缀的版本化 GHA cache（save / lookup / restore）
- **watchdog** — job deadline 看门狗 + 超时重试 dispatch（job-start / run / dispatch-retry）

所有 action 均使用 **Node 24** 运行时（`action.yml` 中 `using: node24`）。消费方引用 **`@main`**（如 `hcwhan/actions/kit/cache/save@main`）。

---

## Cache actions

| Action      | 路径            | 作用                                                                  |
| ----------- | --------------- | --------------------------------------------------------------------- |
| **save**    | `kit/cache/save`    | 追加 UTC 时间后缀 → save → 轮询 API verify → 可选 save 成功后清理同族旧 key |
| **lookup**  | `kit/cache/lookup`  | 按 cache-key 前缀列举并解析最新 key（只读）                           |
| **restore** | `kit/cache/restore` | 恢复 cache-key 槽位最新 key；可选 restore 成功后清理同族 key 下旧条目 |

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
  - uses: hcwhan/actions/kit/cache/save@main
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

  - uses: hcwhan/actions/kit/cache/lookup@main
    id: cache-lookup
    with:
      cache-key: ${{ env.CACHE_KEY }}
      api-try-count: "3"                         # 可选，单次 GitHub API 调用的最多尝试次数（含首次，默认 3 次）

  - uses: hcwhan/actions/kit/cache/restore@main
    id: cache-restore
    with:
      path: ./build
      family-key: ${{ env.CACHE_FAMILY_KEY }}
      cache-key: ${{ env.CACHE_KEY }}
      cleanup-stale: "true"                      # 可选，默认 true：restore 成功后是否删除同族 key 下旧条目
      api-try-count: "3"                         # 可选，单次 restoreCache / GitHub API 调用的最多尝试次数（含首次，默认 3 次）
```

同一 ref 下，建议每个 cache-key 槽位仅安排一个 writer；代码不强制互斥，并发 save 会写入不同时间后缀的 key。

---

## Watchdog actions

| Action              | 路径                      | 作用 |
| ------------------- | ------------------------- | ---- |
| **job-start**       | `kit/watchdog/job-start`      | job 最早阶段记录 UTC epoch 毫秒（output `job-start-time`） |
| **run**             | `kit/watchdog/run`            | spawn 子进程 + deadline 看门狗；graceful abort 时 output `should-retry` |
| **dispatch-retry**  | `kit/watchdog/dispatch-retry` | 校验 `should-retry` 后 `workflow_dispatch` 重试，并等待 concurrency 取消当前 run |

### 行为概要

- **deadline**：由 `job-start-time` + `limit-hours`（默认 5，支持小数）计算；超时后对子进程最多 3 次 SIGINT（间隔 60s），仍存活则按平台强杀（Windows `taskkill /T /F`；Unix 进程组 `SIGKILL`）。
- **should-retry**：`aborted && !force-killed && !task-succeeded`；graceful abort 失败（强杀）不触发 retry。
- **dispatch-retry**：`createWorkflowDispatch` 失败时 `withRetry` 线性退避（最多 3 次，间隔 30s / 60s）；成功后等待 **5 分钟** 期望 concurrency 取消当前 run，超时则 step 失败。
- **状态传递**：使用 `@actions/core` outputs。

### 用法

典型 serial workflow：

```yaml
on:
  workflow_dispatch:
    inputs:
      retry_count:
        description: 当前 retry 计数
        required: false
        default: "0"
        type: string

permissions:
  actions: write
  contents: read

jobs:
  build:
    outputs:
      should-retry: ${{ steps.run-task.outputs.should-retry }}
    steps:
      - name: Record job start
        id: job-start
        uses: hcwhan/actions/kit/watchdog/job-start@main

      - name: Run build with watchdog
        id: run-task
        uses: hcwhan/actions/kit/watchdog/run@main
        with:
          working-directory: ${{ github.workspace }}
          command: ninja
          args: '["-C","build","install"]'
          job-start-time: ${{ steps.job-start.outputs.job-start-time }}
          limit-hours: "5"

  retry:
    needs: build
    if: always() && !cancelled() && needs.build.outputs.should-retry == 'true'
    steps:
      - uses: hcwhan/actions/kit/watchdog/dispatch-retry@main
        with:
          should-retry: ${{ needs.build.outputs.should-retry }}
          use-cache: "true"
          retry-count: ${{ inputs.retry_count }}
          max-retry-count: "8"                   # 可选，默认 8
          workflow-file: build-serial.yml
          dispatch-inputs: '{"use_cache":"true"}'
```

`watchdog/run` outputs：`should-retry`、`aborted`、`force-killed`、`task-succeeded`、`exit-code`。

---

## 开发

```bash
npm install
npm run typecheck
npm test
npm run test:watch   # 可选，vitest 监听模式
npm run format:ts    # 按 AGENTS.md 格式化 import / 空行
npm run build        # 全量：clean → tsc → vendor → cache + watchdog import 改写
npm run build:cache    # 仅 cache import 改写（需 dist 已由 tsc 产出）
npm run build:watchdog # 仅 watchdog import 改写
```

构建流程（`scripts/build.mjs`）：

1. **全量**（`npm run build`）：`cleanDist` → `tsc` → esbuild 打包 `dist/vendor/{core,github,cache}/index.js` → `prepareBaseDist` → `prepareCacheDist` → `prepareWatchdogDist`
2. **增量**（`build:cache` / `build:watchdog`）：仅对已有 `dist/` 做 `@actions/*` 与 `@/*` import 改写，不清理其它 action 组产物

编码规范见 [AGENTS.md](./AGENTS.md)。
