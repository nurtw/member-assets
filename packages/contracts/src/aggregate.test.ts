import { describe, expect, it } from 'vitest';

import {
  aggregateTotalQuerySchema,
  aggregateVehicleQuerySchema,
} from './index.js';

const ZONE = '7d1f0c2e-1b2a-4c3d-8e4f-5a6b7c8d9e0f';
const BRANCH = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('the grand total (Requirement 13.2)', () => {
  it('takes no parameter at all', () => {
    expect(aggregateTotalQuerySchema.safeParse({}).success).toBe(true);
    for (const query of [
      { zone_id: ZONE },
      { period: '2026-09' },
      { anything: 'x' },
    ]) {
      expect(aggregateTotalQuerySchema.safeParse(query).success).toBe(false);
    }
  });
});

describe('a filtered total (Requirement 13.1)', () => {
  const parse = (query: object) =>
    aggregateVehicleQuerySchema.safeParse(query).success;

  it('takes the approved filters, alone or together', () => {
    expect(parse({})).toBe(true);
    expect(parse({ zone_id: ZONE })).toBe(true);
    expect(parse({ branch_id: BRANCH })).toBe(true);
    expect(parse({ vehicle_category: 'SHUTTLE_BUS' })).toBe(true);
    expect(
      parse({ zone_id: ZONE, vehicle_category: 'TRUCKS', period: '2026-Q3' }),
    ).toBe(true);
  });

  it('refuses any other filter, rather than ignoring it', () => {
    for (const query of [
      { unit_id: BRANCH },
      { lga: 'Awka South' },
      { declaration_status: 'ACTIVE' },
      { plate_number: 'AA123XY' },
      { page: '2' },
    ]) {
      expect(parse(query), JSON.stringify(query)).toBe(false);
    }
  });

  it('refuses a zone and a branch together', () => {
    expect(parse({ zone_id: ZONE, branch_id: BRANCH })).toBe(false);
  });

  it('refuses a period that is not a month, quarter, or year', () => {
    for (const period of ['2026-09-01', '2026-Q5', 'last-week', '2026-13']) {
      expect(parse({ period })).toBe(false);
    }
    for (const period of ['2026-09', '2026-Q3', '2026']) {
      expect(parse({ period })).toBe(true);
    }
  });

  it('refuses a malformed identifier or category', () => {
    expect(parse({ zone_id: 'zone-1' })).toBe(false);
    expect(parse({ vehicle_category: 'shuttle bus' })).toBe(false);
  });
});
