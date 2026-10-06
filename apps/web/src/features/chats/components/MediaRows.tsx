import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Modal } from '../../../components/ui/Modal';
import { ICON, ProfileRow, ProfileSection } from '../../../components/profile/ProfileCard';
import { useI18n } from '../../../hooks/useI18n';
import { useMediaSrc } from '../../media/hooks/useMediaSrc';

type Kind = 'images' | 'videos' | 'files' | 'voice' | 'links';

const FORMS: Record<string, { ru: [string, string, string]; en: [string, string] }> = {
  images: { ru: ['фотография', 'фотографии', 'фотографий'], en: ['photo', 'photos'] },
  videos: { ru: ['видео', 'видео', 'видео'], en: ['video', 'videos'] },
  files: { ru: ['файл', 'файла', 'файлов'], en: ['file', 'files'] },
  links: { ru: ['ссылка', 'ссылки', 'ссылок'], en: ['link', 'links'] },
  voice: { ru: ['голосовое сообщение', 'голосовых сообщения', 'голосовых сообщений'], en: ['voice message', 'voice messages'] },
  groups: { ru: ['общая группа', 'общие группы', 'общих групп'], en: ['common group', 'common groups'] },
};

/** "39 фотографий": the number followed by the noun in the correct Russian or English form. */
export function countLabel(kind: string, n: number, locale: string): string {
  const forms = FORMS[kind];
  if (!forms) return String(n);
  if (locale.startsWith('ru')) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    const i = mod10 === 1 && mod100 !== 11 ? 0 : mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20) ? 1 : 2;
    return `${n} ${forms.ru[i]}`;
  }
  return `${n} ${forms.en[n === 1 ? 0 : 1]}`;
}

const KINDS: { kind: Kind; icon: string; label: string }[] = [
  { kind: 'images', icon: ICON.image, label: 'chatInfo.images' },
  { kind: 'videos', icon: ICON.video, label: 'chatInfo.videos' },
  { kind: 'files', icon: ICON.file, label: 'chatInfo.files' },
  { kind: 'links', icon: ICON.link, label: 'chatInfo.links' },
  { kind: 'voice', icon: ICON.mic, label: 'chatInfo.voice' },
];

interface Item {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  sender: { id: string; firstName: string; lastName: string | null };
  media: { mimeType: string; size: number | string; url: string } | null;
}

/** Rows "Photos 39", "Videos 3", ... that open the matching list. Kinds with nothing in them are left out. */
export function MediaRows({ chatId }: { chatId: string }) {
  const { locale } = useI18n();
  const [open, setOpen] = useState<Kind | null>(null);
  const { data } = useQuery({
    queryKey: ['media-summary', chatId],
    queryFn: () => api.get<Record<Kind, number>>(`/chats/${chatId}/media-summary`),
  });

  const rows = KINDS.filter((k) => (data?.[k.kind] ?? 0) > 0);
  if (rows.length === 0) return null;

  return (
    <ProfileSection>
      {rows.map((k) => (
        <ProfileRow key={k.kind} path={k.icon} label={countLabel(k.kind, data![k.kind], locale)} onClick={() => setOpen(k.kind)} />
      ))}
      {open && <MediaBrowser chatId={chatId} kind={open} onClose={() => setOpen(null)} />}
    </ProfileSection>
  );
}

function Thumb({ item, kind, onOpen }: { item: Item; kind: 'images' | 'videos'; onOpen: () => void }) {
  const url = item.media?.url ?? '';
  const { data: src } = useMediaSrc(kind === 'images' ? `${url}${url.includes('?') ? '&' : '?'}thumb=1` : url);
  if (!src) return <div className="aspect-square bg-bg-hover animate-pulse rounded-md" />;
  return (
    <button onClick={onOpen} className="block aspect-square overflow-hidden rounded-md bg-bg-hover hover:opacity-90 transition-opacity">
      {kind === 'images' ? <img src={src} alt="" className="w-full h-full object-cover" /> : <video src={src} className="w-full h-full object-cover" muted />}
    </button>
  );
}

function FileRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const { data: src } = useMediaSrc(item.media?.url ?? '');
  const size = Number(item.media?.size ?? 0);
  return (
    <div className="flex items-center gap-3 py-2 text-sm text-fg-primary">
      <span className="text-fg-secondary">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICON.file} />
        </svg>
      </span>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left hover:text-fg-accent">
        <span className="block truncate">{item.content || item.media?.mimeType || '-'}</span>
        <span className="block text-xs text-fg-secondary">
          {size ? `${(size / 1024).toFixed(size > 1048576 ? 0 : 1)} KB · ` : ''}
          {new Date(item.createdAt).toLocaleDateString()}
        </span>
      </button>
      <a href={src} download className="p-1.5 rounded-lg text-fg-secondary hover:bg-bg-hover hover:text-fg-primary" aria-label="download">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d={ICON.download} />
        </svg>
      </a>
    </div>
  );
}

function VoiceRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const { data: src } = useMediaSrc(item.media?.url ?? '');
  return (
    <div className="py-2">
      <button onClick={onOpen} className="text-xs text-fg-secondary mb-1 hover:text-fg-accent text-left">
        {item.sender.firstName} · {new Date(item.createdAt).toLocaleString()}
      </button>
      {src ? <audio src={src} controls className="w-full h-9" /> : <div className="h-9 rounded bg-bg-hover animate-pulse" />}
    </div>
  );
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

function LinkRow({ item, onOpen }: { item: Item; onOpen: () => void }) {
  const url = URL_RE.exec(item.content)?.[0];
  if (!url) return null;
  return (
    <div className="py-2 text-sm">
      <a href={url} target="_blank" rel="noopener noreferrer" className="block text-fg-accent truncate hover:underline">
        {url}
      </a>
      <button onClick={onOpen} className="block text-xs text-fg-secondary hover:text-fg-accent text-left">
        {item.sender.firstName} · {new Date(item.createdAt).toLocaleDateString()}
      </button>
    </div>
  );
}

/** All items of one kind in a chat, newest first, loaded a page at a time. */
export function MediaBrowser({ chatId, kind, onClose }: { chatId: string; kind: Kind; onClose: () => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  // Opens the chat at that message; the profile window (if any) closes and the message lights up.
  const open = (messageId: string) => {
    onClose();
    window.dispatchEvent(new Event('flux:close-profile'));
    navigate(`/chats/${chatId}?msg=${messageId}`);
  };
  const query = useInfiniteQuery({
    queryKey: ['media-list', chatId, kind],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api.get<{ items: Item[]; next: string | null }>(
        `/chats/${chatId}/media?kind=${kind}&limit=30${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ''}`,
      ),
    getNextPageParam: (last) => last.next ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const title = t(KINDS.find((k) => k.kind === kind)!.label);

  return (
    <Modal isOpen onClose={onClose} title={title} size="md">
      <div className="p-4" data-testid="media-browser">
        {query.isLoading ? (
          <div className="text-sm text-fg-secondary">{t('common.loading')}</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-fg-secondary">{t('chatInfo.mediaEmpty')}</div>
        ) : kind === 'images' || kind === 'videos' ? (
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((item) => (
              <Thumb key={item.id} item={item} kind={kind} onOpen={() => open(item.id)} />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {items.map((item) =>
              kind === 'files' ? (
                <FileRow key={item.id} item={item} onOpen={() => open(item.id)} />
              ) : kind === 'voice' ? (
                <VoiceRow key={item.id} item={item} onOpen={() => open(item.id)} />
              ) : (
                <LinkRow key={item.id} item={item} onOpen={() => open(item.id)} />
              ),
            )}
          </div>
        )}
        {query.hasNextPage && (
          <button
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="mt-3 w-full py-2 rounded-xl bg-bg-elevated text-sm font-medium text-fg-primary hover:bg-bg-hover disabled:opacity-50"
          >
            {t('chatInfo.showMore')}
          </button>
        )}
      </div>
    </Modal>
  );
}
