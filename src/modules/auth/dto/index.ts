import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEthereumAddress } from 'class-validator';

export class GetNonceDto {
  @ApiProperty({ example: '0x1234...5678' })
  @IsEthereumAddress()
  address: string;
}

export class VerifySignatureDto {
  @ApiProperty({ description: 'SIWE message' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ description: 'Wallet signature' })
  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty()
  user: {
    id: string;
    walletAddress: string;
    termsAccepted: boolean;
  };
}
