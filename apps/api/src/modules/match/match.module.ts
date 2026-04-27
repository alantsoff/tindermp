import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ActivityScoreService } from './activity-score.service';
import { ChatService } from './chat.service';
import { EventLoggerService } from './event-logger.service';
import { FeedService } from './feed.service';
import { InviteService } from './invite.service';
import { MatchAdminGuard } from './match-admin.guard';
import { MatchController } from './match.controller';
import { MatchMaintenanceService } from './match-maintenance.service';
import { MatchAuthGuard } from './match-auth.guard';
import { MatchAuthService } from './match-auth.service';
import { NotificationService } from './notification.service';
import { PhotosService } from './photos.service';
import { ProfileService } from './profile.service';
import { SwipeService } from './swipe.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MatchController],
  providers: [
    MatchAuthGuard,
    MatchAdminGuard,
    MatchAuthService,
    InviteService,
    EventLoggerService,
    NotificationService,
    ProfileService,
    FeedService,
    SwipeService,
    PhotosService,
    ChatService,
    ActivityScoreService,
    MatchMaintenanceService,
  ],
  exports: [
    MatchAuthService,
    MatchAuthGuard,
    MatchAdminGuard,
    InviteService,
    EventLoggerService,
    NotificationService,
  ],
})
export class MatchModule {}
