import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { Avatar } from '../../components/ui/Avatar';
import { useI18n } from '../../hooks/useI18n';
import { api, ApiError } from '../../lib/api';
import { useAuthStore } from '../../stores/auth.store';
import { useMediaSrc } from '../media/hooks/useMediaSrc';
import { useMediaUpload } from '../media/hooks/useMediaUpload';

interface StoryItem {
  id: string;
  caption: string | null;
  url: string;
  mimeType?: string;
  viewed: boolean;
  createdAt: string;
}
interface FeedEntry {
  author: { id: string; firstName: string; lastName?: string | null; avatarUrl?: string | null };
  stories: StoryItem[];
  hasUnseen: boolean;
}

const IMAGE_MS = 5000;

const icon = (d: string) => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

/** "today at 20:07" / "yesterday at 20:07" / a date. */
function useWhen() {
  const { t, locale } = useI18n();
  return (iso: string) => {
    const date = new Date(iso);
    const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86_400_000);
    if (days <= 0) return t('stories.todayAt', { time });
    if (days === 1) return t('stories.yesterdayAt', { time });
    return `${date.toLocaleDateString(locale)} ${time}`;
  };
}

/** Drives the progress of the current story: a fixed time for pictures, the playback position for video. */
function useProgress(storyKey: string, paused: boolean, isVideo: boolean, onDone: () => void) {
  const [progress, setProgress] = useState(0);
  const video = useRef<HTMLVideoElement | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    setProgress(0);
  }, [storyKey]);

  useEffect(() => {
    if (isVideo) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const tick = (now: number) => {
      if (!paused) elapsed += now - last;
      last = now;
      const value = Math.min(1, elapsed / IMAGE_MS);
      setProgress(value);
      if (value >= 1) doneRef.current();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [storyKey, paused, isVideo]);

  const videoProps = {
    ref: video,
    onTimeUpdate: () => {
      const el = video.current;
      if (el && el.duration) setProgress(el.currentTime / el.duration);
    },
    onEnded: () => doneRef.current(),
  };
  return { progress, videoProps, video };
}

function StoryMedia({ story, paused, onDone, onProgress }: { story: StoryItem; paused: boolean; onDone: () => void; onProgress: (p: number) => void }) {
  const { data: src } = useMediaSrc(story.url);
  const isVideo = Boolean(story.mimeType?.startsWith('video/'));
  const { progress, videoProps, video } = useProgress(story.id + (src ? '1' : '0'), paused || !src, isVideo, onDone);

  useEffect(() => onProgress(progress), [progress, onProgress]);
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (paused) el.pause();
    else void el.play().catch(() => undefined);
  }, [paused, video, src]);

  if (!src) return <div className="absolute inset-0 grid place-items-center text-white/60">…</div>;
  return isVideo ? (
    <video key={story.id} src={src} autoPlay playsInline {...videoProps} className="absolute inset-0 w-full h-full object-cover" />
  ) : (
    <img key={story.id} src={src} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
  );
}

function StoryViewer({ entries, start, onClose }: { entries: FeedEntry[]; start: number; onClose: () => void }) {
  const { t } = useI18n();
  const when = useWhen();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user?.id);
  const [authorIdx, setAuthorIdx] = useState(start);
  const entry = entries[authorIdx]!;
  const firstUnseen = entry.stories.findIndex((s) => !s.viewed);
  const [index, setIndex] = useState(firstUnseen === -1 ? 0 : firstUnseen);
  const [holding, setHolding] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reply, setReply] = useState('');
  const [progress, setProgress] = useState(0);
  const story = entry.stories[index];
  const own = entry.author.id === me;
  const paused = holding || typing;

  const hasPrev = authorIdx > 0 || index > 0;
  const hasNext = authorIdx < entries.length - 1 || index < entry.stories.length - 1;

  const goNext = useCallback(() => {
    if (index + 1 < entry.stories.length) setIndex(index + 1);
    else if (authorIdx + 1 < entries.length) {
      const next = entries[authorIdx + 1]!;
      setAuthorIdx(authorIdx + 1);
      const unseen = next.stories.findIndex((s) => !s.viewed);
      setIndex(unseen === -1 ? 0 : unseen);
    } else onClose();
  }, [index, entry.stories.length, authorIdx, entries, onClose]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex(index - 1);
    else if (authorIdx > 0) {
      const prev = entries[authorIdx - 1]!;
      setAuthorIdx(authorIdx - 1);
      setIndex(prev.stories.length - 1);
    }
  }, [index, authorIdx, entries]);

  useEffect(() => {
    if (!story || own) return;
    void api.post(`/stories/${story.id}/view`, {}).then(() => queryClient.invalidateQueries({ queryKey: ['stories'] }));
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (typing) return;
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, onClose, typing]);

  const viewers = useQuery({
    queryKey: ['stories', 'viewers', story?.id],
    queryFn: () => api.get<{ total: number }>(`/stories/${story!.id}/viewers`),
    enabled: own && !!story,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/stories/${story!.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stories'] });
      onClose();
    },
  });
  const send = useMutation({
    mutationFn: async () => {
      const chat = await api.post<{ id: string }>('/chats/private', { targetUserId: entry.author.id });
      await api.post(`/chats/${chat.id}/messages`, { type: 'TEXT', content: reply.trim(), clientTempId: crypto.randomUUID() });
    },
    onSuccess: () => {
      setReply('');
      setTyping(false);
      toast.success(t('stories.replySent'));
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong')),
  });

  if (!story) return null;
  const name = `${entry.author.firstName} ${entry.author.lastName ?? ''}`.trim();

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center animate-fade-in" role="dialog" aria-modal="true" data-testid="story-viewer">
      <div className="absolute inset-0" onClick={onClose} />
      <button onClick={onClose} className="absolute top-4 right-4 z-20 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10" aria-label={t('common.close')}>
        {icon('M18 6L6 18M6 6l12 12')}
      </button>

      {hasPrev && (
        <button onClick={goPrev} className="hidden md:grid absolute left-[calc(50%-290px)] z-20 w-10 h-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="prev">
          {icon('M15 18l-6-6 6-6')}
        </button>
      )}
      {hasNext && (
        <button onClick={goNext} className="hidden md:grid absolute right-[calc(50%-290px)] z-20 w-10 h-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="next">
          {icon('M9 18l6-6-6-6')}
        </button>
      )}

      <div className="relative h-[min(88vh,780px)] aspect-[9/16] max-w-[calc(100vw-1rem)] rounded-2xl overflow-hidden bg-neutral-900 shadow-dropdown select-none">
        <StoryMedia key={story.id} story={story} paused={paused} onDone={goNext} onProgress={setProgress} />

        {/* tap zones: the left third goes back, the rest forward; holding pauses */}
        <div
          className="absolute inset-0 z-10"
          onPointerDown={() => setHolding(true)}
          onPointerUp={() => setHolding(false)}
          onPointerLeave={() => setHolding(false)}
        >
          <button className="absolute left-0 top-16 bottom-24 w-1/3" onClick={goPrev} aria-label="prev" />
          <button className="absolute right-0 top-16 bottom-24 w-2/3" onClick={goNext} aria-label="next" />
        </div>

        <div className="absolute top-0 inset-x-0 z-20 p-3 pt-3.5 bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <div className="flex gap-1">
            {entry.stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 rounded-full bg-white/35 overflow-hidden">
                <div className="h-full bg-white" style={{ width: i < index ? '100%' : i === index ? `${Math.round(progress * 100)}%` : '0%' }} />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 mt-3 pointer-events-auto">
            <Avatar name={name} avatarUrl={entry.author.avatarUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="text-white text-sm font-semibold truncate">{name}</div>
              <div className="text-white/70 text-xs">{when(story.createdAt)}</div>
            </div>
            {own && (
              <button onClick={() => remove.mutate()} className="p-1.5 rounded-full text-white/80 hover:text-white hover:bg-white/15" aria-label={t('common.delete')}>
                {icon('M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6')}
              </button>
            )}
          </div>
        </div>

        <div className="absolute bottom-0 inset-x-0 z-20 p-3 pt-10 bg-gradient-to-t from-black/70 to-transparent">
          {story.caption && <p className="text-white text-sm mb-3 px-1 break-words">{story.caption}</p>}
          {own ? (
            <div className="flex items-center gap-2 text-white/90 text-sm px-1 pb-1">
              {icon('M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z')}
              {t('stories.views')}: {viewers.data?.total ?? 0}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) send.mutate();
              }}
              className="flex items-center gap-2 rounded-full bg-white/15 backdrop-blur-md px-4 py-2"
            >
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                placeholder={t('stories.replyPlaceholder')}
                className="flex-1 bg-transparent text-white placeholder:text-white/60 text-sm focus:outline-none"
                maxLength={500}
              />
              <button type="submit" disabled={!reply.trim() || send.isPending} className="text-white disabled:opacity-40" aria-label={t('common.send')}>
                {icon('M22 2L11 13M22 2l-7 20-4-9-9-4z')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A ring around an avatar: bright for stories you have not seen, grey for seen ones. */
function Ring({ unseen, children }: { unseen: boolean; children: React.ReactNode }) {
  return (
    <span className={clsx('rounded-full p-[2.5px] inline-flex', unseen ? 'bg-gradient-to-tr from-[#8f80ff] via-[#6aa8ff] to-[#5ad1ff]' : 'bg-border')}>
      <span className="rounded-full p-[2px] bg-bg-panel inline-flex">{children}</span>
    </span>
  );
}

/** Row of contacts with live stories at the top of the chat list, plus the "add" button. */
export function StoriesBar() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { upload } = useMediaUpload();
  const me = useAuthStore((s) => s.user);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const feed = useQuery({ queryKey: ['stories'], queryFn: () => api.get<{ items: FeedEntry[] }>('/stories'), refetchInterval: 60_000 });

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['stories'] });
    window.addEventListener('flux:story', refresh);
    return () => window.removeEventListener('flux:story', refresh);
  }, [queryClient]);

  const publish = async (file: File) => {
    setBusy(true);
    try {
      const uploaded = await upload(file);
      await api.post('/stories', { fileObjectId: uploaded.fileObjectId });
      await queryClient.invalidateQueries({ queryKey: ['stories'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.somethingWrong'));
    } finally {
      setBusy(false);
    }
  };

  const items = feed.data?.items ?? [];
  // Mine first, then the others with fresh stories before the seen ones.
  const ordered = [...items].sort((a, b) => Number(b.author.id === me?.id) - Number(a.author.id === me?.id) || Number(b.hasUnseen) - Number(a.hasUnseen));
  const mine = ordered.find((e) => e.author.id === me?.id);

  return (
    <div className="flex gap-3.5 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="stories-bar">
      <input
        ref={input}
        type="file"
        accept="image/*,video/mp4,video/webm"
        hidden
        data-testid="story-file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void publish(f);
        }}
      />
      <div className="relative flex flex-col items-center gap-1 shrink-0 w-[60px]">
        <button
          disabled={busy}
          onClick={() => (mine ? setOpen(ordered.indexOf(mine)) : input.current?.click())}
          aria-label={mine ? t('stories.you') : t('stories.add')}
        >
          {mine ? (
            <Ring unseen={mine.hasUnseen}>
              <Avatar name={me?.firstName ?? '?'} avatarUrl={me?.avatarUrl} size="md" />
            </Ring>
          ) : (
            <span className="inline-flex p-[4.5px]">
              <Avatar name={me?.firstName ?? '?'} avatarUrl={me?.avatarUrl} size="md" />
            </span>
          )}
        </button>
        <button
          onClick={() => input.current?.click()}
          disabled={busy}
          className="absolute right-0 top-[34px] w-[18px] h-[18px] rounded-full bg-fg-accent text-fg-on-accent ring-2 ring-bg-panel flex items-center justify-center"
          aria-label={t('stories.add')}
        >
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <span className="text-[11.5px] text-fg-secondary truncate w-full text-center">{t('stories.you')}</span>
      </div>

      {ordered.map((e, i) =>
        e.author.id === me?.id ? null : (
          <button key={e.author.id} onClick={() => setOpen(i)} className="flex flex-col items-center gap-1 shrink-0 w-[60px]">
            <Ring unseen={e.hasUnseen}>
              <Avatar name={e.author.firstName} avatarUrl={e.author.avatarUrl} size="md" />
            </Ring>
            <span className={clsx('text-[11.5px] truncate w-full text-center', e.hasUnseen ? 'text-fg-primary font-medium' : 'text-fg-secondary')}>{e.author.firstName}</span>
          </button>
        ),
      )}
      {open !== null && <StoryViewer entries={ordered} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
