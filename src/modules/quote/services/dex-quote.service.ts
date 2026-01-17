import { Injectable, Logger } from '@nestjs/common';
import { PublicClient, formatUnits, encodePacked, concat } from 'viem';
import {
  DEX_CONTRACTS,
  DEX_INFO,
  UNISWAP_V3_QUOTER_V2_ABI,
  UNISWAP_V2_ROUTER_ABI,
  V3_FEE_TIERS,
  TOKEN_ADDRESSES,
} from '../../../constants';

export interface DexQuoteResult {
  dexId: string;
  dexName: string;
  amountOut: bigint;
  amountOutFormatted: string;
  estimatedGas: number;
  feeTier?: number;
  feeTiers?: number[]; // For multi-hop routes
  path?: string[];
  pathEncoded?: string; // Encoded path for multi-hop V3 swaps
  isMultiHop?: boolean;
  priceImpact: number;
}

// Bridge tokens for multi-hop routing (most liquid tokens on each chain)
const BRIDGE_TOKENS: Record<number, string[]> = {
  1: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'], // Ethereum
  56: ['WBNB', 'USDC', 'USDT', 'BUSD'], // BSC
  42161: ['WETH', 'USDC', 'USDT', 'DAI'], // Arbitrum
  137: ['WMATIC', 'WETH', 'USDC', 'USDT'], // Polygon
  11155111: ['WETH', 'USDC'], // Sepolia - limited liquidity
};

/**
 * DexQuoteService
 * Fetches quotes from all available DEX protocols
 */
@Injectable()
export class DexQuoteService {
  private readonly logger = new Logger(DexQuoteService.name);

  /**
   * Fetch quotes from all DEXes on a chain
   */
  async fetchAllQuotes(
    chainId: number,
    provider: PublicClient,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    fromDecimals: number,
    toDecimals: number,
  ): Promise<DexQuoteResult[]> {
    const dexContracts = DEX_CONTRACTS[chainId];
    if (!dexContracts) {
      this.logger.warn(`No DEX contracts for chain ${chainId}`);
      return [];
    }

    const quotePromises: Promise<DexQuoteResult | null>[] = [];

    // Fetch quotes from all DEXes in parallel
    for (const [dexId, contracts] of Object.entries(dexContracts)) {
      quotePromises.push(
        this.getQuoteForDex(
          dexId,
          chainId,
          provider,
          contracts,
          tokenIn,
          tokenOut,
          amountIn,
          toDecimals,
        ),
      );
    }

    const results = await Promise.all(quotePromises);
    return results.filter((r) => r !== null) as DexQuoteResult[];
  }

  /**
   * Get quote from a specific DEX
   */
  private async getQuoteForDex(
    dexId: string,
    chainId: number,
    provider: PublicClient,
    contracts: { router: string; quoter?: string; factory?: string },
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<DexQuoteResult | null> {
    try {
      const dexInfo = DEX_INFO[dexId];
      if (!dexInfo) return null;

      // Route to appropriate quote method based on DEX type
      switch (dexInfo.type) {
        case 'amm_v3':
          return await this.getUniswapV3Quote(
            dexId,
            chainId,
            provider,
            contracts.quoter!,
            tokenIn,
            tokenOut,
            amountIn,
            toDecimals,
          );

        case 'amm_v2':
          return await this.getUniswapV2Quote(
            dexId,
            chainId,
            provider,
            contracts.router,
            tokenIn,
            tokenOut,
            amountIn,
            toDecimals,
          );

        case 'curve':
        case 'balancer':
          // TODO: Implement Curve/Balancer quotes
          return null;

        default:
          return null;
      }
    } catch (error) {
      this.logger.debug(`Failed to get quote from ${dexId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get quote from Uniswap V3 style DEX (supports single-hop and multi-hop)
   */
  private async getUniswapV3Quote(
    dexId: string,
    chainId: number,
    provider: PublicClient,
    quoterAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<DexQuoteResult | null> {
    try {
      // Try single-hop first
      const singleHopResult = await this.getV3SingleHopQuote(
        dexId,
        provider,
        quoterAddress,
        tokenIn,
        tokenOut,
        amountIn,
        toDecimals,
      );

      // Try multi-hop routes through bridge tokens
      const multiHopResult = await this.getV3MultiHopQuote(
        dexId,
        chainId,
        provider,
        quoterAddress,
        tokenIn,
        tokenOut,
        amountIn,
        toDecimals,
      );

      // Log results for debugging
      this.logger.log(
        `[V3] Quote results - Single-hop: ${singleHopResult ? formatUnits(singleHopResult.amountOut, toDecimals) : 'N/A'}, ` +
        `Multi-hop: ${multiHopResult ? formatUnits(multiHopResult.amountOut, toDecimals) : 'N/A'}`
      );

      // Return the best result
      if (!singleHopResult && !multiHopResult) {
        return null;
      }

      if (!singleHopResult) return multiHopResult;
      if (!multiHopResult) return singleHopResult;

      // Compare and return better quote
      if (multiHopResult.amountOut > singleHopResult.amountOut) {
        this.logger.log(
          `[V3] Multi-hop route is better: ${formatUnits(multiHopResult.amountOut, toDecimals)} vs ${formatUnits(singleHopResult.amountOut, toDecimals)}`
        );
        return multiHopResult;
      }

      return singleHopResult;
    } catch {
      return null;
    }
  }

  /**
   * Get single-hop V3 quote
   */
  private async getV3SingleHopQuote(
    dexId: string,
    provider: PublicClient,
    quoterAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<DexQuoteResult | null> {
    try {
      let bestAmountOut = 0n;
      let bestFee = V3_FEE_TIERS[1]; // Default 0.3%

      // Try all fee tiers
      for (const fee of V3_FEE_TIERS) {
        try {
          const result = await provider.readContract({
            address: quoterAddress as `0x${string}`,
            abi: UNISWAP_V3_QUOTER_V2_ABI,
            functionName: 'quoteExactInputSingle',
            args: [
              {
                tokenIn: tokenIn as `0x${string}`,
                tokenOut: tokenOut as `0x${string}`,
                amountIn,
                fee,
                sqrtPriceLimitX96: 0n,
              },
            ],
          });

          const amountOut = (result as [bigint])[0];
          if (amountOut > bestAmountOut) {
            bestAmountOut = amountOut;
            bestFee = fee;
          }
        } catch {
          continue;
        }
      }

      if (bestAmountOut === 0n) return null;

      return {
        dexId,
        dexName: DEX_INFO[dexId].name,
        amountOut: bestAmountOut,
        amountOutFormatted: formatUnits(bestAmountOut, toDecimals),
        estimatedGas: 150000, // Typical V3 single-hop gas
        feeTier: bestFee,
        isMultiHop: false,
        path: [tokenIn, tokenOut],
        priceImpact: 0.5,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get multi-hop V3 quote through bridge tokens
   */
  private async getV3MultiHopQuote(
    dexId: string,
    chainId: number,
    provider: PublicClient,
    quoterAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<DexQuoteResult | null> {
    try {
      const bridgeTokenSymbols = BRIDGE_TOKENS[chainId] || [];
      const chainTokens = TOKEN_ADDRESSES[chainId] || {};

      this.logger.log(`[V3] Trying multi-hop routes through bridge tokens: ${bridgeTokenSymbols.join(', ')}`);

      let bestResult: DexQuoteResult | null = null;

      // Try each bridge token
      for (const bridgeSymbol of bridgeTokenSymbols) {
        const bridgeAddress = chainTokens[bridgeSymbol];
        if (!bridgeAddress) continue;

        // Skip if bridge token is same as input or output
        if (
          bridgeAddress.toLowerCase() === tokenIn.toLowerCase() ||
          bridgeAddress.toLowerCase() === tokenOut.toLowerCase()
        ) {
          this.logger.debug(`[V3] Skipping bridge ${bridgeSymbol} - same as input/output`);
          continue;
        }

        this.logger.log(`[V3] Trying bridge token: ${bridgeSymbol} (${bridgeAddress})`);

        // Try all fee tier combinations for 2-hop route
        for (const fee1 of V3_FEE_TIERS) {
          for (const fee2 of V3_FEE_TIERS) {
            try {
              // Encode the path: tokenIn -> bridgeToken -> tokenOut
              const path = this.encodeV3Path(
                [tokenIn, bridgeAddress, tokenOut],
                [fee1, fee2],
              );

              const result = await provider.readContract({
                address: quoterAddress as `0x${string}`,
                abi: UNISWAP_V3_QUOTER_V2_ABI,
                functionName: 'quoteExactInput',
                args: [path, amountIn],
              });

              const amountOut = (result as [bigint])[0];

              if (!bestResult || amountOut > bestResult.amountOut) {
                bestResult = {
                  dexId,
                  dexName: DEX_INFO[dexId].name,
                  amountOut,
                  amountOutFormatted: formatUnits(amountOut, toDecimals),
                  estimatedGas: 250000, // Typical V3 multi-hop gas
                  feeTiers: [fee1, fee2],
                  isMultiHop: true,
                  path: [tokenIn, bridgeAddress, tokenOut],
                  pathEncoded: path,
                  priceImpact: 0.8, // Higher for multi-hop
                };

                this.logger.debug(
                  `[V3] Found multi-hop route: ${tokenIn} -> ${bridgeSymbol} -> ${tokenOut} = ${formatUnits(amountOut, toDecimals)}`
                );
              }
            } catch (err: any) {
              // This combination doesn't work, try next
              this.logger.debug(`[V3] Multi-hop ${bridgeSymbol} failed with fees ${fee1}/${fee2}: ${err?.message?.slice(0, 100)}`);
              continue;
            }
          }
        }
      }

      if (!bestResult) {
        this.logger.warn(`[V3] No multi-hop route found for ${tokenIn} -> ${tokenOut}`);
      }

      return bestResult;
    } catch (error: any) {
      this.logger.warn(`[V3] Multi-hop quote failed: ${error?.message}`);
      return null;
    }
  }

  /**
   * Encode Uniswap V3 path for multi-hop swaps
   * Format: token0 (20 bytes) + fee (3 bytes) + token1 (20 bytes) + fee (3 bytes) + token2 (20 bytes)
   */
  private encodeV3Path(tokens: string[], fees: number[]): `0x${string}` {
    if (tokens.length !== fees.length + 1) {
      throw new Error('Invalid path: tokens length must be fees length + 1');
    }

    let encoded = tokens[0].toLowerCase() as `0x${string}`;

    for (let i = 0; i < fees.length; i++) {
      // Encode fee as 3 bytes (24 bits)
      const feeHex = fees[i].toString(16).padStart(6, '0');
      const nextToken = tokens[i + 1].toLowerCase().slice(2); // Remove 0x prefix
      encoded = `${encoded}${feeHex}${nextToken}` as `0x${string}`;
    }

    return encoded;
  }

  /**
   * Get quote from Uniswap V2 style DEX (supports single-hop and multi-hop)
   */
  private async getUniswapV2Quote(
    dexId: string,
    chainId: number,
    provider: PublicClient,
    routerAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<DexQuoteResult | null> {
    try {
      // Try single-hop first
      const singleHopResult = await this.getV2SingleHopQuote(
        dexId,
        provider,
        routerAddress,
        tokenIn,
        tokenOut,
        amountIn,
        toDecimals,
      );

      // Try multi-hop routes
      const multiHopResult = await this.getV2MultiHopQuote(
        dexId,
        chainId,
        provider,
        routerAddress,
        tokenIn,
        tokenOut,
        amountIn,
        toDecimals,
      );

      // Return best result
      if (!singleHopResult && !multiHopResult) return null;
      if (!singleHopResult) return multiHopResult;
      if (!multiHopResult) return singleHopResult;

      if (multiHopResult.amountOut > singleHopResult.amountOut) {
        this.logger.log(
          `[V2] Multi-hop route is better: ${formatUnits(multiHopResult.amountOut, toDecimals)} vs ${formatUnits(singleHopResult.amountOut, toDecimals)}`
        );
        return multiHopResult;
      }

      return singleHopResult;
    } catch {
      return null;
    }
  }

  /**
   * Get single-hop V2 quote
   */
  private async getV2SingleHopQuote(
    dexId: string,
    provider: PublicClient,
    routerAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<DexQuoteResult | null> {
    try {
      const path = [tokenIn, tokenOut] as `0x${string}`[];

      const amounts = (await provider.readContract({
        address: routerAddress as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path],
      })) as bigint[];

      const amountOut = amounts[amounts.length - 1];

      return {
        dexId,
        dexName: DEX_INFO[dexId].name,
        amountOut,
        amountOutFormatted: formatUnits(amountOut, toDecimals),
        estimatedGas: 120000, // Typical V2 single-hop gas
        path: path.map((p) => p.toString()),
        isMultiHop: false,
        priceImpact: 0.3,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get multi-hop V2 quote through bridge tokens
   */
  private async getV2MultiHopQuote(
    dexId: string,
    chainId: number,
    provider: PublicClient,
    routerAddress: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<DexQuoteResult | null> {
    try {
      const bridgeTokenSymbols = BRIDGE_TOKENS[chainId] || [];
      const chainTokens = TOKEN_ADDRESSES[chainId] || {};

      let bestResult: DexQuoteResult | null = null;

      for (const bridgeSymbol of bridgeTokenSymbols) {
        const bridgeAddress = chainTokens[bridgeSymbol];
        if (!bridgeAddress) continue;

        if (
          bridgeAddress.toLowerCase() === tokenIn.toLowerCase() ||
          bridgeAddress.toLowerCase() === tokenOut.toLowerCase()
        ) {
          continue;
        }

        try {
          const path = [tokenIn, bridgeAddress, tokenOut] as `0x${string}`[];

          const amounts = (await provider.readContract({
            address: routerAddress as `0x${string}`,
            abi: UNISWAP_V2_ROUTER_ABI,
            functionName: 'getAmountsOut',
            args: [amountIn, path],
          })) as bigint[];

          const amountOut = amounts[amounts.length - 1];

          if (!bestResult || amountOut > bestResult.amountOut) {
            bestResult = {
              dexId,
              dexName: DEX_INFO[dexId].name,
              amountOut,
              amountOutFormatted: formatUnits(amountOut, toDecimals),
              estimatedGas: 180000, // Typical V2 multi-hop gas
              path: path.map((p) => p.toString()),
              isMultiHop: true,
              priceImpact: 0.5,
            };

            this.logger.debug(
              `[V2] Found multi-hop route: ${tokenIn} -> ${bridgeSymbol} -> ${tokenOut} = ${formatUnits(amountOut, toDecimals)}`
            );
          }
        } catch {
          continue;
        }
      }

      return bestResult;
    } catch {
      return null;
    }
  }

}
