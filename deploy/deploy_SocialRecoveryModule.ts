import { assertSingletonFactory } from "../rocketh/config.js";
import { pinnedSocialRecoveryModule, socialRecoveryModuleAddress } from "../rocketh/expected_addresses.js";
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
  if (seconds === 0n) {
    throw new Error("SCM_RECOVERY_PERIOD_ARG must be greater than 0: a zero recovery period lets a recovery finalize immediately");
  }
  if (seconds > MAX_RECOVERY_PERIOD) {
    throw new Error(`SCM_RECOVERY_PERIOD_ARG must be at most ${MAX_RECOVERY_PERIOD} seconds, got "${recoveryPeriod}"`);
  }
  return seconds;
}

export default deployScript(
  async (env) => {
    const { deploy, namedAccounts } = env;
    const { deployer } = namedAccounts;
    const recoveryPeriod = getRecoveryPeriod();

    // Refuse to deploy anywhere but at the pinned address for this recovery period, before any
    // transaction is sent.
    const pinned = pinnedSocialRecoveryModule(recoveryPeriod);
    if (!pinned) {
      throw new Error(
        `No pinned address for a recovery period of ${recoveryPeriod} seconds. ` +
          "Add it to rocketh/expected_addresses.ts if this variant is meant to be deployed.",
      );
    }
    const expectedAddress = socialRecoveryModuleAddress(artifacts.SocialRecoveryModule.bytecode, recoveryPeriod);
    if (expectedAddress !== pinned.address) {
      throw new Error(
        `SocialRecoveryModule (${pinned.label}) would deploy at ${expectedAddress}, but its pinned address is ${pinned.address}. ` +
          "The build does not match the sources the pin was computed from: check for a stale build, modified sources, " +
          "CRLF line endings, or different compiler or dependency versions. Update rocketh/expected_addresses.ts only if the move is intended.",
      );
    }

    await assertSingletonFactory(env);
    const deployment = await deploy(
      "SocialRecoveryModule",
      {
        account: deployer,
        artifact: artifacts.SocialRecoveryModule,
        args: [recoveryPeriod],
      },
      {
        deterministic: true,
      },
    );
    if (deployment.address.toLowerCase() !== pinned.address.toLowerCase()) {
      throw new Error(`SocialRecoveryModule was deployed at ${deployment.address} instead of the pinned ${pinned.address}.`);
    }
  },
  { tags: ["SocialRecoveryModule", "SocialRecoveryModule_deploy"] },
);
