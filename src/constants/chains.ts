import { Chain, mainnet, bsc, arbitrum, polygon, sepolia } from 'viem/chains';

// Chain configurations for viem - Railgun-supported networks only
export const CHAIN_CONFIG: Record<number, Chain> = {
  1: mainnet, // Ethereum
  56: bsc, // BSC
  42161: arbitrum, // Arbitrum
  137: polygon, // Polygon
  11155111: sepolia, // Sepolia (testnet)
};

export const PUBLIC_RPCS: Record<number, string[]> = {
  1: [
    'https://eth.llamarpc.com',
    'https://ethereum.publicnode.com',
    'https://1rpc.io/eth',
  ],
  137: [
    'https://polygon-bor-rpc.publicnode.com',
    'https://1rpc.io/matic',
  ],
  42161: [
    'https://arbitrum-one.publicnode.com',
  ],
  56: [
    'https://bsc-dataseed.binance.org',
    'https://bsc-rpc.publicnode.com',
    'https://bsc-dataseed1.defibit.io',
  ],
  // NOTE: 1rpc.io has SSL issues from some VPS providers
  // publicnode.com works reliably from VPS
  11155111: [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://rpc.sepolia.org',
    'https://rpc2.sepolia.org',
  ],
};

export const getRpcUrl = (chainId: number): string => {
  return PUBLIC_RPCS[chainId]?.[0] || '';
};

export const getAllRpcUrls = (chainId: number): string[] => {
  return PUBLIC_RPCS[chainId] || [];
};

// Chainlink price feed addresses (ETH/USD or BNB/USD)
export const CHAINLINK_PRICE_FEEDS: Record<number, string> = {
  1: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419', // ETH/USD on Ethereum
  56: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE', // BNB/USD on BSC
  42161: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', // ETH/USD on Arbitrum
  137: '0xF9680D99D6C9589e2a93a78A04A279e509205945', // ETH/USD on Polygon
  11155111: '0x694AA1769357215DE4FAC081bf1f309aDC325306', // ETH/USD on Sepolia
};

// Chainlink price feeds for individual tokens (token symbol -> chain -> feed address)
// All feeds return USD price with 8 decimals
export const TOKEN_PRICE_FEEDS: Record<string, Record<number, string>> = {
  LINK: {
    1: '0x2c1d072e956AFFC0D435Cb7AC38EF18d24d9127c', // LINK/USD Ethereum
    11155111: '0xc59E3633BAAC79493d908e63626716e204A45EdF', // LINK/USD Sepolia
    137: '0xd9FFdb71EbE7496cC440152d43986Aae0AB76665', // LINK/USD Polygon
    42161: '0x86E53CF1B870786351Da77A57575e79CB55812CB', // LINK/USD Arbitrum
  },
  BTC: {
    1: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c', // BTC/USD Ethereum
    11155111: '0x1b44F3514812d835EB1BDB0acB33d3fA3351Ee43', // BTC/USD Sepolia
    137: '0xc907E116054Ad103354f2D350FD2514433D57F6f', // BTC/USD Polygon
    42161: '0x6ce185860a4963106506C203335A2910B3C00608', // BTC/USD Arbitrum
  },
  USDC: {
    1: '0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6', // USDC/USD Ethereum
    137: '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7', // USDC/USD Polygon
    42161: '0x50834F3163758fcC1Df9973b6e91f0F0F0434aD3', // USDC/USD Arbitrum
  },
  DAI: {
    1: '0xAed0c38402a5d19df6E4c03F4E2DceD6e29c1ee9', // DAI/USD Ethereum
    137: '0x4746DeC9e833A82EC7C2C1356372CcF2cfcD2F3D', // DAI/USD Polygon
    42161: '0xc5C8E77B397E531B8EC06BFb0048328B30E9eCfB', // DAI/USD Arbitrum
  },
  UNI: {
    1: '0x553303d460EE0afB37EdFf9bE42922D8FF63220e', // UNI/USD Ethereum
    137: '0xdf0Fb4e4F928d2dCB76f438575fDD8682386e13C', // UNI/USD Polygon
  },
  AAVE: {
    1: '0x547a514d5e3769680Ce22B2361c10Ea13619e8a9', // AAVE/USD Ethereum
    137: '0x72484B12719E23115761D5DA1646945632979bB6', // AAVE/USD Polygon
  },
};
