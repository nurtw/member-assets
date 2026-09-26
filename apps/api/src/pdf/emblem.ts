import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The Union emblem, for documents other than the card (item 18's letter).
 *
 * The same file the card template bundles (`card/templates/assets/`), which
 * `nest-cli.json` already copies into `dist`, so this path resolves the same
 * way from source and from the build. Read once at module load: it is a
 * shipped asset, not a member's upload.
 *
 * The card template keeps its own read of the file. Template modules are left
 * exactly as issued (CLAUDE.md), so it is not re-pointed here.
 */
export const EMBLEM_PNG = readFileSync(
  fileURLToPath(
    new URL('../card/templates/assets/nurtw-emblem.png', import.meta.url),
  ),
);
