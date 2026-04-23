import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MatchModule } from '../match/match.module';
import { AdminWebAuthService } from './admin-web-auth.service';
import { AdminWebGuard } from './admin-web.guard';
import { MatchAdminAuthController } from './match-admin-auth.controller';
import { MatchAdminController } from './match-admin.controller';
import { MatchAdminCronService } from './jobs/match-admin-cron.service';
import { MatchAdminService } from './match-admin.service';

@Module({
  imports: [JwtModule.register({}), MatchModule],
  controllers: [MatchAdminAuthController, MatchAdminController],
  providers: [
    AdminWebAuthService,
    AdminWebGuard,
    MatchAdminService,
    MatchAdminCronService,
  ],
})
export class MatchAdminModule {}
