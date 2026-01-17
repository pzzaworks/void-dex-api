import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { User } from '../../database/entities';

@Injectable()
export class TermsAcceptedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as User;

    if (!user || !user.termsAccepted) {
      throw new ForbiddenException(
        'You must accept the Terms of Service and Privacy Policy to access this resource',
      );
    }

    return true;
  }
}
