# hcwhan/actions

可复用的 GitHub Actions 集合：**cache**（save / restore）+ **watchdog**（job-start / run / dispatch-retry），action 声明位于 **`kit/`**。消费方引用 **`@main`**（如 `hcwhan/actions/kit/cache/save@main`）。

## 仓库布局

| 路径 | 说明 |
|------|------|
| `kit/cache/`、`kit/watchdog/` | action 声明（`node24` → `dist/<group>/*/index.js`） |
| `src/base/` | 跨 action 组共享层 |
| `src/cache/`、`src/watchdog/` | 各组 entry + `lib/` |
| `test/base/`、`test/cache/`、`test/watchdog/` | vitest 单测 |
| `dist/` | `tsc` + post-build 产物（勿手改） |
| `scripts/build-base.mjs` | vendor esbuild + import 改写公共逻辑 |
| `scripts/build-cache.mjs` | 仅 `dist/cache/*` import 改写 |
| `scripts/build-watchdog.mjs` | 仅 `dist/watchdog/*` import 改写 |
| `scripts/build.mjs` | 顶层编排（`npm run build`） |
| `scripts/format-ts-style.mjs` | TypeScript import / 空行格式化 |

### `src/base/`

| 模块 | 作用 |
|------|------|
| `action-input.ts` | `runAction`、`readPositiveIntInput`、`readNonNegativeIntInput`、`readBooleanInput`、`readPathInput` |
| `retry.ts` | `sleep`、`withRetry`（线性退避；cache API 与 dispatch 重试共用） |
| `errors.ts` | `errorMessage`、`toError` |
| `github-context.ts` | `getGithubRepoContext`、`createOctokit`、`getGithubRefName` |
| `pad.ts` | UTC 后缀等字符串填充 |

### `src/watchdog/lib/`

| 模块 | 作用 |
|------|------|
| `watchdog.ts` | `createWatchdog`：deadline → SIGINT 优雅中止 → 强杀 |
| `process-tree.ts` | `listLiveProcessTreePids`、`isProcessTreeEmpty`、`waitForProcessTreeEmpty` |
| `spawn-async.ts` | `spawnAsync`、`sendGracefulAbortToProcessTree`、`forceKillProcessTree` |
| `parse-inputs.ts` | `parseArgsInput`、`parseJobStartMs`、`parseLimitHoursInput`、`parseDispatchInputs` |
| `dispatch-workflow.ts` | `dispatchRetryWorkflow`：`withRetry` dispatch + 等待 concurrency cancel |

**重试策略约定：** SIGINT 优雅中止为固定 60s 间隔手写循环（最多 5 次，成功 = 进程树清空，耗尽后强杀）；`dispatch-workflow` 的 `createWorkflowDispatch` 使用 `withRetry`（`delayMs: 30_000`，最多 3 次，间隔 30s / 60s）。

---

## TypeScript 编码规范

### Import 布局

凡含 `import` 的 `.ts` / `.js` / `.mjs` 文件（含 `scripts/`），按以下顺序排列：

1. **import 块前**：空 **1** 行（文件首行留空）
2. **`node:` 内置模块**（如 `node:fs`、`node:child_process`）
3. **空 1 行**（仅当下一组有 import 时）
4. **npm 依赖包**（`@actions/*`、`vitest`、`esbuild` 等；不含 `node:`、不含 `@/*`、不含相对路径）
5. **空 1 行**（仅当下一组有 import 时）
6. **项目内依赖**：`@/*` 别名、相对路径（`./`、`../`）
7. **import 块后**：空 **2** 行，再接后续代码

某组无 import 时跳过该组及其前后空行；仍保留「块前 1 行 + 块后 2 行」。

无 import 的纯逻辑文件：首行仍留 **1** 行空行，再写代码。

**示例：**

```typescript

import { type ChildProcess } from "node:child_process";

import * as core from "@actions/core";

import { runAction } from "@/base/action-input.js";
import { parseArgsInput } from "../lib/parse-inputs.js";


// …
```

### Export 可见性

- **不得**为未被任何 `src/` 代码 import 的符号加 `export`（模块内私有即可）
- **不得**为仅被 `test/` import 的符号加 `export`；应改为在测试侧 mock / stub，或将待测逻辑留在同文件内通过 public API 间接覆盖
- `export` 仅用于：`src/` 内跨文件复用、action entry（`*/index.ts`）对外暴露的运行时契约，或确有外部消费方（非 test）依赖的 API

### 注释

- 每个**顶层** `function`、**导出/未导出**均可；每个 **`const` 常量**、**`interface` / `type` 别名**、**`class`**，在其**上一行**加一行 `//` 注释
- 注释应**简洁精炼**（中文为主，与现有 `src/base/` 风格一致）
- **不要**在函数体内部加注释（除非已有且与本次改动强相关）
- 测试文件中：`describe` / `it` **不需要**注释；独立的 helper 函数 / 常量仍遵循上述规则

### 空行与注释：禁止擅自删除

**修改代码时：**

- **不得**自主删除已有空行（含 import 块前后、逻辑段落之间的空行）
- **不得**自主删除已有 `//` 注释（含函数、常量、interface 上的注释）
- 若格式化 / lint / 「整理代码」与保留空行、注释冲突，**以保留为准**
- 仅当用户**明确要求**删除，或该空行/注释因删除对应代码而**必然成为死代码**时，才可删除

---

## 构建与测试

```bash
npm run build          # 全量：clean → tsc → vendor → prepareBase + cache + watchdog
npm run build:cache    # 仅 cache import 改写（需 dist 已由 tsc 产出）
npm run build:watchdog # 仅 watchdog import 改写
npm run format:ts      # 按本规范格式化 src/、test/、scripts/ 下 .ts/.js/.mjs（不含 dist/）
npm test
npm run typecheck
```

改 `src/**/*.ts` 后须先 `tsc`（或全量 `npm run build`）更新 `dist/`，再视需要跑 `build:cache` / `build:watchdog` 重跑 import 改写。
