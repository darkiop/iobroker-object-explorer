import React from 'react';
import { Check } from 'lucide-react';

function StyledCheckbox({ checked, indeterminate, onChange, title }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  title?: string;
}) {
  return (
    <label className="inline-flex items-center justify-center cursor-pointer select-none" title={title}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        ref={(el) => { if (el) el.indeterminate = !!indeterminate; }}
        className="sr-only"
      />
      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
        checked
          ? 'bg-blue-500 border-blue-500'
          : indeterminate
          ? 'bg-blue-400/60 border-blue-400'
          : 'bg-gray-100 dark:bg-gray-700 border-gray-400 dark:border-gray-500'
      }`}>
        {checked && <Check size={9} className="text-white" strokeWidth={3} />}
        {!checked && indeterminate && <span className="block w-2 h-[1.5px] bg-white rounded" />}
      </span>
    </label>
  );
}

export default StyledCheckbox;
