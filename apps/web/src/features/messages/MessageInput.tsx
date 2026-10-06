import { useState, KeyboardEvent, useRef, useEffect, ChangeEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { useI18n } from '../../hooks/useI18n';
import { useThemeStore } from '../../stores/theme.store';
import { Tooltip } from '../../components/ui/Tooltip';
import { storage } from '../../lib/storage';
import { getChatType, isE2eeChat } from '../../stores/chats.store';
import { parseMarkdown, TextEntity } from '../../lib/richText';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/auth.store';
import { ShareLocation } from './components/ShareLocation';
import { StickerPicker } from './components/StickerPicker';
import { CreatePoll } from './components/CreatePoll';
import { ScheduleMessage } from './components/ScheduleMessage';
import { InlineBotResults } from './components/InlineBotResults';
import { encryptForChat } from '../../services/e2ee/secretSessions';
import { encryptForGroup } from '../../services/e2ee/groupSessions';

interface MessageInputProps {
  /** `entities` describe formatting (bold, code, links, ...) inside `content`. */
  onSend: (content: string, entities?: TextEntity[]) => void;
  onFile?: (file: File) => void;
  /** Starts voice recording; when omitted the mic button is hidden. */
  onVoice?: () => void;
  /** Called with `true` while the user types and `false` when they pause. */
  onTyping?: (isTyping: boolean) => void;
  isLoading?: boolean;
  isUploading?: boolean;
  replyTo?: { id: string; content: string; senderName: string } | null;
  onCancelReply?: () => void;
  /**
   * Enables per-chat draft persistence in IndexedDB. The component is reused
   * across chats (React keeps the same instance), so without this the text of
   * one conversation would silently carry over into the next.
   */
  chatId?: string;
  /** Set for a secret chat: the input stays locked until its keys are available. */
  secretStatus?: string;
}

export function MessageInput({
  onSend,
  onFile,
  onVoice,
  onTyping,
  isLoading,
  isUploading,
  replyTo,
  onCancelReply,
  chatId,
  secretStatus,
}: MessageInputProps) {
  const myId = useAuthStore((state) => state.user?.id) ?? '';
  const blocked = secretStatus !== undefined && secretStatus !== 'ready';
  const { t } = useI18n();
  const enterToSend = useThemeStore((s) => s.enterToSend);
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The callback is stored in a ref so the unmount cleanup can emit a final
  // "stopped typing" without re-running on every parent render.
  const onTypingRef = useRef(onTyping);
  onTypingRef.current = onTyping;
  const isTypingRef = useRef(false);
  const typingTimerRef = useRef<number | null>(null);

  const stopTyping = () => {
    if (typingTimerRef.current) {
      window.clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingRef.current?.(false);
    }
  };

  const handleChange = (next: string) => {
    setValue(next);

    if (next.trim().length === 0) {
      stopTyping();
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingRef.current?.(true);
    }

    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(stopTyping, 2500);
  };

  // Leaving the chat mid-sentence must not leave the peer staring at "typing…".
  useEffect(() => {
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      if (isTypingRef.current) onTypingRef.current?.(false);
    };
  }, []);

  // Drafts live in IndexedDB so they survive a reload and stay available
  // offline. Writes are debounced (no IDB hit per keystroke) and always target
  // the chat the text actually belongs to, so switching conversations mid-word
  // cannot file one chat's draft under another.
  const draftTimerRef = useRef<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);
  const draftChatRef = useRef<string | undefined>(chatId);
  const draftValueRef = useRef(value);
  const draftLoadedRef = useRef(false);
  draftValueRef.current = value;

  useEffect(() => {
    if (!chatId) {
      draftLoadedRef.current = false;
      return;
    }

    draftChatRef.current = chatId;
    // Block writes until this chat's draft has been read back: saving the
    // cleared value first would delete the very draft we are loading.
    draftLoadedRef.current = false;
    setValue('');

    let cancelled = false;
    void storage.getDraft(chatId).then((content) => {
      if (cancelled) return;
      draftLoadedRef.current = true;
      setValue(content);
    });

    return () => {
      cancelled = true;
      // Leaving the chat must not lose the last <500ms of typing.
      if (draftTimerRef.current) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
      void storage.saveDraft(draftChatRef.current!, draftValueRef.current);
    };
  }, [chatId]);

  useEffect(() => {
    if (!chatId || !draftLoadedRef.current) return;

    if (draftTimerRef.current) window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      draftTimerRef.current = null;
      void storage.saveDraft(chatId, value);
    }, 500);

    return () => {
      if (draftTimerRef.current) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = null;
      }
    };
  }, [chatId, value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // With "Enter sends" on: Enter sends, Shift+Enter makes a new line.
    // With it off: Enter inserts a newline, Ctrl/Cmd+Enter sends.
    const shouldSend = enterToSend
      ? e.key === 'Enter' && !e.shiftKey
      : e.key === 'Enter' && (e.ctrlKey || e.metaKey);

    if (shouldSend) {
      e.preventDefault();
      handleSubmit();
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey && !enterToSend) {
      // Prevent the composer from submitting the surrounding form.
      e.preventDefault();
    }
  };

  const handleSubmit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    stopTyping();

    let finalContent = trimmed;
    let entities: TextEntity[] | undefined;

    if (chatId && (getChatType(chatId) === 'SECRET' || isE2eeChat(chatId))) {
      // Never fall back to plaintext: a secret chat either encrypts or sends nothing.
      try {
        finalContent = isE2eeChat(chatId)
          ? await encryptForGroup(chatId, myId, trimmed)
          : await encryptForChat(chatId, myId, trimmed);
      } catch {
        toast.error(t('chats.secretCannotSend'));
        return;
      }
    } else {
      // Plain chats: turn **bold**, __italic__, `code`, ||spoiler||, [links](...)
      // into text + entities. A message that is only markup is sent as typed.
      const parsed = parseMarkdown(trimmed);
      if (parsed.text.trim()) {
        finalContent = parsed.text;
        entities = parsed.entities.length > 0 ? parsed.entities : undefined;
      }
    }

    onSend(finalContent, entities);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onFile) {
      onFile(file);
    }
    // Allow picking the same file again later.
    e.target.value = '';
  };

  const isBusy = isLoading || isUploading;

  return (
    <div className="border-t border-border-subtle bg-bg-panel/70 backdrop-blur-xl backdrop-saturate-150 p-3">
      {replyTo && (
        <div className="flex items-start gap-2 mb-2 px-2 py-1.5 bg-bg-hover border-l-2 border-fg-accent rounded-r animate-slide-down shadow-panel">
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-fg-accent truncate">
              {t('chats.replyingTo', { name: replyTo.senderName })}
            </div>
            <div className="text-xs text-fg-secondary truncate">
              {replyTo.content || t('chats.attachment')}
            </div>
          </div>
          <Tooltip label={t('messages.cancelReplyHint')} side="left">
            <button
              onClick={onCancelReply}
              className="p-1 rounded text-fg-secondary hover:bg-bg-active hover:text-fg-primary transition-colors"
              aria-label={t('chats.cancelReply')}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </Tooltip>
        </div>
      )}

      <InlineBotResults value={value} onPick={handleChange} />
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          tabIndex={-1}
          aria-hidden
        />
        <Tooltip label={t('messages.attachHint')} side="top">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fileInputRef.current?.click()}
            disabled={!onFile || isUploading}
            isLoading={isUploading}
            aria-label={t('chats.attachFile')}
          >
            {!isUploading && (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            )}
          </Button>
        </Tooltip>
        <textarea
          ref={textareaRef}
          disabled={blocked}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isUploading ? t('chats.uploading') : t('chats.messagePlaceholder')}
          rows={1}
          className="flex-1 resize-none bg-bg-elevated border border-border shadow-panel rounded-2xl px-4 py-3 text-[15px] leading-6 text-fg-primary placeholder:text-fg-tertiary max-h-[200px] transition-all duration-200 ease-spring hover:border-fg-accent/30 focus:outline-none focus:border-fg-accent/60 focus:ring-4 focus:ring-fg-accent/10"
        />
        {chatId && getChatType(chatId) !== 'SECRET' && !isE2eeChat(chatId) && (
          <div ref={menuRef} className="relative">
            <Tooltip label={t('messages.moreActions')} side="top">
              <Button size="sm" variant="ghost" onClick={() => setMenuOpen((v) => !v)} aria-label={t('messages.moreActions')} aria-expanded={menuOpen}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="19" cy="12" r="2" />
                </svg>
              </Button>
            </Tooltip>
            {/* Kept mounted (only hidden) so a dialog opened from here outlives the menu closing. */}
            <div
              onClick={() => setMenuOpen(false)}
              className={`${menuOpen ? 'flex' : 'hidden'} absolute bottom-full right-0 mb-2 gap-1 p-1 bg-bg-panel border border-border rounded-xl shadow-float z-20`}
            >
              {value.trim() ? (
                <ScheduleMessage chatId={chatId} text={value} onScheduled={() => setValue('')} />
              ) : (
                <>
                  <StickerPicker chatId={chatId} />
                  <ShareLocation chatId={chatId} />
                  <CreatePoll chatId={chatId} />
                </>
              )}
            </div>
          </div>
        )}
        {onVoice && !value.trim() ? (
          <Tooltip label={t('messages.voiceHint')} side="top">
            <Button
              size="sm"
              variant="ghost"
              onClick={onVoice}
              disabled={isBusy}
              aria-label={t('messages.recordVoice')}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </Button>
          </Tooltip>
        ) : (
          <Tooltip label={t('messages.sendHint')} side="top">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!value.trim() || isBusy}
              isLoading={isLoading}
              aria-label={t('chats.send')}
            >
              {!isLoading && (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              )}
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
