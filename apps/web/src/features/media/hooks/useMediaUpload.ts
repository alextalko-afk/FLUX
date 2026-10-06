import { useState, useCallback } from 'react';
import { api } from '../../../lib/api';

interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

interface UploadResult {
  fileObjectId: string;
  url: string;
  thumbnailUrl: string | null;
  mimeType: string;
  size: number;
  category: 'image' | 'video' | 'audio' | 'document';
}

interface UseMediaUploadReturn {
  upload: (file: File, chatId?: string) => Promise<UploadResult>;
  isUploading: boolean;
  progress: UploadProgress | null;
  error: string | null;
  cancel: () => void;
}

export function useMediaUpload(): UseMediaUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const cancel = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsUploading(false);
    setProgress(null);
  }, [abortController]);

  const upload = useCallback(
    async (file: File, chatId?: string): Promise<UploadResult> => {
      setIsUploading(true);
      setProgress(null);
      setError(null);

      const controller = new AbortController();
      setAbortController(controller);

      try {
        const mediaType = getMediaType(file.type);

        const initResult = await api.post<any>('/media/upload/init', {
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size.toString(),
          mediaType,
          chatId,
        });

        const uploadResult = await uploadToPresignedUrl(
          initResult.uploadUrl,
          file,
          (loaded, total) => {
            setProgress({
              loaded,
              total,
              percent: Math.round((loaded / total) * 100),
            });
          },
          controller.signal,
        );

        if (!uploadResult.success) {
          throw new Error('Upload failed');
        }

        const completeResult = await api.post<UploadResult>('/media/upload/complete', {
          fileObjectId: initResult.fileObjectId,
        });

        setIsUploading(false);
        setProgress(null);
        return completeResult;
      } catch (err) {
        setIsUploading(false);
        setProgress(null);
        const message = err instanceof Error ? err.message : 'Upload failed';
        setError(message);
        throw err;
      }
    },
    [],
  );

  return { upload, isUploading, progress, error, cancel };
}

function getMediaType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'CHAT_MEDIA';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'VOICE';
  return 'CHAT_MEDIA';
}

function uploadToPresignedUrl(
  url: string,
  file: File,
  onProgress: (loaded: number, total: number) => void,
  signal: AbortSignal,
): Promise<{ success: boolean }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ success: true });
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));

    signal.addEventListener('abort', () => xhr.abort());

    xhr.send(file);
  });
}
