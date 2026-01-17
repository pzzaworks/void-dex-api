import { Controller, Post, Body, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { VerifySignatureDto, AuthResponseDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('nonce')
  @ApiOperation({ summary: 'Get nonce for SIWE authentication' })
  @ApiResponse({ status: 200, description: 'Returns a nonce for signing' })
  async getNonce(@Query('address') address: string): Promise<{ nonce: string }> {
    const nonce = await this.authService.getNonce(address);
    return { nonce };
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify SIWE signature and get JWT token' })
  @ApiResponse({
    status: 200,
    description: 'Returns JWT token and user info',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async verify(@Body() dto: VerifySignatureDto): Promise<AuthResponseDto> {
    return this.authService.verifySignature(dto.message, dto.signature);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info from JWT' })
  @ApiResponse({
    status: 200,
    description: 'Returns current user info',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  getMe(@CurrentUser() user: User): { id: string; walletAddress: string; termsAccepted: boolean } {
    return {
      id: user.id,
      walletAddress: user.walletAddress,
      termsAccepted: user.termsAccepted,
    };
  }
}
