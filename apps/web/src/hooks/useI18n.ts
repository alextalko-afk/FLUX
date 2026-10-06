/**
 * Main translation hook.
 *
 * Re-exported from `useTranslations` to keep a single implementation while
 * exposing the name that reads better at call sites: `const { t } = useI18n()`.
 */
export {
  useI18n,
  translate,
  type Locale,
  type TParams,
  type TranslateFn,
} from './useTranslations';