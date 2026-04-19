/**
 * Converts a base64 data URL (image/jpeg, image/png, or image/webp) to a Blob.
 * Returns null if the input is null, empty, or not a valid image data URL.
 */
export function dataUrlToBlob(dataUrl: string | null): Blob | null {
  if (!dataUrl) {
    return null;
  }

  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) {
    return null;
  }

  try {
    const contentType = match[1].toLowerCase();
    const base64Data = match[2];
    const binary = atob(base64Data);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: contentType });
  } catch {
    return null;
  }
}
