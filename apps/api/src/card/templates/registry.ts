/**
 * The card template registry.
 *
 * One entry per version ever issued against. A card records its
 * `template_version` and re-renders through the module registered under it, so
 * a card issued years ago reprints exactly as it was printed.
 *
 * **Removing an entry is a breaking change.** Every card issued under that
 * version becomes unrenderable, and the reprint of a damaged card stops matching
 * the original. `registry.spec.ts` asserts that known versions stay registered,
 * so deleting one fails a test rather than a member at a counter.
 */

import { NotFoundException } from '@nestjs/common';

import type { CardTemplate } from './template.js';
import { v1Provisional } from './v1-provisional.js';

const TEMPLATES: readonly CardTemplate[] = [v1Provisional];

const BY_VERSION = new Map(
  TEMPLATES.map((template) => [template.version, template]),
);

/**
 * The version new cards are drafted against.
 *
 * Changing this affects cards drafted afterwards and no others — which is the
 * whole point of recording the version on the row.
 */
export const CURRENT_TEMPLATE_VERSION = v1Provisional.version;

export function listTemplates(): readonly CardTemplate[] {
  return TEMPLATES;
}

/**
 * The template a card was rendered against.
 *
 * Throws rather than falling back to the current template. A silent fallback
 * would reprint a card in a design the holder's card does not have, and the
 * reprint would look correct — which is worse than an error, because nobody
 * would investigate it.
 */
export function templateFor(version: string): CardTemplate {
  const template = BY_VERSION.get(version);
  if (!template) {
    throw new NotFoundException(
      `No card template is registered under version ${version}. ` +
        'A template module must never be removed while cards reference it.',
    );
  }
  return template;
}

export function currentTemplate(): CardTemplate {
  return templateFor(CURRENT_TEMPLATE_VERSION);
}
