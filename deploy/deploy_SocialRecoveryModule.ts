import { artifacts, deployScript } from "../rocketh/deploy.js";

const RECOVERY_PERIOD = 14n * 24n * 60n * 60n; // 14 days

export default deployScript(
  async ({ deploy, namedAccounts }) => {
    const { deployer } = namedAccounts;
    await deploy(
      "SocialRecoveryModule",
      {
        account: deployer,
        artifact: artifacts.SocialRecoveryModule,
        args: [RECOVERY_PERIOD],
      },
      {
        deterministic: true,
      },
    );
  },
  { tags: ["SocialRecoveryModule", "SocialRecoveryModule_deploy"] },
);
