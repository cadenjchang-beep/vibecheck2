import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { useI18n } from '@/lib/i18n';
import { usePageTitle } from '@/lib/page';

export default function NotFound() {
  const { t } = useI18n();
  usePageTitle(t('errors.pageNotFoundTitle'));
  return (
    <EmptyState
      className="mx-auto mt-8 max-w-xl"
      icon={<SearchX />}
      level={1}
      title={t('errors.pageNotFoundTitle')}
      description={t('errors.pageNotFoundBody')}
      action={
        <Button asChild>
          <Link to="/">{t('errors.goHome')}</Link>
        </Button>
      }
    />
  );
}
