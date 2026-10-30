import type { SocialRecoveryModule, TestExecutor } from "../../typechain-types/index.js";
import type { TypedDataDomain } from "ethers";

export async function getEIP712Domain(socialRecoveryModule: SocialRecoveryModule): Promise<TypedDataDomain> {
  return {
    name: await socialRecoveryModule.NAME(),
    version: await socialRecoveryModule.VERSION(),
    chainId: await socialRecoveryModule.getChainId(),
    verifyingContract: await socialRecoveryModule.getAddress(),
  };
}
export function getEIP712Types() {
  return {
    ExecuteRecovery: [
      { type: "address", name: "wallet" },
      { type: "address[]", name: "newOwners" },
      { type: "uint256", name: "newThreshold" },
      { type: "uint256", name: "nonce" },
    ],
  };
}

export async function getEIP712Message(account: TestExecutor, newOwners: string[], newThreshold: number, nonce: bigint) {
  return {
    wallet: await account.getAddress(),
    newOwners: newOwners,
    newThreshold: newThreshold,
    nonce,
  };
}
