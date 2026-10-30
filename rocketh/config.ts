import type { Create2DeterministicDeploymentInfo, UserConfig } from "rocketh/types";
import * as deployExtension from "@rocketh/deploy";
import * as readExecuteExtension from "@rocketh/read-execute";
import { getSingletonFactoryInfo } from "@safe-global/safe-singleton-factory";
import { chains } from "../chains.js";

const SAFE_SINGLETON_FACTORY = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";
const HARDHAT_CHAIN_ID = 31337;

const chainIds = [...Object.values(chains).map((c) => c.chainId), HARDHAT_CHAIN_ID];
const deterministicDeployments: Map<number, Create2DeterministicDeploymentInfo> = new Map();
for (const chainId of chainIds) {
  const info = getSingletonFactoryInfo(chainId);
  if (!info) {
    console.warn(`WARNING: no safe singleton factory on ${chainId}`);
    continue;
  }
  if (info.address.toLowerCase() !== SAFE_SINGLETON_FACTORY.toLowerCase()) {
    console.warn(`WARNING: unexpected safe singleton factory on ${chainId}`);
  }
  deterministicDeployments.set(chainId, {
    factory: info.address as `0x${string}`,
    deployer: info.signerAddress as `0x${string}`,
    funding: (BigInt(info.gasLimit) * BigInt(info.gasPrice)).toString(),
    signedTx: info.transaction as `0x${string}`,
  });
}
const chainConfigs = Object.fromEntries(
  Array.from(deterministicDeployments.entries()).map(([chainId, deploymentInfo]) => [
    chainId,
    {
      deterministicDeployment: deploymentInfo,
    },
  ]),
);

export const config = {
  accounts: {
    deployer: {
      default: 0,
    },
  },
  chains: {
    ...chainConfigs,
  },
  data: {},
} as const satisfies UserConfig;

const extensions = {
  ...deployExtension,
  ...readExecuteExtension,
};
export { extensions };
type Extensions = typeof extensions;
type Accounts = typeof config.accounts;
type Data = typeof config.data;
export type { Extensions, Accounts, Data };
