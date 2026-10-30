import { AbiCoder, getCreate2Address, keccak256, ZeroHash } from "ethers";
import { SAFE_SINGLETON_FACTORY } from "../rocketh/config.js";

// `deterministic: true` in rocketh is create2 through the chain's factory with a zero salt.
export const CREATE2_SALT = ZeroHash;

export type ExpectedSocialRecoveryModule = {
  readonly label: string;
  readonly recoveryPeriod: bigint;
  readonly address: `0x${string}`;
};

/**
 * The address of every SocialRecoveryModule variant that may be deployed, one per recovery period.
 *
 * The deploy script refuses to deploy a recovery period that is not listed here, or whose computed
 * address differs from the one listed. The address is derived from the creation bytecode, which
 * ends with a metadata hash of the sources and compiler settings, so it changes with any edit to a
 * contract or its dependencies, with the line endings of the sources, with the compiler settings
 * and with the constructor argument.
 *
 * Update an entry only in the same change that moves it, and only once the move is understood.
 * test/ExpectedAddresses.spec.ts recomputes every entry from the build.
 */
export const SOCIAL_RECOVERY_MODULE_ADDRESSES: readonly ExpectedSocialRecoveryModule[] = [
  { label: "3 minutes (testnets only)", recoveryPeriod: 3n * 60n, address: "0x4dF6081A82E07A7cD99aEf91C72d12a5138e468B" },
  { label: "3 days", recoveryPeriod: 3n * 24n * 60n * 60n, address: "0x00480F5ecC008995469fA7e12c70Ef3DC9FEe7fD" },
  { label: "7 days", recoveryPeriod: 7n * 24n * 60n * 60n, address: "0xEaC444E2F28469E641215F129874Aff8294cAfE0" },
  { label: "14 days", recoveryPeriod: 14n * 24n * 60n * 60n, address: "0x4d92D03a47468d9FC62495d85E3F205b4616FC5c" },
];

export function pinnedSocialRecoveryModule(recoveryPeriod: bigint): ExpectedSocialRecoveryModule | undefined {
  return SOCIAL_RECOVERY_MODULE_ADDRESSES.find((entry) => entry.recoveryPeriod === recoveryPeriod);
}

/** The create2 address the Safe singleton factory gives a SocialRecoveryModule with this bytecode and recovery period. */
export function socialRecoveryModuleAddress(bytecode: string, recoveryPeriod: bigint): `0x${string}` {
  const constructorArgs = AbiCoder.defaultAbiCoder().encode(["uint256"], [recoveryPeriod]);
  const initCode = bytecode + constructorArgs.slice(2);
  return getCreate2Address(SAFE_SINGLETON_FACTORY, CREATE2_SALT, keccak256(initCode)) as `0x${string}`;
}
