import { useEffect, useState, useRef, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../../../components/ui/Button';
import { useI18n } from '../../../hooks/useI18n';

interface ImageViewerProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export function ImageViewer({ src, alt = 'Image', onClose }: ImageViewerProps) {
  const { t } = useI18n();
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const positionStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const MIN = 1;
  const MAX = 6;
  const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v));
  const stageRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  // React attaches wheel listeners as passive, so zooming without scrolling the page needs a native one.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      setScale((s) => {
        const next = clamp(s * (e.deltaY > 0 ? 0.9 : 1.1));
        if (next === MIN) setPosition({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleMouseDown = (e: MouseEvent) => {
    moved.current = false;
    if (scale === MIN) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    positionStart.current = { ...position };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    setPosition({ x: positionStart.current.x + dx, y: positionStart.current.y + dy });
  };

  const handleMouseUp = () => setIsDragging(false);

  const zoomTo = (next: number) => {
    const v = clamp(next);
    setScale(v);
    if (v === MIN) setPosition({ x: 0, y: 0 });
  };
  const handleZoomIn = () => zoomTo(scale * 1.25);
  const handleZoomOut = () => zoomTo(scale / 1.25);
  const handleReset = () => zoomTo(1);
  const handleDoubleClick = () => zoomTo(scale > 1 ? 1 : 2.5);
  // A click on the dark backdrop (not on the picture or after a drag) closes the viewer.
  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget && !moved.current) onClose();
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = alt;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  };

  // Portalled: inside a bubble, an ancestor transform would make `fixed` relative to it.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1 p-1 rounded-full bg-black/50 border border-white/10 backdrop-blur text-white [&_button]:rounded-full">
        <Button size="sm" variant="ghost" onClick={handleZoomOut} aria-label={t('messages.zoomOut')}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReset} aria-label={t('messages.resetZoom')}>
          {Math.round(scale * 100)}%
        </Button>
        <Button size="sm" variant="ghost" onClick={handleZoomIn} aria-label={t('messages.zoomIn')}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDownload} aria-label={t('messages.download')}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} aria-label={t('common.close')}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </Button>
      </div>

      <div
        ref={stageRef}
        className={`w-full h-full flex items-center justify-center overflow-hidden ${scale > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'}`}
        onClick={handleBackdropClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={src}
          alt={alt}
          className="max-w-[94vw] max-h-[88vh] object-contain rounded-lg shadow-2xl select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.1s',
          }}
          draggable={false}
          onDoubleClick={handleDoubleClick}
        />
      </div>
    </div>,
    document.body,
  );
}
