// Stable hash-based color for dynamic enum names (rooms, functions).
// Same name always maps to the same palette entry.
const ENUM_COLORS = [
  'text-blue-600 dark:text-blue-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-amber-600 dark:text-amber-400',
  'text-violet-600 dark:text-violet-400',
  'text-rose-600 dark:text-rose-400',
  'text-teal-600 dark:text-teal-400',
  'text-orange-600 dark:text-orange-400',
  'text-sky-600 dark:text-sky-400',
  'text-pink-600 dark:text-pink-400',
  'text-indigo-600 dark:text-indigo-400',
  'text-lime-600 dark:text-lime-400',
  'text-cyan-600 dark:text-cyan-400',
];

export function getEnumColor(name: string): string {
  if (!name) return 'text-gray-500 dark:text-gray-400';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return ENUM_COLORS[Math.abs(hash) % ENUM_COLORS.length];
}
