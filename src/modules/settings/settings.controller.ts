import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get public app settings' })
  async getPublicSettings() {
    return this.settingsService.getPublicSettings();
  }

  @Get('networks')
  @ApiOperation({ summary: 'Get enabled networks' })
  async getEnabledNetworks() {
    return this.settingsService.getEnabledNetworks();
  }
}
