/**
 * Identifies an uploaded image from its bytes.
 *
 * **The declared content type and the file extension are caller-supplied and are
 * not evidence of anything.** A caller may send an executable, name it
 * `photo.jpg`, and declare `image/jpeg`; that file would then be stored, served
 * back under a type the browser trusts, and — depending on what later consumes
 * it — executed. The bytes are the only statement about a file that the sender
 * cannot simply assert.
 *
 * Only formats the card and the officer portal actually render are accepted.
 * SVG is deliberately absent: it is a document format that carries script, and
 * an SVG "photograph" served from the Union's own origin would be stored
 * cross-site scripting.
 */

export interface RecognisedImage {
  /** The content type to store and to serve back — never the declared one. */
  contentType: string;
  extension: string;
}

interface Signature {
  contentType: string;
  extension: string;
  /** Byte sequence at `offset`; `null` matches any byte at that position. */
  magic: readonly (number | null)[];
  offset: number;
}

const SIGNATURES: readonly Signature[] = [
  {
    contentType: 'image/jpeg',
    extension: 'jpg',
    magic: [0xff, 0xd8, 0xff],
    offset: 0,
  },
  {
    contentType: 'image/png',
    extension: 'png',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    offset: 0,
  },
  {
    // RIFF....WEBP — the four bytes between are the file length.
    contentType: 'image/webp',
    extension: 'webp',
    magic: [
      0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50,
    ],
    offset: 0,
  },
];

export function recogniseImage(bytes: Buffer): RecognisedImage | null {
  for (const signature of SIGNATURES) {
    const { magic, offset } = signature;
    if (bytes.length < offset + magic.length) {
      continue;
    }
    const matches = magic.every(
      (expected, index) =>
        expected === null || bytes[offset + index] === expected,
    );
    if (matches) {
      return {
        contentType: signature.contentType,
        extension: signature.extension,
      };
    }
  }
  return null;
}

export const ACCEPTED_IMAGE_TYPES = SIGNATURES.map(
  (signature) => signature.contentType,
);
