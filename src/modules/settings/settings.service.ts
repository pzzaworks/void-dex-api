import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSettings } from '../../database/entities';

// Network configuration
export interface NetworkConfig {
  chainId: number;
  name: string;
  enabled: boolean;
  isTestnet: boolean;
}

// Default settings
const DEFAULT_SETTINGS = {
  enabled_networks: {
    value: {
      networks: [
        { chainId: 11155111, name: 'Sepolia', enabled: true, isTestnet: true },
        { chainId: 1, name: 'Ethereum', enabled: false, isTestnet: false },
        { chainId: 42161, name: 'Arbitrum', enabled: false, isTestnet: false },
        { chainId: 137, name: 'Polygon', enabled: false, isTestnet: false },
        { chainId: 56, name: 'BSC', enabled: false, isTestnet: false },
      ],
    },
    description: 'List of supported networks and their enabled status',
  },
  maintenance_mode: {
    value: { enabled: false, message: '' },
    description: 'Global maintenance mode toggle',
  },
  swap_enabled: {
    value: { enabled: true },
    description: 'Enable/disable swap functionality',
  },
};

@Injectable()
export class SettingsService implements OnModuleInit {
  constructor(
    @InjectRepository(AppSettings)
    private readonly settingsRepository: Repository<AppSettings>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultSettings();
  }

  private async seedDefaultSettings() {
    for (const [key, config] of Object.entries(DEFAULT_SETTINGS)) {
      const existing = await this.settingsRepository.findOne({ where: { key } });
      if (!existing) {
        await this.settingsRepository.save({
          key,
          value: config.value,
          description: config.description,
        });
      }
    }
  }

  async getSetting(key: string): Promise<AppSettings | null> {
    return this.settingsRepository.findOne({ where: { key } });
  }

  async getEnabledNetworks(): Promise<NetworkConfig[]> {
    const setting = await this.getSetting('enabled_networks');
    if (!setting) return [];

    const networks = setting.value.networks as NetworkConfig[];
    return networks.filter((n) => n.enabled);
  }

  async getAllNetworks(): Promise<NetworkConfig[]> {
    const setting = await this.getSetting('enabled_networks');
    if (!setting) return [];

    return setting.value.networks as NetworkConfig[];
  }

  async getPublicSettings(): Promise<Record<string, unknown>> {
    const [networks, maintenance, swap] = await Promise.all([
      this.getSetting('enabled_networks'),
      this.getSetting('maintenance_mode'),
      this.getSetting('swap_enabled'),
    ]);

    return {
      networks: networks?.value.networks || [],
      maintenance: maintenance?.value || { enabled: false },
      swapEnabled: swap?.value.enabled ?? true,
    };
  }

  async updateSetting(key: string, value: Record<string, unknown>): Promise<AppSettings> {
    let setting = await this.settingsRepository.findOne({ where: { key } });

    if (setting) {
      setting.value = value;
    } else {
      setting = this.settingsRepository.create({ key, value });
    }

    return this.settingsRepository.save(setting);
  }

  async setNetworkEnabled(chainId: number, enabled: boolean): Promise<void> {
    const setting = await this.getSetting('enabled_networks');
    if (!setting) return;

    const networks = setting.value.networks as NetworkConfig[];
    const network = networks.find((n) => n.chainId === chainId);

    if (network) {
      network.enabled = enabled;
      await this.updateSetting('enabled_networks', { networks });
    }
  }
}
