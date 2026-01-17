import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QuoteController } from './quote.controller';
import { QuoteService } from './quote.service';
import {
  PriceService,
  FeeCalculatorService,
  RouteOptimizerService,
  DexQuoteService,
} from './services';
import { LiquidityGraphService } from './services/liquidity-graph.service';
import { PathfinderService } from './services/pathfinder.service';
import { RouteQuoteService } from './services/route-quote.service';
import { ProtocolModule } from '../protocol/protocol.module';
import { PoolModule } from '../pool/pool.module';

@Module({
  imports: [ConfigModule, ProtocolModule, PoolModule],
  controllers: [QuoteController],
  providers: [
    QuoteService,
    PriceService,
    FeeCalculatorService,
    RouteOptimizerService,
    DexQuoteService,
    LiquidityGraphService,
    PathfinderService,
    RouteQuoteService,
  ],
  exports: [QuoteService],
})
export class QuoteModule {}
