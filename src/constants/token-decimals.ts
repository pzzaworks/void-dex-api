// Token decimals for all supported tokens (mainnet defaults)
export const TOKEN_DECIMALS: Record<string, number> = {
  // Common tokens
  ETH: 18,
  WETH: 18,
  USDC: 6,
  'USDC.e': 6,
  USDT: 6,
  DAI: 18,
  WBTC: 8,
  LINK: 18,
  UNI: 18,
  AAVE: 18,
  MKR: 18,
  SNX: 18,
  CRV: 18,
  COMP: 18,
  LDO: 18,
  APE: 18,
  SHIB: 18,
  PEPE: 18,
  stETH: 18,
  rETH: 18,
  FRAX: 18,
  // BSC
  BNB: 18,
  WBNB: 18,
  BUSD: 18,
  CAKE: 18,
  BTCB: 18,
  XRP: 18,
  ADA: 18,
  DOGE: 8,
  // Polygon
  MATIC: 18,
  WMATIC: 18,
  QUICK: 18,
  // Arbitrum
  ARB: 18,
  GMX: 18,
  MAGIC: 18,
  PENDLE: 18,
  // Optimism
  OP: 18,
  VELO: 18,
  // Base
  USDbC: 6,
  cbETH: 18,
  AERO: 18,
  BRETT: 18,
  DEGEN: 18,
  // Avalanche
  AVAX: 18,
  WAVAX: 18,
  'USDT.e': 6,
  JOE: 18,
  // Fantom
  FTM: 18,
  WFTM: 18,
  fUSDT: 6,
  BOO: 18,
  // zkSync
  ZK: 18,
  // Mantle
  MNT: 18,
  WMNT: 18,
  // Gnosis
  xDAI: 18,
  WXDAI: 18,
  GNO: 18,
  // Celo
  CELO: 18,
  cUSD: 18,
  cEUR: 18,
  // Moonbeam
  GLMR: 18,
  WGLMR: 18,
  // Cronos
  CRO: 18,
  WCRO: 18,
  // Blast
  USDB: 18,
  BLAST: 18,
  // Mode
  MODE: 18,
};

/**
 * Get token decimals
 * @param symbol Token symbol
 */
export function getTokenDecimals(symbol: string): number {
  return TOKEN_DECIMALS[symbol] ?? 18;
}
