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
  private readonly ownerIncompleteVehicles: {
    legacyId: string;
    plate: string;
    missing: string;
  }[] = [];
  private readonly failedBarcodes: { legacyId: string; reason: string }[] = [];
  private counts = {
    vehicles: 0,
    members: 0,
    vehiclesAlreadyPresent: 0,
    membersAlreadyPresent: 0,
    vehiclesRepaired: 0,
    barcodes: 0,
    barcodesAlreadyPresent: 0,
    rowsWithoutBarcode: 0,
  };

  /** Requirement 9A.3 — a Transpay barcode placed on the register, unattached. */
  barcodeImported(): void {
    this.counts.barcodes += 1;
  }
  barcodeAlreadyPresent(): void {
    this.counts.barcodesAlreadyPresent += 1;
  }
  /** VEH-20 — onboards with a new signed sticker; not a defect. */
  rowWithoutBarcode(): void {
    this.counts.rowsWithoutBarcode += 1;
  }
  barcodeFailed(legacyId: string, reason: string): void {
    this.failedBarcodes.push({ legacyId, reason });
  }
  private registerWasSkipped = false;
  /** `--no-register` — the register was deliberately left alone this run. */
  registerSkipped(): void {
    this.registerWasSkipped = true;
  }

  vehicleImported(): void {
    this.counts.vehicles += 1;
  }
  memberImported(): void {
    this.counts.members += 1;
  }
  vehicleAlreadyPresent(): void {
    this.counts.vehiclesAlreadyPresent += 1;
  }
  memberAlreadyPresent(): void {
    this.counts.membersAlreadyPresent += 1;
  }
  /** `--repair` — a pre-1.2 legacy row corrected to the 1.3 shape. */
  vehicleRepaired(): void {
    this.counts.vehiclesRepaired += 1;
  }
  /** Requirement 25.4 — an owner record lacking a name or phone, or absent. */
  ownerIncomplete(legacyId: string, plate: string, missing: string): void {
    this.ownerIncompleteVehicles.push({ legacyId, plate, missing });
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

- Vehicles imported: ${this.counts.vehicles} (already present from an earlier run: ${this.counts.vehiclesAlreadyPresent})
- Members imported: ${this.counts.members} (already present from an earlier run: ${this.counts.membersAlreadyPresent})
- Pre-1.2 vehicles corrected to on record with owner details (\`--repair\`): ${this.counts.vehiclesRepaired}
${
  this.registerWasSkipped
    ? '- Transpay register: **not run** (`--no-register`)'
    : `- Transpay barcodes placed on the register, unattached (Requirement 9A.3): ${this.counts.barcodes} (already present from an earlier run: ${this.counts.barcodesAlreadyPresent})
- Vehicle rows with no barcode — onboarded later with a new sticker (VEH-20): ${this.counts.rowsWithoutBarcode}
- Barcodes that failed to import: ${this.failedBarcodes.length}`
}
- Vehicles with no local government area on record (Requirement 25.3): ${this.noLgaVehicles.length}
- Vehicles whose owner record lacks a name or phone (Requirement 25.4): ${this.ownerIncompleteVehicles.length}
- Vehicles with no driver (member) linked (MIG-04): ${this.unattachedVehicles.length}
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

## Vehicles with no driver linked

Only \`drivers.csv\` names a driver for a vehicle, and it covers few of them
(MIG-04: the driver is the member). Owners are never matched to members by
name. Link a driver from the vehicle screen's Driver section.

${table(
  this.unattachedVehicles.map((r) => ({ legacyId: r.legacyId, plate: r.plate })),
  ['legacyId', 'plate'],
)}

## Vehicles whose owner record is incomplete

Copied as recorded (Requirement 25.4). The gap must be filled before the
vehicle can be declared, which requires an owner name and phone
(Requirement 9.8).

${table(
  this.ownerIncompleteVehicles as unknown as Record<string, string>[],
  ['legacyId', 'plate', 'missing'],
)}

## Members imported without a contact record

Legacy \`phone\` or \`address\` was blank; PRD requires both non-null on
\`MemberContact\`, so none was created.

${table(
  this.membersWithoutContact.map((r) => ({ legacyId: r.legacyId })),
  ['legacyId'],
)}

## Vehicle status pending MIG-06 review

Every migrated vehicle is \`ON_RECORD\` whatever its legacy status (Decision
6.5). A legacy \`INACTIVE\`, \`blacklisted\`, or unrecognised value is kept in
the vehicle's notes and listed here, pending the Union's answer on what it
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

## Transpay barcodes that failed to import

The register is closed (VEH-21): a barcode missing here can never be
reattached, so each one needs a decision before go-live.

${table(
  this.failedBarcodes as unknown as Record<string, string>[],
  ['legacyId', 'reason'],
)}
`;
  }
}
