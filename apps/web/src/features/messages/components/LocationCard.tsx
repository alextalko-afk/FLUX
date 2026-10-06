import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../hooks/useI18n';
import { api } from '../../../lib/api';
import { useMessagesStore } from '../../../stores/messages.store';

export interface LocationView {
  latitude: number;
  longitude: number;
  label: string | null;
  isLive: boolean;
  updatedAt: string;
}

/** No map tiles are loaded: the card shows coordinates and links out, so nothing leaks to a map provider by itself. */
export function LocationCard({ chatId, messageId, location, isOwn }: { chatId: string; messageId: string; location: LocationView; isOwn: boolean }) {
  const { t } = useI18n();
  const lat = location.latitude.toFixed(5);
  const lon = location.longitude.toFixed(5);
  const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

  const stop = async () => {
    try {
      const next = await api.post<LocationView>(`/chats/${chatId}/messages/${messageId}/location/stop`, {});
      useMessagesStore.getState().updateMessage(chatId, messageId, { location: next } as any);
    } catch {
      toast.error(t('location.denied'));
    }
  };

  return (
    <div className="space-y-1 text-sm" data-testid="location-card">
      <div className="font-semibold text-fg-primary">📍 {location.label || t('location.title')}</div>
      <div className="text-fg-secondary">{lat}, {lon}</div>
      {location.isLive && <div className="text-xs text-green-600">● {t('location.liveNow')}</div>}
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-fg-accent hover:underline">
        {t('location.open')}
      </a>
      {location.isLive && isOwn && (
        <div>
          <Button size="sm" variant="ghost" onClick={() => void stop()}>
            {t('location.stop')}
          </Button>
        </div>
      )}
    </div>
  );
}
