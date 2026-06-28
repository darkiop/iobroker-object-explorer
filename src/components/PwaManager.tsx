import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { setPwaCallbacks, triggerSwUpdate } from '../pwa';

export default function PwaManager() {
  const showToast = useToast();

  useEffect(() => {
    setPwaCallbacks(
      () => {
        showToast(
          'Neue Version verfügbar',
          'info',
          {
            label: 'Neu laden',
            onClick: () => {
              triggerSwUpdate();
              window.location.reload();
            },
          }
        );
      },
      () => {
        showToast('App bereit für Offline-Nutzung', 'success');
      }
    );
  }, [showToast]);

  return null;
}
