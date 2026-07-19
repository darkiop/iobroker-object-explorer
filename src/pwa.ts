import { registerSW } from 'virtual:pwa-register';

type Callback = () => void;

let _onNeedRefresh: Callback | null = null;
let _onOfflineReady: Callback | null = null;
const _updateSW: ((reload?: boolean) => Promise<void>) | undefined = registerSW({
  immediate: true,
  onNeedRefresh() {
    _onNeedRefresh?.();
  },
  onOfflineReady() {
    _onOfflineReady?.();
  },
});

export function setPwaCallbacks(onNeedRefresh: Callback, onOfflineReady: Callback): void {
  _onNeedRefresh = onNeedRefresh;
  _onOfflineReady = onOfflineReady;
}

export function triggerSwUpdate(): void {
  void _updateSW?.(true);
}
