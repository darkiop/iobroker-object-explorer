import { useState, useEffect, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface UseInstallPromptResult {
  canInstall: boolean;
  install: () => void;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [canInstall, setCanInstall] = useState(false);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = () => {
    if (!promptRef.current) return;
    void promptRef.current.prompt();
    promptRef.current.userChoice.then(() => {
      promptRef.current = null;
      setCanInstall(false);
    });
  };

  return { canInstall, install };
}
