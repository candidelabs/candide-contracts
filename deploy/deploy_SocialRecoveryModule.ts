import { artifacts, deployScript } from "../rocketh/deploy.js";

const RECOVERY_PERIOD = 14n * 24n * 60n * 60n; // 14 days
const MAX_RECOVERY_PERIOD = 2n ** 63n; // keeps block.timestamp + recoveryPeriod far below the uint64 executableAt wrap

function getRecoveryPeriod(): bigint {
  const recoveryPeriod = process.env.SCM_RECOVERY_PERIOD_ARG;
  if (!recoveryPeriod) {
    return RECOVERY_PERIOD;
  }
  if (!/^\d+$/.test(recoveryPeriod)) {
    throw new Error(`SCM_RECOVERY_PERIOD_ARG must be a number of seconds, got "${recoveryPeriod}"`);
  }
  const seconds = BigInt(recoveryPeriod);
  if (seconds > MAX_RECOVERY_PERIOD) {
    throw new Error(`SCM_RECOVERY_PERIOD_ARG must be at most ${MAX_RECOVERY_PERIOD} seconds, got "${recoveryPeriod}"`);
  }
  return seconds;
}

export default deployScript(
  async ({ deploy, namedAccounts }) => {
    const { deployer } = namedAccounts;
    await deploy(
      "SocialRecoveryModule",
      {
        account: deployer,
        artifact: artifacts.SocialRecoveryModule,
        args: [getRecoveryPeriod()],
      },
      {
        deterministic: true,
      },
    );
  },
  { tags: ["SocialRecoveryModule", "SocialRecoveryModule_deploy"] },
);
