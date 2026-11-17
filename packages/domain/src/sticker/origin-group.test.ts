import { describe, expect, it } from 'vitest';

import { stickerOriginGroup } from './origin-group.js';

describe('stickerOriginGroup', () => {
  it('calls the imported register imported', () => {
    expect(stickerOriginGroup('REGISTER')).toBe('IMPORTED');
  });

  it('calls stock and signed stickers added through the System', () => {
    expect(stickerOriginGroup('STOCK')).toBe('ADDED');
    expect(stickerOriginGroup('SIGNED')).toBe('ADDED');
  });
});
