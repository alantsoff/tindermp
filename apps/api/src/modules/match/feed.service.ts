import { Injectable } from '@nestjs/common';
import { Prisma, type MatchRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProfileService } from './profile.service';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profileService: ProfileService,
  ) {}

  async getFeed(profileId: string, rawLimit?: number) {
    await this.profileService.requireProfileById(profileId);
    const limit = Math.min(Math.max(rawLimit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const settings = await this.prisma.matchSettings.findUnique({
      where: { profileId },
      select: { interestedRoles: true, interestedNiches: true },
    });
    const roles = settings?.interestedRoles ?? [];
    const niches = settings?.interestedNiches ?? [];

    type FeedRow = {
      id: string;
      role: MatchRole;
      roleCustom: string | null;
      displayName: string;
      headline: string | null;
      bio: string | null;
      city: string | null;
      niches: string[];
      skills: string[];
      priceMin: number | null;
      priceMax: number | null;
      currency: string;
      avatarUrl: string | null;
      portfolioUrl: string | null;
      telegramContact: string | null;
      isActive: boolean;
    };

    const rows = await this.prisma.$queryRaw<FeedRow[]>(Prisma.sql`
      SELECT
        p.id,
        p.role,
        p."roleCustom",
        p."displayName",
        p.headline,
        p.bio,
        p.city,
        p.niches,
        p.skills,
        p."priceMin",
        p."priceMax",
        p.currency,
        p."avatarUrl",
        p."portfolioUrl",
        p."telegramContact",
        p."isActive"
      FROM "MatchProfile" p
      LEFT JOIN "MatchSettings" s ON s."profileId" = p.id
      WHERE p.id != ${profileId}
        AND p."isActive" = true
        AND COALESCE(s."hideFromFeed", false) = false
        AND (cardinality(${roles}::"MatchRole"[]) = 0 OR p.role = ANY(${roles}::"MatchRole"[]))
        AND (cardinality(${niches}::text[]) = 0 OR p.niches && ${niches}::text[])
        AND NOT EXISTS (
          SELECT 1
          FROM "MatchSwipe" sw
          WHERE sw."fromProfileId" = ${profileId}
            AND sw."toProfileId" = p.id
        )
      ORDER BY random()
      LIMIT ${limit}
    `);

    return rows.map((row) => ({
      ...row,
      roleLabel:
        row.role === 'CUSTOM' ? (row.roleCustom ?? 'CUSTOM') : row.role,
      telegramContact: null,
    }));
  }
}
