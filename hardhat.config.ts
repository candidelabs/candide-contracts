import "dotenv/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import HardhatDeploy from "hardhat-deploy";
import { chains } from "./chains.js";

/**
 * Builds the RPC url of a network: RPC_URL_<chainId> when it is set, otherwise the chain's public
 * `node` in chains.ts. A chain without a `node` requires RPC_URL_<chainId>.
 *
 * RPC_URL_<chainId> is a configuration variable, resolved when the network connects, from the
 * environment or the Hardhat keystore. Overriding a chain's `node` is decided when the config
 * loads, so that override must be in the environment (.env).
 *
 * @param chain - An entry of chains.ts.
 * @returns A fixed url, or a configuration variable resolved when the network connects.
 */
const rpcUrl = (chain: (typeof chains)[keyof typeof chains]) => {
  const chainRpcUrl = `RPC_URL_${chain.chainId}`;
  if ("node" in chain && !process.env[chainRpcUrl]) {
    return chain.node;
  }
  return configVariable(chainRpcUrl);
};

const httpNetworks = Object.fromEntries(
  Object.entries(chains).map(([name, chain]) => [
    name,
    {
      type: "http" as const,
      chainId: chain.chainId,
      chainType: chain.chainType,
      url: rpcUrl(chain),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  ]),
);

const optimizedCompilerSettings = {
  version: "0.8.20",
  settings: {
    optimizer: { enabled: true, runs: 1000000 },
    evmVersion: "paris",
    viaIR: true,
  },
};

const buildProfile = {
  compilers: [
    {
      version: "0.8.20",
      settings: {
        optimizer: { enabled: true, runs: 1000000 },
        evmVersion: "paris",
      },
    },
  ],
  overrides: {
    "contracts/modules/social_recovery/SocialRecoveryModule.sol": optimizedCompilerSettings,
  },
};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, HardhatDeploy],
  solidity: {
    profiles: {
      default: buildProfile,
      production: buildProfile,
    },
    npmFilesToBuild: [
      "@safe-global/safe-contracts/contracts/handler/CompatibilityFallbackHandler.sol",
      "@safe-global/safe-contracts/contracts/libraries/SignMessageLib.sol",
    ],
  },
  typechain: {
    outDir: "typechain-types",
  },
  generateTypedArtifacts: {
    destinations: [
      {
        mode: "typescript",
      },
    ],
  },
  coverage: {
    skipFiles: ["contracts/test/**"],
  },
  networks: {
    default: {
      type: "edr-simulated",
      blockGasLimit: 100000000,
    },
    ...httpNetworks,
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
