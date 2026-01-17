import { Injectable, Logger } from '@nestjs/common';
import { PublicClient } from 'viem';
import { PriceService } from './price.service';

/**
 * WETH-Only Fee System
 *
 * Broadcaster only accepts WETH as fee token.
 * The fee is calculated as gas cost in WETH terms.
 */
export interface FeeBreakdown {
  // Broadcaster fee (always in WETH)
  broadcasterFee: string;        // e.g., "0.001234 WETH"
  broadcasterFeeWei: string;     // e.g., "1234000000000000" (for transaction building)
  broadcasterFeeUsd: string;     // e.g., "$4.32"

  // VoidDex protocol fee (0.05% of input, converted to WETH)
  voidDexFee: string;            // e.g., "0.000123 WETH"
  voidDexFeeUsd: string;

  // Totals (all in WETH)
  totalFeeWeth: string;          // e.g., "0.001357 WETH"
  totalFeeUsd: string;

  // Legacy fields for backward compatibility
  gasCost: string;
  gasCostUsd: string;
}

export interface FeeCalculationParams {
  chainId: number;
  provider: PublicClient;
  fromToken: string;
  amountIn: number;
  estimatedGas: number;
}

@Injectable()
export class FeeCalculatorService {
  private readonly logger = new Logger(FeeCalculatorService.name);

  // VoidDex protocol fee: 0.05%
  private readonly VOIDDEX_FEE_BPS = 0.0005;

  constructor(private readonly priceService: PriceService) {}

  // Broadcaster profit margin (15%) - same as broadcaster config
  private readonly BROADCASTER_PROFIT_MARGIN = 0.15;

  async calculateFees(params: FeeCalculationParams): Promise<FeeBreakdown> {
    const { chainId, provider, fromToken, amountIn, estimatedGas } = params;

    this.logger.log(`[FeeCalculator] Input: chainId=${chainId}, fromToken=${fromToken}, amountIn=${amountIn}, estimatedGas=${estimatedGas}`);

    // Get real gas price from network
    let gasPriceGwei: number;
    try {
      const gasPrice = await provider.getGasPrice();
      gasPriceGwei = Number(gasPrice) / 1e9;
      this.logger.log(`[FeeCalculator] Gas price on chain ${chainId}: ${gasPriceGwei.toFixed(6)} gwei`);
    } catch (error) {
      this.logger.error(`[FeeCalculator] Failed to get gas price: ${error}`);
      throw error;
    }

    // Minimum gas estimate for a Railgun cross-contract swap
    // This includes: ZK proof verification + unshield + approve + swap + shield
    // Typical range: 800k-1.5M gas depending on proof complexity
    const MINIMUM_RAILGUN_SWAP_GAS = 1_000_000;

    // Use provided gas estimate, or fall back to minimum for display purposes
    let effectiveGas = estimatedGas;
    if (!estimatedGas || estimatedGas <= 0) {
      this.logger.warn(`[FeeCalculator] Invalid gas estimate: ${estimatedGas}, using minimum: ${MINIMUM_RAILGUN_SWAP_GAS}`);
      effectiveGas = MINIMUM_RAILGUN_SWAP_GAS;
    } else if (estimatedGas < 100_000) {
      // If estimate seems too low (likely incomplete), use minimum
      this.logger.warn(`[FeeCalculator] Gas estimate ${estimatedGas} seems too low, using minimum: ${MINIMUM_RAILGUN_SWAP_GAS}`);
      effectiveGas = MINIMUM_RAILGUN_SWAP_GAS;
    }

    // Calculate gas cost in WETH (same as ETH) using BigInt for precision
    // gasCost = gasEstimate * gasPrice
    const gasPriceWei = BigInt(Math.round(gasPriceGwei * 1e9));
    const gasCostWei = BigInt(effectiveGas) * gasPriceWei;
    const gasCostEth = Number(gasCostWei) / 1e18;

    // WETH-Only: Broadcaster fee = gas cost + profit margin (in WETH)
    // This is what the broadcaster will charge
    const broadcasterFeeWei = gasCostWei + (gasCostWei * BigInt(Math.round(this.BROADCASTER_PROFIT_MARGIN * 100))) / 100n;
    const broadcasterFeeEth = Number(broadcasterFeeWei) / 1e18;

    // Get prices
    const ethPrice = await this.priceService.getEthPrice(chainId, provider);
    const fromTokenPrice = await this.priceService.getTokenPrice(chainId, provider, fromToken);

    this.logger.log(`[FeeCalculator] Prices: ETH=$${ethPrice.toFixed(2)}, ${fromToken}=$${fromTokenPrice.toFixed(2)}`);

    const gasCostUsd = gasCostEth * ethPrice;
    const broadcasterFeeUsd = broadcasterFeeEth * ethPrice;

    // VoidDex protocol fee (0.05% of input amount)
    // Calculate in input token first, then convert to WETH for display
    const voidDexFeeInToken = amountIn * this.VOIDDEX_FEE_BPS;
    const voidDexFeeUsd = voidDexFeeInToken * fromTokenPrice;
    // Convert to WETH equivalent
    const voidDexFeeWeth = ethPrice > 0 ? voidDexFeeUsd / ethPrice : 0;

    this.logger.log(`[FeeCalculator] Broadcaster Fee (WETH): ${broadcasterFeeEth.toFixed(8)} WETH ($${broadcasterFeeUsd.toFixed(2)})`);
    this.logger.log(`[FeeCalculator] VoidDex Fee: ${voidDexFeeWeth.toFixed(8)} WETH ($${voidDexFeeUsd.toFixed(2)})`);

    // Total fees (all in WETH now)
    const totalFeeWeth = broadcasterFeeEth + voidDexFeeWeth;
    const totalFeeUsd = broadcasterFeeUsd + voidDexFeeUsd;

    // Format helpers
    const formatFee = (value: number): string => {
      if (value === 0) return '0';
      if (value < 0.00000001) return '< 0.00000001';
      if (value < 0.0001) return value.toFixed(8);
      return value.toFixed(6);
    };

    const formatUsd = (value: number): string => {
      if (value === 0) return '$0.00';
      if (value < 0.01) return '< $0.01';
      return `$${value.toFixed(2)}`;
    };

    const feeResult: FeeBreakdown = {
      // WETH-only broadcaster fee
      broadcasterFee: `${formatFee(broadcasterFeeEth)} WETH`,
      broadcasterFeeWei: broadcasterFeeWei.toString(),
      broadcasterFeeUsd: formatUsd(broadcasterFeeUsd),

      // VoidDex protocol fee (converted to WETH)
      voidDexFee: `${formatFee(voidDexFeeWeth)} WETH`,
      voidDexFeeUsd: formatUsd(voidDexFeeUsd),

      // Totals (all in WETH)
      totalFeeWeth: `${formatFee(totalFeeWeth)} WETH`,
      totalFeeUsd: formatUsd(totalFeeUsd),

      // Legacy fields (for backward compatibility)
      gasCost: `${gasCostEth.toFixed(6)} ETH`,
      gasCostUsd: formatUsd(gasCostUsd),
    };

    this.logger.log(`[FeeCalculator] Result: ${JSON.stringify(feeResult)}`);
    return feeResult;
  }

  calculateVoidDexFee(amount: number): number {
    return amount * this.VOIDDEX_FEE_BPS;
  }

  getVoidDexFeeBps(): number {
    return this.VOIDDEX_FEE_BPS;
  }
}
