
import { prepareActionGroupDist } from "./build-base.mjs";


const LIB_DIR = "dist/cache/lib";
const ENTRY_NAMES = [
  "cache/save",
  "cache/lookup",
  "cache/restore"
];

export function prepareCacheDist() {
  prepareActionGroupDist({ libDir: LIB_DIR, entryNames: ENTRY_NAMES });
}
