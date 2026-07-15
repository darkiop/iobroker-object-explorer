import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipContextValue {
  delayDuration: number;
}

const TooltipContext = createContext<TooltipContextValue>({ delayDuration: 700 });

export interface TooltipProviderProps {
  delayDuration?: number;
  disableHoverableContent?: boolean;
  children: React.ReactNode;
}

export function TooltipProvider({ delayDuration = 700, children }: TooltipProviderProps) {
  return <TooltipContext.Provider value={{ delayDuration }}>{children}</TooltipContext.Provider>;
}

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  className?: string;
}

const CURSOR_OFFSET_X = 14;
const CURSOR_OFFSET_Y = 18;
const VIEWPORT_MARGIN = 8;

export function Tooltip({ content, children, className }: TooltipProps) {
  const { delayDuration } = useContext(TooltipContext);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useLayoutEffect(() => {
    if (!visible || !anchor || !contentRef.current) return;
    const { width, height } = contentRef.current.getBoundingClientRect();
    let x = anchor.x + CURSOR_OFFSET_X;
    let y = anchor.y + CURSOR_OFFSET_Y;
    if (x + width + VIEWPORT_MARGIN > window.innerWidth) x = anchor.x - width - CURSOR_OFFSET_X;
    if (y + height + VIEWPORT_MARGIN > window.innerHeight) y = anchor.y - height - CURSOR_OFFSET_Y;
    x = Math.max(VIEWPORT_MARGIN, Math.min(x, window.innerWidth - width - VIEWPORT_MARGIN));
    y = Math.max(VIEWPORT_MARGIN, Math.min(y, window.innerHeight - height - VIEWPORT_MARGIN));
    setPos({ x, y });
  }, [visible, anchor]);

  if (content === undefined || content === null || content === '') {
    return children;
  }

  function scheduleShow(x: number, y: number) {
    setAnchor({ x, y });
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), delayDuration);
  }

  function hide() {
    clearTimeout(timeoutRef.current);
    setVisible(false);
    setPos(null);
  }

  const child = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      scheduleShow(e.clientX, e.clientY);
    },
    onMouseMove: (e: React.MouseEvent) => {
      children.props.onMouseMove?.(e);
      setAnchor({ x: e.clientX, y: e.clientY });
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      scheduleShow(rect.left, rect.bottom);
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hide();
    },
  });

  return (
    <>
      {child}
      {visible &&
        anchor &&
        createPortal(
          <div
            ref={contentRef}
            data-testid="tooltip-content"
            style={{
              position: 'fixed',
              top: pos?.y ?? anchor.y,
              left: pos?.x ?? anchor.x,
              visibility: pos ? 'visible' : 'hidden',
            }}
            className={
              className ??
              'z-[9999] px-2.5 py-1.5 rounded shadow-lg border text-xs font-mono bg-gray-900 border-gray-600 text-gray-100 dark:bg-gray-950 dark:border-gray-700 pointer-events-none'
            }
          >
            {content}
          </div>,
          document.body
        )}
    </>
  );
}
