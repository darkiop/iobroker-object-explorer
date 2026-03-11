export function getTypeColor(type: string): string {
  switch (type) {
    case 'boolean': return 'text-orange-500 dark:text-orange-400';
    case 'number':  return 'text-blue-500 dark:text-blue-400';
    case 'string':  return 'text-green-600 dark:text-green-400';
    case 'object':  return 'text-purple-500 dark:text-purple-400';
    case 'array':   return 'text-pink-500 dark:text-pink-400';
    case 'mixed':   return 'text-yellow-600 dark:text-yellow-400';
    default:        return 'text-gray-500 dark:text-gray-400';
  }
}
