import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateOrganisationInput,
  MoveOrganisationInput,
  OrganisationNode,
  OrganisationTreeNode,
  SetOrganisationActiveInput,
  UpdateOrganisationInput,
} from '@nurtw/contracts';
import {
  ORGANISATION_LEVELS,
  assertMoveIsAcyclic,
  assertValidPlacement,
  childPath,
  InvalidHierarchyError,
  outermostScopes,
  type OrganisationLevel,
} from '@nurtw/domain';
import type { Organisation, Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service.js';
import { PermissionService } from '../auth/permission.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const READ = 'organisation.read';
const MANAGE = 'organisation.manage';

/** Who is acting, and the request it arrived on — for the audit trail. */
export interface ActorContext {
  userId: string;
  requestId?: string | null;
  ipAddress?: string | null;
}

/**
 * The organisational hierarchy (PRD §6).
 *
 * **Every method here is record-scoped.** The global guard has already
 * established that the caller holds the permission *somewhere*; that is a coarse
 * gate and nothing more. Each method below re-asks the question against the path
 * of the record actually being touched, because holding `organisation.manage` in
 * one branch must never authorise acting on another branch's nodes
 * (`CLAUDE.md` → "Authentication and permissions", Decision 9.4).
 */
@Injectable()
export class OrganisationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  // --- Reads ---------------------------------------------------------------

  /**
   * The hierarchy as the caller is entitled to see it.
   *
   * Filtered to the subtrees in which the caller holds `organisation.read`, and
   * returned as a forest rather than a single tree: a branch administrator's
   * view legitimately has no council at its head. Returning the whole hierarchy
   * and letting the dashboard hide the rest would disclose the Union's complete
   * structure to every officer holding the most basic read permission.
   */
  async tree(userId: string): Promise<OrganisationTreeNode[]> {
    const scopes = await this.readableScopes(userId);
    if (scopes.length === 0) {
      return [];
    }

    const rows = await this.prisma.organisation.findMany({
      where: { OR: scopes.map((path) => ({ path: { startsWith: path } })) },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    return this.assemble(rows);
  }

  /** A single node, or 404 where the caller may not read it. */
  async findOne(userId: string, id: string): Promise<OrganisationNode> {
    const node = await this.loadVisible(userId, id);
    return this.toSummary(node, await this.countChildren(node.id));
  }

  // --- Mutations -----------------------------------------------------------

  /**
   * Creates a node beneath `parentId`, or a council at the root.
   *
   * The permission is checked against the **parent's** path. A node that does
   * not exist yet has no path of its own, so the question can only be "may this
   * user add something beneath there".
   */
  async create(
    actor: ActorContext,
    input: CreateOrganisationInput,
  ): Promise<OrganisationNode> {
    const parent = input.parentId
      ? await this.loadVisible(actor.userId, input.parentId)
      : null;

    await this.requireManage(actor.userId, parent?.path ?? '/');

    this.assertPlacement(parent?.level ?? null, input.level);

    if (parent && !parent.isActive) {
      throw new ConflictException(
        'A node cannot be created beneath an inactive organisation.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // The path contains the row's own id, which the database assigns, so the
      // row is written once and its path set immediately afterwards inside the
      // same transaction. No row is ever visible carrying a provisional path.
      const row = await tx.organisation.create({
        data: {
          name: input.name,
          level: input.level,
          parentId: parent?.id ?? null,
          stateName: input.level === 'COUNCIL' ? (input.stateName ?? null) : null,
          path: '',
        },
      });

      const withPath = await tx.organisation.update({
        where: { id: row.id },
        data: { path: childPath(parent?.path ?? null, row.id) },
      });

      await this.audit.record(
        {
          action: 'organisation.create',
          subjectType: 'organisation',
          subjectId: withPath.id,
          organisationId: withPath.id,
          actorUserId: actor.userId,
          after: this.auditView(withPath),
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return withPath;
    });

    return this.toSummary(created, 0);
  }

  /** Renames a node. Level and parent are deliberately not editable here. */
  async update(
    actor: ActorContext,
    id: string,
    input: UpdateOrganisationInput,
  ): Promise<OrganisationNode> {
    const node = await this.loadVisible(actor.userId, id);
    await this.requireManage(actor.userId, node.path);

    if (input.stateName !== undefined && node.level !== 'COUNCIL') {
      throw new ConflictException(
        'A state is recorded on a council only (PRD §23.2).',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organisation.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.stateName !== undefined
            ? { stateName: input.stateName }
            : {}),
        },
      });

      await this.audit.record(
        {
          action: 'organisation.update',
          subjectType: 'organisation',
          subjectId: id,
          organisationId: id,
          actorUserId: actor.userId,
          before: this.auditView(node),
          after: this.auditView(row),
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toSummary(updated, await this.countChildren(id));
  }

  /**
   * Moves a node, and every descendant with it.
   *
   * **Authorised at both ends, and this is the rule to defend in review.** A move
   * is simultaneously a removal from one place and an insertion into another, so
   * it takes `organisation.manage` at the node's current location *and* at the
   * destination. Checking one end only would let an administrator scoped to
   * branch A pull a node out of branch B into their own scope — acquiring
   * authority over its members without ever holding a permission in B — or push
   * one of their own nodes outside their scope, where they could no longer see
   * what they had done.
   */
  async move(
    actor: ActorContext,
    id: string,
    input: MoveOrganisationInput,
  ): Promise<OrganisationNode> {
    const node = await this.loadVisible(actor.userId, id);

    // The origin.
    await this.requireManage(actor.userId, node.path);

    const destination = input.parentId
      ? await this.loadVisible(actor.userId, input.parentId)
      : null;
    const destinationPath = destination?.path ?? '/';

    // The destination. Not redundant: it is a different subtree by definition.
    await this.requireManage(actor.userId, destinationPath);

    if ((destination?.id ?? null) === node.parentId) {
      throw new ConflictException('The node is already in that position.');
    }

    this.assertPlacement(destination?.level ?? null, node.level);

    try {
      assertMoveIsAcyclic(node.path, destination?.path ?? null);
    } catch (error) {
      if (error instanceof InvalidHierarchyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }

    if (destination && !destination.isActive) {
      throw new ConflictException(
        'A node cannot be moved beneath an inactive organisation.',
      );
    }

    const oldPath = node.path;
    const newPath = childPath(destination?.path ?? null, node.id);

    const moved = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organisation.update({
        where: { id },
        data: { parentId: destination?.id ?? null, path: newPath },
      });

      /**
       * Rewrite every descendant in the same statement, and the same
       * transaction as the node itself.
       *
       * A partial rewrite is not a cosmetic defect: descendants would keep a
       * prefix naming an ancestor that no longer contains them, and
       * `scopeContains` would then answer authorisation questions from stale
       * ancestry — granting access through the branch the record has left and
       * denying it through the branch it has joined.
       *
       * Raw SQL because this is string concatenation across rows, which Prisma's
       * `updateMany` cannot express. The prefix is parameterised; paths are
       * built from UUIDs and separators and contain no LIKE metacharacter.
       *
       * `substr(text, int)` with an explicit cast, NOT `substring(x FROM y)`.
       * With a text-typed parameter the latter is PostgreSQL's *regular
       * expression* form, which finds no match and returns NULL — every path in
       * the subtree would be set to null rather than rewritten. The not-null
       * constraint on the column caught it here; without that constraint it
       * would have been silent scope corruption.
       */
      const rewritten = await tx.$executeRaw`
        UPDATE "organisation"
           SET "path" = ${newPath} || substr("path", ${oldPath.length + 1}::int),
               "updated_at" = now()
         WHERE "path" LIKE ${`${oldPath}%`}
           AND "id" <> ${id}::uuid
      `;

      await this.audit.record(
        {
          action: 'organisation.move',
          subjectType: 'organisation',
          subjectId: id,
          organisationId: id,
          actorUserId: actor.userId,
          reason: input.reason,
          before: { ...this.auditView(node), path: oldPath },
          after: {
            ...this.auditView(row),
            path: newPath,
            descendantsRewritten: rewritten,
          },
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toSummary(moved, await this.countChildren(id));
  }

  /**
   * Activates or deactivates a node. Nothing is ever deleted (domain rule 5).
   *
   * Deactivation refuses while active children or active members remain, so an
   * administrator works bottom-up and no single click quietly disables a
   * subtree. Activation refuses beneath an inactive parent. Together these hold
   * the invariant *an active node's ancestors are all active*, which is what
   * allows an interface to trust the flag on a single row.
   */
  async setActive(
    actor: ActorContext,
    id: string,
    input: SetOrganisationActiveInput,
  ): Promise<OrganisationNode> {
    const node = await this.loadVisible(actor.userId, id);
    await this.requireManage(actor.userId, node.path);

    if (node.isActive === input.isActive) {
      throw new ConflictException('The organisation is already in that state.');
    }

    if (!input.isActive) {
      const [activeChildren, activeMembers] = await Promise.all([
        this.prisma.organisation.count({
          where: { parentId: id, isActive: true },
        }),
        this.prisma.member.count({
          where: { organisationId: id, status: 'ACTIVE' },
        }),
      ]);

      if (activeChildren > 0) {
        throw new ConflictException(
          `This organisation has ${activeChildren} active child organisation(s). Deactivate those first.`,
        );
      }
      if (activeMembers > 0) {
        throw new ConflictException(
          `This organisation has ${activeMembers} active member(s). Reassign them first.`,
        );
      }
    } else if (node.parentId) {
      const parent = await this.prisma.organisation.findUnique({
        where: { id: node.parentId },
        select: { isActive: true },
      });
      if (!parent?.isActive) {
        throw new ConflictException(
          'The parent organisation is inactive. Activate it first.',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organisation.update({
        where: { id },
        data: { isActive: input.isActive },
      });

      await this.audit.record(
        {
          action: input.isActive
            ? 'organisation.activate'
            : 'organisation.deactivate',
          subjectType: 'organisation',
          subjectId: id,
          organisationId: id,
          actorUserId: actor.userId,
          reason: input.reason,
          before: this.auditView(node),
          after: this.auditView(row),
          requestId: actor.requestId,
          ipAddress: actor.ipAddress,
        },
        tx,
      );

      return row;
    });

    return this.toSummary(updated, await this.countChildren(id));
  }

  // --- Internals -----------------------------------------------------------

  private async readableScopes(userId: string): Promise<string[]> {
    const held = await this.permissions.listFor(userId);
    return outermostScopes(
      held
        .filter((entry) => entry.permission === READ)
        .map((entry) => entry.scopePath),
    );
  }

  /**
   * Loads a node the caller is entitled to see, or 404.
   *
   * "Outside your scope" and "no such node" answer identically on purpose: a
   * unit administrator enumerating identifiers must not be able to learn which
   * of them name real organisations. Existence is disclosed only within a
   * subtree the caller may already read.
   */
  private async loadVisible(
    userId: string,
    id: string,
  ): Promise<Organisation & { level: OrganisationLevel }> {
    const node = await this.prisma.organisation.findUnique({ where: { id } });
    if (!node) {
      throw new NotFoundException();
    }
    if (!(await this.permissions.can(userId, READ, node.path))) {
      throw new NotFoundException();
    }
    return node as Organisation & { level: OrganisationLevel };
  }

  private async requireManage(userId: string, path: string): Promise<void> {
    if (!(await this.permissions.can(userId, MANAGE, path))) {
      throw new ForbiddenException();
    }
  }

  private assertPlacement(
    parentLevel: OrganisationLevel | null,
    childLevel: OrganisationLevel,
  ): void {
    try {
      assertValidPlacement(parentLevel, childLevel);
    } catch (error) {
      if (error instanceof InvalidHierarchyError) {
        throw new ConflictException(error.message);
      }
      throw error;
    }
  }

  private countChildren(id: string): Promise<number> {
    return this.prisma.organisation.count({ where: { parentId: id } });
  }

  /** Depth is derived from the path, never stored — one fewer thing to drift. */
  private depthOf(path: string): number {
    return path.split('/').filter((segment) => segment.length > 0).length - 1;
  }

  private toSummary(node: Organisation, childCount: number): OrganisationNode {
    return {
      id: node.id,
      name: node.name,
      level: node.level as OrganisationLevel,
      parentId: node.parentId,
      stateName: node.stateName,
      isActive: node.isActive,
      depth: this.depthOf(node.path),
      childCount,
    };
  }

  /**
   * What a change records in the audit trail.
   *
   * Named fields, not the whole row. Spreading the record would enrol every
   * column added to this table in future into a seven-year retention it was
   * never assessed for (PRD §22).
   */
  private auditView(node: Organisation): Prisma.InputJsonObject {
    return {
      name: node.name,
      level: node.level,
      parentId: node.parentId,
      stateName: node.stateName,
      isActive: node.isActive,
    };
  }

  /** Builds the forest, parenting only within the visible set. */
  private assemble(rows: readonly Organisation[]): OrganisationTreeNode[] {
    const byId = new Map<string, OrganisationTreeNode>();
    for (const row of rows) {
      byId.set(row.id, {
        ...this.toSummary(row, 0),
        children: [],
      });
    }

    const roots: OrganisationTreeNode[] = [];
    for (const row of rows) {
      const node = byId.get(row.id);
      if (!node) {
        continue;
      }
      const parent = row.parentId ? byId.get(row.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
        parent.childCount = parent.children.length;
      } else {
        // Either a genuine root, or the top of the caller's visible subtree.
        roots.push(node);
      }
    }

    const byLevelThenName = (a: OrganisationTreeNode, b: OrganisationTreeNode) =>
      ORGANISATION_LEVELS.indexOf(a.level) -
        ORGANISATION_LEVELS.indexOf(b.level) || a.name.localeCompare(b.name);

    const sortDeep = (nodes: OrganisationTreeNode[]): void => {
      nodes.sort(byLevelThenName);
      for (const node of nodes) {
        sortDeep(node.children);
      }
    };
    sortDeep(roots);

    return roots;
  }
}
