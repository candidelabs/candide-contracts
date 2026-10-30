import type { Create2DeterministicDeploymentInfo, UserConfig } from "rocketh/types";
import * as deployExtension from "@rocketh/deploy";
import * as readExecuteExtension from "@rocketh/read-execute";
import { getSingletonFactoryInfo } from "@safe-global/safe-singleton-factory";
import { chains } from "../chains.js";

export const SAFE_SINGLETON_FACTORY = "0x914d7Fec6aaC8cd542e72Bca78B30650d45643d7";
// Runtime code of the Safe singleton factory, identical on every chain.
const SAFE_SINGLETON_FACTORY_CODE =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";
const HARDHAT_CHAIN_ID = 31337;

const chainIds = [...Object.values(chains).map((c) => c.chainId), HARDHAT_CHAIN_ID];
// Chains tagged "testnet": the configured testnets and the local hardhat chain. Deploy scripts read
// the tag from env.tags to decide what may be deployed on a chain.
const testnetChainIds = new Set<number>([
  ...Object.values(chains)
    .filter((c) => "testnet" in c && c.testnet)
    .map((c) => c.chainId),
  HARDHAT_CHAIN_ID,
]);
const deterministicDeployments: Map<number, Create2DeterministicDeploymentInfo> = new Map();
// Chains (OP stack) that ship the factory as a preinstall: their artifact has no signed
// deployment transaction, so rocketh cannot deploy the factory and can only find it in place.
const preinstalledFactoryChainIds = new Set<number>();
for (const chainId of chainIds) {
  const info = getSingletonFactoryInfo(chainId);
  if (!info) {
    throw new Error(
      `Safe singleton factory not found for chain ${chainId}. ` +
        "Contracts are deployed through it so that they get the same address on every network. " +
        "You can request a new deployment at https://github.com/safe-global/safe-singleton-factory.",
    );
  }
  if (info.address.toLowerCase() !== SAFE_SINGLETON_FACTORY.toLowerCase()) {
    // The pinned addresses in rocketh/expected_addresses.ts assume this factory on every chain.
    throw new Error(`Unexpected Safe singleton factory ${info.address} on chain ${chainId}, expected ${SAFE_SINGLETON_FACTORY}.`);
  }
  if (info.transaction === "0x") {
    preinstalledFactoryChainIds.add(chainId);
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
      tags: testnetChainIds.has(chainId) ? ["testnet"] : [],
    },
  ]),
);

type FactoryCheckEnvironment = {
  network: {
    chain: { id: number };
    provider: { request(args: { method: "eth_getCode"; params: [`0x${string}`, "latest"] }): Promise<unknown> };
  };
};

// On a chain whose factory is a preinstall, rocketh skips its own factory check and would try to
// broadcast the empty transaction if the factory were missing. Check it here instead.
export async function assertSingletonFactory(env: FactoryCheckEnvironment): Promise<void> {
  const chainId = env.network.chain.id;
  if (!preinstalledFactoryChainIds.has(chainId)) {
    return;
  }
  const code = await env.network.provider.request({ method: "eth_getCode", params: [SAFE_SINGLETON_FACTORY, "latest"] });
  if (typeof code !== "string" || code.toLowerCase() !== SAFE_SINGLETON_FACTORY_CODE) {
    throw new Error(
      `Chain ${chainId} is expected to ship the Safe singleton factory as a preinstall at ${SAFE_SINGLETON_FACTORY}, ` +
        `but the code there is ${code === "0x" ? "empty" : "not the factory"}. It cannot be deployed from here; ` +
        "see https://github.com/safe-global/safe-singleton-factory.",
    );
  }
}

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
