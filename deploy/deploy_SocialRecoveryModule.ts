import { artifacts, deployScript } from "../rocketh/deploy.js";

const RECOVERY_PERIOD = 14n * 24n * 60n * 60n; // 14 days

function getRecoveryPeriod(): bigint {
  const recoveryPeriod = process.env.SCM_RECOVERY_PERIOD_ARG;
  if (!recoveryPeriod) {
    return RECOVERY_PERIOD;
  }
  if (!/^\d+$/.test(recoveryPeriod)) {
    throw new Error(`SCM_RECOVERY_PERIOD_ARG must be a number of seconds, got "${recoveryPeriod}"`);
  }
  return BigInt(recoveryPeriod);
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
