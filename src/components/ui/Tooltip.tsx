import React from 'react';
import * as RadixTooltip from '@radix-ui/react-tooltip';

export const TooltipProvider = RadixTooltip.Provider;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Tooltip({ content, children, side = 'top', align = 'center', className }: TooltipProps) {
  if (content === undefined || content === null || content === '') {
    return children;
  }

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          collisionPadding={8}
          sideOffset={6}
          className={
            className ??
            'z-[9999] px-2.5 py-1.5 rounded shadow-lg border text-xs font-mono bg-gray-900 border-gray-600 text-gray-100 dark:bg-gray-950 dark:border-gray-700'
          }
        >
          {content}
          <RadixTooltip.Arrow className="fill-gray-900 dark:fill-gray-950" />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
