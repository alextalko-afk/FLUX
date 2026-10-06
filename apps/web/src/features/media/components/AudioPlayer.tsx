import { useRef, useState, useEffect } from 'react';
import clsx from 'clsx';

interface AudioPlayerProps {
  src: string;
  waveform?: number[];
  duration?: number;
}

export function AudioPlayer({ src, waveform, duration }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => setAudioDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audioDuration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = percent * audioDuration;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = audioDuration ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 bg-bg-hover rounded-lg p-2 min-w-[240px]">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-fg-accent flex items-center justify-center text-fg-on-accent flex-shrink-0 hover:opacity-90 transition-opacity"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        {waveform && waveform.length > 0 ? (
          <div
            className="h-8 flex items-center gap-0.5 cursor-pointer"
            onClick={handleSeek}
          >
            {waveform.map((value, idx) => {
              const isPlayed = (idx / waveform.length) * 100 <= progress;
              return (
                <div
                  key={idx}
                  className={clsx(
                    'flex-1 rounded-full transition-colors',
                    isPlayed ? 'bg-fg-accent' : 'bg-fg-tertiary',
                  )}
                  style={{ height: `${Math.max(20, value * 100)}%` }}
                />
              );
            })}
          </div>
        ) : (
          <div
            className="h-1 bg-fg-tertiary rounded-full cursor-pointer relative"
            onClick={handleSeek}
          >
            <div
              className="h-full bg-fg-accent rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
        <div className="text-2xs text-fg-tertiary mt-1">
          {formatTime(currentTime)} / {formatTime(audioDuration)}
        </div>
      </div>
    </div>
  );
}
