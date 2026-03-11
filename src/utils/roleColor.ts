export function getRoleColor(role: string): string {
  if (!role) return 'text-gray-500 dark:text-gray-400';
  const top = role.split('.')[0];
  switch (top) {
    case 'switch':
    case 'button':    return 'text-blue-500 dark:text-blue-400';
    case 'level':     return 'text-indigo-500 dark:text-indigo-400';
    case 'value':     return 'text-emerald-600 dark:text-emerald-400';
    case 'sensor':    return 'text-teal-600 dark:text-teal-400';
    case 'indicator': return 'text-amber-500 dark:text-amber-400';
    case 'text':      return 'text-purple-500 dark:text-purple-400';
    case 'media':     return 'text-pink-500 dark:text-pink-400';
    case 'weather':   return 'text-sky-500 dark:text-sky-400';
    case 'light':     return 'text-yellow-500 dark:text-yellow-400';
    case 'blind':
    case 'curtain':   return 'text-orange-500 dark:text-orange-400';
    case 'state':     return 'text-gray-600 dark:text-gray-300';
    default:          return 'text-gray-500 dark:text-gray-400';
  }
}
