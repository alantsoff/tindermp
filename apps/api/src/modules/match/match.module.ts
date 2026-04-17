import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { FeedService } from './feed.service';
import { MatchController } from './match.controller';
import { MatchAuthGuard } from './match-auth.guard';
import { MatchAuthService } from './match-auth.service';
import { ProfileService } from './profile.service';
import { SwipeService } from './swipe.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MatchController],
  providers: [
    MatchAuthGuard,
    MatchAuthService,
    ProfileService,
    FeedService,
    SwipeService,
    ChatService,
  ],
})
export class MatchModule {}
