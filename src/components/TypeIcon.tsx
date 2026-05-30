import { ToggleLeft, Hash, Type, Braces, List, Layers, FileCode2, File } from 'lucide-react';

function TypeIcon({ type, size = 12 }: { type: string; size?: number }) {
  switch (type) {
    case 'boolean': return <ToggleLeft size={size} className="text-orange-500 dark:text-orange-400 shrink-0" />;
    case 'number':  return <Hash       size={size} className="text-blue-500 dark:text-blue-400 shrink-0" />;
    case 'string':  return <Type       size={size} className="text-green-600 dark:text-green-400 shrink-0" />;
    case 'object':  return <Braces     size={size} className="text-purple-500 dark:text-purple-400 shrink-0" />;
    case 'array':   return <List       size={size} className="text-pink-500 dark:text-pink-400 shrink-0" />;
    case 'mixed':   return <Layers     size={size} className="text-yellow-600 dark:text-yellow-400 shrink-0" />;
    case 'json':    return <FileCode2  size={size} className="text-cyan-500 dark:text-cyan-400 shrink-0" />;
    case 'file':    return <File       size={size} className="text-slate-500 dark:text-slate-400 shrink-0" />;
    default:        return null;
  }
}

export default TypeIcon;
