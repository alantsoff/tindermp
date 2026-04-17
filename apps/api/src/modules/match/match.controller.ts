import {
  Body,
  ConflictException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthInitDto } from './dto/auth-init.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SwipeDto } from './dto/swipe.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { ChatService } from './chat.service';
import { FeedService } from './feed.service';
import { MatchAuthGuard } from './match-auth.guard';
import { MatchAuthService } from './match-auth.service';
import { ProfileService } from './profile.service';
import { SwipeService } from './swipe.service';

type MatchRequest = {
  matchUser?: { userId: string; profileId: string | null };
};

@Controller('match-api')
export class MatchController {
  constructor(
    private readonly authService: MatchAuthService,
    private readonly profileService: ProfileService,
    private readonly feedService: FeedService,
    private readonly swipeService: SwipeService,
    private readonly chatService: ChatService,
  ) {}

  private requireProfileId(req: MatchRequest): string {
    const profileId = req.matchUser?.profileId;
    if (!profileId) {
      throw new ConflictException('profile_required');
    }
    return profileId;
  }

  @Post('auth')
  auth(@Body() dto: AuthInitDto) {
    return this.authService.authenticateByInitData(dto.initData);
  }

  @Get('me')
  @UseGuards(MatchAuthGuard)
  me(@Req() req: MatchRequest) {
    const userId = req.matchUser?.userId;
    if (!userId) {
      throw new ConflictException('profile_required');
    }
    return this.profileService.getMe(userId);
  }

  @Post('profile')
  @UseGuards(MatchAuthGuard)
  upsertProfile(@Req() req: MatchRequest, @Body() dto: UpsertProfileDto) {
    const userId = req.matchUser?.userId;
    if (!userId) {
      throw new ConflictException('profile_required');
    }
    return this.profileService.upsertProfile(userId, dto);
  }

  @Get('settings')
  @UseGuards(MatchAuthGuard)
  getSettings(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.profileService.getSettings(profileId);
  }

  @Post('settings')
  @UseGuards(MatchAuthGuard)
  updateSettings(@Req() req: MatchRequest, @Body() dto: UpdateSettingsDto) {
    const profileId = this.requireProfileId(req);
    return this.profileService.updateSettings(profileId, dto);
  }

  @Get('feed')
  @UseGuards(MatchAuthGuard)
  getFeed(@Req() req: MatchRequest, @Query('limit') limitRaw?: string) {
    const profileId = this.requireProfileId(req);
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return this.feedService.getFeed(profileId, limit);
  }

  @Post('swipe')
  @UseGuards(MatchAuthGuard)
  swipe(@Req() req: MatchRequest, @Body() dto: SwipeDto) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.swipe(profileId, dto.toProfileId, dto.direction);
  }

  @Post('swipe/undo')
  @UseGuards(MatchAuthGuard)
  undo(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.undoLastSwipe(profileId);
  }

  @Get('matches')
  @UseGuards(MatchAuthGuard)
  getMatches(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.getMatches(profileId);
  }

  @Get('matches/:pairId/messages')
  @UseGuards(MatchAuthGuard)
  getMessages(@Req() req: MatchRequest, @Param('pairId') pairId: string) {
    const profileId = this.requireProfileId(req);
    return this.chatService.getMessages(pairId, profileId);
  }

  @Post('matches/:pairId/messages')
  @UseGuards(MatchAuthGuard)
  sendMessage(
    @Req() req: MatchRequest,
    @Param('pairId') pairId: string,
    @Body() dto: SendMessageDto,
  ) {
    const profileId = this.requireProfileId(req);
    return this.chatService.sendMessage(pairId, profileId, dto.body);
  }
}
