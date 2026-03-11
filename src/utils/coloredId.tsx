export function ColoredId({ id, className }: { id: string; className?: string }) {
  const parts = id.split('.');
  return (
    <span className={`truncate ${className ?? ''}`} title={id}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-gray-400/60 dark:text-gray-600 select-none">.</span>}
          <span className={
            i === 0 ? 'text-amber-600 dark:text-amber-400' :
            i === 1 ? 'text-sky-600 dark:text-sky-400' :
            i === parts.length - 1 ? 'text-gray-800 dark:text-gray-200' :
            'text-gray-500 dark:text-gray-400'
          }>{part}</span>
        </span>
      ))}
    </span>
  );
}
