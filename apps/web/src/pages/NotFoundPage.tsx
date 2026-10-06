import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { useI18n } from '../hooks/useI18n';

export function NotFoundPage() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-fade-in">
      <h1 className="text-6xl font-bold text-fg-tertiary mb-4 animate-float-up">404</h1>
      <p className="text-lg text-fg-primary mb-2">{t('notFound.title')}</p>
      <p className="text-sm text-fg-secondary mb-6">
        {t('notFound.description')}
      </p>
      <Link to="/chats">
        <Button>{t('notFound.backToChats')}</Button>
      </Link>
    </div>
  );
}
