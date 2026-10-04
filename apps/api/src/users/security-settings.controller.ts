import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Injectable,
  Put,
  Req,
} from '@nestjs/common';
import {
  setSecondFactorEnforcementSchema,
  type SecuritySettings,
  type SetSecondFactorEnforcementInput,
} from '@nurtw/contracts';
import { SECOND_FACTOR_PERMISSIONS } from '@nurtw/domain';

import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { PermissionService } from '../auth/permission.service.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { SessionUser } from '../auth/session.service.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AUTH_MFA_ENFORCED,
  SettingsService,
} from '../settings/settings.service.js';

/**
 * The switch for PRD Requirement 17.1, and who it would shut out (item 28).
 *
 * Enforcement ships off, so that no administrator is locked out before
 * enrolling. Turning it on is a deliberate, audited act by somebody who has
 * themselves proved a second factor in the session doing it. Otherwise the
 * request that turned it on would be the last privileged request that
 * administrator could make.
 */
@Injectable()
export class SecuritySettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SecuritySettings> {
    const [enforced, users] = await Promise.all([
      this.settings.isEnabled(AUTH_MFA_ENFORCED),
      this.prisma.user.findMany({
        where: { isActive: true, mfaEnabledAt: null },
        select: { id: true, fullName: true, email: true },
        orderBy: { fullName: 'asc' },
      }),
    ]);
    // Of the active officers with no second factor, those holding a
    // privileged permission: the ones enforcement stops.
    const withoutFactor: SecuritySettings['privilegedWithoutSecondFactor'] = [];
    for (const user of users) {
      const held = await this.permissions.heldAnywhere(
        user.id,
        SECOND_FACTOR_PERMISSIONS,
      );
      if (held.length > 0) {
        withoutFactor.push(user);
      }
    }
    return {
      secondFactorEnforced: enforced,
      privilegedWithoutSecondFactor: withoutFactor,
    };
  }

  async setEnforcement(
    actor: SessionUser,
    input: SetSecondFactorEnforcementInput,
    meta: { requestId: string | null; ipAddress: string | null },
  ): Promise<SecuritySettings> {
    const before = await this.settings.isEnabled(AUTH_MFA_ENFORCED);
    if (before === input.enforced) {
      throw new ConflictException('Enforcement is already in that state.');
    }
    if (input.enforced && !actor.secondFactorVerified) {
      throw new ConflictException(
        'Set up and prove a second factor before requiring one.',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.systemSetting.upsert({
        where: { key: AUTH_MFA_ENFORCED },
        create: {
          key: AUTH_MFA_ENFORCED,
          value: String(input.enforced),
          updatedByUserId: actor.id,
        },
        update: { value: String(input.enforced), updatedByUserId: actor.id },
      });
      await this.audit.record(
        {
          action: 'security.second_factor_enforcement',
          subjectType: 'system_setting',
          actorUserId: actor.id,
          before: { enforced: before },
          after: { enforced: input.enforced },
          reason: input.reason,
          requestId: meta.requestId,
          ipAddress: meta.ipAddress,
        },
        tx,
      );
    });
    return this.get();
  }
}

@Controller('settings/security')
export class SecuritySettingsController {
  constructor(private readonly security: SecuritySettingsService) {}

  @RequirePermission('system_setting.manage')
  @Get()
  @Documented({
    summary: 'Read the second-factor requirement, and who it would stop.',
    description:
      'PRD Requirement 17.1. Whether a privileged permission needs a second-factor session, ' +
      'and the active officers who hold one and have not set a second factor up. Those are ' +
      'the officers enforcement stops until they enrol.',
  })
  async get() {
    return this.security.get();
  }

  @RequirePermission('system_setting.manage')
  @Put('second-factor')
  @Documented({
    summary:
      'Require, or stop requiring, a second factor for privileged permissions.',
    description:
      'Requirement 17.1. It ships off so that no administrator is locked out before ' +
      'enrolling, and must be on at go-live. Turning it on needs a session that has itself ' +
      'proved a second factor. A reason is mandatory and the change is audited.',
    body: setSecondFactorEnforcementSchema,
    responses: {
      409: 'Already in that state, or this session has not proved a second factor.',
    },
  })
  async setEnforcement(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(setSecondFactorEnforcementSchema))
    body: SetSecondFactorEnforcementInput,
  ) {
    if (!request.user) {
      throw new BadRequestException();
    }
    return this.security.setEnforcement(request.user, body, {
      requestId: request.header('x-request-id') ?? null,
      ipAddress: request.ip ?? null,
    });
  }
}
