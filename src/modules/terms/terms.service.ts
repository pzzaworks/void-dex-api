import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { verifyMessage } from 'viem';
import { User } from '../../database/entities';

const CURRENT_TERMS_VERSION = '1.0';

@Injectable()
export class TermsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  getTermsStatus(user: User): {
    accepted: boolean;
    version: string | null;
    acceptedAt: Date | null;
  } {
    return {
      accepted: user.termsAccepted,
      version: user.termsVersion,
      acceptedAt: user.termsAcceptedAt,
    };
  }

  generateTermsMessage(user: User): {
    message: string;
    nonce: string;
    version: string;
  } {
    const nonce = this.generateNonce();
    const timestamp = new Date().toISOString();

    const message = `I accept the VoidDex Terms of Service (v${CURRENT_TERMS_VERSION}) and Privacy Policy.

Wallet: ${user.walletAddress}
Nonce: ${nonce}
Timestamp: ${timestamp}`;

    return {
      message,
      nonce,
      version: CURRENT_TERMS_VERSION,
    };
  }

  async acceptTerms(
    user: User,
    message: string,
    signature: string,
  ): Promise<{ accepted: boolean; version: string; acceptedAt: Date }> {
    // Verify the signature
    const isValid = await verifyMessage({
      address: user.walletAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      throw new BadRequestException('Invalid signature');
    }

    // Verify message contains correct wallet address
    if (!message.toLowerCase().includes(user.walletAddress.toLowerCase())) {
      throw new BadRequestException('Message does not match wallet address');
    }

    // Verify message contains terms acceptance
    if (!message.includes('I accept the VoidDex Terms of Service')) {
      throw new BadRequestException('Invalid terms acceptance message');
    }

    // Extract version from message
    const versionMatch = message.match(/\(v([\d.]+)\)/);
    const version = versionMatch ? versionMatch[1] : CURRENT_TERMS_VERSION;

    const acceptedAt = new Date();

    // Update user record
    user.termsAccepted = true;
    user.termsSignature = signature;
    user.termsVersion = version;
    user.termsAcceptedAt = acceptedAt;

    await this.userRepository.save(user);

    return {
      accepted: true,
      version,
      acceptedAt,
    };
  }

  private generateNonce(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }
}
