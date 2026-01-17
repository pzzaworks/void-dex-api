// DEX protocols with display names
export const DEX_INFO: Record<
  string,
  { name: string; type: 'amm_v2' | 'amm_v3' | 'curve' | 'balancer' }
> = {
  // V3 DEXes
  uniswap_v3: { name: 'Uniswap V3', type: 'amm_v3' },
  pancakeswap_v3: { name: 'PancakeSwap V3', type: 'amm_v3' },
  sushiswap_v3: { name: 'SushiSwap V3', type: 'amm_v3' },
  quickswap_v3: { name: 'QuickSwap V3', type: 'amm_v3' },

  // V2 DEXes
  uniswap_v2: { name: 'Uniswap V2', type: 'amm_v2' },
  sushiswap: { name: 'SushiSwap', type: 'amm_v2' },
  pancakeswap_v2: { name: 'PancakeSwap V2', type: 'amm_v2' },
  quickswap: { name: 'QuickSwap', type: 'amm_v2' },
  camelot: { name: 'Camelot', type: 'amm_v2' },
  traderjoe: { name: 'Trader Joe', type: 'amm_v2' },
  biswap: { name: 'Biswap', type: 'amm_v2' },
  apeswap: { name: 'ApeSwap', type: 'amm_v2' },
  spookyswap: { name: 'SpookySwap', type: 'amm_v2' },
  pangolin: { name: 'Pangolin', type: 'amm_v2' },

  // Other protocols (TODO: implement)
  curve: { name: 'Curve', type: 'curve' },
  balancer: { name: 'Balancer', type: 'balancer' },
};

// DEX Router/Quoter addresses per chain (Top 4-5 DEXes per chain by TVL)
export const DEX_CONTRACTS: Record<
  number,
  Record<string, { router: string; quoter?: string; factory?: string }>
> = {
  // ============ Ethereum Mainnet (1) ============
  1: {
    uniswap_v3: {
      quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // QuoterV2
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    },
    uniswap_v2: {
      router: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
      factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    },
    sushiswap: {
      router: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F',
      factory: '0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac',
    },
    sushiswap_v3: {
      quoter: '0x64e8802FE490fa7cc61d3463958199161Bb608A7',
      router: '0x2E6cd2d30aa43f40aa81619ff4b6E0a41479B13F',
      factory: '0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4F',
    },
    // curve: { router: '0x99a58482BD75cbab83b27EC03CA68fF489b5788f' }, // TODO
    // balancer: { router: '0xBA12222222228d8Ba445958a75a0704d566BF2C8' }, // TODO
  },

  // ============ Arbitrum One (42161) ============
  42161: {
    uniswap_v3: {
      quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // QuoterV2
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    },
    sushiswap: {
      router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    },
    sushiswap_v3: {
      quoter: '0x0524E833cCD057e4d7A296e3aaAb9f7675964Ce1',
      router: '0x8A21F6768C1f8075791D08546Dadf6daA0bE820c',
      factory: '0x1af415a1EbA07a4986a52B6f2e7dE7003D82231e',
    },
    camelot: {
      router: '0xc873fEcbd354f5A56E00E710B90EF4201db2448d',
      factory: '0x6EcCab422D763aC031210895C81787E87B43A652',
    },
    traderjoe: {
      router: '0xbeE5c10Cf6E4F68f831E11C1D9E59B43560B3571', // LB Router
      factory: '0x8e42f2F4101563bF679975178e880FD87d3eFd4e',
    },
  },

  // ============ Polygon (137) ============
  137: {
    uniswap_v3: {
      quoter: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e', // QuoterV2
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    },
    quickswap: {
      router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
      factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
    },
    quickswap_v3: {
      quoter: '0xa15F0D7377B2A0C0c10db057f641beD21028FC89',
      router: '0xf5b509bB0909a69B1c207E495f687a596C168E12',
      factory: '0x411b0fAcC3489691f28ad58c47006AF5E3Ab3A28',
    },
    sushiswap: {
      router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    },
    apeswap: {
      router: '0xC0788A3aD43d79aa53B09c2EaCc313A787d1d607',
      factory: '0xCf083Be4164828f00cAE704EC15a36D711491284',
    },
  },

  // ============ BSC (56) ============
  56: {
    pancakeswap_v3: {
      quoter: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    },
    pancakeswap_v2: {
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
      factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
    },
    sushiswap: {
      router: '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      factory: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
    },
    biswap: {
      router: '0x3a6d8cA21D1CF76F653A67577FA0D27453350dD8',
      factory: '0x858E3312ed3A876947EA49d572A7C42DE08af7EE',
    },
    apeswap: {
      router: '0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7',
      factory: '0x0841BD0B734E4F5853f0dD8d7Ea041c241fb0Da6',
    },
  },

  // ============ Sepolia Testnet (11155111) ============
  11155111: {
    uniswap_v3: {
      quoter: '0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3',
      router: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
      factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    },
  },
};

// Fee tiers for Uniswap V3 / PancakeSwap V3
export const V3_FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

// VoidDex Router addresses per chain
export const VOIDDEX_ROUTER: Record<number, { router: string; adapter: string }> = {
  11155111: {
    // Sepolia Testnet - Deployed 2026-01-02 with forceApprove fix in Router + Adapter
    router: '0x5A175fFF5B27a1f98b29c6EbB0f1Aac0181fF456',
    adapter: '0x46d768aA13A86d746611676035287a0E1a0e15e8',
  },
};
