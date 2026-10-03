/**
 * Source-address ranges (PRD §12.1, "allowed source IP ranges where
 * practical" — item 11).
 *
 * An external client may be limited to the addresses its organisation calls
 * from. A token used from anywhere else is then refused, so a token that
 * leaks is worth far less.
 *
 * Written out here, without Node's `net` module, because this package is also
 * compiled into the web application, which validates a range as it is typed.
 */

export type IpVersion = 4 | 6;

export interface ParsedIpAddress {
  version: IpVersion;
  value: bigint;
}

export interface ParsedIpRange {
  version: IpVersion;
  /** The first address of the range: the address with its host bits cleared. */
  base: bigint;
  prefix: number;
}

const BITS: Readonly<Record<IpVersion, number>> = { 4: 32, 6: 128 };

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(text: string): bigint | null {
  const match = IPV4.exec(text);
  if (!match) {
    return null;
  }
  let value = 0n;
  for (const part of match.slice(1)) {
    // "010" is octal to some parsers and decimal to others. Refusing it means
    // a range can never mean two different things.
    if (part.length > 1 && part.startsWith('0')) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

/** The 16-bit groups of one side of an IPv6 address, or `null` if malformed. */
function ipv6Groups(part: string, mayEndInIpv4: boolean): number[] | null {
  if (part === '') {
    return [];
  }
  const groups: number[] = [];
  const pieces = part.split(':');
  for (const [index, piece] of pieces.entries()) {
    if (piece.includes('.')) {
      // An embedded IPv4 address is valid only as the very end of the address.
      if (!mayEndInIpv4 || index !== pieces.length - 1) {
        return null;
      }
      const embedded = parseIpv4(piece);
      if (embedded === null) {
        return null;
      }
      groups.push(Number(embedded >> 16n), Number(embedded & 0xffffn));
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) {
      return null;
    }
    groups.push(parseInt(piece, 16));
  }
  return groups;
}

function parseIpv6(text: string): bigint | null {
  if (text.length < 2 || text.length > 45) {
    return null;
  }
  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const compressed = halves.length === 2;
  const head = ipv6Groups(halves[0] ?? '', !compressed);
  const tail = compressed ? ipv6Groups(halves[1] ?? '', true) : [];
  if (head === null || tail === null) {
    return null;
  }

  let groups: number[];
  if (compressed) {
    // "::" stands for at least one group of zeros.
    const missing = 8 - head.length - tail.length;
    if (missing < 1) {
      return null;
    }
    groups = [...head, ...Array.from({ length: missing }, () => 0), ...tail];
  } else {
    if (head.length !== 8) {
      return null;
    }
    groups = head;
  }
  return groups.reduce((value, group) => (value << 16n) | BigInt(group), 0n);
}

/** `::ffff:a.b.c.d` — an IPv4 address written as IPv6. */
function isIpv4Mapped(value: bigint): boolean {
  return value >> 32n === 0xffffn;
}

/**
 * Parses an address as a request reports it.
 *
 * An IPv4 address arriving as `::ffff:203.0.113.7`, which is how a dual-stack
 * socket reports it, is read as the IPv4 address it is. Otherwise an IPv4
 * range would never match a caller on such a socket.
 */
export function parseIpAddress(text: string): ParsedIpAddress | null {
  const trimmed = text.trim();
  if (!trimmed.includes(':')) {
    const value = parseIpv4(trimmed);
    return value === null ? null : { version: 4, value };
  }
  // A link-local address may carry a zone ("fe80::1%eth0"), which names an
  // interface on this machine and is no part of the address.
  const zone = trimmed.indexOf('%');
  const value = parseIpv6(zone === -1 ? trimmed : trimmed.slice(0, zone));
  if (value === null) {
    return null;
  }
  return isIpv4Mapped(value)
    ? { version: 4, value: value & 0xffffffffn }
    : { version: 6, value };
}

/**
 * Parses an allowed range: one address, or an address and a prefix length
 * (`203.0.113.0/24`, `2001:db8::/32`).
 *
 * A prefix of 0 is refused. It would cover every address, which is what an
 * empty list already means, and a list that looks like a restriction while
 * restricting nothing is worse than none.
 */
export function parseIpRange(text: string): ParsedIpRange | null {
  const parts = text.trim().split('/');
  if (parts.length > 2) {
    return null;
  }
  const [addressText = '', prefixText] = parts;

  let version: IpVersion;
  let value: bigint | null;
  if (addressText.includes(':')) {
    version = 6;
    value = parseIpv6(addressText);
    // Written as IPv6 but meaning IPv4: ambiguous once a prefix is attached.
    if (value !== null && isIpv4Mapped(value)) {
      return null;
    }
  } else {
    version = 4;
    value = parseIpv4(addressText);
  }
  if (value === null) {
    return null;
  }

  const bits = BITS[version];
  let prefix = bits;
  if (prefixText !== undefined) {
    if (!/^\d{1,3}$/.test(prefixText)) {
      return null;
    }
    prefix = Number(prefixText);
    if (prefix < 1 || prefix > bits) {
      return null;
    }
  }

  const hostBits = BigInt(bits - prefix);
  return { version, base: (value >> hostBits) << hostBits, prefix };
}

export function isValidIpRange(text: string): boolean {
  return parseIpRange(text) !== null;
}

export function ipInRange(
  address: ParsedIpAddress,
  range: ParsedIpRange,
): boolean {
  if (address.version !== range.version) {
    return false;
  }
  const hostBits = BigInt(BITS[range.version] - range.prefix);
  return address.value >> hostBits === range.base >> hostBits;
}

/**
 * Whether an address falls in any of the ranges.
 *
 * An address that cannot be read is in no range, and a range that cannot be
 * read contains nothing: each fails towards refusal. The caller decides what
 * an empty list means; here it contains nothing.
 */
export function ipInRanges(
  address: string,
  ranges: readonly string[],
): boolean {
  const parsed = parseIpAddress(address);
  if (parsed === null) {
    return false;
  }
  return ranges.some((text) => {
    const range = parseIpRange(text);
    return range !== null && ipInRange(parsed, range);
  });
}
