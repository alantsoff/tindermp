import { ConflictException } from '@nestjs/common';
import { InviteService } from './invite.service';

describe('InviteService.redeemForProfileCreation', () => {
  const eventLogger = { log: jest.fn() };

  const buildService = () => {
    const tx = {
      matchInviteCode: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
      },
    } as any;
    const prisma = { $transaction: jest.fn() } as any;
    const service = new InviteService(prisma, eventLogger as any);
    return { service, tx };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws invite_already_used when code is already claimed', async () => {
    const { service, tx } = buildService();
    tx.matchInviteCode.findUnique.mockResolvedValue({
      id: 'i1',
      usedAt: new Date(),
      revokedAt: null,
      usedByProfileId: 'other-profile',
    });

    await expect(
      service.redeemForProfileCreation(tx, 'ABCD-EFGH', 'new'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws invite_already_used when concurrent redeem wins the race', async () => {
    const { service, tx } = buildService();
    tx.matchInviteCode.findUnique.mockResolvedValue({
      id: 'i1',
      usedAt: null,
      revokedAt: null,
      usedByProfileId: null,
    });
    tx.matchInviteCode.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.redeemForProfileCreation(tx, 'ABCD-EFGH', 'new'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('is idempotent when the same profile claims the code twice', async () => {
    const { service, tx } = buildService();
    tx.matchInviteCode.findUnique.mockResolvedValue({
      id: 'i1',
      usedAt: new Date(),
      revokedAt: null,
      usedByProfileId: 'same-profile',
    });

    await expect(
      service.redeemForProfileCreation(tx, 'ABCD-EFGH', 'same-profile'),
    ).resolves.toEqual({ ownerProfileId: null });
    expect(tx.matchInviteCode.updateMany).not.toHaveBeenCalled();
  });
});
