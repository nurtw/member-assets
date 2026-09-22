/**
 * The reconciliation report (PRD §25, Requirement 25.3).
 *
 * A migration that silently drops or guesses at a record is worse than one
 * that fails loudly — every row this script could not import cleanly ends up
 * here, with a reason, rather than as a gap nobody notices. Never includes a
 * member's name, phone, or address: entries are keyed by legacy row id and
 * plate number, which is enough for staff to look the record up themselves.
 */
export class ReconciliationReport {
  private readonly failedVehicles: { legacyId: string; reason: string }[] = [];
  private readonly failedMembers: { legacyId: string; reason: string }[] = [];
  private readonly noLgaVehicles: { legacyId: string; plate: string }[] = [];
  private readonly flaggedVehicleStatus: {
    legacyId: string;
    plate: string;
    legacyStatus: string;
    mappedTo: string;
  }[] = [];
  private readonly flaggedMemberStatus: {
    legacyId: string;
    legacyStatus: string;
    mappedTo: string;
  }[] = [];
  private readonly unattachedVehicles: { legacyId: string; plate: string }[] =
    [];
  private readonly membersWithoutContact: { legacyId: string }[] = [];
  private counts = { vehicles: 0, members: 0 };

  vehicleImported(): void {
    this.counts.vehicles += 1;
  }
  memberImported(): void {
    this.counts.members += 1;
  }

  vehicleFailed(legacyId: string, reason: string): void {
    this.failedVehicles.push({ legacyId, reason });
  }
  memberFailed(legacyId: string, reason: string): void {
    this.failedMembers.push({ legacyId, reason });
  }
  noLga(legacyId: string, plate: string): void {
    this.noLgaVehicles.push({ legacyId, plate });
  }
  vehicleStatusFlagged(
    legacyId: string,
    plate: string,
    legacyStatus: string,
    mappedTo: string,
  ): void {
    this.flaggedVehicleStatus.push({ legacyId, plate, legacyStatus, mappedTo });
  }
  memberStatusFlagged(
    legacyId: string,
    legacyStatus: string,
    mappedTo: string,
  ): void {
    this.flaggedMemberStatus.push({ legacyId, legacyStatus, mappedTo });
  }
  unattached(legacyId: string, plate: string): void {
    this.unattachedVehicles.push({ legacyId, plate });
  }
  noContact(legacyId: string): void {
    this.membersWithoutContact.push({ legacyId });
  }

  render(): string {
    const table = (
      rows: Record<string, string>[],
      columns: string[],
    ): string => {
      if (rows.length === 0) {
        return '_None._\n';
      }
      const header = `| ${columns.join(' | ')} |`;
      const sep = `| ${columns.map(() => '---').join(' | ')} |`;
      const body = rows
        .map((row) => `| ${columns.map((c) => row[c] ?? '').join(' | ')} |`)
        .join('\n');
      return `${header}\n${sep}\n${body}\n`;
    };

    return `# Legacy migration reconciliation report

Generated ${new Date().toISOString()}. Row identifiers are legacy CSV ids —
no name, phone, or address appears here (CLAUDE.md's data-handling rule).

## Summary

- Vehicles imported: ${this.counts.vehicles}
- Members imported: ${this.counts.members}
- Vehicles with no local government area on record (Requirement 25.3): ${this.noLgaVehicles.length}
- Vehicles left unattached to any member (owner reconciliation, MIG-04): ${this.unattachedVehicles.length}
- Members imported with no contact row (missing phone or address): ${this.membersWithoutContact.length}
- Vehicle status flagged for review (MIG-06): ${this.flaggedVehicleStatus.length}
- Member status flagged for review (MIG-06): ${this.flaggedMemberStatus.length}
- Vehicles that failed to import: ${this.failedVehicles.length}
- Members that failed to import: ${this.failedMembers.length}

## Vehicles with no local government area

${table(
  this.noLgaVehicles.map((r) => ({ legacyId: r.legacyId, plate: r.plate })),
  ['legacyId', 'plate'],
)}

## Vehicles left unattached to a member

Own reconciliation is unmatched \`owner_jsonb\`, not attempted further (MIG-04
"import as recorded, reconcile afterwards"). Attach via the vehicle detail
screen's Owner section.

${table(
  this.unattachedVehicles.map((r) => ({ legacyId: r.legacyId, plate: r.plate })),
  ['legacyId', 'plate'],
)}

## Members imported without a contact record

Legacy \`phone\` or \`address\` was blank; PRD requires both non-null on
\`MemberContact\`, so none was created.

${table(
  this.membersWithoutContact.map((r) => ({ legacyId: r.legacyId })),
  ['legacyId'],
)}

## Vehicle status pending MIG-06 review

Legacy \`INACTIVE\` or \`blacklisted\` maps to \`SUSPENDED\` (reversible), never
a terminal status — provisional pending the Union's answer on what these
should mean.

${table(
  this.flaggedVehicleStatus as unknown as Record<string, string>[],
  ['legacyId', 'plate', 'legacyStatus', 'mappedTo'],
)}

## Member status pending MIG-06 review

${table(
  this.flaggedMemberStatus as unknown as Record<string, string>[],
  ['legacyId', 'legacyStatus', 'mappedTo'],
)}

## Vehicles that failed to import

${table(
  this.failedVehicles as unknown as Record<string, string>[],
  ['legacyId', 'reason'],
)}

## Members that failed to import

${table(
  this.failedMembers as unknown as Record<string, string>[],
  ['legacyId', 'reason'],
)}
`;
  }
}
