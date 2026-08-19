import * as core from "../../vendor/core/index.js";
import { runAction } from "../../base/action-input.js";
// job-start action 主流程：记录 job 起始时间戳
async function run() {
    const jobStartMs = Date.now();
    core.setOutput("job-start-time", String(jobStartMs));
    core.info(`job-start-time=${jobStartMs}`);
}
runAction(run);
//# sourceMappingURL=index.js.map