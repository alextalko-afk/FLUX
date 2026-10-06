import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Tooltip } from '../../../components/ui/Tooltip';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';

const LIVE_OPTIONS = [900, 3600, 8 * 3600];
const UPDATE_EVERY_MS = 10_000;

const getPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15_000 });
  });

/** Sends the current position once or shares it live; live updates run while this page stays open. */
export function ShareLocation({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const watch = useRef<{ id: number; timer?: ReturnType<typeof setTimeout> } | null>(null);

  const stopWatching = () => {
    if (watch.current) navigator.geolocation.clearWatch(watch.current.id);
    watch.current = null;
  };
  useEffect(() => stopWatching, []);

  const share = async (liveSeconds?: number) => {
    setBusy(true);
    try {
      const pos = await getPosition();
      const message = await api.post<{ id: string }>(`/chats/${chatId}/location`, {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        ...(liveSeconds ? { liveSeconds } : {}),
      });
      setOpen(false);
      if (liveSeconds) startLive(message.id, liveSeconds);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('location.denied'));
    } finally {
      setBusy(false);
    }
  };

  const startLive = (messageId: string, seconds: number) => {
    stopWatching();
    const until = Date.now() + seconds * 1000;
    let last = Date.now();
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (Date.now() > until) return stopWatching();
        if (Date.now() - last < UPDATE_EVERY_MS) return;
        last = Date.now();
        api
          .post(`/chats/${chatId}/messages/${messageId}/location`, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          })
          .catch((err) => {
            // The server ends a share when its time is up or the sender stopped it.
            if (err instanceof ApiError && err.code === 'LOCATION_ENDED') stopWatching();
          });
      },
      stopWatching,
      { enableHighAccuracy: true },
    );
    watch.current = { id };
  };

  const label = (s: number) => (s < 3600 ? `${s / 60} ${t('location.min')}` : `${s / 3600} ${t('location.hour')}`);

  return (
    <>
      <Tooltip label={t('location.title')} side="top">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={t('location.title')}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </Button>
      </Tooltip>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('location.title')} size="sm">
        <div className="p-5 space-y-3">
          <Button className="w-full" onClick={() => void share()} isLoading={busy}>
            {t('location.sendCurrent')}
          </Button>
          <div className="text-xs uppercase text-fg-tertiary">{t('location.live')}</div>
          <div className="flex gap-2">
            {LIVE_OPTIONS.map((s) => (
              <Button key={s} size="sm" variant="ghost" disabled={busy} onClick={() => void share(s)}>
                {label(s)}
              </Button>
            ))}
          </div>
          <div className="text-xs text-fg-secondary">{t('location.liveHint')}</div>
        </div>
      </Modal>
    </>
  );
}
