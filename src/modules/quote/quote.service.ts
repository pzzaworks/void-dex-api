import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { createPublicClient, http, parseUnits, formatUnits, PublicClient } from 'viem';
import { TOKEN_ADDRESSES, getTokenDecimals, CHAIN_CONFIG, getRpcUrl } from '../../constants';
import { DexQuoteService, DexQuoteResult } from './services/dex-quote.service';
import { RouteOptimizerService, RouteStep } from './services/route-optimizer.service';
import { FeeCalculatorService, FeeBreakdown } from './services/fee-calculator.service';
import { PriceService } from './services/price.service';
import { PathfinderService } from './services/pathfinder.service';
import { RouteQuoteService, RouteQuote } from './services/route-quote.service';
import { PoolService } from '../pool/pool.service';

export interface QuoteParams {
  chainId: number;
  fromToken: string;
  toToken: string;
  fromTokenSymbol?: string;
  toTokenSymbol?: string;
  amount: string;
  slippage?: number;
  type?: 'exactInput' | 'exactOutput'; // exactInput = specify sell amount, exactOutput = specify buy amount
}

export interface QuoteResponse {
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  route: {
    steps: RouteStep[];
    totalSteps: number;
    isSplit: boolean;
  };
  fees: FeeBreakdown;
  meta: {
    priceImpact: string;
    exchangeRate: string;
    minReceived: string;
    expiresAt: number;
  };
}

@Injectable()
export class QuoteService {
  private readonly logger = new Logger(QuoteService.name);
  private providers = new Map<number, PublicClient>();

  constructor(
    private readonly dexQuoteService: DexQuoteService,
    private readonly routeOptimizer: RouteOptimizerService,
    private readonly feeCalculator: FeeCalculatorService,
    private readonly priceService: PriceService,
    private readonly pathfinderService: PathfinderService,
    private readonly routeQuoteService: RouteQuoteService,
  ) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const chains = [1, 56, 42161, 137, 11155111];

    for (const chainId of chains) {
      const url = getRpcUrl(chainId);
      const chain = CHAIN_CONFIG[chainId];
      if (!url || !chain) continue;

      try {
        const client = createPublicClient({ chain, transport: http(url) });
        this.providers.set(chainId, client as PublicClient);
        this.logger.log(`Initialized provider for chain ${chainId}`);
      } catch (error) {
        this.logger.warn(`Failed to init provider for chain ${chainId}`);
      }
    }
  }

  private getProvider(chainId: number): PublicClient {
    const provider = this.providers.get(chainId);
    if (!provider) throw new BadRequestException(`Chain ${chainId} is not supported`);
    return provider;
  }

  async getQuote(params: QuoteParams): Promise<QuoteResponse> {
    const { chainId, fromToken, toToken, fromTokenSymbol, toTokenSymbol, amount, slippage = 0.5, type = 'exactInput' } = params;

    const provider = this.getProvider(chainId);

    // Resolve token addresses and symbols
    const fromTokenAddress = this.resolveTokenAddress(chainId, fromToken);
    const toTokenAddress = this.resolveTokenAddress(chainId, toToken);
    const fromSymbol = fromTokenSymbol || this.getSymbolByAddress(chainId, fromTokenAddress) || fromToken;
    const toSymbol = toTokenSymbol || this.getSymbolByAddress(chainId, toTokenAddress) || toToken;

    // Get decimals
    const fromDecimals = getTokenDecimals(fromSymbol);
    const toDecimals = getTokenDecimals(toSymbol);

    // For exactOutput, we need to find the input amount that produces the desired output
    if (type === 'exactOutput') {
      return this.getExactOutputQuote(
        chainId,
        provider,
        fromTokenAddress,
        toTokenAddress,
        fromSymbol,
        toSymbol,
        amount,
        fromDecimals,
        toDecimals,
        slippage,
      );
    }

    // Parse amount (exactInput)
    const amountIn = parseUnits(amount, fromDecimals);
    const parsedAmount = parseFloat(amount);

    // === NEW AGGREGATOR FLOW: Dynamic Route Discovery ===
    this.logger.log(`[Quote] Finding routes for ${fromSymbol} -> ${toSymbol} on chain ${chainId}`);

    // 1. Discover all possible routes using pathfinder
    const discoveredRoutes = await this.pathfinderService.findRoutes(
      chainId,
      fromTokenAddress,
      toTokenAddress,
    );

    this.logger.log(`[Quote] Discovered ${discoveredRoutes.length} routes`);

    // 2. If we have routes from pathfinder, use them
    if (discoveredRoutes.length > 0) {
      // Get quotes for all discovered routes
      const routeQuotes = await this.routeQuoteService.getQuotesForRoutes(
        chainId,
        provider,
        discoveredRoutes,
        amountIn,
        toDecimals,
      );

      if (routeQuotes.length > 0) {
        // Try route-level split optimization
        const splitResult = this.optimizeRouteSplit(
          routeQuotes,
          amountIn,
          fromDecimals,
          toDecimals,
        );

        if (splitResult) {
          this.logger.log(
            `[Quote] ${splitResult.isSplit ? 'Split' : 'Single'} route: ` +
            `${splitResult.routes.map(r => `${r.percentage.toFixed(1)}% via ${r.quote.route.path.join('->')}`).join(', ')} ` +
            `total output: ${splitResult.totalOutput}`
          );

          // Build response from split result
          return this.buildSplitRouteResponse(
            chainId,
            provider,
            fromSymbol,
            toSymbol,
            amount,
            splitResult,
            slippage,
          );
        }
      }
    }

    // === FALLBACK: Legacy direct DEX quotes (for direct pairs) ===
    this.logger.log(`[Quote] Falling back to direct DEX quotes`);

    // Fetch quotes from all DEXes
    const dexQuotes = await this.dexQuoteService.fetchAllQuotes(
      chainId,
      provider,
      fromTokenAddress,
      toTokenAddress,
      amountIn,
      fromDecimals,
      toDecimals,
    );

    if (dexQuotes.length === 0) {
      throw new NotFoundException(`No liquidity found for ${fromSymbol}/${toSymbol}. This trading pair may not have active pools on this network.`);
    }

    // No external price validation needed - the swap rate IS the market rate
    // Pool liquidity determines the price, not external oracles

    // Find optimal route (single or split)
    const optimalRoute = this.routeOptimizer.findOptimalRoute(
      dexQuotes,
      amountIn,
      fromDecimals,
      toDecimals,
      fromSymbol,
      toSymbol,
    );

    // Calculate fees
    const fees = await this.feeCalculator.calculateFees({
      chainId,
      provider,
      fromToken: fromSymbol,
      amountIn: parsedAmount,
      estimatedGas: optimalRoute.totalGas,
    });

    // Calculate exchange rate from actual swap data (not external prices!)
    const totalOutput = parseFloat(optimalRoute.totalOutput);
    const parsedInput = parseFloat(amount);
    const exchangeRate = parsedInput > 0 ? totalOutput / parsedInput : 0;

    // Calculate min received with slippage
    const minReceived = totalOutput * (1 - slippage / 100);

    return {
      fromToken: fromSymbol,
      toToken: toSymbol,
      fromAmount: amount,
      toAmount: optimalRoute.totalOutput,
      route: {
        steps: optimalRoute.steps,
        totalSteps: optimalRoute.steps.length,
        isSplit: optimalRoute.isSplit,
      },
      fees,
      meta: {
        priceImpact: `${optimalRoute.avgPriceImpact.toFixed(2)}%`,
        exchangeRate: `1 ${fromSymbol} ≈ ${exchangeRate.toFixed(6)} ${toSymbol}`,
        minReceived: `${minReceived.toFixed(6)} ${toSymbol}`,
        expiresAt: Date.now() + 30000,
      },
    };
  }

  /**
   * Route split optimization constants
   */
  private readonly MAX_ROUTE_SPLITS = 3;
  private readonly MIN_ROUTE_PERCENTAGE = 5; // Minimum 5% per route

  /**
   * Optimize split across multiple routes for better output
   */
  private optimizeRouteSplit(
    quotes: RouteQuote[],
    amountIn: bigint,
    fromDecimals: number,
    toDecimals: number,
  ): { routes: Array<{ quote: RouteQuote; percentage: number }>; totalOutput: string; totalGas: number; avgPriceImpact: number; isSplit: boolean } | null {
    if (quotes.length === 0) return null;

    // Sort by output (best first)
    const sortedQuotes = [...quotes].sort((a, b) =>
      b.amountOut > a.amountOut ? 1 : b.amountOut < a.amountOut ? -1 : 0,
    );

    // If only one quote or small amount, use single route
    const amountInNum = Number(formatUnits(amountIn, fromDecimals));
    if (sortedQuotes.length === 1 || amountInNum < 100) {
      return {
        routes: [{ quote: sortedQuotes[0], percentage: 100 }],
        totalOutput: sortedQuotes[0].amountOutFormatted,
        totalGas: sortedQuotes[0].estimatedGas,
        avgPriceImpact: sortedQuotes[0].priceImpact,
        isSplit: false,
      };
    }

    // Take top routes for split consideration
    const topQuotes = sortedQuotes.slice(0, this.MAX_ROUTE_SPLITS);

    // Calculate split percentages based on output quality
    // Better output = higher percentage allocation
    const outputs = topQuotes.map(q => Number(q.amountOut));
    const totalPotentialOutput = outputs.reduce((sum, o) => sum + o, 0);

    let percentages = outputs.map(output => (output / totalPotentialOutput) * 100);

    // Filter routes below minimum threshold
    const validSplits: Array<{ quote: RouteQuote; percentage: number }> = [];
    for (let i = 0; i < topQuotes.length; i++) {
      if (percentages[i] >= this.MIN_ROUTE_PERCENTAGE) {
        validSplits.push({ quote: topQuotes[i], percentage: percentages[i] });
      }
    }

    // If only one valid route remains, use it 100%
    if (validSplits.length <= 1) {
      return {
        routes: [{ quote: sortedQuotes[0], percentage: 100 }],
        totalOutput: sortedQuotes[0].amountOutFormatted,
        totalGas: sortedQuotes[0].estimatedGas,
        avgPriceImpact: sortedQuotes[0].priceImpact,
        isSplit: false,
      };
    }

    // Normalize percentages to sum to 100
    const totalPercentage = validSplits.reduce((sum, s) => sum + s.percentage, 0);
    validSplits.forEach(s => {
      s.percentage = Math.round((s.percentage / totalPercentage) * 10000) / 100; // 2 decimal places
    });

    // Adjust to ensure exactly 100%
    const sum = validSplits.reduce((a, b) => a + b.percentage, 0);
    if (sum !== 100 && validSplits.length > 0) {
      validSplits[0].percentage += Math.round((100 - sum) * 100) / 100;
    }

    // Calculate split output (proportional to percentage)
    // Note: In reality we'd need to re-quote with split amounts for accurate results
    // This is an approximation that works well for similar-output routes
    let totalSplitOutput = 0n;
    let totalSplitGas = 0;
    let weightedPriceImpact = 0;

    for (const split of validSplits) {
      const proportion = split.percentage / 100;
      // Approximate output for this split
      const splitOutput = (split.quote.amountOut * BigInt(Math.round(proportion * 10000))) / 10000n;
      totalSplitOutput += splitOutput;
      totalSplitGas += Math.floor(split.quote.estimatedGas * proportion);
      weightedPriceImpact += split.quote.priceImpact * proportion;
    }

    const totalSplitOutputFormatted = formatUnits(totalSplitOutput, toDecimals);

    // Compare single best vs split
    const singleOutput = Number(sortedQuotes[0].amountOutFormatted);
    const splitOutput = Number(totalSplitOutputFormatted);

    // Split needs to be at least 0.1% better to justify extra gas
    const splitThreshold = 1.001;
    if (splitOutput > singleOutput * splitThreshold) {
      this.logger.log(
        `[Quote] Split routing is ${((splitOutput / singleOutput - 1) * 100).toFixed(2)}% better than single route`
      );
      return {
        routes: validSplits,
        totalOutput: totalSplitOutputFormatted,
        totalGas: totalSplitGas,
        avgPriceImpact: weightedPriceImpact,
        isSplit: true,
      };
    }

    // Use single best route
    return {
      routes: [{ quote: sortedQuotes[0], percentage: 100 }],
      totalOutput: sortedQuotes[0].amountOutFormatted,
      totalGas: sortedQuotes[0].estimatedGas,
      avgPriceImpact: sortedQuotes[0].priceImpact,
      isSplit: false,
    };
  }

  /**
   * Build QuoteResponse from split route result
   */
  private async buildSplitRouteResponse(
    chainId: number,
    provider: PublicClient,
    fromSymbol: string,
    toSymbol: string,
    amount: string,
    splitResult: { routes: Array<{ quote: RouteQuote; percentage: number }>; totalOutput: string; totalGas: number; avgPriceImpact: number; isSplit: boolean },
    slippage: number,
  ): Promise<QuoteResponse> {
    const parsedAmount = parseFloat(amount);
    const steps: RouteStep[] = [];

    // Convert each route to steps
    for (const { quote: routeQuote, percentage } of splitResult.routes) {
      for (const hop of routeQuote.hopsData) {
        // Get proper decimals for each token
        const tokenInSymbol = this.getSymbolByAddress(chainId, hop.tokenIn);
        const tokenOutSymbol = this.getSymbolByAddress(chainId, hop.tokenOut);
        const inDecimals = tokenInSymbol ? getTokenDecimals(tokenInSymbol) : 18;
        const outDecimals = tokenOutSymbol ? getTokenDecimals(tokenOutSymbol) : 18;

        // Scale amounts by percentage
        const scaledAmountIn = (hop.amountIn * BigInt(Math.round(percentage * 100))) / 10000n;
        const scaledAmountOut = (hop.amountOut * BigInt(Math.round(percentage * 100))) / 10000n;

        steps.push({
          dexId: hop.dexId,
          dexName: hop.dexId.replace('_', ' ').toUpperCase(),
          percentage: Math.round(percentage * 100) / 100,
          fromToken: tokenInSymbol || 'UNKNOWN',
          toToken: tokenOutSymbol || 'UNKNOWN',
          fromAmount: formatUnits(scaledAmountIn, inDecimals),
          toAmount: formatUnits(scaledAmountOut, outDecimals),
          estimatedGas: Math.floor(routeQuote.estimatedGas / routeQuote.hopsData.length),
          feeTier: hop.fee || 3000,
          isMultiHop: routeQuote.hopsData.length > 1,
          path: [hop.tokenIn, hop.tokenOut],
        });
      }
    }

    // Calculate fees
    const fees = await this.feeCalculator.calculateFees({
      chainId,
      provider,
      fromToken: fromSymbol,
      amountIn: parsedAmount,
      estimatedGas: splitResult.totalGas,
    });

    // Calculate exchange rate from actual swap data
    const totalOutput = parseFloat(splitResult.totalOutput);
    const parsedInput = parseFloat(amount);
    const exchangeRate = parsedInput > 0 ? totalOutput / parsedInput : 0;

    // Calculate min received with slippage
    const minReceived = totalOutput * (1 - slippage / 100);

    return {
      fromToken: fromSymbol,
      toToken: toSymbol,
      fromAmount: amount,
      toAmount: splitResult.totalOutput,
      route: {
        steps,
        totalSteps: steps.length,
        isSplit: splitResult.isSplit,
      },
      fees,
      meta: {
        priceImpact: `${splitResult.avgPriceImpact.toFixed(2)}%`,
        exchangeRate: `1 ${fromSymbol} ≈ ${exchangeRate.toFixed(6)} ${toSymbol}`,
        minReceived: `${minReceived.toFixed(6)} ${toSymbol}`,
        expiresAt: Date.now() + 30000,
      },
    };
  }

  /**
   * Get quote for exact output amount using binary search
   */
  private async getExactOutputQuote(
    chainId: number,
    provider: PublicClient,
    fromTokenAddress: string,
    toTokenAddress: string,
    fromSymbol: string,
    toSymbol: string,
    desiredOutput: string,
    fromDecimals: number,
    toDecimals: number,
    slippage: number,
  ): Promise<QuoteResponse> {
    const targetOutput = parseFloat(desiredOutput);

    // First, do a sample swap to estimate the exchange rate from pool data
    // Use a small amount to get approximate rate
    const sampleAmount = parseUnits('0.01', fromDecimals);
    let estimatedInput = targetOutput; // Default estimate

    try {
      const sampleQuotes = await this.dexQuoteService.fetchAllQuotes(
        chainId,
        provider,
        fromTokenAddress,
        toTokenAddress,
        sampleAmount,
        fromDecimals,
        toDecimals,
      );

      if (sampleQuotes.length > 0) {
        const bestSample = sampleQuotes.reduce((best, q) => q.amountOut > best.amountOut ? q : best);
        const sampleIn = Number(formatUnits(sampleAmount, fromDecimals));
        const sampleOut = Number(formatUnits(bestSample.amountOut, toDecimals));
        const sampleRate = sampleOut / sampleIn;
        // Estimate input needed for target output
        estimatedInput = sampleRate > 0 ? targetOutput / sampleRate : targetOutput;
      }
    } catch {
      // If sample fails, use target as initial estimate
    }

    // Binary search to find the right input amount (max 5 iterations)
    let low = estimatedInput * 0.5;
    let high = estimatedInput * 2.0;
    let bestQuote: { input: number; output: number; route: any } | null = null;

    for (let i = 0; i < 5; i++) {
      const mid = (low + high) / 2;
      const amountIn = parseUnits(mid.toFixed(fromDecimals), fromDecimals);

      try {
        const dexQuotes = await this.dexQuoteService.fetchAllQuotes(
          chainId,
          provider,
          fromTokenAddress,
          toTokenAddress,
          amountIn,
          fromDecimals,
          toDecimals,
        );

        if (dexQuotes.length === 0) continue;

        const route = this.routeOptimizer.findOptimalRoute(
          dexQuotes,
          amountIn,
          fromDecimals,
          toDecimals,
          fromSymbol,
          toSymbol,
        );

        const output = parseFloat(route.totalOutput);

        // Save best result
        if (!bestQuote || Math.abs(output - targetOutput) < Math.abs(bestQuote.output - targetOutput)) {
          bestQuote = { input: mid, output, route };
        }

        // Adjust search range
        if (output < targetOutput) {
          low = mid;
        } else {
          high = mid;
        }

        // Close enough (within 0.1%)
        if (Math.abs(output - targetOutput) / targetOutput < 0.001) {
          break;
        }
      } catch {
        // Adjust range if quote fails
        if (mid < estimatedInput) {
          low = mid;
        } else {
          high = mid;
        }
      }
    }

    if (!bestQuote) {
      throw new NotFoundException(`No liquidity found for the requested output amount of ${targetOutput} ${toSymbol}. Try a smaller amount or different pair.`);
    }

    // Calculate fees
    this.logger.log(`[Quote exactOutput] Calculating fees: fromToken=${fromSymbol}, amountIn=${bestQuote.input}, estimatedGas=${bestQuote.route.totalGas}`);
    const fees = await this.feeCalculator.calculateFees({
      chainId,
      provider,
      fromToken: fromSymbol,
      amountIn: bestQuote.input,
      estimatedGas: bestQuote.route.totalGas,
    });

    // Calculate max input with slippage (for exactOutput, slippage means you might need to pay more)
    const maxInput = bestQuote.input * (1 + slippage / 100);

    // Calculate exchange rate from swap data
    const swapRate = bestQuote.input > 0 ? bestQuote.output / bestQuote.input : 0;

    return {
      fromToken: fromSymbol,
      toToken: toSymbol,
      fromAmount: bestQuote.input.toFixed(6),
      toAmount: desiredOutput,
      route: {
        steps: bestQuote.route.steps,
        totalSteps: bestQuote.route.steps.length,
        isSplit: bestQuote.route.isSplit,
      },
      fees,
      meta: {
        priceImpact: `${bestQuote.route.avgPriceImpact.toFixed(2)}%`,
        exchangeRate: `1 ${fromSymbol} ≈ ${swapRate.toFixed(6)} ${toSymbol}`,
        minReceived: `${desiredOutput} ${toSymbol}`,
        expiresAt: Date.now() + 30000,
      },
    };
  }

  private resolveTokenAddress(chainId: number, tokenOrAddress: string): string {
    if (tokenOrAddress.startsWith('0x')) return tokenOrAddress;

    const addresses = TOKEN_ADDRESSES[chainId];
    if (!addresses) throw new BadRequestException(`Chain ${chainId} is not supported`);

    const address = addresses[tokenOrAddress.toUpperCase()];
    if (!address) throw new BadRequestException(`Token ${tokenOrAddress} not found on chain ${chainId}`);

    return address;
  }

  private getSymbolByAddress(chainId: number, address: string): string | null {
    const addresses = TOKEN_ADDRESSES[chainId];
    if (!addresses) return null;

    const lowerAddress = address.toLowerCase();
    for (const [symbol, addr] of Object.entries(addresses)) {
      if (addr.toLowerCase() === lowerAddress) return symbol;
    }
    return null;
  }
}
