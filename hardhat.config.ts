import "dotenv/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import HardhatDeploy from "hardhat-deploy";
import { chains } from "./chains.js";

/**
 * Builds the RPC url of a network, in order of priority: RPC_URL_<chainId>, the chain's `node` in
 * chains.ts, then <BASE_RPC_URL>/<chainId>?secret=<RPC_SECRET>. Without BASE_RPC_URL, it falls
 * back to a complete RPC_URL_<chainId>, which may then come from the keystore.
 *
 * The shape of the url is decided when the config loads, so RPC_URL_<chainId> and BASE_RPC_URL are
 * read from the environment (.env). Secrets (RPC_SECRET, DEPLOYER_PRIVATE_KEY, ETHERSCAN_API_KEY)
 * are configuration variables, resolved at connection time from the environment or the keystore.
 *
 * @param chain - An entry of chains.ts.
 * @returns A fixed url, or a configuration variable resolved when the network connects.
 */
const rpcUrl = (chain: (typeof chains)[keyof typeof chains]) => {
  const chainRpcUrl = `RPC_URL_${chain.chainId}`;
  if (process.env[chainRpcUrl]) {
    return configVariable(chainRpcUrl);
  }
  if ("node" in chain) {
    return chain.node;
  }
  if (process.env.BASE_RPC_URL) {
    return configVariable("RPC_SECRET", { format: `${process.env.BASE_RPC_URL}/${chain.chainId}?secret={variable}` });
  }
  // Nothing in the environment to compose a url from: require a complete per-chain url, which may
  // then come from the keystore. A keystore BASE_RPC_URL cannot be used, since the chain id and
  // secret could not be appended to it.
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
      allowUnlimitedContractSize: true,
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
