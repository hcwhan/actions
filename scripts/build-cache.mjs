import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(scriptDir, "..");

const ENTRY_NAMES = ["cache/save", "cache/lookup", "cache/restore"];
const LIB_DIR = "dist/cache/lib";
const BASE_DIR = "dist/base";

// ESM vendor bundle 内嵌的 CJS 依赖（如 @actions/http-client → tunnel）会 dynamic require Node 内置模块；
// GitHub Actions node24 以 ESM 加载 action 时没有全局 require，需注入 createRequire shim。
const ESM_REQUIRE_SHIM = [
  'import { createRequire as __createRequireForVendorBundle } from "node:module";',
  "const require = __createRequireForVendorBundle(import.meta.url);",
].join("\n");

// 共享 esbuild 选项：不压缩、保留名称、生成 source map
const sharedOptions = {
  platform: "node",
  format: "esm",
  minify: false,
  keepNames: true,
  sourcemap: true,
  logLevel: "info",
  legalComments: "inline",
  banner: { js: ESM_REQUIRE_SHIM },
};

// 3 个 vendor 包，与 package.json dependencies 一一对应
const VENDOR_PACKAGES = [
  {
    name: "core",
    entry: ['export * from "@actions/core";', 'export * from "@actions/http-client";'].join("\n"),
    externalMap: {},
  },
  {
    name: "github",
    entry: 'export { context, getOctokit } from "@actions/github";',
    externalMap: {
      "@actions/core": "../core/index.js",
      "@actions/http-client": "../core/index.js",
    },
  },
  {
    name: "cache",
    entry: 'export * from "@actions/cache";',
    externalMap: {
      "@actions/core": "../core/index.js",
      "@actions/http-client": "../core/index.js",
    },
  },
];

// 打包 vendor 子包时，将 npm 依赖指向已打包的 vendor 文件
function createVendorDependencyExternalPlugin(externalMap) {
  return {
    name: "external-vendor-deps",
    setup(build) {
      for (const [pkg, vendorPath] of Object.entries(externalMap)) {
        build.onResolve({ filter: new RegExp(`^${pkg.replace("/", "\\/")}$`) }, () => ({
          path: vendorPath,
          external: true,
        }));
      }
    },
  };
}

function writeTempVendorEntry(relativePath, content) {
  writeFileSync(path.join(rootDir, relativePath), content);
}

function removeTempFile(relativePath) {
  const filePath = path.join(rootDir, relativePath);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}

// @actions/* → dist/vendor 子路径（相对 dist/ 根目录）
const VENDOR_IMPORT_MAP = {
  "@actions/core": "core/index.js",
  "@actions/cache": "cache/index.js",
  "@actions/github": "github/index.js",
};

function vendorImportPrefix(fromFilePath) {
  const distDir = path.join(rootDir, "dist");
  const fileDir = path.dirname(fromFilePath);
  const relativeDir = path.relative(distDir, fileDir);
  const depth = relativeDir === "" ? 0 : relativeDir.split(path.sep).length;
  return depth === 0 ? "./vendor" : `${"../".repeat(depth)}vendor`;
}

// @/… → 相对 dist/ 的路径（@ 映射 src → dist）
function resolveAliasImportPath(fileDir, subpath) {
  const targetPath = path.join(rootDir, "dist", subpath);
  let relativePath = path.relative(fileDir, targetPath).split(path.sep).join("/");
  if (!relativePath.startsWith(".")) {
    relativePath = `./${relativePath}`;
  }
  return relativePath;
}

// 将 tsc 产物中 @/… import 改为相对路径（静态 import / export from / 动态 import）
function rewriteAliasImports(filePath) {
  let content = readFileSync(filePath, "utf8");
  const fileDir = path.dirname(filePath);
  const toRelative = (subpath) => resolveAliasImportPath(fileDir, subpath);

  content = content.replace(/\bfrom "@\/([^"]+)"/g, (_match, subpath) => `from "${toRelative(subpath)}"`);
  content = content.replace(/\bimport\s*\(\s*"@\/([^"]+)"\s*\)/g, (_match, subpath) => `import("${toRelative(subpath)}")`);
  content = content.replace(/\bimport "@\/([^"]+)"/g, (_match, subpath) => `import "${toRelative(subpath)}"`);

  writeFileSync(filePath, content);
}

function rewriteVendorImports(filePath) {
  let content = readFileSync(filePath, "utf8");
  const vendorPrefix = vendorImportPrefix(filePath);
  for (const [pkg, vendorSubpath] of Object.entries(VENDOR_IMPORT_MAP)) {
    const vendorPath = `${vendorPrefix}/${vendorSubpath}`;
    const pattern = new RegExp(`from "${pkg.replace("/", "\\/")}"`, "g");
    content = content.replace(pattern, `from "${vendorPath}"`);
  }
  writeFileSync(filePath, content);
}

function rewriteDistImports(filePath) {
  rewriteVendorImports(filePath);
  rewriteAliasImports(filePath);
}

// 按 VENDOR_PACKAGES 顺序打包 dist/vendor/{name}/index.js
async function bundleVendors() {
  mkdirSync(path.join(rootDir, "dist/vendor"), { recursive: true });

  for (const pkg of VENDOR_PACKAGES) {
    const tempEntry = `scripts/.vendor-${pkg.name}-entry.ts`;
    const outdir = path.join(rootDir, "dist/vendor", pkg.name);
    mkdirSync(outdir, { recursive: true });

    writeTempVendorEntry(tempEntry, `${pkg.entry}\n`);
    try {
      await esbuild.build({
        ...sharedOptions,
        entryPoints: [path.join(rootDir, tempEntry)],
        bundle: true,
        outfile: path.join(outdir, "index.js"),
        plugins: [createVendorDependencyExternalPlugin(pkg.externalMap)],
      });
    } finally {
      removeTempFile(tempEntry);
    }
  }
}

function cleanDist() {
  const distDir = path.join(rootDir, "dist");
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true });
  }
}

function compileTypeScript() {
  const tscBin = path.join(rootDir, "node_modules/typescript/bin/tsc");
  const result = spawnSync(tscBin, ["-p", "tsconfig.build.json"], {
    cwd: rootDir,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// 递归遍历目录下全部 .js 产物
function forEachJsFile(dir, callback) {
  if (!existsSync(dir)) {
    return;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      forEachJsFile(fullPath, callback);
    } else if (entry.name.endsWith(".js")) {
      callback(fullPath);
    }
  }
}

// lib / base 保留 tsc 多文件结构，改写 @actions/* 与 @/* import
function prepareLibFiles() {
  for (const dir of [LIB_DIR, BASE_DIR]) {
    forEachJsFile(path.join(rootDir, dir), rewriteDistImports);
  }
}

function prepareEntryFiles() {
  for (const name of ENTRY_NAMES) {
    rewriteDistImports(path.join(rootDir, "dist", name, "index.js"));
  }
}

async function main() {
  cleanDist();
  compileTypeScript();
  await bundleVendors();
  prepareLibFiles();
  prepareEntryFiles();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
