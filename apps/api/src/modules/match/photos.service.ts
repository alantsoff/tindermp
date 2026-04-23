import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_PHOTOS = 6;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

function getUploadsRoot(): string {
  return (
    process.env.MATCH_UPLOADS_DIR?.trim() ||
    resolve(__dirname, '..', '..', '..', 'storage', 'match-media')
  );
}

function getMediaBaseUrl(): string {
  return (process.env.MATCH_MEDIA_BASE_URL?.trim() || '/match-media').replace(
    /\/$/,
    '',
  );
}

function buildPhotoUrl(filename: string): string {
  return `${getMediaBaseUrl()}/photos/${filename}`;
}

async function compressImage(buffer: Buffer): Promise<Buffer> {
  for (const quality of [82, 70, 60]) {
    const rendered = await sharp(buffer)
      .rotate()
      .resize(1080, 1080, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (rendered.byteLength <= MAX_FILE_SIZE_BYTES) {
      return rendered;
    }
  }
  throw new BadRequestException('image_too_large_after_compression');
}

@Injectable()
export class PhotosService {
  constructor(private readonly prisma: PrismaService) {}

  private getPhotosDir(): string {
    return join(getUploadsRoot(), 'photos');
  }

  async listForProfile(profileId: string) {
    return this.prisma.matchProfilePhoto.findMany({
      where: { profileId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upload(profileId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('file_required');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('image_mime_not_allowed');
    }

    const existingCount = await this.prisma.matchProfilePhoto.count({
      where: { profileId },
    });
    if (existingCount >= MAX_PHOTOS) {
      throw new BadRequestException('photos_limit_reached');
    }

    const rendered = await compressImage(file.buffer);

    const filename = `${randomUUID()}.webp`;
    const photosDir = this.getPhotosDir();
    await mkdir(photosDir, { recursive: true });
    await writeFile(join(photosDir, filename), rendered);

    return this.prisma.matchProfilePhoto.create({
      data: {
        profileId,
        url: buildPhotoUrl(filename),
        order: existingCount,
      },
    });
  }

  async remove(profileId: string, photoId: string) {
    const photo = await this.prisma.matchProfilePhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo || photo.profileId !== profileId) {
      throw new NotFoundException('photo_not_found');
    }

    await this.prisma.matchProfilePhoto.delete({ where: { id: photoId } });
    const filename = photo.url.split('/').pop();
    if (filename) {
      await unlink(join(this.getPhotosDir(), filename)).catch(() => undefined);
    }

    const rest = await this.listForProfile(profileId);
    await Promise.all(
      rest.map((item, idx) =>
        this.prisma.matchProfilePhoto.update({
          where: { id: item.id },
          data: { order: idx },
        }),
      ),
    );

    return { ok: true };
  }

  async reorder(profileId: string, order: string[]) {
    const photos = await this.listForProfile(profileId);
    const photoIds = photos.map((item) => item.id);
    if (order.length !== photoIds.length) {
      throw new BadRequestException('reorder_length_mismatch');
    }
    const expected = [...photoIds].sort().join(',');
    const actual = [...order].sort().join(',');
    if (expected !== actual) {
      throw new BadRequestException('reorder_invalid_ids');
    }

    await this.prisma.$transaction(
      order.map((photoId, idx) =>
        this.prisma.matchProfilePhoto.update({
          where: { id: photoId },
          data: { order: idx },
        }),
      ),
    );

    return this.listForProfile(profileId);
  }
}
