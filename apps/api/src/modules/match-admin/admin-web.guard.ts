import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminWebAuthService } from './admin-web-auth.service';

@Injectable()
export class AdminWebGuard implements CanActivate {
  constructor(private readonly authService: AdminWebAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      headers?: { authorization?: string };
      adminUser?: { userId: string; telegramId: string };
    }>();

    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authorization header required');
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      throw new UnauthorizedException('Token required');
    }
    const payload = await this.authService.verify(token);
    req.adminUser = { userId: payload.uid, telegramId: payload.tid };
    return true;
  }
}
