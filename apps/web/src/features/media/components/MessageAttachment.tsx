import { useState } from 'react';
import clsx from 'clsx';
import { useMediaSrc } from '../hooks/useMediaSrc';
import { AudioPlayer } from './AudioPlayer';
import { VideoPlayer } from './VideoPlayer';
import { ImageViewer } from './ImageViewer';

export interface MessageMedia {
  fileObjectId?: string | null;
  url: string;
  mimeType: string;
  size: number;
  fileName?: string | null;
  duration?: number | null;
  waveform?: number[] | null;
  thumbnailUrl?: string | null;
  width?: number | null;
  height?: number | null;
}

interface MessageAttachmentProps {
  media: MessageMedia;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Renders an attachment inside a message bubble based on its mime type.
 * Resolves the presigned URL on demand — the API link itself returns JSON.
 */
export function MessageAttachment({ media }: MessageAttachmentProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { data: src, isLoading, isError } = useMediaSrc(media.url);
  // Small server-generated preview. Falls back to the full image when the
  // server could not produce one (gif/svg/failure), so behaviour is unchanged.
  const { data: thumb } = useMediaSrc(media.thumbnailUrl);

  if (isLoading) {
    return (
      <div className="min-w-[180px] h-20 bg-bg-hover rounded-lg animate-pulse" aria-hidden />
    );
  }

  if (isError || !src) {
    return (
      <div className="flex items-center gap-2 text-sm text-fg-error">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Failed to load attachment
      </div>
    );
  }

  const kind = media.mimeType.split('/')[0];

  if (kind === 'image') {
    return (
      <>
        <button
          type="button"
          onClick={() => setLightboxOpen(true)}
          className="block max-w-[320px] w-full overflow-hidden rounded-lg hover:opacity-90 transition-opacity"
        >
          <img
            src={thumb || src}
            alt={media.fileName || 'Image attachment'}
            className="block max-h-[400px] w-full object-cover"
            loading="lazy"
          />
        </button>
        {lightboxOpen && (
          <ImageViewer src={src} alt={media.fileName || 'Image'} onClose={() => setLightboxOpen(false)} />
        )}
      </>
    );
  }

  if (kind === 'video') {
    return (
      <div className="min-w-[260px] max-w-[360px]">
        <VideoPlayer src={src} poster={media.thumbnailUrl || undefined} />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="min-w-[240px] max-w-[320px]">
        <AudioPlayer
          src={src}
          duration={media.duration || undefined}
          waveform={media.waveform || undefined}
        />
      </div>
    );
  }

  return (
    <a
      href={src}
      download={media.fileName || undefined}
      target="_blank"
      rel="noreferrer"
      className={clsx(
        'flex items-center gap-3 min-w-[220px] p-2 rounded-lg',
        'bg-bg-hover hover:bg-bg-active transition-colors',
      )}
    >
      <div className="w-10 h-10 rounded-lg bg-fg-accent flex items-center justify-center text-fg-on-accent flex-shrink-0">
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-fg-primary truncate">
          {media.fileName || 'Attachment'}
        </div>
        <div className="text-xs text-fg-secondary">{formatBytes(media.size)}</div>
      </div>
    </a>
  );
}
