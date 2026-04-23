import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AdminWebAuthService } from './admin-web-auth.service';
import { AdminWebGuard } from './admin-web.guard';

@Controller('match-admin/auth')
export class MatchAdminAuthController {
  constructor(private readonly authService: AdminWebAuthService) {}

  @Post('login')
  login(@Body() dto: AdminLoginDto) {
    return this.authService.login(dto.telegramId, dto.password);
  }

  @Get('me')
  @UseGuards(AdminWebGuard)
  me(@Req() req: { adminUser?: { userId: string; telegramId: string } }) {
    return {
      ok: true,
      userId: req.adminUser?.userId ?? null,
      telegramId: req.adminUser?.telegramId ?? null,
    };
  }
}
