import { assertSingletonFactory } from "../rocketh/config.js";
import {
  type ExpectedSocialRecoveryModule,
  pinnedSocialRecoveryModule,
  SOCIAL_RECOVERY_MODULE_ADDRESSES,
  socialRecoveryModuleAddress,
} from "../rocketh/expected_addresses.js";
import { artifacts, deployScript } from "../rocketh/deploy.js";

const MAX_RECOVERY_PERIOD = 2n ** 63n; // keeps block.timestamp + recoveryPeriod far below the uint64 executableAt wrap

// SCM_RECOVERY_PERIOD_ARG narrows a run to the variant with that recovery period, in seconds. Unset,
// every pinned variant allowed on the chain is deployed.
function getRequestedRecoveryPeriod(): bigint | undefined {
  const recoveryPeriod = process.env.SCM_RECOVERY_PERIOD_ARG;
  if (!recoveryPeriod) {
    return undefined;
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

function selectVariants(isTestnet: boolean): ExpectedSocialRecoveryModule[] {
  const requested = getRequestedRecoveryPeriod();
  if (requested === undefined) {
    return SOCIAL_RECOVERY_MODULE_ADDRESSES.filter((variant) => isTestnet || !variant.testnetOnly);
  }
  const pinned = pinnedSocialRecoveryModule(requested);
  if (!pinned) {
    throw new Error(
      `No pinned address for a recovery period of ${requested} seconds. ` +
        "Add it to rocketh/expected_addresses.ts if this variant is meant to be deployed.",
    );
  }
  if (pinned.testnetOnly && !isTestnet) {
    throw new Error(`SocialRecoveryModule (${pinned.label}) may only be deployed on a chain tagged "testnet".`);
  }
  return [pinned];
}

export default deployScript(
  async (env) => {
    const { deploy, namedAccounts } = env;
    const { deployer } = namedAccounts;
    const variants = selectVariants(env.tags.testnet === true);

    // Refuse to deploy anywhere but at the pinned addresses, before any transaction is sent.
    for (const variant of variants) {
      const expectedAddress = socialRecoveryModuleAddress(artifacts.SocialRecoveryModule.bytecode, variant.recoveryPeriod);
      if (expectedAddress !== variant.address) {
        throw new Error(
          `SocialRecoveryModule (${variant.label}) would deploy at ${expectedAddress}, but its pinned address is ${variant.address}. ` +
            "The build does not match the sources the pin was computed from: check for a stale build, modified sources, " +
            "CRLF line endings, or different compiler or dependency versions. Update rocketh/expected_addresses.ts only if the move is intended.",
        );
      }
    }

    await assertSingletonFactory(env);
    for (const variant of variants) {
      const deployment = await deploy(
        `SocialRecoveryModule_${variant.key}`,
        {
          account: deployer,
          artifact: artifacts.SocialRecoveryModule,
          args: [variant.recoveryPeriod],
        },
        {
          deterministic: true,
        },
      );
      if (deployment.address.toLowerCase() !== variant.address.toLowerCase()) {
        throw new Error(
          `SocialRecoveryModule (${variant.label}) was deployed at ${deployment.address} instead of the pinned ${variant.address}.`,
        );
      }
    }
  },
  { tags: ["SocialRecoveryModule", "SocialRecoveryModule_deploy"] },
);
