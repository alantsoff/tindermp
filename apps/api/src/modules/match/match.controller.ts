import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { AuthInitDto } from './dto/auth-init.dto';
import { AdminIssueInvitesDto } from './dto/admin-issue-invites.dto';
import { PauseDto } from './dto/pause.dto';
import { RevokeInviteDto } from './dto/revoke-invite.dto';
import { ReorderPhotosDto } from './dto/reorder-photos.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SwipeDto } from './dto/swipe.dto';
import { SuperSwipeDto } from './dto/super-swipe.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpsertProfileDto } from './dto/upsert-profile.dto';
import { ChatService } from './chat.service';
import { FeedService } from './feed.service';
import { InviteService } from './invite.service';
import { MatchAdminGuard } from './match-admin.guard';
import { MatchAuthGuard } from './match-auth.guard';
import { MatchAuthService } from './match-auth.service';
import { ProfileService } from './profile.service';
import { PhotosService } from './photos.service';
import { SwipeService } from './swipe.service';

type MatchRequest = {
  matchUser?: { userId: string; profileId: string | null };
};

@Controller('match-api')
export class MatchController {
  constructor(
    private readonly authService: MatchAuthService,
    private readonly profileService: ProfileService,
    private readonly inviteService: InviteService,
    private readonly feedService: FeedService,
    private readonly swipeService: SwipeService,
    private readonly chatService: ChatService,
    private readonly photosService: PhotosService,
  ) {}

  private requireProfileId(req: MatchRequest): string {
    const profileId = req.matchUser?.profileId;
    if (!profileId) {
      throw new ConflictException('profile_required');
    }
    return profileId;
  }

  // /auth вызывается один раз на открытие мини-аппа, но его валидация
  // initData дорогая (HMAC + upsert в БД) и доступна без авторизации,
  // поэтому лимитируем агрессивно.
  @Post('auth')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
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

  // Через POST /profile выполняется редим инвайт-кода при создании
  // профиля. Без жёсткого лимита этот эндпоинт — главный канал brute-force
  // инвайтов. 5 попыток в минуту достаточно для легитимного пользователя
  // (обычно один успешный upsert), но делает перебор невыгодным.
  @Post('profile')
  @UseGuards(MatchAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
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
  getFeed(
    @Req() req: MatchRequest,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const profileId = this.requireProfileId(req);
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const offset = offsetRaw ? Number.parseInt(offsetRaw, 10) : undefined;
    return this.feedService.getFeed(profileId, limit, offset);
  }

  @Post('swipe')
  @UseGuards(MatchAuthGuard)
  swipe(@Req() req: MatchRequest, @Body() dto: SwipeDto) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.swipe(profileId, dto.toProfileId, dto.direction);
  }

  @Post('swipe/super')
  @UseGuards(MatchAuthGuard)
  superSwipe(@Req() req: MatchRequest, @Body() dto: SuperSwipeDto) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.superSwipe(profileId, dto.toProfileId);
  }

  @Post('swipe/undo')
  @UseGuards(MatchAuthGuard)
  undo(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.undoLastSwipe(profileId);
  }

  @Get('swipe/reset/preview')
  @UseGuards(MatchAuthGuard)
  swipeResetPreview(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.previewReset(profileId);
  }

  @Post('swipe/reset')
  @UseGuards(MatchAuthGuard)
  swipeReset(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.reset(profileId);
  }

  @Post('pause')
  @UseGuards(MatchAuthGuard)
  pause(@Req() req: MatchRequest, @Body() dto: PauseDto) {
    const profileId = this.requireProfileId(req);
    return this.profileService.setPause(profileId, dto.days);
  }

  @Get('invites')
  @UseGuards(MatchAuthGuard)
  invites(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.inviteService.listForProfile(profileId);
  }

  @Post('invites/revoke')
  @UseGuards(MatchAuthGuard)
  revokeInvite(@Req() req: MatchRequest, @Body() dto: RevokeInviteDto) {
    const profileId = this.requireProfileId(req);
    return this.inviteService.revokeByCodeForOwner(profileId, dto.code);
  }

  @Post('admin/invites')
  @UseGuards(MatchAdminGuard)
  adminIssueInvites(@Body() dto: AdminIssueInvitesDto) {
    if (dto.ownerProfileId) {
      return this.inviteService.issueForProfile(
        dto.ownerProfileId,
        dto.count,
        'admin',
      );
    }
    return this.inviteService.issueAdminFree(dto.count);
  }

  @Get('admin/invites')
  @UseGuards(MatchAdminGuard)
  adminListInvites(
    @Query('owner') owner?: string,
    @Query('status') status?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    return this.inviteService.listAdmin({ owner, status, limit });
  }

  @Post('admin/invites/:id/revoke')
  @UseGuards(MatchAdminGuard)
  adminRevokeInvite(@Param('id') id: string) {
    return this.inviteService.revokeById(id);
  }

  @Post('admin/invites/bootstrap')
  @UseGuards(MatchAdminGuard)
  adminBootstrapInvites() {
    return this.inviteService.bootstrapExistingProfiles();
  }

  @Get('admin/invite-tree/:profileId')
  @UseGuards(MatchAdminGuard)
  adminInviteTree(@Param('profileId') profileId: string) {
    return this.inviteService.inviteTree(profileId);
  }

  @Get('matches')
  @UseGuards(MatchAuthGuard)
  getMatches(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.getMatches(profileId);
  }

  @Get('favorites')
  @UseGuards(MatchAuthGuard)
  getFavorites(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.getFavorites(profileId);
  }

  @Delete('favorites/:toProfileId')
  @UseGuards(MatchAuthGuard)
  removeFavorite(
    @Req() req: MatchRequest,
    @Param('toProfileId') toProfileId: string,
  ) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.removeFavorite(profileId, toProfileId);
  }

  @Post('matches/:pairId/read')
  @UseGuards(MatchAuthGuard)
  markPairRead(@Req() req: MatchRequest, @Param('pairId') pairId: string) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.markPairRead(pairId, profileId);
  }

  @Post('matches/:pairId/archive')
  @UseGuards(MatchAuthGuard)
  archivePair(@Req() req: MatchRequest, @Param('pairId') pairId: string) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.archivePair(pairId, profileId);
  }

  @Post('matches/:pairId/unarchive')
  @UseGuards(MatchAuthGuard)
  unarchivePair(@Req() req: MatchRequest, @Param('pairId') pairId: string) {
    const profileId = this.requireProfileId(req);
    return this.swipeService.unarchivePair(pairId, profileId);
  }

  @Get('photos')
  @UseGuards(MatchAuthGuard)
  listPhotos(@Req() req: MatchRequest) {
    const profileId = this.requireProfileId(req);
    return this.photosService.listForProfile(profileId);
  }

  @Post('photos')
  @UseGuards(MatchAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  uploadPhoto(
    @Req() req: MatchRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const profileId = this.requireProfileId(req);
    return this.photosService.upload(profileId, file);
  }

  @Delete('photos/:photoId')
  @UseGuards(MatchAuthGuard)
  deletePhoto(@Req() req: MatchRequest, @Param('photoId') photoId: string) {
    const profileId = this.requireProfileId(req);
    return this.photosService.remove(profileId, photoId);
  }

  @Patch('photos/reorder')
  @UseGuards(MatchAuthGuard)
  reorderPhotos(@Req() req: MatchRequest, @Body() dto: ReorderPhotosDto) {
    const profileId = this.requireProfileId(req);
    return this.photosService.reorder(profileId, dto.order);
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

  @Post('matches/:pairId/contact-reveal')
  @UseGuards(MatchAuthGuard)
  contactReveal(@Req() req: MatchRequest, @Param('pairId') pairId: string) {
    const profileId = this.requireProfileId(req);
    return this.chatService.revealContact(pairId, profileId);
  }

  @Get('matches/:pairId/partner')
  @UseGuards(MatchAuthGuard)
  getMatchPartner(@Req() req: MatchRequest, @Param('pairId') pairId: string) {
    const profileId = this.requireProfileId(req);
    return this.chatService.getPartnerProfile(pairId, profileId);
  }
}
