import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { interval, map, type Observable } from 'rxjs';
import { AdminWebGuard } from './admin-web.guard';
import { BanProfileDto } from './dto/ban-profile.dto';
import { ConfirmActionDto } from './dto/confirm-action.dto';
import {
  BulkGiftInvitesDto,
  IssueDetachedDto,
  IssueToAdminsDto,
  IssueToProfileDto,
  IssueToSelfDto,
} from './dto/issue-invites.dto';
import { RecomputeSpamDto } from './dto/recompute-spam.dto';
import { MatchAdminService } from './match-admin.service';

type MatchRequest = {
  adminUser?: { userId: string; telegramId: string };
};

@UseGuards(AdminWebGuard)
@Controller('match-admin')
export class MatchAdminController {
  constructor(private readonly service: MatchAdminService) {}

  private requireAdminUserId(req: MatchRequest): string {
    const userId = req.adminUser?.userId;
    if (!userId) throw new BadRequestException('admin_user_required');
    return userId;
  }

  @Get('overview')
  overview() {
    return this.service.overview();
  }

  @Get('timeseries')
  timeseries(
    @Query('metric') metric = 'dau',
    @Query('period', new ParseIntPipe({ optional: true })) period?: number,
  ) {
    return this.service.timeseries(metric, period ?? 30);
  }

  @Get('metrics-series')
  metricsSeries(
    @Query('granularity') rawGranularity = 'day',
    @Query('period', new DefaultValuePipe(30), ParseIntPipe) period: number,
  ) {
    const granularity = rawGranularity === 'hour' ? 'hour' : 'day';
    return this.service.metricsSeries(granularity, period);
  }

  @Get('role-distribution')
  roleDistribution() {
    return this.service.roleDistribution();
  }

  @Get('users')
  users(
    @Query('query') query?: string,
    @Query('role') role?: string,
    @Query('workFormat') workFormat?: string,
    @Query('marketplace') marketplace?: string,
    @Query('banned') banned?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    // role/workFormat/marketplace приходят как свободные строки —
    // сервис сам валидирует их по enum'ам Prisma (см. coerceEnum).
    return this.service.users({
      query,
      role,
      workFormat,
      marketplace,
      banned,
      limit,
      offset,
    });
  }

  @Get('users/:profileId')
  userDetails(@Param('profileId') profileId: string) {
    return this.service.userDetails(profileId);
  }

  @Get('users/:profileId/events')
  userEvents(
    @Param('profileId') profileId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('before') before?: string,
  ) {
    return this.service.userEvents(profileId, limit ?? 100, before);
  }

  @Get('spam/flagged')
  spamFlagged(
    @Query('minScore', new ParseIntPipe({ optional: true })) minScore?: number,
  ) {
    return this.service.spamFlagged(minScore ?? 60);
  }

  @Get('spam/signals/:profileId')
  spamSignals(@Param('profileId') profileId: string) {
    return this.service.spamSignals(profileId);
  }

  @Post('spam/recompute')
  recomputeSpam(@Body() dto: RecomputeSpamDto) {
    return this.service.recomputeSpam(dto.profileId);
  }

  @Post('users/:profileId/ban')
  banProfile(
    @Req() req: MatchRequest,
    @Param('profileId') profileId: string,
    @Body() dto: BanProfileDto,
  ) {
    return this.service.banProfile(
      this.requireAdminUserId(req),
      profileId,
      dto.reason,
      dto.shadow ?? false,
    );
  }

  @Post('users/:profileId/unban')
  unbanProfile(
    @Req() req: MatchRequest,
    @Param('profileId') profileId: string,
    @Body() dto: BanProfileDto,
  ) {
    return this.service.unbanProfile(
      this.requireAdminUserId(req),
      profileId,
      dto.reason,
    );
  }

  @Post('users/:profileId/cascade-ban/preview')
  cascadeBanPreview(@Param('profileId') profileId: string) {
    return this.service.cascadeBanPreview(profileId);
  }

  @Post('users/:profileId/cascade-ban')
  cascadeBan(
    @Req() req: MatchRequest,
    @Param('profileId') profileId: string,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.service.cascadeBan(
      this.requireAdminUserId(req),
      profileId,
      dto.confirmToken,
      dto.reason,
    );
  }

  @Post('users/:profileId/cascade-revoke/preview')
  cascadeRevokePreview(@Param('profileId') profileId: string) {
    return this.service.cascadeRevokePreview(profileId);
  }

  @Post('users/:profileId/cascade-revoke')
  cascadeRevoke(
    @Req() req: MatchRequest,
    @Param('profileId') profileId: string,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.service.cascadeRevoke(
      this.requireAdminUserId(req),
      profileId,
      dto.confirmToken,
      dto.reason,
    );
  }

  @Post('invites/issue-to-self')
  issueToSelf(@Req() req: MatchRequest, @Body() dto: IssueToSelfDto) {
    return this.service.issueToSelf(this.requireAdminUserId(req), dto.count);
  }

  @Post('invites/issue-to-profile')
  issueToProfile(@Req() req: MatchRequest, @Body() dto: IssueToProfileDto) {
    return this.service.issueToProfile(
      this.requireAdminUserId(req),
      dto.profileId,
      dto.count,
      dto.reason,
    );
  }

  @Post('invites/issue-detached')
  issueDetached(@Req() req: MatchRequest, @Body() dto: IssueDetachedDto) {
    return this.service.issueDetached(
      this.requireAdminUserId(req),
      dto.count,
      dto.reason,
      dto.label,
    );
  }

  @Post('invites/issue-to-admins')
  issueToAdmins(@Req() req: MatchRequest, @Body() dto: IssueToAdminsDto) {
    return this.service.issueToAdmins(
      this.requireAdminUserId(req),
      dto.count,
      dto.reason,
    );
  }

  @Post('invites/bulk-gift')
  bulkGift(@Req() req: MatchRequest, @Body() dto: BulkGiftInvitesDto) {
    return this.service.bulkGift(
      this.requireAdminUserId(req),
      dto.profileIds,
      dto.countEach,
      dto.reason,
    );
  }

  @Get('invites')
  invites(
    @Query('status') status?: string,
    @Query('owner') owner?: string,
    @Query('usedBy') usedBy?: string,
    @Query('source') source?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.service.invites({ status, owner, usedBy, source, limit });
  }

  @Post('invites/:code/revoke')
  revokeInvite(
    @Req() req: MatchRequest,
    @Param('code') code: string,
    @Body() dto: BanProfileDto,
  ) {
    return this.service.revokeInvite(
      this.requireAdminUserId(req),
      code,
      dto.reason,
    );
  }

  @Get('invite-tree/:rootProfileId')
  inviteTree(
    @Param('rootProfileId') rootProfileId: string,
    @Query('depth', new ParseIntPipe({ optional: true })) depth?: number,
  ) {
    return this.service.inviteTree(rootProfileId, depth ?? 3);
  }

  @Get('invite-roots')
  inviteRoots(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.service.inviteRoots(limit ?? 50);
  }

  @Get('invite-tree/:profileId/ancestors')
  inviteAncestors(@Param('profileId') profileId: string) {
    return this.service.ancestors(profileId);
  }

  @Get('invite-tree/search')
  searchInviteTree(@Query('q') q = '') {
    return this.service.searchInviteTree(q);
  }

  @Get('audit')
  audit(
    @Query('admin') admin?: string,
    @Query('action') action?: string,
    @Query('target') target?: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.service.audit({ admin, action, target, limit, offset });
  }

  @Get('live/events')
  liveEvents() {
    return this.service.liveEvents();
  }

  @Sse('live/events-stream')
  liveEventsStream(): Observable<{ data: unknown }> {
    return interval(5000).pipe(map(() => ({ data: { ts: Date.now() } })));
  }
}
