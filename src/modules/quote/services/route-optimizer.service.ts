import { Injectable, Logger } from '@nestjs/common';
import { formatUnits, encodeAbiParameters } from 'viem';

export interface DexQuote {
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
  // Liquidity depth indicator (higher = deeper liquidity)
  liquidityScore?: number;
}

export interface RouteStep {
  dexId: string;
  dexName: string;
  percentage: number; // Can be 3.97, 14.86, etc.
  fromToken: string; // Token symbol for this step's input
  toToken: string; // Token symbol for this step's output
  fromAmount: string;
  toAmount: string;
  estimatedGas: number;
  feeTier?: number; // V3 fee tier (500, 3000, 10000) for single-hop
  feeTiers?: number[]; // V3 fee tiers for multi-hop
  isMultiHop?: boolean;
  path?: string[]; // Token path for the route
  dexData?: string; // Encoded DEX-specific data for the swap
}

export interface OptimalRoute {
  steps: RouteStep[];
  totalOutput: string;
  totalGas: number;
  avgPriceImpact: number;
  isSplit: boolean;
}

@Injectable()
export class RouteOptimizerService {
  private readonly logger = new Logger(RouteOptimizerService.name);

  private readonly MIN_SPLIT_PERCENTAGE = 1; // Minimum 1% per DEX
  private readonly MAX_SPLITS = 3; // Max 3 DEXes (we only have 3 per chain now)

  /**
   * Find optimal route with dynamic split percentages based on liquidity
   */
  findOptimalRoute(
    quotes: DexQuote[],
    amountIn: bigint,
    fromDecimals: number,
    toDecimals: number,
    fromToken?: string,
    toToken?: string,
  ): OptimalRoute {
    if (quotes.length === 0) {
      throw new Error('No DEX quotes available');
    }

    // Sort by output amount (best first)
    const sortedQuotes = [...quotes].sort((a, b) =>
      b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0,
    );

    // If only one quote or very small amount, use single DEX
    const amountInNum = Number(formatUnits(amountIn, fromDecimals));
    if (sortedQuotes.length === 1 || amountInNum < 100) {
      return this.createSingleRoute(sortedQuotes[0], amountIn, fromDecimals, toDecimals, fromToken, toToken);
    }

    // Calculate dynamic split based on output ratios
    const dynamicSplit = this.calculateDynamicSplit(sortedQuotes, amountIn, fromDecimals);

    // Compare single vs split
    const singleRoute = this.createSingleRoute(sortedQuotes[0], amountIn, fromDecimals, toDecimals, fromToken, toToken);
    const splitRoute = this.createSplitRoute(dynamicSplit, amountIn, fromDecimals, toDecimals, fromToken, toToken);

    // Choose better output (accounting for extra gas in split)
    const singleOutput = parseFloat(singleRoute.totalOutput);
    const splitOutput = parseFloat(splitRoute.totalOutput);

    // Split needs to be at least 0.1% better to justify extra gas
    const splitThreshold = 1.001;
    if (splitOutput > singleOutput * splitThreshold) {
      return splitRoute;
    }

    return singleRoute;
  }

  /**
   * Calculate dynamic split percentages based on quote outputs
   * Uses output ratios to determine optimal allocation
   */
  private calculateDynamicSplit(
    quotes: DexQuote[],
    amountIn: bigint,
    fromDecimals: number,
  ): Array<{ quote: DexQuote; percentage: number }> {
    const topQuotes = quotes.slice(0, this.MAX_SPLITS);

    // Calculate total output if we used each DEX for full amount
    const outputs = topQuotes.map((q) => Number(q.amountOut));
    const totalPotentialOutput = outputs.reduce((sum, o) => sum + o, 0);

    // Calculate raw percentages based on output quality
    // Better output = higher percentage allocation
    const rawPercentages = outputs.map((output) => (output / totalPotentialOutput) * 100);

    // Normalize to 100% and apply minimum threshold
    let percentages = this.normalizePercentages(rawPercentages);

    // Filter out DEXes below minimum threshold and pair with quotes
    const validSplits: Array<{ quote: DexQuote; percentage: number }> = [];
    for (let i = 0; i < topQuotes.length; i++) {
      if (percentages[i] >= this.MIN_SPLIT_PERCENTAGE) {
        validSplits.push({ quote: topQuotes[i], percentage: percentages[i] });
      }
    }

    // If only one valid DEX remains, give it 100%
    if (validSplits.length === 1) {
      validSplits[0].percentage = 100;
      return validSplits;
    }

    // Renormalize percentages to sum to 100%
    const totalPercentage = validSplits.reduce((sum, s) => sum + s.percentage, 0);
    validSplits.forEach((s) => {
      s.percentage = (s.percentage / totalPercentage) * 100;
    });

    // Round to 2 decimal places (e.g., 42.37%)
    validSplits.forEach((s) => {
      s.percentage = Math.round(s.percentage * 100) / 100;
    });

    // Ensure they sum to exactly 100
    const sum = validSplits.reduce((a, b) => a + b.percentage, 0);
    if (sum !== 100 && validSplits.length > 0) {
      validSplits[0].percentage += 100 - sum;
      validSplits[0].percentage = Math.round(validSplits[0].percentage * 100) / 100;
    }

    return validSplits;
  }

  private normalizePercentages(raw: number[]): number[] {
    const total = raw.reduce((sum, p) => sum + p, 0);
    return raw.map((p) => (p / total) * 100);
  }

  private createSingleRoute(
    quote: DexQuote,
    amountIn: bigint,
    fromDecimals: number,
    toDecimals: number,
    fromToken?: string,
    toToken?: string,
  ): OptimalRoute {
    // Generate dexData for the swap
    let dexData: string | undefined;

    if (quote.isMultiHop && quote.pathEncoded) {
      // Multi-hop: use encoded path
      dexData = this.encodeV3MultiHopDexData(quote.pathEncoded);
      this.logger.log(`[RouteOptimizer] Using multi-hop route with path: ${quote.path?.join(' -> ')}`);
    } else if (quote.feeTier) {
      // Single-hop: use fee tier
      dexData = this.encodeV3DexData(quote.feeTier);
    }

    return {
      steps: [
        {
          dexId: quote.dexId,
          dexName: quote.dexName,
          percentage: 100,
          fromToken: fromToken || 'UNKNOWN',
          toToken: toToken || 'UNKNOWN',
          fromAmount: formatUnits(amountIn, fromDecimals),
          toAmount: formatUnits(quote.amountOut, toDecimals),
          estimatedGas: quote.estimatedGas,
          feeTier: quote.feeTier,
          feeTiers: quote.feeTiers,
          isMultiHop: quote.isMultiHop,
          path: quote.path,
          dexData,
        },
      ],
      totalOutput: formatUnits(quote.amountOut, toDecimals),
      totalGas: quote.estimatedGas,
      avgPriceImpact: quote.priceImpact,
      isSplit: false,
    };
  }

  private createSplitRoute(
    splits: Array<{ quote: DexQuote; percentage: number }>,
    amountIn: bigint,
    fromDecimals: number,
    toDecimals: number,
    fromToken?: string,
    toToken?: string,
  ): OptimalRoute {
    const steps: RouteStep[] = [];
    let totalOutput = 0n;
    let totalGas = 0;
    let weightedPriceImpact = 0;

    for (const { quote, percentage } of splits) {
      // Calculate split amounts
      const splitAmountIn = (amountIn * BigInt(Math.round(percentage * 100))) / 10000n;
      const splitAmountOut = (quote.amountOut * BigInt(Math.round(percentage * 100))) / 10000n;

      // Generate dexData for the swap (V3 format: isMultiHop, encodedFee)
      const dexData = quote.feeTier
        ? this.encodeV3DexData(quote.feeTier)
        : undefined;

      steps.push({
        dexId: quote.dexId,
        dexName: quote.dexName,
        percentage,
        fromToken: fromToken || 'UNKNOWN',
        toToken: toToken || 'UNKNOWN',
        fromAmount: formatUnits(splitAmountIn, fromDecimals),
        toAmount: formatUnits(splitAmountOut, toDecimals),
        estimatedGas: quote.estimatedGas,
        feeTier: quote.feeTier,
        dexData,
      });

      totalOutput += splitAmountOut;
      totalGas += quote.estimatedGas;
      weightedPriceImpact += quote.priceImpact * (percentage / 100);
    }

    return {
      steps,
      totalOutput: formatUnits(totalOutput, toDecimals),
      totalGas,
      avgPriceImpact: weightedPriceImpact,
      isSplit: true,
    };
  }

  /**
   * Estimate price impact based on trade size
   */
  estimatePriceImpact(amountUsd: number): number {
    if (amountUsd < 1000) return 0.1;
    if (amountUsd < 10000) return 0.2 + (amountUsd - 1000) * 0.00001;
    if (amountUsd < 100000) return 0.3 + (amountUsd - 10000) * 0.000005;
    if (amountUsd < 1000000) return 0.8 + (amountUsd - 100000) * 0.000002;
    return 3; // Cap at 3%
  }

  /**
   * Encode dexData for UniswapV3Adapter (single-hop)
   * Format: abi.encode(bool isMultiHop, bytes swapData)
   * For single hop: swapData = abi.encode(uint24 fee)
   */
  private encodeV3DexData(feeTier: number): string {
    // Encode the fee tier as bytes
    const feeEncoded = encodeAbiParameters(
      [{ type: 'uint24' }],
      [feeTier],
    );

    // Encode the full dexData: (isMultiHop=false, feeEncoded)
    const dexData = encodeAbiParameters(
      [{ type: 'bool' }, { type: 'bytes' }],
      [false, feeEncoded],
    );

    return dexData;
  }

  /**
   * Encode dexData for UniswapV3Adapter (multi-hop)
   * Format: abi.encode(bool isMultiHop, bytes swapData)
   * For multi-hop: swapData = encoded path (token + fee + token + fee + token)
   */
  private encodeV3MultiHopDexData(pathEncoded: string): string {
    // Encode the full dexData: (isMultiHop=true, pathEncoded)
    const dexData = encodeAbiParameters(
      [{ type: 'bool' }, { type: 'bytes' }],
      [true, pathEncoded as `0x${string}`],
    );

    return dexData;
  }
}
