/**
 * The vehicle-letter template registry.
 *
 * One entry per version ever issued against. **Removing an entry is a breaking
 * change**: every letter issued under it becomes impossible to download again.
 * `registry.spec.ts` names every version ever issued, so deleting one fails a
 * test rather than an officer at a counter.
 */

import { NotFoundException } from '@nestjs/common';

import type { LetterTemplate } from './template.js';
import { v1 } from './v1.js';

const TEMPLATES: readonly LetterTemplate[] = [v1];

const BY_VERSION = new Map(
  TEMPLATES.map((template) => [template.version, template]),
);

/** The version new letters are issued against. */
export const CURRENT_LETTER_TEMPLATE_VERSION = v1.version;

/**
 * The template a letter was issued against. Throws rather than falling back to
 * the current one: a silent fallback would produce a letter the holder's copy
 * does not match, and it would look correct.
 */
export function letterTemplateFor(version: string): LetterTemplate {
  const template = BY_VERSION.get(version);
  if (!template) {
    throw new NotFoundException(
      `No letter template is registered under version ${version}. ` +
        'A template module must never be removed while letters reference it.',
    );
  }
  return template;
}
