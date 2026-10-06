import { ReactNode, DragEvent, useState, useRef } from 'react';
import clsx from 'clsx';

interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** Text shown in the overlay while a drag hovers the zone. */
  label?: string;
  /** Extra classes for the wrapper (e.g. flex sizing). */
  className?: string;
}

/**
 * Minimal `accept` matcher supporting the same forms the `<input type="file">`
 * attribute uses: extensions (`.png`), exact mime types (`image/png`) and
 * wildcards (`image/*`). Files that do not match are dropped silently.
 */
function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const patterns = accept
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;

  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) return name.endsWith(pattern);
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

export function FileDropZone({
  onFiles,
  children,
  accept,
  multiple = true,
  disabled = false,
  label = 'Drop files here',
  className,
}: FileDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files).filter((file) =>
      matchesAccept(file, accept),
    );
    if (files.length > 0) {
      onFiles(multiple ? files : [files[0]!]);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={clsx('relative', className, isDragging && 'ring-2 ring-fg-accent ring-offset-2')}
    >
      {children}
      {isDragging && (
        <div className="absolute inset-0 bg-bg-overlay flex items-center justify-center rounded-lg z-10">
          <div className="bg-bg-panel px-6 py-4 rounded-lg shadow-dropdown text-fg-primary font-medium">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
