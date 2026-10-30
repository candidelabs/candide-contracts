import { AbiCoder, getCreate2Address, keccak256, ZeroHash } from "ethers";
import { SAFE_SINGLETON_FACTORY } from "../rocketh/config.js";

// `deterministic: true` in rocketh is create2 through the chain's factory with a zero salt.
export const CREATE2_SALT = ZeroHash;

/** The SocialRecoveryModule version the contracts in this repository build (its VERSION constant). */
export const SOCIAL_RECOVERY_MODULE_VERSION = "0.2.0";

export type ExpectedSocialRecoveryModule = {
  readonly label: string;
  readonly recoveryPeriod: bigint;
  /** The create2 address, the same on every network. */
  readonly address: `0x${string}`;
  /** keccak256 of the runtime code at that address: what `eth_getCode` returns, with the recovery period immutable filled in. */
  readonly codeHash: `0x${string}`;
};

/**
 * Every SocialRecoveryModule variant that may be deployed, per version and recovery period.
 *
 * The address is derived from the creation bytecode, which ends with a metadata hash of the sources
 * and compiler settings, so it changes with any edit to a contract or its dependencies, with the
 * line endings of the sources, with the compiler settings and with the constructor argument. The
 * code hash lets anyone check a deployed instance with `eth_getCode` alone, without compiling.
 *
 * The entries for SOCIAL_RECOVERY_MODULE_VERSION are what this repository builds: the deploy
 * script refuses to deploy a recovery period that is not listed, or whose computed address differs
 * from the one listed, and test/ExpectedAddresses.spec.ts recomputes address and code hash of every
 * entry from the build. Update an entry only in the same change that moves it, and only once the
 * move is understood.
 */
export const SOCIAL_RECOVERY_MODULE_DEPLOYMENTS: Readonly<Record<string, readonly ExpectedSocialRecoveryModule[]>> = {
  "0.2.0": [
    {
      label: "3 minutes (testnets only)",
      recoveryPeriod: 3n * 60n,
      address: "0x4dF6081A82E07A7cD99aEf91C72d12a5138e468B",
      codeHash: "0xc0547ec59123a73940a10008ab105d4579435baf07e2a1a0696600c0727b4d20",
    },
    {
      label: "3 days",
      recoveryPeriod: 3n * 24n * 60n * 60n,
      address: "0x00480F5ecC008995469fA7e12c70Ef3DC9FEe7fD",
      codeHash: "0x154717e4e357f89fa0b32230dff1e8023ef537ee292531c2aea4542f497381b7",
    },
    {
      label: "7 days",
      recoveryPeriod: 7n * 24n * 60n * 60n,
      address: "0xEaC444E2F28469E641215F129874Aff8294cAfE0",
      codeHash: "0xd46c0c47dc9e3be052f61865745dfc3fac1e99abf4ad73565c6948331478c6d6",
    },
    {
      label: "14 days",
      recoveryPeriod: 14n * 24n * 60n * 60n,
      address: "0x4d92D03a47468d9FC62495d85E3F205b4616FC5c",
      codeHash: "0x3fd518db238b4b131340be8dad1731d79e184588529317d09f01155139e8ab3f",
    },
  ],
};

/** The variants of the version this repository builds. */
export const SOCIAL_RECOVERY_MODULE_ADDRESSES: readonly ExpectedSocialRecoveryModule[] =
  SOCIAL_RECOVERY_MODULE_DEPLOYMENTS[SOCIAL_RECOVERY_MODULE_VERSION];

export function pinnedSocialRecoveryModule(recoveryPeriod: bigint): ExpectedSocialRecoveryModule | undefined {
  return SOCIAL_RECOVERY_MODULE_ADDRESSES.find((entry) => entry.recoveryPeriod === recoveryPeriod);
}

function encodeRecoveryPeriod(recoveryPeriod: bigint): string {
  return AbiCoder.defaultAbiCoder().encode(["uint256"], [recoveryPeriod]).slice(2);
}

/** The create2 address the Safe singleton factory gives a SocialRecoveryModule with this bytecode and recovery period. */
export function socialRecoveryModuleAddress(bytecode: string, recoveryPeriod: bigint): `0x${string}` {
  const initCode = bytecode + encodeRecoveryPeriod(recoveryPeriod);
  return getCreate2Address(SAFE_SINGLETON_FACTORY, CREATE2_SALT, keccak256(initCode)) as `0x${string}`;
}

export type RuntimeArtifact = {
  readonly deployedBytecode: string;
  /** solc's immutableReferences: byte offsets in the runtime code, per immutable id. */
  readonly immutableReferences?: Readonly<Record<string, readonly { readonly start: number; readonly length: number }[]>>;
};

/** keccak256 of the runtime code of a SocialRecoveryModule with this artifact and recovery period. */
export function socialRecoveryModuleCodeHash(artifact: RuntimeArtifact, recoveryPeriod: bigint): `0x${string}` {
  const references = Object.values(artifact.immutableReferences ?? {}).flat();
  if (references.length === 0) {
    throw new Error("artifact has no immutable references: the recovery period cannot be filled into its runtime code");
  }
  const word = encodeRecoveryPeriod(recoveryPeriod);
  let code = artifact.deployedBytecode.slice(2);
  for (const { start, length } of references) {
    code = code.slice(0, start * 2) + word.slice(0, length * 2) + code.slice((start + length) * 2);
  }
  return keccak256("0x" + code) as `0x${string}`;
}
