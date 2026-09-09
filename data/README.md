# Legacy Data Export

**This directory is excluded from version control. It must remain so.**

## Contents

A production export from the Union's existing system, comprising ten PostgreSQL tables in
CSV form. It is the source for roadmap item 09, `legacy-data-migration`.

## Restriction

The export contains the personal data of Union members — names, telephone numbers,
residential addresses, vehicle identification numbers — and at least one bcrypt password
hash in `users.csv`.

Accordingly:

- The directory is listed in `.gitignore` and must not be committed.
- Rows must not be reproduced in documentation, implementation plans, commit messages,
  issue text, or test fixtures. Test fixtures are synthetic, per `ARCHITECTURE.md`
  Decision 13.2.
- Values must not be written to application logs.

## Migration scope

Members, vehicles, drivers, and sticker requests are migrated.

`vehicle_wallets.csv`, `vehicle_transactions.csv`, and `company_charges.csv` are **not**
migrated. The System is not a revenue-collection platform; the exclusion is recorded in
`PRD.md` §2.2 and is a deliberate scope decision.

## Catalogue

Volumes, enumerations, and known quality defects are documented in `CLAUDE.md` under
"Legacy export shape". Two matters require the Union's determination before migration
begins; both are recorded in `ROADMAP.md` under "Open questions", items 8 and 9.
