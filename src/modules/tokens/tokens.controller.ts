import {
  Controller,
  Get,
  Query,
  Param,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { TokensService } from './tokens.service';

@ApiTags('tokens')
@Controller('tokens')
export class TokensController {
  constructor(private readonly tokensService: TokensService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated token list for a chain' })
  @ApiQuery({ name: 'chainId', required: true, type: Number, description: 'Chain ID' })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10, max: 50)',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search by symbol, name or address',
  })
  getTokens(
    @Query('chainId') chainId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    if (!chainId) {
      throw new BadRequestException('chainId is required');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId)) {
      throw new BadRequestException('Invalid chainId');
    }

    const parsedPage = page ? parseInt(page, 10) : 1;
    if (isNaN(parsedPage) || parsedPage < 1) {
      throw new BadRequestException('Invalid page number');
    }

    let parsedLimit = limit ? parseInt(limit, 10) : 10;
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      throw new BadRequestException('Invalid limit');
    }
    // Cap limit at 50
    parsedLimit = Math.min(parsedLimit, 50);

    return this.tokensService.getTokens(parsedChainId, parsedPage, parsedLimit, search);
  }

  @Get('native')
  @ApiOperation({ summary: 'Get native token for a chain' })
  @ApiQuery({ name: 'chainId', required: true, type: Number })
  getNativeToken(@Query('chainId') chainId: string) {
    if (!chainId) {
      throw new BadRequestException('chainId is required');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId)) {
      throw new BadRequestException('Invalid chainId');
    }

    const token = this.tokensService.getNativeToken(parsedChainId);
    if (!token) {
      throw new NotFoundException('Chain not supported');
    }

    return token;
  }

  @Get('chains')
  @ApiOperation({ summary: 'Get list of supported chain IDs' })
  getSupportedChains() {
    return {
      chains: this.tokensService.getSupportedChains(),
    };
  }

  @Get(':symbolOrAddress')
  @ApiOperation({ summary: 'Get token by symbol or address' })
  @ApiParam({ name: 'symbolOrAddress', description: 'Token symbol or contract address' })
  @ApiQuery({ name: 'chainId', required: true, type: Number })
  getToken(@Param('symbolOrAddress') symbolOrAddress: string, @Query('chainId') chainId: string) {
    if (!chainId) {
      throw new BadRequestException('chainId is required');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId)) {
      throw new BadRequestException('Invalid chainId');
    }

    const token = this.tokensService.getToken(parsedChainId, symbolOrAddress);
    if (!token) {
      throw new NotFoundException('Token not found');
    }

    return token;
  }
}
