/**
 * Derive minimal namespace patterns from a list of visible IDs.
 * Uses adapter.instance level: "hm-rpc.0.MEQ123.1.STATE" → "hm-rpc.0.*"
 * Falls back to full id if only 1-2 segments.
 */
export function derivePatterns(ids: string[]): string[] {
  if (ids.length === 0) return [];
  const prefixes = new Set<string>();
  for (const id of ids) {
    const dot1 = id.indexOf('.');
    if (dot1 === -1) {
      prefixes.add(id);
      continue;
    }
    const dot2 = id.indexOf('.', dot1 + 1);
    if (dot2 === -1) {
      // Only adapter.instance — subscribe that subtree
      prefixes.add(`${id}.*`);
    } else {
      // adapter.instance.* covers the device/channel/state subtree
      prefixes.add(`${id.slice(0, dot2)}.*`);
    }
  }
  return [...prefixes].sort();
}
