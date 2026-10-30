import { assertSingletonFactory } from "../rocketh/config.js";
import {
  type ExpectedSocialRecoveryModule,
  pinnedSocialRecoveryModule,
  SOCIAL_RECOVERY_MODULE_ADDRESSES,
  socialRecoveryModuleAddress,
} from "../rocketh/expected_addresses.js";
import { artifacts, deployScript } from "../rocketh/deploy.js";

const MAX_RECOVERY_PERIOD = 2n ** 63n; // keeps block.timestamp + recoveryPeriod far below the uint64 executableAt wrap

/**
 * Reads SCM_RECOVERY_PERIOD_ARG, which narrows a run to the variant with that recovery period.
 *
 * @returns The requested recovery period in seconds, or undefined when the variable is unset, in
 * which case every pinned variant allowed on the chain is deployed.
 * @throws If the value is not a whole number of seconds, is zero, or exceeds MAX_RECOVERY_PERIOD.
 */
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

/**
 * Selects the SocialRecoveryModule variants this run deploys.
 *
 * Without SCM_RECOVERY_PERIOD_ARG, every pinned variant is selected, minus the testnet-only ones
 * on a chain that is not a testnet. With it, only the variant pinned for that recovery period.
 *
 * @param isTestnet - Whether the chain is tagged "testnet".
 * @returns The variants to deploy, in the order they are pinned.
 * @throws If the requested recovery period has no pinned variant, or names a testnet-only variant
 * on a chain that is not a testnet.
 */
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
  /**
   * Deploys the selected SocialRecoveryModule variants through the Safe singleton factory.
   *
   * Every variant's create2 address is computed from the artifact and checked against its pin
   * before any transaction is sent, and the address rocketh reports is checked again after each
   * deployment. A variant already deployed at its address is skipped by rocketh.
   *
   * @throws If a computed or deployed address differs from its pin, or the chain's singleton
   * factory is missing.
   */
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
