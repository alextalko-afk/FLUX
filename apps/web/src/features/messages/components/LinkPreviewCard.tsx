import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

interface Preview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const URL_RE = /https?:\/\/[^\s<>"')]+/i;

/** First web link in a message, or null. */
export function firstUrl(text: string): string | null {
  return URL_RE.exec(text)?.[0].replace(/[.,;:!?]+$/, '') ?? null;
}

/**
 * Card for the first link of a message. The server fetches the page (never the
 * viewer's browser), so the viewer's address is not exposed to the site.
 */
export function LinkPreviewCard({ url }: { url: string }) {
  const { data } = useQuery({
    queryKey: ['link-preview', url],
    queryFn: () => api.get<{ preview: Preview | null }>(`/link-preview?url=${encodeURIComponent(url)}`),
    staleTime: Infinity,
    retry: false,
  });
  const preview = data?.preview;
  if (!preview) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-2 block border-l-2 border-fg-accent pl-3 py-1 text-sm hover:bg-bg-hover rounded-r"
    >
      {preview.siteName && <div className="text-xs text-fg-accent truncate">{preview.siteName}</div>}
      {preview.title && <div className="font-medium text-fg-primary line-clamp-2">{preview.title}</div>}
      {preview.description && <div className="text-xs text-fg-secondary line-clamp-3">{preview.description}</div>}
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="mt-1 max-h-48 rounded-lg object-cover"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
    </a>
  );
}
