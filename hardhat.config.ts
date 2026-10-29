import "dotenv/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import HardhatDeploy from "hardhat-deploy";
import { chains } from "./chains.js";

const rpcUrl = (chain: (typeof chains)[keyof typeof chains]) => {
  const chainRpcUrl = `RPC_URL_${chain.chainId}`;
  if (process.env[chainRpcUrl]) {
    return configVariable(chainRpcUrl);
  }
  if ("node" in chain) {
    return chain.node;
  }
  return process.env.BASE_RPC_URL
    ? configVariable("RPC_SECRET", { format: `${process.env.BASE_RPC_URL}/${chain.chainId}?secret={variable}` })
    : configVariable("BASE_RPC_URL");
};

const httpNetworks = Object.fromEntries(
  Object.entries(chains).map(([name, chain]) => [
    name,
    {
      type: "http" as const,
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
