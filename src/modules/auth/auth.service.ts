import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { verifyMessage } from 'viem';
import { User } from '../../database/entities';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
  ) {}

  async getNonce(walletAddress: string): Promise<string> {
    const nonce = this.generateNonce();
    const normalizedAddress = walletAddress.toLowerCase();

    let user = await this.userRepository.findOne({
      where: { walletAddress: normalizedAddress },
    });

    if (!user) {
      user = this.userRepository.create({
        walletAddress: normalizedAddress,
        nonce,
      });
    } else {
      user.nonce = nonce;
    }

    await this.userRepository.save(user);
    return nonce;
  }

  async verifySignature(
    message: string,
    signature: string,
  ): Promise<{ accessToken: string; user: { id: string; walletAddress: string; termsAccepted: boolean } }> {
    try {
      // Parse SIWE message
      const parsedMessage = this.parseSiweMessage(message);

      // Verify signature with viem
      const isValid = await verifyMessage({
        address: parsedMessage.address as `0x${string}`,
        message,
        signature: signature as `0x${string}`,
      });

      if (!isValid) {
        throw new UnauthorizedException('Invalid signature');
      }

      const normalizedAddress = parsedMessage.address.toLowerCase();
      const user = await this.userRepository.findOne({
        where: { walletAddress: normalizedAddress },
      });

      if (!user || user.nonce !== parsedMessage.nonce) {
        throw new UnauthorizedException('Invalid nonce');
      }

      user.nonce = null;

      // Auto-accept terms if SIWE message contains terms acceptance
      if (!user.termsAccepted && this.messageContainsTermsAcceptance(message)) {
        user.termsAccepted = true;
        user.termsSignature = signature;
        user.termsVersion = '1.0';
        user.termsAcceptedAt = new Date();
      }

      await this.userRepository.save(user);

      const payload = {
        sub: user.id,
        address: user.walletAddress,
      };

      return {
        accessToken: this.jwtService.sign(payload),
        user: {
          id: user.id,
          walletAddress: user.walletAddress,
          termsAccepted: user.termsAccepted,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Signature verification failed');
    }
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  private generateNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }

  private messageContainsTermsAcceptance(message: string): boolean {
    return message.includes('I accept the VoidDex Terms of Service and Privacy Policy');
  }

  private parseSiweMessage(message: string): { address: string; nonce: string } {
    // Parse SIWE message format
    // Example: domain wants you to sign in with your Ethereum account:\n0x123...\n\nStatement\n\nURI: https://...\nVersion: 1\nChain ID: 1\nNonce: abc123\n...

    const addressMatch = message.match(/0x[a-fA-F0-9]{40}/);
    const nonceMatch = message.match(/Nonce: ([^\n]+)/);

    if (!addressMatch || !nonceMatch) {
      throw new UnauthorizedException('Invalid SIWE message format');
    }

    return {
      address: addressMatch[0],
      nonce: nonceMatch[1],
    };
  }
}
