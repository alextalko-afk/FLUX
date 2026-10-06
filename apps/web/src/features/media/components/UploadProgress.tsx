import { useI18n } from '../../../hooks/useI18n';

interface UploadProgressProps {
  fileName: string;
  percent: number;
  onCancel?: () => void;
}

export function UploadProgress({ fileName, percent, onCancel }: UploadProgressProps) {
  const { t } = useI18n();

  return (
    <div className="bg-bg-panel border border-border rounded-lg p-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-bg-hover flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-fg-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="text-sm font-medium text-fg-primary truncate">{fileName}</div>
            <div className="text-xs text-fg-secondary flex-shrink-0">{percent}%</div>
          </div>
          <div className="w-full h-1.5 bg-bg-hover rounded-full overflow-hidden">
            <div
              className="h-full bg-fg-accent transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="p-1 rounded hover:bg-bg-hover text-fg-secondary hover:text-fg-primary"
            aria-label={t('messages.cancelUpload')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
