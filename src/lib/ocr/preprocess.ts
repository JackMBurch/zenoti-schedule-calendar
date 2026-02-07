import sharp from 'sharp';

export async function preprocessForOcr(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width: 2200, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .threshold(180)
    .toBuffer();
}
