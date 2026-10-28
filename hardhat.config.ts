import "dotenv/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig, task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";
import HardhatDeploy from "hardhat-deploy";
import { chains } from "./chains.js";

const rpcUrl = (chainId: number) =>
  process.env.BASE_RPC_URL === undefined
    ? configVariable("BASE_RPC_URL")
    : configVariable("RPC_SECRET", { format: `${process.env.BASE_RPC_URL}/${chainId}?secret={variable}` });
const httpNetworks = Object.fromEntries(
  Object.entries(chains).map(([name, chain]) => [
    name,
    {
      type: "http" as const,
      chainType: chain.chainType,
      url: "node" in chain ? chain.node : rpcUrl(chain.chainId),
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

const generateDeploymentsTask = task("generate:deployments", "Generate markdown file with deployed contract addresses")
  .setAction(() => import("./src/tasks/generate_deployments_markdown.js"))
  .build();

const codesizeTask = task("codesize", "Displays the codesize of the contracts")
  .addFlag({ name: "skipcompile", description: "should not compile before printing size" })
  .addOption({
    name: "contractname",
    description: "name of the contract",
    type: ArgumentType.STRING_WITHOUT_DEFAULT,
    defaultValue: undefined,
  })
  .setAction(() => import("./src/tasks/show_codesize.js"))
  .build();

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers, HardhatDeploy],
  tasks: [generateDeploymentsTask, codesizeTask],
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
