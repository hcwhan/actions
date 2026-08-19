
import { cleanDist, compileTypeScript, bundleVendors, prepareBaseDist } from "./build-base.mjs";
import { prepareCacheDist } from "./build-cache.mjs";
import { prepareWatchdogDist } from "./build-watchdog.mjs";


const only = process.argv.includes("--only")
  ? process.argv[process.argv.indexOf("--only") + 1]
  : "all";

async function main() {
  if (only === "all") {
    cleanDist();
    compileTypeScript();
    await bundleVendors();
    prepareBaseDist();
    prepareCacheDist();
    prepareWatchdogDist();
    return;
  }
  if (only === "cache") {
    prepareCacheDist();
    return;
  }
  if (only === "watchdog") {
    prepareWatchdogDist();
    return;
  }
  throw new Error(`未知 --only: ${only}`);
}

main();
