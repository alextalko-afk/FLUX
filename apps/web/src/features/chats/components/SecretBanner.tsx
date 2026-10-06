import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useI18n } from '../../../hooks/useI18n';
import type { SecretChatStatus } from '../hooks/useSecretChat';

/**
 * Strip at the top of a secret chat. It states what is true: the chat is
 * end-to-end encrypted and tied to two devices. When it is not usable on this
 * device it says so plainly instead of showing an empty conversation.
 */
export function SecretBanner({ state }: { state: SecretChatStatus }) {
  const { t } = useI18n();
  const [isVerifying, setIsVerifying] = useState(false);

  if (state.status === 'loading') return null;

  const lock = (
    <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );

  if (state.status !== 'ready') {
    const message =
      state.status === 'wrong-device'
        ? t('chats.secretWrongDevice')
        : state.status === 'revoked'
          ? t('chats.secretRevoked')
          : t('chats.secretError');
    return (
      <div role="alert" className="flex items-center gap-2 px-4 py-2 text-sm border-b border-border-subtle bg-bg-hover text-fg-error">
        {lock}
        <span>{message}</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2 text-sm border-b border-border-subtle bg-bg-panel/70 text-fg-secondary">
        <span className="text-fg-accent">{lock}</span>
        <span className="flex-1 min-w-0">
          {state.peerRevoked ? t('chats.secretPeerRevoked') : t('chats.secretBanner')}
        </span>
        <Button size="sm" variant="secondary" onClick={() => setIsVerifying(true)}>
          {t('chats.secretVerify')}
        </Button>
      </div>

      <Modal isOpen={isVerifying} onClose={() => setIsVerifying(false)} title={t('chats.secretVerifyTitle')} size="sm">
        <div className="p-5 space-y-4">
          <p className="text-sm text-fg-secondary">{t('chats.secretVerifyBody')}</p>
          <p
            className="font-mono text-base text-fg-primary text-center leading-8 select-all break-words"
            aria-label={t('chats.secretVerifyTitle')}
          >
            {state.safetyNumber}
          </p>
          <Button className="w-full" onClick={() => setIsVerifying(false)}>
            {t('common.close')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
