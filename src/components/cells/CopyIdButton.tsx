import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyToClipboard } from '../../utils/clipboard';

function CopyIdButton({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    function done() { setCopied(true); setTimeout(() => setCopied(false), 1500); }
    copyToClipboard(id).then(done).catch(done);
  }

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover/id:opacity-100 text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-white shrink-0 transition-opacity"
      title={id}
    >
      {copied ? <Check size={12} className="text-green-500 dark:text-green-400" /> : <Copy size={12} />}
    </button>
  );
}

export default CopyIdButton;
