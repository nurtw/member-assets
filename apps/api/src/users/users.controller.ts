import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import {
  assignRoleSchema,
  createRoleSchema,
  createUserSchema,
  reasonSchema,
  scopedPermissionSchema,
  setUserStatusSchema,
  updateRoleSchema,
  updateUserSchema,
  type AssignRoleInput,
  type CreateRoleInput,
  type CreateUserInput,
  type ReasonInput,
  type ScopedPermissionInput,
  type SetUserStatusInput,
  type UpdateRoleInput,
  type UpdateUserInput,
} from '@nurtw/contracts';

import type { AuthenticatedRequest } from '../auth/authorisation.guard.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Documented } from '../docs/documented.decorator.js';
import type { ActorContext } from '../organisation/organisation.service.js';
import { RolesService } from './roles.service.js';
import { UsersService } from './users.service.js';

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

const NOT_SELF = 'An administrator cannot do this to their own account (403).';

/**
 * Officer accounts and the access given to them (PRD §16 — item 28).
 *
 * Accounts are Union-wide: an officer belongs to no branch until a role says
 * so. The guard's check is therefore the whole check for reading and for the
 * account itself. Giving a role or a permission is scoped: the service asks
 * the question again against the organisation named (Decision 9.4).
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @RequirePermission('user.read')
  @Get()
  @Documented({
    summary: 'List officer accounts.',
    description:
      'Each account with its status, whether it is still on a temporary password, whether it ' +
      'has a second factor, and its roles with the part of the Union each applies to. No ' +
      'response carries a password, a hash, or a second-factor secret.',
  })
  async list() {
    return { users: await this.users.list() };
  }

  @RequirePermission('user.manage')
  @Post()
  @Documented({
    summary: 'Create an officer account.',
    description:
      'Item 28. The System generates a temporary password and returns it this once; only its ' +
      'hash is stored. The officer must choose their own at first sign-in, and can do nothing ' +
      'else until they have. The account starts with no role: give it one separately.',
    body: createUserSchema,
    responses: { 409: 'An account with that email exists.' },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
  ) {
    return this.users.create(actorOf(request), body);
  }

  @RequirePermission('user.read')
  @Get(':id')
  @Documented({
    summary: 'Read one officer account.',
    description:
      'The account, its roles, the single permissions granted to it, and those revoked from ' +
      'it, each with its scope, its reason, and who gave it.',
    responses: { 404: 'No such account.' },
  })
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return { user: await this.users.get(id) };
  }

  @RequirePermission('user.manage')
  @Patch(':id')
  @Documented({
    summary: 'Amend an officer’s name or email.',
    description:
      'A reason is mandatory and the change is audited before and after. This route cannot ' +
      'change what the officer may do.',
    body: updateUserSchema,
    responses: {
      404: 'No such account.',
      409: 'An account with that email exists.',
    },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return { user: await this.users.update(actorOf(request), id, body) };
  }

  @RequirePermission('user.manage')
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Deactivate or reactivate an officer.',
    description:
      'Deactivating ends every session the officer has, on their next request. Nothing is ' +
      `deleted: the account and its history stay. A reason is mandatory. ${NOT_SELF}`,
    body: setUserStatusSchema,
    responses: {
      404: 'No such account.',
      409: 'The account is already in that state.',
    },
  })
  async setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setUserStatusSchema)) body: SetUserStatusInput,
  ) {
    return { user: await this.users.setStatus(actorOf(request), id, body) };
  }

  @RequirePermission('user.manage')
  @Post(':id/password/reset')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Issue an officer a new temporary password.',
    description:
      'Returns a temporary password this once, ends the officer’s sessions, and clears any ' +
      `lock. They must choose their own at next sign-in. A reason is mandatory. ${NOT_SELF}`,
    body: reasonSchema,
    responses: { 404: 'No such account.' },
  })
  async resetPassword(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.users.resetPassword(actorOf(request), id, body.reason);
  }

  @RequirePermission('user.manage')
  @Post(':id/mfa/reset')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Remove an officer’s second factor.',
    description:
      'For a lost phone with no recovery code left. Removes the authenticator and the ' +
      `recovery codes and ends the officer’s sessions; they set one up again. ${NOT_SELF}`,
    body: reasonSchema,
    responses: {
      404: 'No such account.',
      409: 'The account has no second factor.',
    },
  })
  async resetSecondFactor(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: ReasonInput,
  ) {
    return {
      user: await this.users.resetSecondFactor(
        actorOf(request),
        id,
        body.reason,
      ),
    };
  }

  @RequirePermission('user.manage')
  @Post(':id/roles')
  @Documented({
    summary: 'Give an officer a role within part of the Union.',
    description:
      'PRD §16, Decision 9.4. The role applies to the organisation named and everything ' +
      'beneath it. The administrator must hold `user.manage` over that organisation, and ' +
      'every permission in the role there: nobody gives what they do not hold (403). A ' +
      `reason is mandatory. ${NOT_SELF}`,
    body: assignRoleSchema,
    responses: {
      404: 'No such account, role, or organisation within the administrator’s scope.',
      409: 'The officer already holds that role there.',
    },
  })
  async assignRole(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignRoleSchema)) body: AssignRoleInput,
  ) {
    return { user: await this.users.assignRole(actorOf(request), id, body) };
  }

  @RequirePermission('user.manage')
  @Post(':id/roles/:assignmentId/remove')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Take a role away from an officer.',
    description:
      'Takes effect on the officer’s next request. A reason is mandatory, and the removal ' +
      `is kept in the audit trail. ${NOT_SELF}`,
    body: reasonSchema,
    responses: { 404: 'No such assignment within the administrator’s scope.' },
  })
  async removeRole(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: ReasonInput,
  ) {
    return {
      user: await this.users.removeRole(
        actorOf(request),
        id,
        assignmentId,
        body.reason,
      ),
    };
  }

  @RequirePermission('permission.grant')
  @Post(':id/grants')
  @Documented({
    summary: 'Grant an officer one permission within part of the Union.',
    description:
      'Decision 9.3, layer 2. How `vehicle.declare` reaches anyone but the super ' +
      'administrator (PRD §9.5). The administrator must hold `permission.grant` and the ' +
      `permission itself over the organisation named (403). A reason is mandatory. ${NOT_SELF}`,
    body: scopedPermissionSchema,
    responses: {
      404: 'No such account, or no such organisation within the administrator’s scope.',
      409: 'That permission is already granted there.',
    },
  })
  async grant(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scopedPermissionSchema))
    body: ScopedPermissionInput,
  ) {
    return { user: await this.users.grant(actorOf(request), id, body) };
  }

  @RequirePermission('permission.grant')
  @Post(':id/grants/:grantId/withdraw')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Withdraw a granted permission.',
    description: `Takes effect on the officer’s next request. A reason is mandatory. ${NOT_SELF}`,
    body: reasonSchema,
    responses: { 404: 'No such grant within the administrator’s scope.' },
  })
  async withdrawGrant(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: ReasonInput,
  ) {
    return {
      user: await this.users.withdrawGrant(
        actorOf(request),
        id,
        grantId,
        body.reason,
      ),
    };
  }

  @RequirePermission('permission.revoke')
  @Post(':id/revocations')
  @Documented({
    summary: 'Revoke one permission from an officer within part of the Union.',
    description:
      'Decision 9.3, layer 3. Switches the permission off for this officer there, whatever ' +
      `their roles or grants give: revocation always wins. A reason is mandatory. ${NOT_SELF}`,
    body: scopedPermissionSchema,
    responses: {
      404: 'No such account, or no such organisation within the administrator’s scope.',
      409: 'That permission is already revoked there.',
    },
  })
  async revoke(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scopedPermissionSchema))
    body: ScopedPermissionInput,
  ) {
    return { user: await this.users.revoke(actorOf(request), id, body) };
  }

  @RequirePermission('permission.revoke')
  @Post(':id/revocations/:revocationId/lift')
  @HttpCode(HttpStatus.OK)
  @Documented({
    summary: 'Lift a revocation.',
    description: `The officer’s roles and grants apply again there. A reason is mandatory. ${NOT_SELF}`,
    body: reasonSchema,
    responses: { 404: 'No such revocation within the administrator’s scope.' },
  })
  async liftRevocation(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('revocationId', ParseUUIDPipe) revocationId: string,
    @Body(new ZodValidationPipe(reasonSchema)) body: ReasonInput,
  ) {
    return {
      user: await this.users.liftRevocation(
        actorOf(request),
        id,
        revocationId,
        body.reason,
      ),
    };
  }
}

/** Roles, standard and composed (PRD §16, Decision 9.5 — item 28). */
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @RequirePermission('role.read')
  @Get()
  @Documented({
    summary: 'List roles and the permissions each holds.',
    description:
      'The roles of PRD §16, which cannot be changed, and those the Union has composed, each ' +
      'with its permissions and how many assignments name it.',
  })
  async list() {
    return { roles: await this.roles.list() };
  }

  @RequirePermission('role.manage')
  @Post()
  @Documented({
    summary: 'Compose a role.',
    description:
      'Decision 9.5. A role built from the permission catalogue. It may not hold ' +
      '`vehicle.declare` or `payment.manage_settlement`, which reach an officer only by ' +
      'express grant. The author must hold every permission they put in it (403). The code ' +
      'is fixed once created.',
    body: createRoleSchema,
    responses: { 409: 'A role with that code exists.' },
  })
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
  ) {
    return { role: await this.roles.create(actorOf(request), body) };
  }

  @RequirePermission('role.manage')
  @Put(':code')
  @Documented({
    summary: 'Change a composed role.',
    description:
      'Replaces its permissions. Every officer holding the role is affected from their next ' +
      'request. A reason is mandatory and the change is audited before and after. The roles ' +
      'of PRD §16 cannot be changed.',
    body: updateRoleSchema,
    responses: {
      404: 'No such role.',
      409: 'A system role cannot be changed.',
    },
  })
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('code') code: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ) {
    return { role: await this.roles.update(actorOf(request), code, body) };
  }
}
