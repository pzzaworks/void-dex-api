import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PoolService } from './pool.service';
import { DEX_CONTRACTS, TOKEN_ADDRESSES } from '../../constants';

/**
 * Temporary pool seeder for testing
 * This will be replaced by Subsquid indexer
 */
@Injectable()
export class PoolSeedService implements OnModuleInit {
  private readonly logger = new Logger(PoolSeedService.name);

  constructor(private readonly poolService: PoolService) {}

  async onModuleInit() {
    // Seed pools on startup (will skip if already seeded)
    await this.seedSepoliaTestPools();
  }

  /**
   * Seed known Sepolia testnet pools
   */
  private async seedSepoliaTestPools() {
    const chainId = 11155111;
    const tokens = TOKEN_ADDRESSES[chainId];
    const dexContracts = DEX_CONTRACTS[chainId];

    if (!tokens || !dexContracts) {
      return;
    }

    // Known Sepolia Uniswap V3 pools with liquidity
    const knownPools = [
      // WETH / USDC pools
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f7', // WETH/USDC 0.3%
        token0: tokens.WETH,
        token1: tokens.USDC,
        fee: 3000,
        liquidity: '1000000000000000000', // Placeholder
      },
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1', // WETH/USDC 1%
        token0: tokens.WETH,
        token1: tokens.USDC,
        fee: 10000,
        liquidity: '500000000000000000',
      },
      // WETH / UNI pool (has good liquidity on Sepolia)
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x287B0e934ed0439E2a7b1d5F0FC25eA2c24b64f8', // WETH/UNI 0.3%
        token0: tokens.WETH,
        token1: tokens.UNI,
        fee: 3000,
        liquidity: '2000000000000000000',
      },
      // USDC / DAI pool (for multi-hop)
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7239', // USDC/DAI 0.05%
        token0: tokens.USDC,
        token1: tokens.DAI,
        fee: 500,
        liquidity: '100000000000000000',
      },
      // WETH / LINK pool
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x779877A7B0D9E8603169DdbD7836e478b4624780', // WETH/LINK 0.3%
        token0: tokens.WETH,
        token1: tokens.LINK,
        fee: 3000,
        liquidity: '300000000000000000',
      },
    ];

    // Check if we already have pools
    const existingCount = await this.poolService.getPoolCount(chainId);
    if (existingCount > 0) {
      this.logger.log(`[PoolSeed] ${existingCount} pools already exist for chain ${chainId}`);
      return;
    }

    // Seed pools
    for (const pool of knownPools) {
      try {
        await this.poolService.upsertPool(pool);
        this.logger.log(`[PoolSeed] Added pool ${pool.poolAddress.slice(0, 10)}... (${pool.dexId})`);
      } catch (error) {
        this.logger.warn(`[PoolSeed] Failed to add pool: ${error.message}`);
      }
    }

    this.logger.log(`[PoolSeed] Seeded ${knownPools.length} test pools for Sepolia`);
  }

  /**
   * Seed Ethereum mainnet pools (call manually)
   */
  async seedMainnetPools() {
    const chainId = 1;
    const tokens = TOKEN_ADDRESSES[chainId];

    // Popular mainnet pools - these would normally come from Subsquid
    const pools = [
      // WETH / USDC
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640', // 0.05% fee
        token0: tokens.USDC,
        token1: tokens.WETH,
        fee: 500,
        liquidity: '50000000000000000000000', // High liquidity
      },
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x8ad599c3A0ff1De082011EFDDc58f1908eb6e6D8', // 0.3% fee
        token0: tokens.USDC,
        token1: tokens.WETH,
        fee: 3000,
        liquidity: '30000000000000000000000',
      },
      // WETH / USDT
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x4e68Ccd3E89f51C3074ca5072bbAC773960dFa36', // 0.3%
        token0: tokens.WETH,
        token1: tokens.USDT,
        fee: 3000,
        liquidity: '20000000000000000000000',
      },
      // USDC / USDT (stablecoin pair)
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0x3416cF6C708Da44DB2624D63ea0AAef7113527C6', // 0.01%
        token0: tokens.USDC,
        token1: tokens.USDT,
        fee: 100,
        liquidity: '100000000000000000000000',
      },
      // WETH / DAI
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0xC2e9F25Be6257c210d7Adf0D4Cd6E3E881ba25f8', // 0.3%
        token0: tokens.DAI,
        token1: tokens.WETH,
        fee: 3000,
        liquidity: '15000000000000000000000',
      },
      // WETH / WBTC
      {
        chainId,
        dexId: 'uniswap_v3',
        poolAddress: '0xCBCdF9626bC03E24f779434178A73a0B4bad62eD', // 0.3%
        token0: tokens.WBTC,
        token1: tokens.WETH,
        fee: 3000,
        liquidity: '25000000000000000000000',
      },
      // V2 pools
      {
        chainId,
        dexId: 'uniswap_v2',
        poolAddress: '0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc', // USDC/WETH
        token0: tokens.USDC,
        token1: tokens.WETH,
        liquidity: '40000000000000000000000',
      },
      {
        chainId,
        dexId: 'sushiswap',
        poolAddress: '0x397FF1542f962076d0BFE58eA045FfA2d347ACa0', // USDC/WETH
        token0: tokens.USDC,
        token1: tokens.WETH,
        liquidity: '10000000000000000000000',
      },
    ];

    for (const pool of pools) {
      await this.poolService.upsertPool(pool);
    }

    this.logger.log(`[PoolSeed] Seeded ${pools.length} mainnet pools`);
  }
}
