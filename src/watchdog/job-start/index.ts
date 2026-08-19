
import * as core from "@actions/core";

import { runAction } from "@/base/action-input.js";


// job-start action 主流程：记录 job 起始时间戳
async function run(): Promise<void> {
  const jobStartMs = Date.now();
  core.setOutput("job-start-time", String(jobStartMs));
  core.info(`job-start-time=${jobStartMs}`);
}

runAction(run);
