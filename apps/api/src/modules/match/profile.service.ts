import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpsertProfileDto } from './dto/upsert-profile.dto';

function uniqTrimmed(values: string[] | undefined): string[] {
  if (!values?.length) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
}

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { userId },
      include: { settings: true },
    });
    return {
      profile,
      settings: profile?.settings ?? null,
    };
  }

  async requireProfileById(profileId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async requireProfileByUser(userId: string) {
    const profile = await this.prisma.matchProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new ConflictException('profile_required');
    }
    return profile;
  }

  async upsertProfile(userId: string, dto: UpsertProfileDto) {
    const roleCustom = dto.role === 'CUSTOM' ? dto.roleCustom?.trim() : null;
    if (dto.role === 'CUSTOM' && !roleCustom) {
      throw new BadRequestException('roleCustom is required when role=CUSTOM');
    }
    if (
      typeof dto.priceMin === 'number' &&
      typeof dto.priceMax === 'number' &&
      dto.priceMin > dto.priceMax
    ) {
      throw new BadRequestException('priceMin cannot be greater than priceMax');
    }

    const profile = await this.prisma.matchProfile.upsert({
      where: { userId },
      update: {
        role: dto.role,
        roleCustom,
        displayName: dto.displayName.trim(),
        headline: dto.headline?.trim() || null,
        bio: dto.bio?.trim() || null,
        city: dto.city?.trim() || null,
        niches: uniqTrimmed(dto.niches),
        skills: uniqTrimmed(dto.skills),
        priceMin: dto.priceMin ?? null,
        priceMax: dto.priceMax ?? null,
        currency: dto.currency?.trim() || 'RUB',
        avatarUrl: dto.avatarUrl?.trim() || null,
        portfolioUrl: dto.portfolioUrl?.trim() || null,
        telegramContact: dto.telegramContact?.trim() || null,
        isActive: dto.isActive ?? true,
      },
      create: {
        userId,
        role: dto.role,
        roleCustom,
        displayName: dto.displayName.trim(),
        headline: dto.headline?.trim() || null,
        bio: dto.bio?.trim() || null,
        city: dto.city?.trim() || null,
        niches: uniqTrimmed(dto.niches),
        skills: uniqTrimmed(dto.skills),
        priceMin: dto.priceMin ?? null,
        priceMax: dto.priceMax ?? null,
        currency: dto.currency?.trim() || 'RUB',
        avatarUrl: dto.avatarUrl?.trim() || null,
        portfolioUrl: dto.portfolioUrl?.trim() || null,
        telegramContact: dto.telegramContact?.trim() || null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.prisma.matchSettings.upsert({
      where: { profileId: profile.id },
      update: {
        interestedRoles: dto.interestedRoles
          ? [...dto.interestedRoles]
          : undefined,
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : undefined,
      },
      create: {
        profileId: profile.id,
        interestedRoles: dto.interestedRoles ? [...dto.interestedRoles] : [],
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : [],
      },
    });

    return this.getMe(userId);
  }

  async getSettings(profileId: string) {
    await this.requireProfileById(profileId);
    const settings = await this.prisma.matchSettings.findUnique({
      where: { profileId },
    });
    if (settings) return settings;

    return this.prisma.matchSettings.create({
      data: {
        profileId,
        interestedRoles: [],
        interestedNiches: [],
      },
    });
  }

  async updateSettings(profileId: string, dto: UpdateSettingsDto) {
    await this.requireProfileById(profileId);
    return this.prisma.matchSettings.upsert({
      where: { profileId },
      update: {
        interestedRoles: dto.interestedRoles
          ? [...dto.interestedRoles]
          : undefined,
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : undefined,
        hideFromFeed: dto.hideFromFeed,
      },
      create: {
        profileId,
        interestedRoles: dto.interestedRoles ? [...dto.interestedRoles] : [],
        interestedNiches: dto.interestedNiches
          ? uniqTrimmed(dto.interestedNiches)
          : [],
        hideFromFeed: dto.hideFromFeed ?? false,
      },
    });
  }
}
