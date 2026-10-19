import { describe, expect, it } from 'vitest';

import { forwardedVisitor, trustedHop } from './client-address.js';

/**
 * Who is calling (item 55). Express walks from the connection outwards and
 * takes the first hop it does not trust as the caller, so what these allow is
 * exactly what a caller could otherwise forge.
 */
describe('trustedHop', () => {
  it('trusts only the router when there is no edge proxy', () => {
    const trust = trustedHop('none');

    expect(trust('10.0.0.5', 0)).toBe(true);
    expect(trust('104.16.0.1', 1)).toBe(false);
  });

  it('trusts one Cloudflare hop beyond the router, IPv4, IPv6, or mapped', () => {
    const trust = trustedHop('cloudflare');

    expect(trust('10.0.0.5', 0)).toBe(true);
    expect(trust('172.71.122.156', 1)).toBe(true);
    expect(trust('2606:4700:10::ac43:1', 1)).toBe(true);
    expect(trust('::ffff:104.16.0.1', 1)).toBe(true);
  });

  it('never trusts a hop that is not Cloudflare, or a second one that is', () => {
    const trust = trustedHop('cloudflare');

    expect(trust('203.0.113.7', 1)).toBe(false);
    expect(trust('104.16.0.1', 2)).toBe(false);
    expect(trust('not-an-address', 1)).toBe(false);
  });
});

describe('forwardedVisitor', () => {
  const SECRET = 's'.repeat(40);

  it('believes the website with the shared secret', () => {
    expect(forwardedVisitor(SECRET, '198.51.100.23', SECRET)).toBe(
      '198.51.100.23',
    );
    expect(forwardedVisitor(SECRET, ' 2001:db8::7 ', SECRET)).toBe(
      '2001:db8::7',
    );
    expect(forwardedVisitor(SECRET, '::ffff:198.51.100.23', SECRET)).toBe(
      '198.51.100.23',
    );
  });

  it('believes nobody without the secret, or with any other key', () => {
    expect(
      forwardedVisitor(SECRET, '198.51.100.23', undefined),
    ).toBeUndefined();
    expect(
      forwardedVisitor(undefined, '198.51.100.23', SECRET),
    ).toBeUndefined();
    expect(forwardedVisitor('wrong', '198.51.100.23', SECRET)).toBeUndefined();
    expect(
      forwardedVisitor(`${SECRET}x`, '198.51.100.23', SECRET),
    ).toBeUndefined();
  });

  it('takes one valid address and nothing else', () => {
    expect(forwardedVisitor(SECRET, undefined, SECRET)).toBeUndefined();
    expect(forwardedVisitor(SECRET, '', SECRET)).toBeUndefined();
    expect(
      forwardedVisitor(SECRET, '198.51.100.23, 203.0.113.7', SECRET),
    ).toBeUndefined();
    expect(forwardedVisitor(SECRET, 'localhost', SECRET)).toBeUndefined();
  });
});
