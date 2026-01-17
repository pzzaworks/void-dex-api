import { Controller, Get, Query, BadRequestException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { QuoteService } from './quote.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TermsAcceptedGuard } from '../../common/guards/terms-accepted.guard';
import { PathfinderService } from './services/pathfinder.service';

@ApiTags('quote')
@Controller('quote')
export class QuoteController {
  constructor(
    private readonly quoteService: QuoteService,
    private readonly pathfinderService: PathfinderService,
  ) {}

  // Test endpoint for route discovery (no auth)
  @Get('routes')
  @ApiOperation({ summary: 'Discover all possible routes between tokens' })
  @ApiQuery({ name: 'chainId', required: true, type: Number })
  @ApiQuery({ name: 'fromToken', required: true, type: String })
  @ApiQuery({ name: 'toToken', required: true, type: String })
  async getRoutes(
    @Query('chainId') chainId: string,
    @Query('fromToken') fromToken: string,
    @Query('toToken') toToken: string,
  ) {
    const routes = await this.pathfinderService.findRoutes(
      parseInt(chainId, 10),
      fromToken,
      toToken,
    );

    return {
      chainId: parseInt(chainId, 10),
      fromToken,
      toToken,
      routeCount: routes.length,
      routes: routes.map((route) => ({
        path: route.path,
        hops: route.totalHops,
        estimatedGas: route.estimatedGas,
        dexes: route.hops.map((h) => h.dexId),
        pools: route.hops.map((h) => h.poolAddress),
      })),
    };
  }

  // Temporary test endpoint without auth (remove in production)
  @Get('test')
  @ApiOperation({ summary: 'Test quote endpoint (no auth)' })
  @ApiQuery({ name: 'chainId', required: true, type: Number })
  @ApiQuery({ name: 'fromToken', required: true, type: String })
  @ApiQuery({ name: 'toToken', required: true, type: String })
  @ApiQuery({ name: 'amount', required: true, type: String })
  async getTestQuote(
    @Query('chainId') chainId: string,
    @Query('fromToken') fromToken: string,
    @Query('toToken') toToken: string,
    @Query('amount') amount: string,
  ) {
    return this.quoteService.getQuote({
      chainId: parseInt(chainId, 10),
      fromToken,
      toToken,
      amount,
      type: 'exactInput',
    });
  }

  @Get()
  @UseGuards(JwtAuthGuard, TermsAcceptedGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get swap quote with optimal route' })
  @ApiQuery({ name: 'chainId', required: true, type: Number })
  @ApiQuery({
    name: 'fromToken',
    required: true,
    type: String,
    description: 'Token address or symbol',
  })
  @ApiQuery({
    name: 'toToken',
    required: true,
    type: String,
    description: 'Token address or symbol',
  })
  @ApiQuery({
    name: 'fromTokenSymbol',
    required: false,
    type: String,
    description: 'Token symbol for display',
  })
  @ApiQuery({
    name: 'toTokenSymbol',
    required: false,
    type: String,
    description: 'Token symbol for display',
  })
  @ApiQuery({ name: 'amount', required: true, type: String })
  @ApiQuery({
    name: 'slippage',
    required: false,
    type: Number,
    description: 'Slippage tolerance in percentage (default: 0.5)',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['exactInput', 'exactOutput'],
    description: 'Quote type: exactInput (specify sell amount) or exactOutput (specify buy amount)',
  })
  async getQuote(
    @Query('chainId') chainId: string,
    @Query('fromToken') fromToken: string,
    @Query('toToken') toToken: string,
    @Query('fromTokenSymbol') fromTokenSymbol?: string,
    @Query('toTokenSymbol') toTokenSymbol?: string,
    @Query('amount') amount?: string,
    @Query('slippage') slippage?: string,
    @Query('type') type?: 'exactInput' | 'exactOutput',
  ) {
    if (!chainId || !fromToken || !toToken || !amount) {
      throw new BadRequestException('Missing required parameters');
    }

    const parsedChainId = parseInt(chainId, 10);
    if (isNaN(parsedChainId)) {
      throw new BadRequestException('Invalid chainId');
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      throw new BadRequestException('Invalid amount');
    }

    return this.quoteService.getQuote({
      chainId: parsedChainId,
      fromToken,
      toToken,
      fromTokenSymbol: fromTokenSymbol?.toUpperCase(),
      toTokenSymbol: toTokenSymbol?.toUpperCase(),
      amount,
      slippage: slippage ? parseFloat(slippage) : undefined,
      type: type || 'exactInput',
    });
  }
}
