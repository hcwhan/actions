
import { prepareActionGroupDist } from "./build-base.mjs";


const LIB_DIR = "dist/watchdog/lib";
const ENTRY_NAMES = [
  "watchdog/job-start",
  "watchdog/run",
  "watchdog/dispatch-retry",
];

export function prepareWatchdogDist() {
  prepareActionGroupDist({ libDir: LIB_DIR, entryNames: ENTRY_NAMES });
}
