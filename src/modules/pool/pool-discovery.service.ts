import { Injectable, Logger } from '@nestjs/common';
import { createPublicClient, http, PublicClient, getAddress } from 'viem';
import { PoolService } from './pool.service';
import { CHAIN_CONFIG, getRpcUrl } from '../../constants';

/**
 * Factory addresses for Uniswap V3 on different chains
 */
const UNISWAP_V3_FACTORY: Record<number, string> = {
  1: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  11155111: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
  42161: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  137: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
  56: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
};

/**
 * V3 Fee tiers
 */
const V3_FEE_TIERS = [100, 500, 3000, 10000];

/**
 * Factory ABI - just getPool function
 */
const FACTORY_ABI = [
  {
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    name: 'getPool',
    outputs: [{ name: 'pool', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * Pool Discovery Service
 * Discovers pools on-demand using Factory.getPool()
 * No block scanning needed!
 */
@Injectable()
export class PoolDiscoveryService {
  private readonly logger = new Logger(PoolDiscoveryService.name);
  private providers = new Map<number, PublicClient>();

  // Cache to avoid re-checking pairs we already looked up
  private checkedPairs = new Map<string, number>(); // pairKey -> timestamp
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly poolService: PoolService) {
    this.initializeProviders();
  }

  private getPairKey(chainId: number, tokenA: string, tokenB: string): string {
    const [t0, t1] = [tokenA.toLowerCase(), tokenB.toLowerCase()].sort();
    return `${chainId}:${t0}:${t1}`;
  }

  private initializeProviders() {
    const chains = [1, 11155111, 42161, 137, 56];

    for (const chainId of chains) {
      const url = getRpcUrl(chainId);
      const chain = CHAIN_CONFIG[chainId];
      if (!url || !chain) continue;

      try {
        const client = createPublicClient({ chain, transport: http(url) });
        this.providers.set(chainId, client as PublicClient);
        this.logger.log(`[Discovery] Provider ready for chain ${chainId}`);
      } catch (error) {
        this.logger.warn(`[Discovery] Failed to init provider for chain ${chainId}`);
      }
    }
  }

  /**
   * Discover pools for a token pair
   * Checks all fee tiers and saves found pools to DB
   * Uses cache to avoid repeated RPC calls
   */
  async discoverPoolsForPair(
    chainId: number,
    tokenA: string,
    tokenB: string,
  ): Promise<string[]> {
    const pairKey = this.getPairKey(chainId, tokenA, tokenB);

    // Check cache first - avoid repeated RPC calls
    const lastChecked = this.checkedPairs.get(pairKey);
    if (lastChecked && Date.now() - lastChecked < this.CACHE_TTL) {
      // Already checked recently, return pools from DB
      const pools = await this.poolService.getPoolsForPair(chainId, tokenA, tokenB);
      return pools.map(p => p.poolAddress);
    }

    const provider = this.providers.get(chainId);
    const factoryAddress = UNISWAP_V3_FACTORY[chainId];

    if (!provider || !factoryAddress) {
      return [];
    }

    const discoveredPools: string[] = [];

    // Use multicall to batch all fee tier checks into ONE RPC call
    try {
      const results = await provider.multicall({
        contracts: V3_FEE_TIERS.map(fee => ({
          address: factoryAddress as `0x${string}`,
          abi: FACTORY_ABI,
          functionName: 'getPool',
          args: [tokenA as `0x${string}`, tokenB as `0x${string}`, fee],
        })),
      });

      // Process results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'success' && result.result && result.result !== ZERO_ADDRESS) {
          const poolAddress = result.result as string;
          const fee = V3_FEE_TIERS[i];

          // Check if already in DB
          const existing = await this.poolService.getPoolByAddress(chainId, poolAddress);

          if (!existing) {
            await this.poolService.upsertPool({
              chainId,
              dexId: 'uniswap_v3',
              poolAddress: poolAddress,
              token0: tokenA,
              token1: tokenB,
              fee,
              isActive: true,
            });

            this.logger.log(
              `[Discovery] Found pool: ${poolAddress.slice(0, 10)}... (fee: ${fee / 10000}%)`
            );
          }

          discoveredPools.push(poolAddress);
        }
      }
    } catch (error: any) {
      // Multicall failed, skip this pair
      this.logger.debug(`[Discovery] Multicall failed for pair: ${error.message}`);
    }

    // Cache this pair as checked
    this.checkedPairs.set(pairKey, Date.now());

    return discoveredPools;
  }

  /**
   * Ensure pools exist for a token pair
   * Called by quote service before getting quotes
   */
  async ensurePoolsForPair(
    chainId: number,
    tokenA: string,
    tokenB: string,
  ): Promise<number> {
    // First check DB
    const existingPools = await this.poolService.getPoolsForPair(chainId, tokenA, tokenB);

    if (existingPools.length > 0) {
      // Already have pools in DB
      return existingPools.length;
    }

    // No pools in DB, discover them
    const discovered = await this.discoverPoolsForPair(chainId, tokenA, tokenB);
    return discovered.length;
  }

  /**
   * Discover pools for multiple token pairs (for graph building)
   */
  async discoverPoolsForTokens(
    chainId: number,
    tokens: string[],
  ): Promise<number> {
    let totalDiscovered = 0;

    // Generate all unique pairs
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const pools = await this.discoverPoolsForPair(chainId, tokens[i], tokens[j]);
        totalDiscovered += pools.length;
      }
    }

    this.logger.log(`[Discovery] Discovered ${totalDiscovered} pools for ${tokens.length} tokens`);
    return totalDiscovered;
  }

  /**
   * Get discovery stats
   */
  async getStats(chainId: number): Promise<{ poolCount: number; chains: number[] }> {
    const poolCount = await this.poolService.getPoolCount(chainId);
    return {
      poolCount,
      chains: Array.from(this.providers.keys()),
    };
  }
}
