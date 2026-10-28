export const chains = {
  // mainnets
  ethereum: { chainId: 1, chainType: "l1" },
  optimism: { chainId: 10, chainType: "op" },
  bsc: { chainId: 56, chainType: "l1" },
  gnosis: { chainId: 100, chainType: "l1", node: "https://gnosis-rpc.publicnode.com" },
  polygon: { chainId: 137, chainType: "l1" },
  worldchain: { chainId: 480, chainType: "op" },
  hyperliquid: { chainId: 999, chainType: "l1" },
  base: { chainId: 8453, chainType: "op" },
  arbitrum: { chainId: 42161, chainType: "l1" },
  celo: { chainId: 42220, chainType: "l1" },
  avax: { chainId: 43114, chainType: "l1", node: "https://avalanche-c-chain-rpc.publicnode.com" },
  // testnets
  sepolia: { chainId: 11155111, chainType: "l1", node: "https://ethereum-sepolia-rpc.publicnode.com" },
  optimismSepolia: { chainId: 11155420, chainType: "op" },
  baseSepolia: { chainId: 84532, chainType: "op" },
  polygonAmoy: { chainId: 80002, chainType: "l1" },
  arbitrumSepolia: { chainId: 421614, chainType: "l1" },
  somniaTestnet: { chainId: 50312, chainType: "l1", node: "https://api.infra.testnet.somnia.network" },
} as const;
