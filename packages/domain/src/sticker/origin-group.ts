import type { StickerOrigin } from './attachment.js';

/**
 * The two kinds the dashboard counts (item 64, `QUESTIONS.md` VEH-41, which
 * amends GOV-21 for the dashboard alone): a sticker from the imported register,
 * and one added through the System (taken into stock, or signed). A sticker's
 * own page still says only "sticker".
 */
export type StickerOriginGroup = 'IMPORTED' | 'ADDED';

export function stickerOriginGroup(origin: StickerOrigin): StickerOriginGroup {
  return origin === 'REGISTER' ? 'IMPORTED' : 'ADDED';
}
