import { Injectable } from '@nestjs/common';

export interface DexProtocol {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'maintenance' | 'coming_soon';
  supportedChains: number[];
  features: string[];
  avgGasCost: string;
  avgTime: string;
  liquidity: 'high' | 'medium' | 'low';
}

export interface PrivacyInfo {
  provider: string;
  name: string;
  description: string;
  privacyScore: number;
  supportedChains: number[];
  features: string[];
}

@Injectable()
export class ProtocolService {
  private readonly dexProtocols: DexProtocol[] = [
    {
      id: 'uniswap_v3',
      name: 'Uniswap V3',
      description: 'Leading DEX with concentrated liquidity',
      status: 'active',
      supportedChains: [1, 137, 42161, 10, 8453, 11155111], // Added Sepolia
      features: ['Concentrated liquidity', 'Low slippage', 'Deep liquidity', 'Multi-hop swaps'],
      avgGasCost: '~0.003 ETH',
      avgTime: '< 1 min',
      liquidity: 'high',
    },
    {
      id: '1inch',
      name: '1inch',
      description: 'DEX aggregator for best prices across multiple DEXes',
      status: 'active',
      supportedChains: [1, 137, 42161, 56, 10, 8453, 43114, 11155111], // Added Sepolia
      features: [
        'Multi-DEX aggregation',
        'Best price routing',
        'Gas optimization',
        'Partial fills',
      ],
      avgGasCost: '~0.004 ETH',
      avgTime: '< 1 min',
      liquidity: 'high',
    },
  ];

  private readonly privacyProvider: PrivacyInfo = {
    provider: 'railgun',
    name: 'Railgun',
    description: 'Full privacy with zkSNARK proofs for shielding and private transactions',
    privacyScore: 95,
    supportedChains: [1, 137, 42161, 56, 11155111], // Added Sepolia
    features: ['zkSNARK proofs', 'Private balances', 'DeFi integration', 'Cross-chain'],
  };

  getAllDexProtocols(): DexProtocol[] {
    return this.dexProtocols;
  }

  getActiveDexProtocols(): DexProtocol[] {
    return this.dexProtocols.filter((p) => p.status === 'active');
  }

  getDexProtocolById(id: string): DexProtocol | undefined {
    return this.dexProtocols.find((p) => p.id === id);
  }

  getDexProtocolsForChain(chainId: number): DexProtocol[] {
    return this.dexProtocols.filter(
      (p) => p.status === 'active' && p.supportedChains.includes(chainId),
    );
  }

  getPrivacyProvider(): PrivacyInfo {
    return this.privacyProvider;
  }

  isPrivacySupportedOnChain(chainId: number): boolean {
    return this.privacyProvider.supportedChains.includes(chainId);
  }

  getBestDexForChain(chainId: number): DexProtocol | null {
    const available = this.getDexProtocolsForChain(chainId);
    if (available.length === 0) return null;

    // Prefer high liquidity
    return available.reduce((best, current) => {
      const liquidityOrder = { high: 3, medium: 2, low: 1 };
      return liquidityOrder[current.liquidity] > liquidityOrder[best.liquidity] ? current : best;
    });
  }
}
