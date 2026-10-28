import "dotenv/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig, task } from "hardhat/config";
import { ArgumentType } from "hardhat/types/arguments";
import type { HttpNetworkUserConfig } from "hardhat/types/config";

const sharedNetworkConfig = {
  type: "http",
  accounts: {
    mnemonic: configVariable("MNEMONIC"),
  },
} satisfies Partial<HttpNetworkUserConfig>;

const infuraUrl = (subdomain: string) => configVariable("INFURA_KEY", { format: `https://${subdomain}.infura.io/v3/{variable}` });

const optimizedCompilerSettings = {
  version: "0.8.20",
  settings: {
    optimizer: { enabled: true, runs: 1000000 },
    evmVersion: "paris",
    viaIR: true,
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
  plugins: [hardhatToolboxMochaEthers],
  tasks: [generateDeploymentsTask, codesizeTask],
  solidity: {
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
    npmFilesToBuild: [
      "@safe-global/safe-contracts/contracts/handler/CompatibilityFallbackHandler.sol",
      "@safe-global/safe-contracts/contracts/libraries/SignMessageLib.sol",
    ],
  },
  typechain: {
    outDir: "typechain-types",
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
    gnosis: {
      ...sharedNetworkConfig,
      url: "https://rpc.gnosischain.com",
    },
    mainnet: {
      ...sharedNetworkConfig,
      chainType: "l1",
      url: infuraUrl("mainnet"),
    },
    sepolia: {
      ...sharedNetworkConfig,
      chainType: "l1",
      url: `https://ethereum-sepolia-rpc.publicnode.com`,
    },
    polygon: {
      ...sharedNetworkConfig,
      url: infuraUrl("polygon-mainnet"),
    },
    bsc: {
      ...sharedNetworkConfig,
      url: `https://bsc-dataseed.binance.org/`,
    },
    arbitrum: {
      ...sharedNetworkConfig,
      url: `https://arb1.arbitrum.io/rpc`,
    },
    fantomTestnet: {
      ...sharedNetworkConfig,
      url: `https://rpc.testnet.fantom.network/`,
    },
    avalanche: {
      ...sharedNetworkConfig,
      url: `https://api.avax.network/ext/bc/C/rpc`,
    },
    custom: {
      ...sharedNetworkConfig,
      url: configVariable("NODE_URL"),
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
