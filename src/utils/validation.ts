/**
 * Validates an ioBroker object ID.
 * Valid segments: alphanumerics, underscores, hyphens — separated by dots.
 * Examples: "javascript.0.myValue", "alias.0.lights.main", "0_userdata.0.temp"
 */
const IOBROKER_ID_RE = /^[a-zA-Z0-9_\-]+(\.[a-zA-Z0-9_\-]+)*$/;

export function isValidIoBrokerId(id: string): boolean {
  return IOBROKER_ID_RE.test(id.trim());
}

/**
 * Validates a single ID segment (no dots allowed).
 */
const ID_SEGMENT_RE = /^[a-zA-Z0-9_\-]+$/;

export function isValidIdSegment(segment: string): boolean {
  return ID_SEGMENT_RE.test(segment.trim());
}

/**
 * Validates an IP address (v4) or hostname/FQDN. Returns an error message or null if valid.
 */
const HOST_RE = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$|^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

export function validateHost(host: string): string | null {
  if (!HOST_RE.test(host)) return 'Invalid IP address or hostname.';
  return null;
}

/**
 * Validates a port string. Returns an error message or null if valid.
 */
export function validatePort(port: string): string | null {
  const trimmed = port.trim();
  if (!trimmed) return 'Port is required.';
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Port must be a number between 1 and 65535.';
  return null;
}
