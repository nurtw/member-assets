/**
 * Getting a member's photograph ready to upload (item 41, MEM-18).
 *
 * A phone's camera makes a picture of several megabytes, far more than a
 * card's photograph box can show and more than the API accepts. It is made
 * smaller in the browser before it is sent, which also spares a slow
 * connection. The API still decides what it will store: it reads the bytes,
 * not the name or the declared type.
 */

/** The longer edge of what is uploaded, in pixels. Ample for a printed card. */
export const PHOTOGRAPH_MAX_EDGE = 1200;

/**
 * What a membership card can print. The API stores a WebP picture too, but
 * the card cannot draw one, so a photograph is only ever sent as one of these.
 */
export const PRINTABLE_TYPES: readonly string[] = ["image/jpeg", "image/png"];

/** For a file chooser. */
export const PHOTOGRAPH_TYPES = PRINTABLE_TYPES.join(",");

/** Whether a file can go on a card as it is. */
export function isPrintable(type: string): boolean {
  return PRINTABLE_TYPES.includes(type.toLowerCase());
}

/** The size that fits within `max` on its longer edge, keeping its shape. */
export function fitWithin(
  width: number,
  height: number,
  max: number = PHOTOGRAPH_MAX_EDGE,
): { width: number; height: number } {
  const longer = Math.max(width, height);
  if (longer <= max || longer === 0) {
    return { width, height };
  }
  const scale = max / longer;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The picture as a JPEG no larger than it needs to be, turned the way the
 * camera held it. Where the browser cannot do that, the file goes as it is if
 * a card can print it; otherwise there is nothing to send, and `null` says so.
 */
export async function preparedPhotograph(file: File): Promise<File | null> {
  const asItIs = isPrintable(file.type) ? file : null;
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return asItIs;
    }
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86),
    );
    return blob
      ? new File([blob], "photograph.jpg", { type: "image/jpeg" })
      : asItIs;
  } catch {
    return asItIs;
  }
}
