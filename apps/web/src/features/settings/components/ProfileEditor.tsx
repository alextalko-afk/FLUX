import { useEffect, useRef, useState, FormEvent, ChangeEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { api, ApiError } from '../../../lib/api';
import { useAuthStore } from '../../../stores/auth.store';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Avatar } from '../../../components/ui/Avatar';
import { useI18n } from '../../../hooks/useI18n';

export function ProfileEditor() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { user, refreshUser } = useAuthStore();
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    username: user?.username || '',
    bio: '',
    statusEmoji: (user as { statusEmoji?: string | null } | null)?.statusEmoji ?? '',
    statusHours: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  // Release the object URL when it is replaced or the editor unmounts.
  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  /**
   * Uploads the avatar on selection.
   *
   * It used to wait for the "Save changes" button, which made picking a
   * picture look like it did nothing.
   */
  const uploadAvatar = async (file: File) => {
    setIsUploadingAvatar(true);
    try {
      const initResult = await api.post<any>('/media/upload/init', {
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size.toString(),
        mediaType: 'AVATAR',
      });

      const putResponse = await fetch(initResult.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!putResponse.ok) {
        throw new Error(`Upload failed with status ${putResponse.status}`);
      }

      await api.post('/media/upload/complete', { fileObjectId: initResult.fileObjectId });

      await refreshUser();
      toast.success(t('settings.avatarUpdated'));
    } catch {
      toast.error(t('settings.avatarFailed'));
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      // The avatar is uploaded separately (on pick), so this only saves the
      // profile fields.
      await api.patch('/users/me', {
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username || undefined,
        bio: form.bio || undefined,
        statusEmoji: form.statusEmoji,
        statusHours: form.statusEmoji && form.statusHours ? form.statusHours : undefined,
      });

      await refreshUser();
    },
    onSuccess: () => {
      toast.success(t('settings.profileUpdated'));
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      refreshUser();
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        if (err.code === 'USERNAME_ALREADY_TAKEN') {
          setErrors({ username: t('auth.usernameTaken') });
        } else {
          toast.error(err.message);
        }
      } else {
        toast.error(t('settings.profileUpdateFailed'));
      }
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    updateMutation.mutate();
  };

  const handleAvatarChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Allow re-picking the same file after a removal.
    e.target.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('settings.avatarTooBig'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.avatarNotImage'));
      return;
    }

    // Show the picked image straight away, then upload it.
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = URL.createObjectURL(file);
    previewUrlRef.current = url;
    setLocalPreview(url);
    setAvatarFile(file);

    void uploadAvatar(file);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h3 className="text-lg font-semibold text-fg-primary">{t('settings.profile')}</h3>

      <div className="flex items-center gap-5">
        <div className="relative w-24 h-24 flex-shrink-0">
          <Avatar
            name={`${form.firstName} ${form.lastName}`.trim() || 'U'}
            avatarUrl={localPreview || user?.avatarUrl}
            size="xl"
            circleClassName="w-24 h-24 text-3xl"
          />
          {isUploadingAvatar && (
            <span className="absolute inset-0 rounded-full bg-bg-overlay/70 flex items-center justify-center">
              <svg className="w-6 h-6 animate-spin text-fg-accent" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-medium text-fg-primary mb-1.5">
            {t('settings.avatar')}
          </label>
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-bg-elevated border border-border shadow-panel text-sm font-medium text-fg-primary cursor-pointer transition-all duration-200 ease-spring hover:border-fg-accent/50 hover:-translate-y-0.5 hover:shadow-float">
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-fg-accent" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {t('settings.avatar')}
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="sr-only"
            />
          </label>
          {avatarFile && (
            <div className="text-xs text-fg-secondary mt-2 flex items-center gap-2">
              <span className="truncate">{t('settings.selected', { name: avatarFile.name })}</span>
              <button
                type="button"
                onClick={() => setAvatarFile(null)}
                className="text-fg-tertiary hover:text-fg-error transition-colors flex-shrink-0"
                aria-label={t('common.remove')}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('auth.firstName')}
          value={form.firstName}
          onChange={(e) => setForm({ ...form, firstName: e.target.value })}
          required
        />
        <Input
          label={t('auth.lastName')}
          value={form.lastName}
          onChange={(e) => setForm({ ...form, lastName: e.target.value })}
        />
      </div>

      <Input
        label={t('auth.username')}
        value={form.username}
        onChange={(e) => setForm({ ...form, username: e.target.value })}
        hint={t('auth.usernameHint')}
        error={errors.username}
      />

      <div>
        <label className="block text-sm font-medium text-fg-primary mb-1.5">
          {t('auth.bio')}
        </label>
        <textarea
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          rows={3}
          maxLength={500}
          className="w-full px-3 py-2 bg-bg-app border border-border rounded-xl text-sm text-fg-primary placeholder:text-fg-tertiary focus:outline-none focus:ring-2 focus:ring-fg-accent/40 focus:border-fg-accent/50 transition-all duration-150 resize-none"
          placeholder={t('auth.bioPlaceholder')}
        />
        <div className="text-xs text-fg-tertiary mt-1 text-right">
          {form.bio.length}/500
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-fg-primary mb-1.5">{t('auth.status')}</label>
        <div className="flex flex-wrap items-center gap-1.5">
          {['', '😊', '🔥', '💼', '🏖️', '🎧', '😴', '🚗'].map((e) => (
            <button
              key={e || 'none'}
              type="button"
              onClick={() => setForm({ ...form, statusEmoji: e })}
              className={`h-9 min-w-9 px-2 rounded-xl text-lg border transition-colors ${form.statusEmoji === e ? 'border-fg-accent bg-fg-accent/10' : 'border-border hover:bg-bg-hover'}`}
              aria-label={e || t('auth.statusClear')}
            >
              {e || <span className="text-xs text-fg-secondary">{t('auth.statusClear')}</span>}
            </button>
          ))}
          {form.statusEmoji && (
            <select
              value={form.statusHours}
              onChange={(e) => setForm({ ...form, statusHours: Number(e.target.value) })}
              className="h-9 px-2 bg-bg-app border border-border rounded-xl text-sm text-fg-primary"
            >
              <option value={0}>{t('auth.statusForever')}</option>
              <option value={1}>{t('auth.statusHours', { n: 1 })}</option>
              <option value={4}>{t('auth.statusHours', { n: 4 })}</option>
              <option value={24}>{t('auth.statusDay')}</option>
            </select>
          )}
        </div>
      </div>

      <Button type="submit" isLoading={updateMutation.isPending}>
        {t('settings.saveChanges')}
      </Button>
    </form>
  );
}
