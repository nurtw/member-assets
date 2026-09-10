import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  createOfficerSignatureSchema,
  decideCardSchema,
  draftCardSchema,
  replaceCardSchema,
  setCardStatusSchema,
  updateCardSchema,
  type CreateOfficerSignatureInput,
  type DecideCardInput,
  type DraftCardInput,
  type ReplaceCardInput,
  type SetCardStatusInput,
  type UpdateCardInput,
} from '@nurtw/contracts';
import type { Response } from 'express';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { CardService } from './card.service.js';
import { OfficerSignatureService } from './officer-signature.service.js';
import { listTemplates } from './templates/registry.js';

function actorOf(request: AuthenticatedRequest): ActorContext {
  if (!request.user) {
    throw new BadRequestException();
  }
  return {
    userId: request.user.id,
    requestId: request.header('x-request-id') ?? null,
    ipAddress: request.ip ?? null,
  };
}

/**
 * Membership cards (PRD §8).
 *
 * `@RequirePermission` is the coarse gate; `CardService` re-asks against the
 * card holder's own organisation path. Both are needed.
 */
@Controller('cards')
export class CardController {
  constructor(private readonly cards: CardService) {}

  @RequirePermission('card.read')
  @Get()
  @Documented({
    summary: 'List membership cards.',
    description:
      'Filtered to the organisation subtrees in which the caller holds `card.read`. Carries ' +
      'card-display data only — this module never joins `member_contact`, `next_of_kin`, or ' +
      '`guarantor`, so there is nothing here to filter out.',
    query: [
      { name: 'status', description: 'Filter by card status.' },
      { name: 'memberId', description: 'Filter to one member.' },
    ],
  })
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('memberId') memberId?: string,
  ) {
    const actor = actorOf(request);
    return { cards: await this.cards.list(actor.userId, { status, memberId }) };
  }

  @RequirePermission('card.read')
  @Get('templates')
  @Documented({
    summary: 'List the registered card templates.',
    description:
      'Every version ever issued against, because a card re-renders through the template it ' +
      'records rather than the current one. A template marked `provisional` is drawn from ' +
      'artwork reconstructed from a photograph and must not be printed for a member — see ' +
      'QUESTIONS.md CARD-05.',
  })
  templates() {
    return {
      templates: listTemplates().map((template) => ({
        version: template.version,
        label: template.label,
        validityMonths: template.validityMonths,
        provisional: template.provisional,
      })),
    };
  }

  @RequirePermission('card.read')
  @Get(':id')
  @Documented({
    summary: 'Retrieve one card, including the values printed upon it.',
    description:
      'The printed values are a snapshot taken at issuance and never recomputed: a card is a ' +
      'physical object, and re-deriving its contents would describe something other than what ' +
      'is in the holder’s pocket. A card outside the caller’s scope answers 404.',
    responses: { 404: 'No such card, or it lies outside the caller’s scope.' },
  })
  async findOne(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = actorOf(request);
    return { card: await this.cards.findOne(actor.userId, id) };
  }

  /**
   * The card as a PDF.
   *
   * `card.read`, not `card.issue`: reading a card includes seeing it. What
   * distinguishes a proof from the article is the overprint, not the permission.
   */
  @RequirePermission('card.read')
  @Get(':id/document')
  @Documented({
    summary: 'Render the card as a PDF.',
    description:
      'Rendered through the template version recorded on the card, never the current one — a ' +
      'silent fallback would reprint the card in a design the holder does not have, and it ' +
      'would look correct. A card that has not been issued renders with **no card number and ' +
      'a diagonal PROOF — NOT ISSUED overprint**, so that a printed draft cannot be passed ' +
      'off as the article.',
    responses: { 404: 'No such card, or it lies outside the caller’s scope.' },
  })
  async document(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const actor = actorOf(request);
    const { bytes, filename } = await this.cards.render(actor.userId, id);

    response.setHeader('X-Content-Type-Options', 'nosniff');
    // A member's photograph and name. Never held by a shared proxy.
    response.setHeader('Cache-Control', 'no-store');

    // `StreamableFile`, not a bare `Buffer`. Nest serialises a returned object
    // as JSON, and a Buffer is an object — so returning one produces
    // `{"type":"Buffer","data":[...]}` with a 200 status, which looks like a
    // working endpoint until somebody opens the file.
    return new StreamableFile(Buffer.from(bytes), {
      type: 'application/pdf',
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @RequirePermission('card.issue')
  @Post()
  @Documented({
    summary: 'Prepare a card for a member.',
    description:
      'Creates the card in DRAFT. **No card number is allocated** — that happens at issuance, ' +
      'because a cancelled draft was never printed and a number against it would name an ' +
      'artifact that does not exist. Only a member in good standing may hold a card. ' +
      'Preparing requires `card.issue`; approving requires `card.approve`, which is a ' +
      'different permission. Note that this separates the permissions and not the people: ' +
      'a caller holding both may prepare a card and then approve it. Both officers are ' +
      'recorded, so the trail shows when they were the same person.',
    body: draftCardSchema,
    responses: {
      409: 'The member is not active, or already has a card in preparation or in use.',
    },
  })
  async draft(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(draftCardSchema)) body: DraftCardInput,
  ) {
    return { card: await this.cards.draft(actorOf(request), body) };
  }

  @RequirePermission('card.issue')
  @Patch(':id')
  @Documented({
    summary: 'Amend a card that has not yet been approved.',
    description:
      'A DRAFT only. Once submitted, amending it changes what the approver is judging; once ' +
      'issued, the card is a physical object and amending its record would make the System ' +
      'describe something other than what was printed. Replace it instead.',
    body: updateCardSchema,
    responses: { 409: 'The card is no longer a draft.' },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCardSchema)) body: UpdateCardInput,
  ) {
    return { card: await this.cards.update(actorOf(request), id, body) };
  }

  @RequirePermission('card.issue')
  @Post(':id/submission')
  @Documented({
    summary: 'Send a prepared card for approval.',
    responses: { 409: 'The card is not a draft.' },
  })
  async submit(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { card: await this.cards.submitForApproval(actorOf(request), id) };
  }

  @RequirePermission('card.approve')
  @Post(':id/decision')
  @Documented({
    summary: 'Approve a card for issuance, or return it for amendment.',
    description:
      'Approval is the **only** place a card number is allocated, and it happens in the same ' +
      'transaction as the status change — so a card can never be issued without a number, nor ' +
      'hold a number without an issuance recorded against it. The photograph, holder ' +
      'signature, and officer signatures are snapshotted at the same moment. Good standing is ' +
      're-checked here, because preparation and approval can be days apart.',
    body: decideCardSchema,
    responses: {
      409: 'The card is not awaiting approval, or the member is no longer active.',
    },
  })
  async decide(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(decideCardSchema)) body: DecideCardInput,
  ) {
    return { card: await this.cards.decide(actorOf(request), id, body) };
  }

  /**
   * Handing an issued card to its holder.
   *
   * A separate route from the status change below, because it is governed by a
   * different permission — completing an issuance belongs to whoever issues,
   * not to whoever may suspend. A single route could only name one permission
   * on its decorator, and the guard refuses before the service is reached, so
   * "it depends on the transition" cannot be expressed there.
   */
  @RequirePermission('card.issue')
  @Post(':id/activation')
  @Documented({
    summary: 'Record that an issued card has been handed to its holder.',
    description:
      'ISSUED → ACTIVE, and nothing else. Requires `card.issue`, because completing an ' +
      'issuance belongs to whoever issues rather than to whoever may suspend. A card only ' +
      'verifies once it is ACTIVE: an ISSUED card exists and occupies its holder’s one live ' +
      'card slot, but it has not been handed over.',
    responses: {
      409: 'The card is not awaiting collection.',
    },
  })
  async activate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { card: await this.cards.activate(actorOf(request), id) };
  }

  @RequirePermission('card.suspend')
  @Patch(':id/status')
  @Documented({
    summary: 'Suspend, restore, or retire a card.',
    description:
      'ISSUED and REPLACED are deliberately unreachable here: the first is reached by ' +
      'approval, which allocates a number, and the second by replacement, which supersedes. ' +
      'So is handing a card over, which has its own route and its own permission. ACTIVE here ' +
      'means **restoring a suspended card**. A lost or expired card is never returned to ' +
      'ACTIVE — it is replaced, because a card reported lost may be in somebody else’s ' +
      'pocket. A reason is required and is recorded.',
    body: setCardStatusSchema,
    responses: {
      409: 'That transition is not permitted from the card’s current status.',
    },
  })
  async setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setCardStatusSchema)) body: SetCardStatusInput,
  ) {
    return { card: await this.cards.setStatus(actorOf(request), id, body) };
  }

  @RequirePermission('card.replace')
  @Post(':id/replacement')
  @Documented({
    summary: 'Replace a card, superseding the original.',
    description:
      'The original moves to REPLACED and a fresh **draft** is created pointing back at it, in ' +
      'one transaction. The replacement is a draft rather than an issued card because ' +
      'issuance is a separate authority — otherwise `card.replace` would mint credentials ' +
      'without `card.approve`. Both ends of the relationship survive. A card that was never ' +
      'printed, or was deliberately cancelled, cannot be replaced.',
    body: replaceCardSchema,
    responses: { 409: 'The card cannot be replaced from its current status.' },
  })
  async replace(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(replaceCardSchema)) body: ReplaceCardInput,
  ) {
    return { card: await this.cards.replace(actorOf(request), id, body) };
  }
}

/**
 * Officer signature assets (PRD §23.7).
 *
 * Union-wide reference data carrying no organisation path, so `canAnywhere` —
 * the guard's check — is the whole authorisation. The same deliberate exception
 * as master data, and for the same reason.
 */
@Controller('officer-signatures')
export class OfficerSignatureController {
  constructor(private readonly signatures: OfficerSignatureService) {}

  @RequirePermission('card.read')
  @Get()
  @Documented({
    summary: 'List officer signature assets.',
    description:
      'Active signatures by default. Superseded ones are retained rather than deleted, so ' +
      'that a card issued under a president who has since left office stays explicable. ' +
      'Returns the asset identifier, never the image.',
    query: [
      {
        name: 'includeSuperseded',
        description: 'Set to `true` to include withdrawn signatures.',
      },
    ],
  })
  async list(@Query('includeSuperseded') includeSuperseded?: string) {
    return {
      signatures: await this.signatures.list(includeSuperseded === 'true'),
    };
  }

  @RequirePermission('card_template.manage')
  @Post()
  @Documented({
    summary: 'Register a signature against an officer position.',
    description:
      'Supersedes whatever held the position, in one transaction, so the position is never ' +
      'briefly held by two signatures nor briefly by none. The image must have been uploaded ' +
      'as `OFFICER_SIGNATURE`: a passport photograph promoted into a signature slot would be ' +
      'printed on every card issued afterwards. Audited — a forged signature asset would ' +
      'forge every card issued after it.',
    body: createOfficerSignatureSchema,
    responses: {
      400: 'The asset does not exist or was not uploaded as an officer signature.',
      409: 'That image is already registered.',
    },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createOfficerSignatureSchema))
    body: CreateOfficerSignatureInput,
  ) {
    return { signature: await this.signatures.create(actorOf(request), body) };
  }

  @RequirePermission('card_template.manage')
  @Delete(':id')
  @Documented({
    summary: 'Withdraw a signature, leaving the position vacant.',
    description:
      'Deactivates rather than deletes: cards already issued under this signature must keep ' +
      'resolving. Cards issued afterwards carry a blank signature line rather than a stale ' +
      'one. A reason is required.',
    query: [{ name: 'reason', description: 'Why the signature is withdrawn.', required: true }],
    responses: {
      404: 'No such signature.',
      409: 'The signature is already superseded.',
    },
  })
  async deactivate(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('reason') reason?: string,
  ) {
    if (!reason || reason.trim().length < 4) {
      throw new BadRequestException('A reason is required.');
    }
    return {
      signature: await this.signatures.deactivate(
        actorOf(request),
        id,
        reason.trim(),
      ),
    };
  }
}
