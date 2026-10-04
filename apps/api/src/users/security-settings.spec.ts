import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditService } from '../audit/audit.service.js';
import type { PermissionService } from '../auth/permission.service.js';
import type { SessionUser } from '../auth/session.service.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  AUTH_MFA_ENFORCED,
  type SettingsService,
} from '../settings/settings.service.js';
import { SecuritySettingsService } from './security-settings.controller.js';

/**
 * The switch for PRD Requirement 17.1 (item 28).
 *
 * Tested here, not end to end: the setting is one row for the whole database,
 * and the end-to-end suites run beside one another against it. Turning it on
 * there would refuse other suites' privileged requests mid-run.
 */
describe('SecuritySettingsService', () => {
  let enforced: boolean;
  let upsert: ReturnType<typeof vi.fn>;
  let record: ReturnType<typeof vi.fn>;
  let heldAnywhere: ReturnType<typeof vi.fn>;
  let service: SecuritySettingsService;

  const officer = (overrides: Partial<SessionUser> = {}): SessionUser => ({
    id: 'user-1',
    email: 'admin@example.test',
    fullName: 'Test Administrator',
    sessionId: 'session-1',
    mustChangePassword: false,
    secondFactorVerified: true,
    ...overrides,
  });
  const meta = { requestId: 'req-1', ipAddress: '203.0.113.7' };

  beforeEach(() => {
    enforced = false;
    upsert = vi.fn(({ create }: { create: { value: string } }) => {
      enforced = create.value === 'true';
      return Promise.resolve();
    });
    record = vi.fn().mockResolvedValue(undefined);
    heldAnywhere = vi.fn().mockResolvedValue([]);

    const tx = { systemSetting: { upsert } };
    const prisma = {
      $transaction: (run: (client: typeof tx) => Promise<void>) => run(tx),
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'user-2', fullName: 'No Factor', email: 'two@example.test' },
          { id: 'user-3', fullName: 'Everyday', email: 'three@example.test' },
        ]),
      },
    };
    const settings = {
      isEnabled: vi.fn((key: string) =>
        Promise.resolve(key === AUTH_MFA_ENFORCED ? enforced : false),
      ),
    };

    service = new SecuritySettingsService(
      prisma as unknown as PrismaService,
      settings as unknown as SettingsService,
      { heldAnywhere } as unknown as PermissionService,
      { record } as unknown as AuditService,
    );
  });

  it('turns the requirement on for a session that has proved a factor, audited with the reason', async () => {
    const result = await service.setEnforcement(
      officer(),
      { enforced: true, reason: 'Go-live' },
      meta,
    );

    expect(result.secondFactorEnforced).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: AUTH_MFA_ENFORCED },
        create: expect.objectContaining({
          value: 'true',
          updatedByUserId: 'user-1',
        }),
        update: expect.objectContaining({ value: 'true' }),
      }),
    );
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'security.second_factor_enforcement',
        actorUserId: 'user-1',
        before: { enforced: false },
        after: { enforced: true },
        reason: 'Go-live',
        requestId: 'req-1',
      }),
      expect.anything(),
    );
  });

  it('refuses to turn it on from a session that has not proved one, and writes nothing', async () => {
    await expect(
      service.setEnforcement(
        officer({ secondFactorVerified: false }),
        { enforced: true, reason: 'Go-live' },
        meta,
      ),
    ).rejects.toThrow(ConflictException);
    expect(upsert).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('turns it off again without asking for a factor', async () => {
    enforced = true;
    const result = await service.setEnforcement(
      officer({ secondFactorVerified: false }),
      { enforced: false, reason: 'Rollback after a lockout' },
      meta,
    );

    expect(result.secondFactorEnforced).toBe(false);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { enforced: true },
        after: { enforced: false },
      }),
      expect.anything(),
    );
  });

  it('refuses a change to the state it is already in', async () => {
    await expect(
      service.setEnforcement(
        officer(),
        { enforced: false, reason: 'No change' },
        meta,
      ),
    ).rejects.toThrow(ConflictException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('lists only the officers without a factor who hold a privileged permission', async () => {
    heldAnywhere.mockImplementation((userId: string) =>
      Promise.resolve(userId === 'user-2' ? ['user.manage'] : []),
    );

    const result = await service.get();

    expect(result.privilegedWithoutSecondFactor).toEqual([
      { id: 'user-2', fullName: 'No Factor', email: 'two@example.test' },
    ]);
  });
});
