import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TermsService } from './terms.service';
import { AcceptTermsDto, TermsStatusDto, TermsMessageDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities';

@ApiTags('terms')
@Controller('terms')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get terms acceptance status for current user' })
  @ApiResponse({
    status: 200,
    description: 'Returns terms acceptance status',
    type: TermsStatusDto,
  })
  getStatus(@CurrentUser() user: User): TermsStatusDto {
    return this.termsService.getTermsStatus(user);
  }

  @Get('message')
  @ApiOperation({ summary: 'Get the terms message to sign' })
  @ApiResponse({
    status: 200,
    description: 'Returns the message to be signed',
    type: TermsMessageDto,
  })
  getMessage(@CurrentUser() user: User): TermsMessageDto {
    return this.termsService.generateTermsMessage(user);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Accept terms by submitting signed message' })
  @ApiResponse({
    status: 200,
    description: 'Terms accepted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid signature or message',
  })
  async accept(
    @CurrentUser() user: User,
    @Body() dto: AcceptTermsDto,
  ): Promise<{ accepted: boolean; version: string; acceptedAt: Date }> {
    return this.termsService.acceptTerms(user, dto.message, dto.signature);
  }
}
