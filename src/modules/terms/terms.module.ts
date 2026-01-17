import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TermsController } from './terms.controller';
import { TermsService } from './terms.service';
import { User } from '../../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [TermsController],
  providers: [TermsService],
  exports: [TermsService],
})
export class TermsModule {}
