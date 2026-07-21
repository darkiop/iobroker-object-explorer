import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useAppSettingsContext } from '../context/UIContext';
import { setPwaCallbacks, triggerSwUpdate } from '../pwa';

export default function PwaManager() {
  const showToast = useToast();
  const { appSettings } = useAppSettingsContext();
  const isEn = appSettings.language === 'en';

  // Re-registers on language change so a toast fired later uses the current language.
  useEffect(() => {
    setPwaCallbacks(
      () => {
        showToast(
          isEn ? 'New version available' : 'Neue Version verfügbar',
          'info',
          {
            label: isEn ? 'Reload' : 'Neu laden',
            onClick: () => {
              triggerSwUpdate();
              window.location.reload();
            },
          }
        );
      },
      () => {
        showToast(isEn ? 'App ready for offline use' : 'App bereit für Offline-Nutzung', 'success');
      }
    );
  }, [showToast, isEn]);

  return null;
}
