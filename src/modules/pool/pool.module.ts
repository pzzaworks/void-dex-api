import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pool } from '../../database/entities';
import { PoolService } from './pool.service';
import { PoolDiscoveryService } from './pool-discovery.service';
import { PoolSeedService } from './pool-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Pool])],
  providers: [PoolService, PoolDiscoveryService, PoolSeedService],
  exports: [PoolService, PoolDiscoveryService],
})
export class PoolModule {}
