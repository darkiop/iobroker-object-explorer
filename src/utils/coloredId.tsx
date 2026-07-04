const DEPTH_COLORS = [
  'text-amber-600 dark:text-amber-400',
  'text-sky-600 dark:text-sky-400',
  'text-violet-600 dark:text-violet-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-rose-600 dark:text-rose-400',
];

export function ColoredId({ id, className }: { id: string; className?: string }) {
  const parts = id.split('.');
  return (
    <span className={`truncate tracking-wide ${className ?? ''}`} title={id}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-gray-400/60 dark:text-gray-600 select-none">.</span>}
          <span className={DEPTH_COLORS[i] ?? 'text-gray-500 dark:text-gray-400'}>
            {part}
          </span>
        </span>
      ))}
    </span>
  );
}
