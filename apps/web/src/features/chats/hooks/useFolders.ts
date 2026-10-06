import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

export interface Folder {
  id: string;
  name: string;
  position: number;
  chatIds: string[];
}

const NO_FOLDERS: Folder[] = [];

/**
 * The signed-in user's chat folders. The list is kept current by the
 * `folder.updated` realtime event (wired in `main.tsx`), so a folder created
 * on one device appears on the others without a refetch.
 */
export function useFolders(): Folder[] {
  const { data } = useQuery({
    queryKey: ['folders'],
    queryFn: () => api.get<{ items: Folder[] }>('/folders'),
    staleTime: 60_000,
  });
  return data?.items ?? NO_FOLDERS;
}
