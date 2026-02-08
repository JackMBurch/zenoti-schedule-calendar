import sharp from 'sharp';

export type PreprocessedScreenshot = {
  // High-contrast image for row detection / layout.
  detection: Buffer;
  // Preserve glyph details for text OCR.
  text: Buffer;
};

export async function preprocessScreenshotForOcr(
  input: Buffer,
): Promise<PreprocessedScreenshot> {
  const base = sharp(input)
    .rotate()
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale()
    .normalize();

  const [detection, text] = await Promise.all([
    base.clone().threshold(180).toBuffer(),
    base.clone().sharpen().toBuffer(),
  ]);

  return { detection, text };
}
