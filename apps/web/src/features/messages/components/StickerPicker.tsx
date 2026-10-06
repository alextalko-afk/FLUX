import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Tooltip } from '../../../components/ui/Tooltip';
import { useI18n } from '../../../hooks/useI18n';
import { api, ApiError } from '../../../lib/api';
import { useMediaSrc } from '../../media/hooks/useMediaSrc';
import { useMediaUpload } from '../../media/hooks/useMediaUpload';

interface Sticker {
  id: string;
  emoji: string;
  url: string;
  mimeType?: string;
}
interface Pack {
  id: string;
  title: string;
  stickers: Sticker[];
}

type Tab = 'mine' | 'search' | 'create';

export function StickerPicker({ chatId }: { chatId: string }) {
  const { t } = useI18n();
  const { upload } = useMediaUpload();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('mine');
  const [mine, setMine] = useState<Pack[]>([]);
  const [found, setFound] = useState<Pack[]>([]);
  const [query, setQuery] = useState('');
  const [title, setTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fail = (err: unknown) => toast.error(err instanceof ApiError ? err.message : t('stickers.failed'));

  const loadMine = useCallback(
    () =>
      api
        .get<{ items: Pack[] }>('/stickers/packs/mine')
        .then((r) => setMine(r.items))
        .catch(() => setMine([])),
    [],
  );

  useEffect(() => {
    if (open) void loadMine();
  }, [open, loadMine]);

  useEffect(() => {
    if (!open || tab !== 'search' || !query.trim()) return setFound([]);
    const h = setTimeout(() => {
      api
        .get<{ items: Pack[] }>(`/stickers/packs?q=${encodeURIComponent(query)}`)
        .then((r) => setFound(r.items))
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(h);
  }, [open, tab, query]);

  const send = async (stickerId: string) => {
    try {
      await api.post(`/chats/${chatId}/stickers`, { stickerId });
      setOpen(false);
    } catch (err) {
      fail(err);
    }
  };

  const install = async (id: string) => {
    try {
      await api.post(`/stickers/packs/${id}/install`, {});
      await loadMine();
    } catch (err) {
      fail(err);
    }
  };

  const create = async () => {
    setBusy(true);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push(await upload(f));
      await api.post('/stickers/packs', {
        title: title.trim(),
        stickers: uploaded.map((u) => ({ fileObjectId: u.fileObjectId, emoji: '🙂' })),
      });
      setTitle('');
      setFiles([]);
      await loadMine();
      setTab('mine');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const grid = (p: Pack) => (
    <div key={p.id} className="space-y-1">
      <div className="text-xs uppercase text-fg-tertiary">{p.title}</div>
      <div className="grid grid-cols-4 gap-2">
        {p.stickers.map((s) => (
          <button key={s.id} type="button" onClick={() => void send(s.id)} className="aspect-square p-1 rounded-lg hover:bg-bg-hover">
            <StickerImage src={s.url} alt={s.emoji} mimeType={s.mimeType} />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <Tooltip label={t('stickers.title')} side="top">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={t('stickers.title')}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16v10l-6 6H4z" />
            <path d="M14 20v-6h6" />
          </svg>
        </Button>
      </Tooltip>
      <Modal isOpen={open} onClose={() => setOpen(false)} title={t('stickers.title')} size="sm">
        <div className="p-5 space-y-3">
          <div className="flex gap-2 text-sm">
            {(['mine', 'search', 'create'] as Tab[]).map((x) => (
              <Button key={x} size="sm" variant={tab === x ? 'primary' : 'ghost'} onClick={() => setTab(x)}>
                {t(`stickers.tab_${x}`)}
              </Button>
            ))}
          </div>

          {tab === 'mine' && (mine.length ? mine.map(grid) : <div className="text-sm text-fg-secondary">{t('stickers.empty')}</div>)}

          {tab === 'search' && (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('stickers.search')}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-fg-primary"
              />
              {found.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{p.title} · {p.stickers.length}</span>
                  <Button size="sm" disabled={mine.some((m) => m.id === p.id)} onClick={() => void install(p.id)}>
                    {t('stickers.add')}
                  </Button>
                </div>
              ))}
            </>
          )}

          {tab === 'create' && (
            <>
              <input
                value={title}
                maxLength={64}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('stickers.packTitle')}
                className="w-full bg-bg-elevated border border-border rounded-lg px-3 py-2 text-fg-primary"
              />
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/png,image/webp,image/gif,video/webm"
                className="hidden"
                onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 60))}
              />
              <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                {t('stickers.pick')} ({files.length})
              </Button>
              <div className="text-xs text-fg-secondary">{t('stickers.limits')}</div>
              <Button className="w-full" onClick={create} isLoading={busy} disabled={!title.trim() || files.length === 0}>
                {t('stickers.create')}
              </Button>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}

export function StickerImage({ src, alt, mimeType, className = 'w-full h-full object-contain' }: { src: string; alt: string; mimeType?: string; className?: string }) {
  const { data: url } = useMediaSrc(src);
  if (!url) return <span className="text-2xl">{alt}</span>;
  // A WebM sticker is a short looping clip; GIF and animated WebP animate on their own in <img>.
  return mimeType === 'video/webm' ? (
    <video src={url} className={className} autoPlay loop muted playsInline aria-label={alt} />
  ) : (
    <img src={url} alt={alt} className={className} />
  );
}
