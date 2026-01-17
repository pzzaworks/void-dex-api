import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class AcceptTermsDto {
  @ApiProperty({ description: 'The terms acceptance message that was signed' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ description: 'Wallet signature of the message' })
  @IsString()
  @IsNotEmpty()
  signature: string;
}

export class TermsStatusDto {
  @ApiProperty()
  accepted: boolean;

  @ApiProperty({ nullable: true })
  version: string | null;

  @ApiProperty({ nullable: true })
  acceptedAt: Date | null;
}

export class TermsMessageDto {
  @ApiProperty()
  message: string;

  @ApiProperty()
  nonce: string;

  @ApiProperty()
  version: string;
}
