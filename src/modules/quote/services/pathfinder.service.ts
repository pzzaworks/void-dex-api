import { Injectable, Logger } from '@nestjs/common';
import { LiquidityGraph, GraphEdge, LiquidityGraphService } from './liquidity-graph.service';
import { PoolDiscoveryService } from '../../pool/pool-discovery.service';
import { PoolService } from '../../pool/pool.service';
import { TOKEN_ADDRESSES } from '../../../constants';

/**
 * Represents a single hop in a route
 */
export interface RouteHop {
  edge: GraphEdge;
  tokenIn: string;
  tokenOut: string;
  poolAddress: string;
  dexId: string;
  fee: number;
}

/**
 * Represents a complete route from tokenIn to tokenOut
 */
export interface DiscoveredRoute {
  hops: RouteHop[];
  tokenIn: string;
  tokenOut: string;
  path: string[]; // Full token path: [tokenIn, intermediate1, ..., tokenOut]
  totalHops: number;
  estimatedGas: number;
  // Populated after quote fetching
  expectedOutput?: bigint;
  priceImpact?: number;
}

/**
 * Priority queue node for Dijkstra
 */
interface QueueNode {
  token: string;
  path: RouteHop[];
  distance: number; // Lower is better
}

// Gas estimates per hop type
const GAS_ESTIMATES = {
  v3_single: 150_000,
  v3_multi: 100_000, // Additional gas per extra hop
  v2_single: 120_000,
  v2_multi: 80_000,
};

@Injectable()
export class PathfinderService {
  private readonly logger = new Logger(PathfinderService.name);

  private readonly MAX_HOPS = 3; // A -> X -> Y -> B
  private readonly MAX_ROUTES = 10; // Max routes to return

  constructor(
    private readonly liquidityGraphService: LiquidityGraphService,
    private readonly poolDiscoveryService: PoolDiscoveryService,
    private readonly poolService: PoolService,
  ) {}

  /**
   * Find all viable routes between two tokens
   * Uses modified BFS/DFS with depth limit (not true Dijkstra since we don't have accurate weights yet)
   */
  async findRoutes(
    chainId: number,
    tokenIn: string,
    tokenOut: string,
  ): Promise<DiscoveredRoute[]> {
    const tokenInLower = tokenIn.toLowerCase();
    const tokenOutLower = tokenOut.toLowerCase();

    // Step 1: Discover pools for this pair and bridge tokens
    await this.discoverRelevantPools(chainId, tokenInLower, tokenOutLower);

    // Step 2: Invalidate graph cache so it rebuilds with new pools
    this.liquidityGraphService.invalidateCache(chainId);

    // Step 3: Get fresh graph
    const graph = await this.liquidityGraphService.getGraph(chainId);

    // Check if tokens exist in graph
    if (!this.liquidityGraphService.hasToken(graph, tokenInLower)) {
      this.logger.warn(`[Pathfinder] Token ${tokenIn} not found in graph after discovery`);
      return [];
    }

    if (!this.liquidityGraphService.hasToken(graph, tokenOutLower)) {
      this.logger.warn(`[Pathfinder] Token ${tokenOut} not found in graph after discovery`);
      return [];
    }

    const routes: DiscoveredRoute[] = [];
    const visited = new Set<string>(); // Prevent cycles within a path

    // BFS with depth limit
    this.findRoutesRecursive(
      graph,
      tokenInLower,
      tokenOutLower,
      [],
      [tokenInLower],
      visited,
      routes,
    );

    // Sort by estimated gas (prefer shorter routes initially)
    routes.sort((a, b) => a.estimatedGas - b.estimatedGas);

    // Limit to top routes
    const topRoutes = routes.slice(0, this.MAX_ROUTES);

    this.logger.log(
      `[Pathfinder] Found ${routes.length} routes for ${tokenIn} -> ${tokenOut}, returning top ${topRoutes.length}`
    );

    return topRoutes;
  }

  /**
   * Recursive route finding with depth limit
   */
  private findRoutesRecursive(
    graph: LiquidityGraph,
    currentToken: string,
    targetToken: string,
    currentHops: RouteHop[],
    currentPath: string[],
    visitedInPath: Set<string>,
    results: DiscoveredRoute[],
  ): void {
    // Check max hops
    if (currentHops.length >= this.MAX_HOPS) {
      return;
    }

    // Get all edges from current token
    const edges = this.liquidityGraphService.getEdgesFrom(graph, currentToken);

    for (const edge of edges) {
      const nextToken = edge.tokenOut.toLowerCase();

      // Skip if we've already visited this token in current path (prevent cycles)
      if (visitedInPath.has(nextToken) && nextToken !== targetToken) {
        continue;
      }

      // Create hop
      const hop: RouteHop = {
        edge,
        tokenIn: edge.tokenIn,
        tokenOut: edge.tokenOut,
        poolAddress: edge.pool.poolAddress,
        dexId: edge.dexId,
        fee: edge.fee,
      };

      const newHops = [...currentHops, hop];
      const newPath = [...currentPath, nextToken];

      // Check if we reached target
      if (nextToken === targetToken) {
        const route = this.createRoute(newHops, newPath);
        results.push(route);
        continue;
      }

      // Continue exploring
      const newVisited = new Set(visitedInPath);
      newVisited.add(nextToken);

      this.findRoutesRecursive(
        graph,
        nextToken,
        targetToken,
        newHops,
        newPath,
        newVisited,
        results,
      );
    }
  }

  /**
   * Create a DiscoveredRoute from hops
   */
  private createRoute(hops: RouteHop[], path: string[]): DiscoveredRoute {
    // Estimate gas based on hop types
    let estimatedGas = 0;

    for (let i = 0; i < hops.length; i++) {
      const hop = hops[i];
      const isV3 = hop.dexId.includes('v3');

      if (i === 0) {
        estimatedGas += isV3 ? GAS_ESTIMATES.v3_single : GAS_ESTIMATES.v2_single;
      } else {
        estimatedGas += isV3 ? GAS_ESTIMATES.v3_multi : GAS_ESTIMATES.v2_multi;
      }
    }

    return {
      hops,
      tokenIn: hops[0].tokenIn,
      tokenOut: hops[hops.length - 1].tokenOut,
      path,
      totalHops: hops.length,
      estimatedGas,
    };
  }

  /**
   * Find routes with priority on high liquidity paths
   * This version uses a priority queue (Dijkstra-like)
   */
  async findRoutesOptimized(
    chainId: number,
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
  ): Promise<DiscoveredRoute[]> {
    const graph = await this.liquidityGraphService.getGraph(chainId);

    const tokenInLower = tokenIn.toLowerCase();
    const tokenOutLower = tokenOut.toLowerCase();

    if (!this.liquidityGraphService.hasToken(graph, tokenInLower) ||
        !this.liquidityGraphService.hasToken(graph, tokenOutLower)) {
      return [];
    }

    const routes: DiscoveredRoute[] = [];

    // Priority queue (min-heap simulation with array + sort)
    // Distance = inverse of liquidity (we want high liquidity)
    const queue: QueueNode[] = [
      { token: tokenInLower, path: [], distance: 0 },
    ];

    const visited = new Map<string, number>(); // token -> best distance to it

    while (queue.length > 0) {
      // Sort to get minimum distance
      queue.sort((a, b) => a.distance - b.distance);
      const current = queue.shift()!;

      if (current.path.length >= this.MAX_HOPS) {
        continue;
      }

      // Skip if we've found a better path to this token
      const existingDist = visited.get(current.token);
      if (existingDist !== undefined && existingDist < current.distance) {
        continue;
      }
      visited.set(current.token, current.distance);

      const edges = this.liquidityGraphService.getEdgesFrom(graph, current.token);

      for (const edge of edges) {
        const nextToken = edge.tokenOut.toLowerCase();

        // Prevent cycles (except reaching target)
        const inPath = current.path.some((h) => h.tokenOut.toLowerCase() === nextToken);
        if (inPath && nextToken !== tokenOutLower) {
          continue;
        }

        const hop: RouteHop = {
          edge,
          tokenIn: edge.tokenIn,
          tokenOut: edge.tokenOut,
          poolAddress: edge.pool.poolAddress,
          dexId: edge.dexId,
          fee: edge.fee,
        };

        const newPath = [...current.path, hop];

        // Calculate distance (lower = better)
        // Use negative log of liquidity so higher liquidity = lower distance
        const liquidityScore = edge.liquidity > 0n
          ? Math.log(Number(edge.liquidity) / 1e18 + 1)
          : 0;
        const newDistance = current.distance - liquidityScore + edge.fee * 100;

        if (nextToken === tokenOutLower) {
          // Found a route!
          const path = [tokenInLower, ...newPath.map((h) => h.tokenOut.toLowerCase())];
          routes.push(this.createRoute(newPath, path));

          if (routes.length >= this.MAX_ROUTES) {
            break;
          }
        } else {
          // Continue exploring
          queue.push({
            token: nextToken,
            path: newPath,
            distance: newDistance,
          });
        }
      }

      if (routes.length >= this.MAX_ROUTES) {
        break;
      }
    }

    // Sort by estimated gas then by hop count
    routes.sort((a, b) => {
      if (a.totalHops !== b.totalHops) {
        return a.totalHops - b.totalHops;
      }
      return a.estimatedGas - b.estimatedGas;
    });

    return routes.slice(0, this.MAX_ROUTES);
  }

  /**
   * Format route for logging
   */
  formatRoute(route: DiscoveredRoute): string {
    const pathStr = route.path.map((t) => t.slice(0, 8)).join(' -> ');
    const dexes = route.hops.map((h) => h.dexId).join(', ');
    return `${pathStr} via [${dexes}] (${route.totalHops} hops, ~${route.estimatedGas} gas)`;
  }

  /**
   * Discover pools for relevant token pairs
   * Called before finding routes to ensure pools exist in DB
   * Uses DYNAMIC bridge tokens from DB + all known tokens from constants
   */
  private async discoverRelevantPools(
    chainId: number,
    tokenIn: string,
    tokenOut: string,
  ): Promise<void> {
    // Get bridge tokens from multiple sources (fully dynamic)
    const bridgeAddresses = await this.getBridgeTokens(chainId, tokenIn, tokenOut);

    // Collect all unique pairs to check
    const pairsToCheck: [string, string][] = [];

    // Direct pair
    pairsToCheck.push([tokenIn, tokenOut]);

    // TokenIn <-> Bridge tokens
    for (const bridge of bridgeAddresses) {
      if (bridge !== tokenIn && bridge !== tokenOut) {
        pairsToCheck.push([tokenIn, bridge]);
        pairsToCheck.push([bridge, tokenOut]);
      }
    }

    // Bridge <-> Bridge (for 3-hop routes, limit to top 3 to reduce calls)
    const topBridges = bridgeAddresses.slice(0, 3);
    for (let i = 0; i < topBridges.length; i++) {
      for (let j = i + 1; j < topBridges.length; j++) {
        pairsToCheck.push([topBridges[i], topBridges[j]]);
      }
    }

    this.logger.log(`[Pathfinder] Discovering ${pairsToCheck.length} pairs...`);

    // Discover all pairs - multicall + cache makes this fast
    await Promise.all(
      pairsToCheck.map(([a, b]) =>
        this.poolDiscoveryService.discoverPoolsForPair(chainId, a, b)
      )
    );
  }

  /**
   * Get bridge tokens dynamically
   * OPTIMIZED: Only use high-liquidity bridge tokens to reduce RPC calls
   */
  private async getBridgeTokens(
    chainId: number,
    tokenIn: string,
    tokenOut: string,
  ): Promise<string[]> {
    // Priority bridge tokens per chain (most liquid pairs)
    const PRIORITY_BRIDGES: Record<number, string[]> = {
      1: ['WETH', 'USDC', 'USDT', 'DAI', 'WBTC'],
      11155111: ['WETH', 'USDC', 'DAI', 'LINK', 'UNI'], // Sepolia
      42161: ['WETH', 'USDC', 'USDT', 'DAI', 'ARB'],
      137: ['WMATIC', 'WETH', 'USDC', 'USDT', 'DAI'],
      56: ['WBNB', 'USDC', 'USDT', 'BUSD', 'WETH'],
    };

    const bridgeSymbols = PRIORITY_BRIDGES[chainId] || PRIORITY_BRIDGES[1];
    const chainTokens = TOKEN_ADDRESSES[chainId] || {};
    const bridgeAddresses: string[] = [];

    // Convert priority symbols to addresses
    for (const symbol of bridgeSymbols) {
      const address = chainTokens[symbol];
      if (address && address !== '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE') {
        const lower = address.toLowerCase();
        if (lower !== tokenIn.toLowerCase() && lower !== tokenOut.toLowerCase()) {
          bridgeAddresses.push(lower);
        }
      }
    }

    // Also add any tokens we already have pools for in DB (they're known to work)
    const dbTokens = await this.poolService.getUniqueTokens(chainId);
    for (const token of dbTokens.slice(0, 5)) { // Limit to 5 from DB
      const lower = token.toLowerCase();
      if (!bridgeAddresses.includes(lower) &&
          lower !== tokenIn.toLowerCase() &&
          lower !== tokenOut.toLowerCase()) {
        bridgeAddresses.push(lower);
      }
    }

    return bridgeAddresses.slice(0, 8); // Max 8 bridge tokens
  }
}
