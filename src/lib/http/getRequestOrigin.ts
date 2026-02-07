function getFirstForwardedValue(value: string): string {
  // Per RFC 7239 and common proxy conventions, these headers may be comma-separated.
  // We use the left-most value (closest to the original client).
  return value.split(',')[0]?.trim() ?? value.trim();
}

export function getRequestOrigin(
  request: Pick<Request, 'headers' | 'url'>,
): string {
  const forwardedProtoRaw = request.headers.get('x-forwarded-proto');
  const forwardedHostRaw = request.headers.get('x-forwarded-host');
  const hostRaw = request.headers.get('host');

  const proto = forwardedProtoRaw
    ? getFirstForwardedValue(forwardedProtoRaw)
    : undefined;
  const host = forwardedHostRaw
    ? getFirstForwardedValue(forwardedHostRaw)
    : hostRaw;

  if (proto && host) {
    return `${proto}://${host}`;
  }

  // Fall back to what Next.js/Node thinks the URL is.
  return new URL(request.url).origin;
}
