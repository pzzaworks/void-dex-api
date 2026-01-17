import { Injectable, Logger } from '@nestjs/common';
import { PublicClient } from 'viem';
import { CHAINLINK_PRICE_FEEDS, CHAINLINK_PRICE_FEED_ABI } from '../../../constants';

/**
 * PriceService
 *
 * Simple approach: Only ETH/USD from Chainlink
 * All other token prices are derived from swap rates (pool data)
 *
 * Example: WETH → LINK swap
 * - Swap rate: 0.022 WETH = 14.09 LINK (from pool)
 * - ETH price: $2980 (from Chainlink)
 * - Input USD: 0.022 * $2980 = $65.56
 * - Implied LINK price: $65.56 / 14.09 = $4.65
 */
@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private ethPriceCache: { price: number; timestamp: number } | null = null;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  /**
   * Get native token (ETH/BNB/MATIC) price in USD
   * This is the ONLY external price we need - everything else comes from swap rates
   */
  async getNativeTokenPrice(chainId: number, provider: PublicClient): Promise<number> {
    if (this.ethPriceCache && Date.now() - this.ethPriceCache.timestamp < this.CACHE_TTL) {
      return this.ethPriceCache.price;
    }

    try {
      const priceFeedAddress = CHAINLINK_PRICE_FEEDS[chainId];
      if (!priceFeedAddress) {
        this.logger.warn(`No Chainlink price feed for chain ${chainId}`);
        return 0;
      }

      const latestRoundData = (await provider.readContract({
        address: priceFeedAddress as `0x${string}`,
        abi: CHAINLINK_PRICE_FEED_ABI,
        functionName: 'latestRoundData',
      })) as [bigint, bigint, bigint, bigint, bigint];

      const price = Number(latestRoundData[1]) / 1e8; // Chainlink returns 8 decimals
      this.logger.log(`Native token price on chain ${chainId}: $${price.toFixed(2)}`);

      this.ethPriceCache = { price, timestamp: Date.now() };
      return price;
    } catch (error) {
      this.logger.error(`Failed to get native token price: ${error}`);
      return 0;
    }
  }

  /**
   * Alias for getNativeTokenPrice (backwards compatibility)
   */
  async getEthPrice(chainId: number, provider: PublicClient): Promise<number> {
    return this.getNativeTokenPrice(chainId, provider);
  }

  /**
   * Get token price - only works for native tokens and stablecoins
   * For other tokens, use calculateTokenPriceFromSwap()
   */
  async getTokenPrice(
    chainId: number,
    provider: PublicClient,
    tokenSymbol: string,
  ): Promise<number> {
    // Native tokens (ETH, WETH, BNB, MATIC, etc.)
    if (['ETH', 'WETH', 'BNB', 'WBNB', 'MATIC', 'WMATIC'].includes(tokenSymbol)) {
      return this.getNativeTokenPrice(chainId, provider);
    }

    // Stablecoins - pegged to $1
    if (['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'GHO', 'sDAI', 'EURS'].includes(tokenSymbol)) {
      return 1;
    }

    // For all other tokens, return 0 - caller should use swap rate
    return 0;
  }

  /**
   * Calculate token price from swap rate
   * This is the correct way to get prices - derived from actual pool liquidity
   *
   * @param amountIn - Input amount (e.g., 0.022 WETH)
   * @param amountOut - Output amount (e.g., 14.09 LINK)
   * @param inputTokenPrice - Price of input token in USD (e.g., $2980 for WETH)
   * @returns Price of output token in USD
   */
  calculateTokenPriceFromSwap(
    amountIn: number,
    amountOut: number,
    inputTokenPrice: number,
  ): number {
    if (amountOut === 0 || inputTokenPrice === 0) return 0;
    const inputValueUsd = amountIn * inputTokenPrice;
    return inputValueUsd / amountOut;
  }

  /**
   * Calculate USD value of a token amount using swap rate
   */
  calculateUsdValue(
    amount: number,
    tokenSymbol: string,
    chainId: number,
    provider: PublicClient,
    swapRateToNative?: number, // e.g., 1 LINK = 0.00156 ETH
  ): Promise<number> {
    return (async () => {
      // Native tokens - direct price
      if (['ETH', 'WETH', 'BNB', 'WBNB', 'MATIC', 'WMATIC'].includes(tokenSymbol)) {
        const nativePrice = await this.getNativeTokenPrice(chainId, provider);
        return amount * nativePrice;
      }

      // Stablecoins - $1 each
      if (['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX'].includes(tokenSymbol)) {
        return amount;
      }

      // Other tokens - use swap rate if provided
      if (swapRateToNative && swapRateToNative > 0) {
        const nativePrice = await this.getNativeTokenPrice(chainId, provider);
        return amount * swapRateToNative * nativePrice;
      }

      return 0;
    })();
  }

  /**
   * Clear price cache
   */
  clearCache(): void {
    this.ethPriceCache = null;
  }
}
