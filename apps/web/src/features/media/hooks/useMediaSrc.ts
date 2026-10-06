import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

/** `MessageMedia.url` is stored as `/api/v1/media/download/<id>`. */
const API_PREFIX = '/api/v1';

function toApiPath(url: string): string {
  return url.startsWith(API_PREFIX) ? url.slice(API_PREFIX.length) : url;
}

/**
 * Resolves a stable media URL into a short-lived presigned one.
 * Presigned links expire after 5 minutes, so the result is cached just
 * below that window and refetched whenever the component remounts.
 */
export function useMediaSrc(url: string | null | undefined, enabled = true) {
  const apiPath = url ? toApiPath(url) : null;

  return useQuery<string>({
    queryKey: ['media-src', apiPath],
    queryFn: async () => {
      const result = await api.get<{ url: string }>(apiPath!);
      return result.url;
    },
    enabled: Boolean(apiPath) && enabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}
