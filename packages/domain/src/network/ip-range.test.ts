import { describe, expect, it } from 'vitest';

import {
  ipInRanges,
  isValidIpRange,
  parseIpAddress,
  parseIpRange,
} from './ip-range.js';

describe('parseIpAddress', () => {
  it('reads an IPv4 address', () => {
    expect(parseIpAddress('203.0.113.7')).toEqual({
      version: 4,
      value: 0xcb007107n,
    });
  });

  it('reads an IPv6 address, compressed or in full', () => {
    expect(parseIpAddress('::1')).toEqual({ version: 6, value: 1n });
    expect(parseIpAddress('2001:db8::1')).toEqual(
      parseIpAddress('2001:0db8:0000:0000:0000:0000:0000:0001'),
    );
    expect(parseIpAddress('2001:DB8::1')).toEqual(
      parseIpAddress('2001:db8::1'),
    );
  });

  it('reads an IPv4 address reported as IPv6 as the IPv4 address it is', () => {
    // A dual-stack socket reports a caller at 127.0.0.1 as ::ffff:127.0.0.1.
    expect(parseIpAddress('::ffff:127.0.0.1')).toEqual(
      parseIpAddress('127.0.0.1'),
    );
    expect(parseIpAddress('::ffff:7f00:1')).toEqual(
      parseIpAddress('127.0.0.1'),
    );
  });

  it('ignores the zone of a link-local address', () => {
    expect(parseIpAddress('fe80::1%eth0')).toEqual(parseIpAddress('fe80::1'));
  });

  it.each([
    '',
    'not an address',
    '203.0.113',
    '203.0.113.256',
    '203.0.113.07',
    '1.2.3.4.5',
    '2001:db8::1::2',
    '2001:db8:0:0:0:0:0:0:1',
    '2001:db8',
    '1:2:3:4:5:6:7::8',
    '2001:db8::g',
    '1.2.3.4::1',
    ':',
  ])('refuses %j', (text) => {
    expect(parseIpAddress(text)).toBeNull();
  });
});

describe('parseIpRange', () => {
  it('reads a bare address as a range of one', () => {
    expect(parseIpRange('203.0.113.7')).toMatchObject({
      version: 4,
      prefix: 32,
    });
    expect(parseIpRange('2001:db8::1')).toMatchObject({
      version: 6,
      prefix: 128,
    });
  });

  it('clears the host bits, so 10.1.2.3/8 is the range 10.0.0.0/8', () => {
    expect(parseIpRange('10.1.2.3/8')).toEqual(parseIpRange('10.0.0.0/8'));
  });

  it('refuses a prefix of zero, which would cover every address', () => {
    expect(isValidIpRange('0.0.0.0/0')).toBe(false);
    expect(isValidIpRange('::/0')).toBe(false);
  });

  it.each([
    '203.0.113.0/33',
    '203.0.113.0/-1',
    '203.0.113.0/',
    '203.0.113.0/24/8',
    '203.0.113.0/2x',
    '2001:db8::/129',
    '::ffff:10.0.0.0/104',
    'example.org',
    '',
  ])('refuses %j', (text) => {
    expect(isValidIpRange(text)).toBe(false);
  });

  it.each(['203.0.113.0/24', '10.0.0.0/8', '2001:db8::/32', ' 192.0.2.1 '])(
    'accepts %j',
    (text) => {
      expect(isValidIpRange(text)).toBe(true);
    },
  );
});

describe('ipInRanges', () => {
  it('finds an address inside a range and not one beside it', () => {
    const ranges = ['203.0.113.0/24'];
    expect(ipInRanges('203.0.113.0', ranges)).toBe(true);
    expect(ipInRanges('203.0.113.255', ranges)).toBe(true);
    expect(ipInRanges('203.0.114.0', ranges)).toBe(false);
    expect(ipInRanges('203.0.112.255', ranges)).toBe(false);
  });

  it('matches a single address exactly', () => {
    expect(ipInRanges('192.0.2.1', ['192.0.2.1'])).toBe(true);
    expect(ipInRanges('192.0.2.2', ['192.0.2.1'])).toBe(false);
  });

  it('matches any one of several ranges', () => {
    const ranges = ['192.0.2.1', '2001:db8::/32', '198.51.100.0/25'];
    expect(ipInRanges('198.51.100.127', ranges)).toBe(true);
    expect(ipInRanges('198.51.100.128', ranges)).toBe(false);
    expect(ipInRanges('2001:db8:ffff::9', ranges)).toBe(true);
    expect(ipInRanges('2001:db9::1', ranges)).toBe(false);
  });

  it('matches an IPv4 range against a caller reported as IPv6', () => {
    expect(ipInRanges('::ffff:203.0.113.9', ['203.0.113.0/24'])).toBe(true);
  });

  it('never matches an IPv4 address against an IPv6 range, or the reverse', () => {
    expect(ipInRanges('0.0.0.1', ['::1'])).toBe(false);
    expect(ipInRanges('::1', ['0.0.0.1'])).toBe(false);
  });

  it('fails towards refusal on anything it cannot read', () => {
    expect(ipInRanges('unknown', ['203.0.113.0/24'])).toBe(false);
    expect(ipInRanges('203.0.113.9', ['nonsense', '0.0.0.0/0'])).toBe(false);
    expect(ipInRanges('203.0.113.9', [])).toBe(false);
  });
});
