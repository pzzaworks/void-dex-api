import { Injectable, Logger } from '@nestjs/common';
import { PublicClient, formatUnits } from 'viem';
import { DiscoveredRoute, RouteHop } from './pathfinder.service';
import { DEX_INFO, UNISWAP_V3_QUOTER_V2_ABI, UNISWAP_V2_ROUTER_ABI, DEX_CONTRACTS } from '../../../constants';

/**
 * Quote result for a discovered route
 */
export interface RouteQuote {
  route: DiscoveredRoute;
  amountIn: bigint;
  amountOut: bigint;
  amountOutFormatted: string;
  priceImpact: number;
  estimatedGas: number;
  // Encoded data for each hop
  hopsData: HopQuoteData[];
}

export interface HopQuoteData {
  poolAddress: string;
  dexId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  fee?: number;
  // Encoded swap data for this hop
  encodedData?: string;
}

@Injectable()
export class RouteQuoteService {
  private readonly logger = new Logger(RouteQuoteService.name);

  /**
   * Get quotes for all discovered routes
   */
  async getQuotesForRoutes(
    chainId: number,
    provider: PublicClient,
    routes: DiscoveredRoute[],
    amountIn: bigint,
    toDecimals: number,
  ): Promise<RouteQuote[]> {
    const quotePromises = routes.map((route) =>
      this.getQuoteForRoute(chainId, provider, route, amountIn, toDecimals)
    );

    const results = await Promise.all(quotePromises);

    // Filter out failed quotes and sort by output (best first)
    const validQuotes = results
      .filter((q): q is RouteQuote => q !== null)
      .sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));

    this.logger.log(
      `[RouteQuote] Got ${validQuotes.length}/${routes.length} valid quotes`
    );

    return validQuotes;
  }

  /**
   * Get quote for a single route by simulating each hop
   */
  private async getQuoteForRoute(
    chainId: number,
    provider: PublicClient,
    route: DiscoveredRoute,
    amountIn: bigint,
    toDecimals: number,
  ): Promise<RouteQuote | null> {
    try {
      const hopsData: HopQuoteData[] = [];
      let currentAmount = amountIn;

      // Simulate each hop
      for (const hop of route.hops) {
        const hopQuote = await this.getHopQuote(
          chainId,
          provider,
          hop,
          currentAmount,
        );

        if (!hopQuote) {
          this.logger.debug(
            `[RouteQuote] Hop failed: ${hop.tokenIn.slice(0, 8)} -> ${hop.tokenOut.slice(0, 8)}`
          );
          return null;
        }

        hopsData.push(hopQuote);
        currentAmount = hopQuote.amountOut;
      }

      const amountOut = currentAmount;
      const amountOutFormatted = formatUnits(amountOut, toDecimals);

      // Estimate price impact (simplified)
      const priceImpact = this.estimatePriceImpact(route.totalHops, amountIn);

      return {
        route,
        amountIn,
        amountOut,
        amountOutFormatted,
        priceImpact,
        estimatedGas: route.estimatedGas,
        hopsData,
      };
    } catch (error: any) {
      this.logger.debug(
        `[RouteQuote] Route quote failed: ${error?.message?.slice(0, 100)}`
      );
      return null;
    }
  }

  /**
   * Get quote for a single hop
   */
  private async getHopQuote(
    chainId: number,
    provider: PublicClient,
    hop: RouteHop,
    amountIn: bigint,
  ): Promise<HopQuoteData | null> {
    const dexInfo = DEX_INFO[hop.dexId];
    if (!dexInfo) return null;

    const dexContracts = DEX_CONTRACTS[chainId]?.[hop.dexId];
    if (!dexContracts) return null;

    try {
      if (dexInfo.type === 'amm_v3') {
        return await this.getV3HopQuote(
          provider,
          dexContracts.quoter!,
          hop,
          amountIn,
        );
      } else if (dexInfo.type === 'amm_v2') {
        return await this.getV2HopQuote(
          provider,
          dexContracts.router,
          hop,
          amountIn,
        );
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get V3 hop quote
   */
  private async getV3HopQuote(
    provider: PublicClient,
    quoterAddress: string,
    hop: RouteHop,
    amountIn: bigint,
  ): Promise<HopQuoteData | null> {
    // Get fee from the edge (pool)
    const fee = hop.edge.pool.fee || 3000;

    try {
      const result = await provider.readContract({
        address: quoterAddress as `0x${string}`,
        abi: UNISWAP_V3_QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            tokenIn: hop.tokenIn as `0x${string}`,
            tokenOut: hop.tokenOut as `0x${string}`,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });

      const amountOut = (result as [bigint])[0];

      return {
        poolAddress: hop.poolAddress,
        dexId: hop.dexId,
        tokenIn: hop.tokenIn,
        tokenOut: hop.tokenOut,
        amountIn,
        amountOut,
        fee,
      };
    } catch {
      return null;
    }
  }

  /**
   * Get V2 hop quote
   */
  private async getV2HopQuote(
    provider: PublicClient,
    routerAddress: string,
    hop: RouteHop,
    amountIn: bigint,
  ): Promise<HopQuoteData | null> {
    try {
      const path = [hop.tokenIn, hop.tokenOut] as `0x${string}`[];

      const amounts = (await provider.readContract({
        address: routerAddress as `0x${string}`,
        abi: UNISWAP_V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, path],
      })) as bigint[];

      const amountOut = amounts[amounts.length - 1];

      return {
        poolAddress: hop.poolAddress,
        dexId: hop.dexId,
        tokenIn: hop.tokenIn,
        tokenOut: hop.tokenOut,
        amountIn,
        amountOut,
      };
    } catch {
      return null;
    }
  }

  /**
   * Estimate price impact based on hops and amount
   */
  private estimatePriceImpact(hops: number, amountIn: bigint): number {
    // Base impact per hop
    const baseImpact = 0.3;
    // Additional impact for larger amounts (simplified)
    const amountFactor = Number(amountIn) / 1e18;
    const amountImpact = Math.min(amountFactor * 0.001, 1);

    return baseImpact * hops + amountImpact;
  }

  /**
   * Find best quote from all routes
   */
  getBestQuote(quotes: RouteQuote[]): RouteQuote | null {
    if (quotes.length === 0) return null;

    // Already sorted by amountOut (descending)
    return quotes[0];
  }

  /**
   * Get top N quotes considering gas costs
   */
  getTopQuotes(
    quotes: RouteQuote[],
    count: number = 5,
    ethPrice: number = 3000,
    gasPrice: bigint = 30_000_000_000n, // 30 gwei
  ): RouteQuote[] {
    // Calculate net output (output - gas cost in token terms)
    const withNetOutput = quotes.map((q) => {
      const gasCostWei = gasPrice * BigInt(q.estimatedGas);
      const gasCostEth = Number(gasCostWei) / 1e18;
      const gasCostUsd = gasCostEth * ethPrice;

      return {
        quote: q,
        gasCostUsd,
      };
    });

    // Sort by output (we'd need token price to properly compare, for now just use raw output)
    withNetOutput.sort((a, b) =>
      b.quote.amountOut > a.quote.amountOut ? 1 : -1
    );

    return withNetOutput.slice(0, count).map((w) => w.quote);
  }
}
