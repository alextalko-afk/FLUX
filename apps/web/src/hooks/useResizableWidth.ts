import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

function readStored(key: string, fallback: number, min: number, max: number): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Width of a pane that the user drags by its edge, like the chat list in Telegram.
 * The value is clamped, remembered between sessions, and a double click on the handle resets it.
 */
export function useResizableWidth(storageKey: string, fallback: number, min: number, max: number) {
  const [width, setWidth] = useState(() => readStored(storageKey, fallback, min, max));
  const latest = useRef(width);
  latest.current = width;

  const save = useCallback(
    (value: number) => {
      try {
        localStorage.setItem(storageKey, String(Math.round(value)));
      } catch {
        // Private mode: the width simply is not remembered.
      }
    },
    [storageKey],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = latest.current;
      const previousCursor = document.body.style.cursor;
      const previousSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      let current = startWidth;
      const onMove = (e: PointerEvent) => {
        current = Math.min(max, Math.max(min, startWidth + e.clientX - startX));
        setWidth(current);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousSelect;
        save(current);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [max, min, save],
  );

  const reset = useCallback(() => {
    setWidth(fallback);
    save(fallback);
  }, [fallback, save]);

  // Keep the stored value inside the limits if they change between versions.
  useEffect(() => {
    setWidth((w) => Math.min(max, Math.max(min, w)));
  }, [min, max]);

  return { width, handleProps: { onPointerDown, onDoubleClick: reset } };
}
