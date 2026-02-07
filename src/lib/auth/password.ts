import { timingSafeEqual } from 'node:crypto';

function toPaddedBuffer(value: string, length: number): Buffer {
  const source = Buffer.from(value, 'utf8');
  const padded = Buffer.alloc(length);
  source.copy(padded);
  return padded;
}

export function constantTimeEquals(a: string, b: string): boolean {
  const maxLen = Math.max(
    Buffer.byteLength(a, 'utf8'),
    Buffer.byteLength(b, 'utf8'),
  );
  const aBuf = toPaddedBuffer(a, maxLen);
  const bBuf = toPaddedBuffer(b, maxLen);
  const equal = timingSafeEqual(aBuf, bBuf);
  return equal && a.length === b.length;
}
