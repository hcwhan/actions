
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";


// vitest 配置根目录（@ 别名指向 src）
const rootDir = path.dirname(fileURLToPath(import.meta.url));


export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDir, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
