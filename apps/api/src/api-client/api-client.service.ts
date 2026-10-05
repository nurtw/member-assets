import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  API_SCOPES,
  DEFAULT_TOKEN_REMINDER_DAYS,
  type ApiClientDetail,
  type ApiClientList,
  type ApiClientSummary,
  type ApiTokenSummary,
  type ApproveApiClientInput,
  type DisclosureProfileSummary,
  type RegisterApiClientInput,
  type SetApiClientAccessInput,
  type SetApiClientLimitsInput,
  type SetApiClientStatusInput,
  type UpdateApiClientInput,
} from '@nurtw/contracts';
import {
  InvalidApiClientTransitionError,
  apiClientStanding,
  apiTokenState,
  applicationExpiresAt,
  assertApiClientTransition,
  isApplicationExpired,
  isTokenExpiringSoon,
  type StoredApiClientStatus,
} from '@nurtw/domain';
import type { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { ValidationException } from '../common/zod-validation.pipe.js';
import { DisclosureProfileService } from '../disclosure/disclosure-profile.service.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import {
  PORTAL_ACCOUNT_SELECT,
  toPortalAccountSummary,
} from '../portal/portal-account.summary.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import {
  API_TOKEN_REMINDER_DAYS,
  SettingsService,
} from '../settings/settings.service.js';

/**
 * A token, as selected for a response. `tokenHash` is not here and must never
 * be: an explicit select is what keeps it out of every response this module
 * builds (Requirement 12.1).
 */
export const TOKEN_SELECT = {
  id: true,
  tokenPrefix: true,
  expiresAt: true,
  revokedAt: true,
  retiresAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;

export type TokenRow = Prisma.ApiTokenGetPayload<{
  select: typeof TOKEN_SELECT;
}>;

/** Days a self-application waits before it lapses, where the setting is absent. */
const APPLICATION_EXPIRY_DAYS = 'portal.application_expiry_days';
const APPLICATION_EXPIRY_FALLBACK = 30;

const SUMMARY_SELECT = {
  id: true,
  organisationName: true,
  status: true,
  selfRegistered: true,
  createdAt: true,
  disclosureProfile: { select: { id: true, code: true, label: true } },
  scopes: { select: { scope: true } },
  tokens: { select: TOKEN_SELECT, orderBy: { createdAt: 'desc' } },
} as const;

const DETAIL_SELECT = {
  ...SUMMARY_SELECT,
  businessPurpose: true,
  technicalContactName: true,
  technicalContactEmail: true,
  technicalContactPhone: true,
  allowedIpRanges: true,
  agreementReference: true,
  agreementDate: true,
  approvedAt: true,
  statusChangedAt: true,
  statusReason: true,
  rateLimitProfile: true,
  dailyQuota: true,
  applicantConfirmedVia: true,
  applicantConfirmationNote: true,
  portalAccount: { select: PORTAL_ACCOUNT_SELECT },
  registeredByUser: { select: { id: true, fullName: true } },
  approvedByUser: { select: { id: true, fullName: true } },
} as const;

type SummaryRow = Prisma.ApiClientGetPayload<{ select: typeof SUMMARY_SELECT }>;
type DetailRow = Prisma.ApiClientGetPayload<{ select: typeof DETAIL_SELECT }>;

export function toTokenSummary(
  row: TokenRow,
  now: Date,
  reminderDays: number,
): ApiTokenSummary {
  return {
    id: row.id,
    prefix: row.tokenPrefix,
    state: apiTokenState(row, now),
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    retiresAt: row.retiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiringSoon: isTokenExpiringSoon(row, now, reminderDays),
  };
}

/** Scopes in catalogue order, so two clients holding the same ones read alike. */
function orderScopes(scopes: readonly string[]): string[] {
  const position = (scope: string) => {
    const index = (API_SCOPES as readonly string[]).indexOf(scope);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...scopes].sort(
    (a, b) => position(a) - position(b) || a.localeCompare(b),
  );
}

/** `YYYY-MM-DD` in Lagos (UTC+1, no daylight saving), where the Union's day runs. */
function lagosToday(now: Date): string {
  return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * External organisations and the access each is given (PRD §12.1, §23.10–23.11
 * — item 11).
 *
 * Union-wide, like master data and fee types: an API client belongs to no
 * branch, so the guard's permission check is the whole check.
 *
 * - **Registering is not approving.** A registration is `PENDING` and can do
 *   nothing. Approval assigns the disclosure profile and the scopes, and needs
 *   a data-sharing agreement on record (Requirement 12.8).
 * - **Access is changed only by `approve` and `setAccess`.** The schema of
 *   `update` cannot carry a scope, a profile, or a status.
 * - **Every act is audited**, with the reason where one is asked for. Reading
 *   a status back is `apiClientStanding`: `EXPIRED` is worked out, not stored.
 */
@Injectable()
export class ApiClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly profiles: DisclosureProfileService,
    private readonly rateLimits: RateLimitService,
  ) {}

  // --- Reads -----------------------------------------------------------------

  async list(): Promise<ApiClientList> {
    const now = new Date();
    const [rows, reminderDays] = await Promise.all([
      this.prisma.apiClient.findMany({
        select: SUMMARY_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
      this.reminderDays(),
    ]);
    const paused = await this.rateLimits.pausedUntil(
      rows.map((row) => row.id),
      now,
    );
    return {
      clients: rows.map((row) =>
        this.toSummary(row, now, reminderDays, paused.get(row.id) ?? null),
      ),
      reminderDays,
    };
  }

  async get(id: string): Promise<ApiClientDetail> {
    const [row, reminderDays, expiryDays] = await Promise.all([
      this.prisma.apiClient.findUnique({
        where: { id },
        select: DETAIL_SELECT,
      }),
      this.reminderDays(),
      this.applicationExpiryDays(),
    ]);
    if (!row) {
      throw new NotFoundException();
    }
    const now = new Date();
    const { limits, pause } = await this.rateLimits.describe(
      {
        clientId: row.id,
        rateLimitProfile: row.rateLimitProfile,
        dailyQuota: row.dailyQuota,
      },
      now,
    );
    return {
      ...this.toDetail(
        row,
        now,
        reminderDays,
        pause?.active ? new Date(pause.pausedUntil) : null,
        expiryDays,
      ),
      limits,
      pause,
    };
  }

  /** The profiles an organisation can be given, for the approval form. */
  assignableProfiles(): Promise<DisclosureProfileSummary[]> {
    return this.profiles.listAssignable();
  }

  // --- Writes ----------------------------------------------------------------

  async register(
    actor: ActorContext,
    input: RegisterApiClientInput,
  ): Promise<ApiClientDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      const row = await tx.apiClient.create({
        data: {
          organisationName: input.organisationName,
          businessPurpose: input.businessPurpose,
          technicalContactName: input.technicalContact.name,
          technicalContactEmail: input.technicalContact.email,
          technicalContactPhone: input.technicalContact.phone || null,
          allowedIpRanges: input.allowedIpRanges,
          // Always pending, whatever was sent: approval is its own act.
          status: 'PENDING',
          registeredByUserId: actor.userId,
        },
        select: { id: true },
      });
      await this.audit.record(
        {
          action: 'api_client.register',
          subjectType: 'api_client',
          subjectId: row.id,
          actorUserId: actor.userId,
          after: {
            organisationName: input.organisationName,
            status: 'PENDING',
            allowedIpRanges: input.allowedIpRanges,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
      return row.id;
    });
    return this.get(id);
  }

  /** Amends the record. It cannot change what the organisation may do. */
  async update(
    actor: ActorContext,
    id: string,
    input: UpdateApiClientInput,
  ): Promise<ApiClientDetail> {
    this.assertAgreementDate(input.agreementDate);

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const before = await tx.apiClient.findUnique({
        where: { id },
        select: {
          status: true,
          organisationName: true,
          businessPurpose: true,
          technicalContactName: true,
          technicalContactEmail: true,
          technicalContactPhone: true,
          allowedIpRanges: true,
          agreementReference: true,
          agreementDate: true,
        },
      });
      if (!before) {
        throw new NotFoundException();
      }
      // A revoked client's record is closed: it stays as it was when access
      // was withdrawn.
      if (before.status === 'REVOKED') {
        throw new ConflictException('A revoked client cannot be amended.');
      }

      const contact = input.technicalContact;
      const data: Prisma.ApiClientUpdateInput = {
        ...(input.organisationName !== undefined
          ? { organisationName: input.organisationName }
          : {}),
        ...(input.businessPurpose !== undefined
          ? { businessPurpose: input.businessPurpose }
          : {}),
        ...(contact !== undefined
          ? {
              technicalContactName: contact.name,
              technicalContactEmail: contact.email,
              technicalContactPhone: contact.phone || null,
            }
          : {}),
        ...(input.allowedIpRanges !== undefined
          ? { allowedIpRanges: input.allowedIpRanges }
          : {}),
        ...(input.agreementReference !== undefined
          ? { agreementReference: input.agreementReference }
          : {}),
        ...(input.agreementDate !== undefined
          ? { agreementDate: new Date(`${input.agreementDate}T00:00:00Z`) }
          : {}),
      };
      const after = await tx.apiClient.update({
        where: { id },
        data,
        select: {
          organisationName: true,
          businessPurpose: true,
          technicalContactName: true,
          technicalContactEmail: true,
          technicalContactPhone: true,
          allowedIpRanges: true,
          agreementReference: true,
          agreementDate: true,
        },
      });

      const describe = (row: typeof after) => ({
        organisationName: row.organisationName,
        businessPurpose: row.businessPurpose,
        technicalContact: {
          name: row.technicalContactName,
          email: row.technicalContactEmail,
          phone: row.technicalContactPhone,
        },
        allowedIpRanges: row.allowedIpRanges,
        agreementReference: row.agreementReference,
        agreementDate: row.agreementDate?.toISOString().slice(0, 10) ?? null,
      });
      await this.audit.record(
        {
          action: 'api_client.update',
          subjectType: 'api_client',
          subjectId: id,
          actorUserId: actor.userId,
          before: describe(before),
          after: describe(after),
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * `PENDING -> ACTIVE`, the only route there. Approval assigns the profile
   * and the scopes and records the agreement, the approver, and the time, in
   * one transaction. It issues no token: that is `api_token.manage`'s act.
   */
  async approve(
    actor: ActorContext,
    id: string,
    input: ApproveApiClientInput,
  ): Promise<ApiClientDetail> {
    this.assertAgreementDate(input.agreementDate);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const before = await tx.apiClient.findUnique({
        where: { id },
        select: { status: true, selfRegistered: true, createdAt: true },
      });
      if (!before) {
        throw new NotFoundException();
      }
      if (before.status !== 'PENDING') {
        throw new ConflictException('Only a pending client can be approved.');
      }
      // Item 29 (EXT-20) — an organisation that applied for itself is
      // approved only once the administrator has confirmed the applicant,
      // by telephone or letter, and says which.
      if (before.selfRegistered) {
        if (
          isApplicationExpired(
            before.createdAt,
            now,
            await this.applicationExpiryDays(),
          )
        ) {
          throw new ConflictException('The application has lapsed.');
        }
        if (!input.applicantConfirmation) {
          throw new ValidationException([
            {
              field: 'applicantConfirmation',
              message:
                'Say how the applicant was confirmed: by telephone or by letter.',
            },
          ]);
        }
      }
      const confirmation = before.selfRegistered
        ? (input.applicantConfirmation ?? null)
        : null;
      const profile = await this.profiles.requireAssignable(
        input.disclosureProfileId,
        tx,
      );

      await tx.apiClientScope.deleteMany({ where: { clientId: id } });
      await tx.apiClientScope.createMany({
        data: input.scopes.map((scope) => ({ clientId: id, scope })),
      });
      await tx.apiClient.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          statusChangedAt: now,
          statusReason: null,
          disclosureProfileId: profile.id,
          agreementReference: input.agreementReference,
          agreementDate: new Date(`${input.agreementDate}T00:00:00Z`),
          approvedByUserId: actor.userId,
          approvedAt: now,
          applicantConfirmedVia: confirmation?.via ?? null,
          applicantConfirmationNote: confirmation?.note || null,
        },
      });

      await this.audit.record(
        {
          action: 'api_client.approve',
          subjectType: 'api_client',
          subjectId: id,
          actorUserId: actor.userId,
          before: { status: 'PENDING' },
          after: {
            status: 'ACTIVE',
            disclosureProfile: profile.code,
            scopes: orderScopes(input.scopes),
            agreementReference: input.agreementReference,
            agreementDate: input.agreementDate,
            ...(confirmation
              ? { applicantConfirmedVia: confirmation.via }
              : {}),
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** How long a self-application waits before it lapses (item 29). */
  applicationExpiryDays(): Promise<number> {
    return this.settings.getPositiveInteger(
      APPLICATION_EXPIRY_DAYS,
      APPLICATION_EXPIRY_FALLBACK,
    );
  }

  /**
   * Replaces the profile and the scopes of an approved organisation (PRD
   * §23.11). It applies on the organisation's next request.
   */
  async setAccess(
    actor: ActorContext,
    id: string,
    input: SetApiClientAccessInput,
  ): Promise<ApiClientDetail> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const before = await tx.apiClient.findUnique({
        where: { id },
        select: {
          status: true,
          disclosureProfile: { select: { code: true } },
          scopes: { select: { scope: true } },
        },
      });
      if (!before) {
        throw new NotFoundException();
      }
      // A pending client is given access by approval, which also records the
      // agreement. A revoked one is given none.
      if (before.status !== 'ACTIVE' && before.status !== 'SUSPENDED') {
        throw new ConflictException(
          'Access is set by approval, and not at all once revoked.',
        );
      }
      const profile = await this.profiles.requireAssignable(
        input.disclosureProfileId,
        tx,
      );

      // Only what changed is written, so a scope left in place keeps the date
      // it was granted on.
      const held = before.scopes.map((granted) => granted.scope);
      const wanted: readonly string[] = input.scopes;
      const removed = held.filter((scope) => !wanted.includes(scope));
      const added = wanted.filter((scope) => !held.includes(scope));
      if (removed.length > 0) {
        await tx.apiClientScope.deleteMany({
          where: { clientId: id, scope: { in: removed } },
        });
      }
      if (added.length > 0) {
        await tx.apiClientScope.createMany({
          data: added.map((scope) => ({ clientId: id, scope })),
        });
      }
      await tx.apiClient.update({
        where: { id },
        data: { disclosureProfileId: profile.id },
      });

      await this.audit.record(
        {
          action: 'api_client.access_change',
          subjectType: 'api_client',
          subjectId: id,
          actorUserId: actor.userId,
          before: {
            disclosureProfile: before.disclosureProfile?.code ?? null,
            scopes: orderScopes(held),
          },
          after: {
            disclosureProfile: profile.code,
            scopes: orderScopes(wanted),
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * Suspends, reinstates, refuses, or revokes.
   *
   * Revoking withdraws every token in the same transaction, so nothing the
   * organisation holds outlives the decision. A suspension leaves the tokens
   * as they are and refuses them, so lifting it restores access without
   * issuing anything new.
   */
  async setStatus(
    actor: ActorContext,
    id: string,
    input: SetApiClientStatusInput,
  ): Promise<ApiClientDetail> {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const before = await tx.apiClient.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!before) {
        throw new NotFoundException();
      }
      const from = before.status as StoredApiClientStatus;

      // The lifecycle allows `PENDING -> ACTIVE`, and `approve` is the only
      // way to make it: this route records no profile, scope, or agreement.
      if (from === 'PENDING' && input.status === 'ACTIVE') {
        throw new ConflictException('A pending client is approved, not set.');
      }
      try {
        assertApiClientTransition(from, input.status);
      } catch (error) {
        if (error instanceof InvalidApiClientTransitionError) {
          throw new ConflictException(error.message);
        }
        throw error;
      }

      await tx.apiClient.update({
        where: { id },
        data: {
          status: input.status,
          statusChangedAt: now,
          statusReason: input.reason,
        },
      });

      let tokensRevoked = 0;
      if (input.status === 'REVOKED') {
        const revoked = await tx.apiToken.updateMany({
          where: { clientId: id, revokedAt: null },
          data: { revokedAt: now },
        });
        tokensRevoked = revoked.count;
      }

      const action =
        input.status === 'SUSPENDED'
          ? 'api_client.suspend'
          : input.status === 'ACTIVE'
            ? 'api_client.reinstate'
            : from === 'PENDING'
              ? 'api_client.refuse'
              : 'api_client.revoke';
      await this.audit.record(
        {
          action,
          subjectType: 'api_client',
          subjectId: id,
          actorUserId: actor.userId,
          before: { status: from },
          after: {
            status: input.status,
            ...(input.status === 'REVOKED' ? { tokensRevoked } : {}),
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /**
   * The limit profile an organisation is held to, and a daily quota of its
   * own where the profile's does not fit (item 13). It applies to the next
   * request. A revoked organisation's record is closed.
   */
  async setLimits(
    actor: ActorContext,
    id: string,
    input: SetApiClientLimitsInput,
  ): Promise<ApiClientDetail> {
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, id);
      const before = await tx.apiClient.findUnique({
        where: { id },
        select: { status: true, rateLimitProfile: true, dailyQuota: true },
      });
      if (!before) {
        throw new NotFoundException();
      }
      if (before.status === 'REVOKED') {
        throw new ConflictException('A revoked client cannot be amended.');
      }
      const profile = await this.rateLimits.requireProfile(
        input.rateLimitProfile,
        tx,
      );
      await tx.apiClient.update({
        where: { id },
        data: { rateLimitProfile: profile.code, dailyQuota: input.dailyQuota },
      });
      await this.audit.record(
        {
          action: 'api_client.limits_change',
          subjectType: 'api_client',
          subjectId: id,
          actorUserId: actor.userId,
          before: {
            rateLimitProfile: before.rateLimitProfile,
            dailyQuota: before.dailyQuota,
          },
          after: {
            rateLimitProfile: profile.code,
            dailyQuota: input.dailyQuota,
          },
          reason: input.reason,
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );
    });
    return this.get(id);
  }

  /** Ends the System's pause on an organisation early (item 13). */
  async liftPause(
    actor: ActorContext,
    id: string,
    reason: string,
  ): Promise<ApiClientDetail> {
    const exists = await this.prisma.apiClient.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException();
    }
    await this.rateLimits.lift(actor, id, reason);
    return this.get(id);
  }

  // --- Internals ---------------------------------------------------------------

  /**
   * Serialises every change to one client. Anything that changes a client, or
   * issues, rotates, or revokes one of its tokens, takes this first, so two
   * requests cannot both find "no token in use" and issue two.
   */
  async lock(tx: Prisma.TransactionClient, clientId: string): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM api_client WHERE id = ${clientId}::uuid FOR UPDATE`;
  }

  reminderDays(): Promise<number> {
    return this.settings.getPositiveInteger(
      API_TOKEN_REMINDER_DAYS,
      DEFAULT_TOKEN_REMINDER_DAYS,
    );
  }

  /**
   * An agreement dated after today has not been signed. Answered as a
   * validation failure on the field, since it describes only the request.
   */
  private assertAgreementDate(agreementDate: string | undefined): void {
    if (agreementDate !== undefined && agreementDate > lagosToday(new Date())) {
      throw new ValidationException([
        {
          field: 'agreementDate',
          message: 'The agreement date cannot be in the future.',
        },
      ]);
    }
  }

  private toSummary(
    row: SummaryRow,
    now: Date,
    reminderDays: number,
    pausedUntil: Date | null,
  ): ApiClientSummary {
    const tokens = row.tokens.map((token) =>
      toTokenSummary(token, now, reminderDays),
    );
    return {
      id: row.id,
      organisationName: row.organisationName,
      status: apiClientStanding(
        row.status as StoredApiClientStatus,
        row.tokens,
        now,
      ),
      disclosureProfile: row.disclosureProfile,
      scopes: orderScopes(row.scopes.map((granted) => granted.scope)),
      currentToken: tokens.find((token) => token.state === 'CURRENT') ?? null,
      pausedUntil: pausedUntil?.toISOString() ?? null,
      selfRegistered: row.selfRegistered,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDetail(
    row: DetailRow,
    now: Date,
    reminderDays: number,
    pausedUntil: Date | null,
    expiryDays: number,
  ): Omit<ApiClientDetail, 'limits' | 'pause'> {
    return {
      ...this.toSummary(row, now, reminderDays, pausedUntil),
      businessPurpose: row.businessPurpose,
      technicalContact: {
        name: row.technicalContactName,
        email: row.technicalContactEmail,
        phone: row.technicalContactPhone,
      },
      allowedIpRanges: row.allowedIpRanges,
      agreementReference: row.agreementReference,
      agreementDate: row.agreementDate?.toISOString().slice(0, 10) ?? null,
      registeredBy: row.registeredByUser,
      approvedBy: row.approvedByUser,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
      statusReason: row.statusReason,
      tokens: row.tokens.map((token) =>
        toTokenSummary(token, now, reminderDays),
      ),
      applicantConfirmation: row.applicantConfirmedVia
        ? {
            via: row.applicantConfirmedVia,
            note: row.applicantConfirmationNote,
          }
        : null,
      applicationExpiresAt:
        row.selfRegistered && row.status === 'PENDING'
          ? applicationExpiresAt(row.createdAt, expiryDays).toISOString()
          : null,
      portalAccount: row.portalAccount
        ? toPortalAccountSummary(row.portalAccount, now)
        : null,
    };
  }
}
