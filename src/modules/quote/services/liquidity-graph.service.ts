import { Injectable, Logger } from '@nestjs/common';
import { Pool } from '../../../database/entities';
import { PoolService } from '../../pool/pool.service';

/**
 * Represents an edge in the liquidity graph (a swap through a pool)
 */
export interface GraphEdge {
  pool: Pool;
  tokenIn: string;
  tokenOut: string;
  dexId: string;
  fee: number; // Fee as decimal (0.003 = 0.3%)
  liquidity: bigint;
  // For V3 pools
  sqrtPriceX96?: bigint;
  tick?: number;
}

/**
 * Adjacency list representation of the liquidity graph
 * Key: token address (lowercase)
 * Value: array of edges (pools) that can swap from this token
 */
export interface LiquidityGraph {
  adjacencyList: Map<string, GraphEdge[]>;
  tokens: Set<string>;
  poolCount: number;
}

@Injectable()
export class LiquidityGraphService {
  private readonly logger = new Logger(LiquidityGraphService.name);

  // Cache graphs per chain with TTL
  private graphCache = new Map<number, { graph: LiquidityGraph; timestamp: number }>();
  private readonly CACHE_TTL = 60_000; // 1 minute cache

  constructor(private readonly poolService: PoolService) {}

  /**
   * Build or retrieve cached liquidity graph for a chain
   */
  async getGraph(chainId: number): Promise<LiquidityGraph> {
    const cached = this.graphCache.get(chainId);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.graph;
    }

    const graph = await this.buildGraph(chainId);
    this.graphCache.set(chainId, { graph, timestamp: Date.now() });

    return graph;
  }

  /**
   * Build liquidity graph from database pools
   */
  private async buildGraph(chainId: number): Promise<LiquidityGraph> {
    const pools = await this.poolService.getAllPools(chainId);

    const adjacencyList = new Map<string, GraphEdge[]>();
    const tokens = new Set<string>();

    for (const pool of pools) {
      const token0 = pool.token0.toLowerCase();
      const token1 = pool.token1.toLowerCase();

      tokens.add(token0);
      tokens.add(token1);

      // Fee tier to decimal (V3: 500 = 0.0005 = 0.05%, V2: default 0.3%)
      const fee = pool.fee ? pool.fee / 1_000_000 : 0.003;

      // Parse liquidity
      const liquidity = pool.liquidity ? BigInt(pool.liquidity) : 0n;
      const sqrtPriceX96 = pool.sqrtPriceX96 ? BigInt(pool.sqrtPriceX96) : undefined;

      // Add edge: token0 -> token1
      const edge0to1: GraphEdge = {
        pool,
        tokenIn: token0,
        tokenOut: token1,
        dexId: pool.dexId,
        fee,
        liquidity,
        sqrtPriceX96,
        tick: pool.tick ?? undefined,
      };

      // Add edge: token1 -> token0
      const edge1to0: GraphEdge = {
        pool,
        tokenIn: token1,
        tokenOut: token0,
        dexId: pool.dexId,
        fee,
        liquidity,
        sqrtPriceX96,
        tick: pool.tick ?? undefined,
      };

      // Add to adjacency list
      if (!adjacencyList.has(token0)) {
        adjacencyList.set(token0, []);
      }
      adjacencyList.get(token0)!.push(edge0to1);

      if (!adjacencyList.has(token1)) {
        adjacencyList.set(token1, []);
      }
      adjacencyList.get(token1)!.push(edge1to0);
    }

    this.logger.log(
      `[LiquidityGraph] Built graph for chain ${chainId}: ${pools.length} pools, ${tokens.size} tokens`
    );

    return {
      adjacencyList,
      tokens,
      poolCount: pools.length,
    };
  }

  /**
   * Get all edges (pools) that can swap from a token
   */
  getEdgesFrom(graph: LiquidityGraph, token: string): GraphEdge[] {
    return graph.adjacencyList.get(token.toLowerCase()) || [];
  }

  /**
   * Get all direct pools between two tokens
   */
  getDirectEdges(graph: LiquidityGraph, tokenIn: string, tokenOut: string): GraphEdge[] {
    const edges = this.getEdgesFrom(graph, tokenIn);
    return edges.filter((e) => e.tokenOut.toLowerCase() === tokenOut.toLowerCase());
  }

  /**
   * Check if a token exists in the graph
   */
  hasToken(graph: LiquidityGraph, token: string): boolean {
    return graph.tokens.has(token.toLowerCase());
  }

  /**
   * Get all tokens in the graph
   */
  getTokens(graph: LiquidityGraph): string[] {
    return Array.from(graph.tokens);
  }

  /**
   * Invalidate cache for a chain
   */
  invalidateCache(chainId: number): void {
    this.graphCache.delete(chainId);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.graphCache.clear();
  }
}
