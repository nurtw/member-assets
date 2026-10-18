import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Values that must be recoverable, sealed at rest: an officer's second-factor
 * secret (item 28, under `MFA_ENCRYPTION_KEY`) and a member's NIN (item 44,
 * under `IDENTITY_ENCRYPTION_KEY`). AES-256-GCM, so a leaked database backup
 * yields neither, and a value altered in the database fails to open rather
 * than opening to something else.
 *
 * Built on `node:crypto` alone, with no Nest decorator, so a script can import
 * it. The stored form is `v1:<iv>:<tag>:<sealed>`; the version leaves room to
 * change the scheme without guessing at what an older value is.
 */
function keyFrom(material: string): Buffer {
  return createHash('sha256').update(material).digest();
}

export function encryptSecret(secret: string, keyMaterial: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyMaterial), iv);
  const sealed = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    sealed.toString('base64url'),
  ].join(':');
}

export function decryptSecret(stored: string, keyMaterial: string): string {
  const [version, iv, tag, sealed] = stored.split(':');
  if (version !== 'v1' || !iv || !tag || !sealed) {
    throw new Error('Unreadable sealed value.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(keyMaterial),
    Buffer.from(iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
