import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProtocolService } from './protocol.service';

@ApiTags('protocols')
@Controller('protocols')
export class ProtocolController {
  constructor(private readonly protocolService: ProtocolService) {}

  @Get('dex')
  @ApiOperation({ summary: 'Get all supported DEX protocols' })
  getAllDexProtocols() {
    return this.protocolService.getAllDexProtocols();
  }

  @Get('dex/active')
  @ApiOperation({ summary: 'Get active DEX protocols' })
  getActiveDexProtocols() {
    return this.protocolService.getActiveDexProtocols();
  }

  @Get('dex/chain/:chainId')
  @ApiOperation({ summary: 'Get DEX protocols available for a specific chain' })
  getDexProtocolsForChain(@Param('chainId') chainId: string) {
    return this.protocolService.getDexProtocolsForChain(parseInt(chainId, 10));
  }

  @Get('dex/:id')
  @ApiOperation({ summary: 'Get DEX protocol by ID' })
  getDexProtocolById(@Param('id') id: string) {
    return this.protocolService.getDexProtocolById(id);
  }

  @Get('dex/recommend')
  @ApiOperation({ summary: 'Get recommended DEX for a chain' })
  @ApiQuery({ name: 'chainId', required: true })
  getBestDex(@Query('chainId') chainId: string) {
    return this.protocolService.getBestDexForChain(parseInt(chainId, 10));
  }

  @Get('privacy')
  @ApiOperation({ summary: 'Get privacy provider info (Railgun)' })
  getPrivacyProvider() {
    return this.protocolService.getPrivacyProvider();
  }

  @Get('privacy/supported/:chainId')
  @ApiOperation({ summary: 'Check if privacy is supported on a chain' })
  isPrivacySupportedOnChain(@Param('chainId') chainId: string) {
    const supported = this.protocolService.isPrivacySupportedOnChain(parseInt(chainId, 10));
    return {
      chainId: parseInt(chainId, 10),
      privacySupported: supported,
      provider: supported ? 'railgun' : null,
    };
  }
}
