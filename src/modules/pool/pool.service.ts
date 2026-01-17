import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Pool } from '../../database/entities';

export interface PoolData {
  chainId: number;
  dexId: string;
  poolAddress: string;
  token0: string;
  token1: string;
  fee?: number;
  reserve0?: string;
  reserve1?: string;
  liquidity?: string;
  sqrtPriceX96?: string;
  tick?: number;
  isActive?: boolean;
}

@Injectable()
export class PoolService {
  private readonly logger = new Logger(PoolService.name);

  constructor(
    @InjectRepository(Pool)
    private readonly poolRepository: Repository<Pool>,
  ) {}

  /**
   * Get all pools for a specific token pair (both directions)
   */
  async getPoolsForPair(
    chainId: number,
    tokenA: string,
    tokenB: string,
  ): Promise<Pool[]> {
    const tokenALower = tokenA.toLowerCase();
    const tokenBLower = tokenB.toLowerCase();

    return this.poolRepository
      .createQueryBuilder('pool')
      .where('pool.chainId = :chainId', { chainId })
      .andWhere('pool.isActive = :isActive', { isActive: true })
      .andWhere(
        '((LOWER(pool.token0) = :tokenA AND LOWER(pool.token1) = :tokenB) OR ' +
          '(LOWER(pool.token0) = :tokenB AND LOWER(pool.token1) = :tokenA))',
        { tokenA: tokenALower, tokenB: tokenBLower },
      )
      .getMany();
  }

  /**
   * Get all pools containing a specific token (for graph building)
   */
  async getPoolsForToken(chainId: number, token: string): Promise<Pool[]> {
    const tokenLower = token.toLowerCase();

    return this.poolRepository
      .createQueryBuilder('pool')
      .where('pool.chainId = :chainId', { chainId })
      .andWhere('pool.isActive = :isActive', { isActive: true })
      .andWhere(
        '(LOWER(pool.token0) = :token OR LOWER(pool.token1) = :token)',
        { token: tokenLower },
      )
      .getMany();
  }

  /**
   * Get all active pools for a chain (for full graph)
   */
  async getAllPools(chainId: number): Promise<Pool[]> {
    return this.poolRepository.find({
      where: { chainId, isActive: true },
    });
  }

  /**
   * Get pools by DEX
   */
  async getPoolsByDex(chainId: number, dexId: string): Promise<Pool[]> {
    return this.poolRepository.find({
      where: { chainId, dexId, isActive: true },
    });
  }

  /**
   * Upsert a pool (create or update)
   */
  async upsertPool(data: PoolData): Promise<Pool> {
    const existing = await this.poolRepository.findOne({
      where: {
        chainId: data.chainId,
        poolAddress: data.poolAddress.toLowerCase(),
      },
    });

    if (existing) {
      // Update existing pool
      Object.assign(existing, {
        ...data,
        poolAddress: data.poolAddress.toLowerCase(),
        token0: data.token0.toLowerCase(),
        token1: data.token1.toLowerCase(),
        lastSyncedAt: new Date(),
      });
      return this.poolRepository.save(existing);
    }

    // Create new pool
    const pool = this.poolRepository.create({
      ...data,
      poolAddress: data.poolAddress.toLowerCase(),
      token0: data.token0.toLowerCase(),
      token1: data.token1.toLowerCase(),
      lastSyncedAt: new Date(),
    });

    return this.poolRepository.save(pool);
  }

  /**
   * Bulk upsert pools
   */
  async upsertPools(pools: PoolData[]): Promise<void> {
    for (const poolData of pools) {
      await this.upsertPool(poolData);
    }
    this.logger.log(`Upserted ${pools.length} pools`);
  }

  /**
   * Update pool reserves
   */
  async updateReserves(
    chainId: number,
    poolAddress: string,
    reserve0: string,
    reserve1: string,
    liquidity?: string,
    sqrtPriceX96?: string,
    tick?: number,
    block?: number,
  ): Promise<void> {
    await this.poolRepository.update(
      { chainId, poolAddress: poolAddress.toLowerCase() },
      {
        reserve0,
        reserve1,
        liquidity,
        sqrtPriceX96,
        tick,
        lastSyncedAt: new Date(),
        lastSyncedBlock: block,
      },
    );
  }

  /**
   * Get pool by address
   */
  async getPoolByAddress(
    chainId: number,
    poolAddress: string,
  ): Promise<Pool | null> {
    return this.poolRepository.findOne({
      where: {
        chainId,
        poolAddress: poolAddress.toLowerCase(),
      },
    });
  }

  /**
   * Deactivate stale pools (not synced in 24 hours)
   */
  async deactivateStalePools(chainId: number): Promise<number> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await this.poolRepository.update(
      {
        chainId,
        isActive: true,
        lastSyncedAt: oneDayAgo,
      },
      { isActive: false },
    );

    return result.affected || 0;
  }

  /**
   * Get pool count by chain
   */
  async getPoolCount(chainId: number): Promise<number> {
    return this.poolRepository.count({
      where: { chainId, isActive: true },
    });
  }

  /**
   * Get unique tokens in pools
   */
  async getUniqueTokens(chainId: number): Promise<string[]> {
    const pools = await this.getAllPools(chainId);
    const tokens = new Set<string>();

    for (const pool of pools) {
      tokens.add(pool.token0.toLowerCase());
      tokens.add(pool.token1.toLowerCase());
    }

    return Array.from(tokens);
  }
}
