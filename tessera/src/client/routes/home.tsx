import { Layers } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/feedback';
import { useI18n } from '@/lib/i18n';
import { useUser } from '@/lib/me';
import { usePageTitle } from '@/lib/page';

export default function Home() {
  const { t } = useI18n();
  usePageTitle(t('nav.home'));
  const user = useUser();
  return (
    <div>
      <h1 className="text-3xl font-extrabold" dir="auto">
        {user?.name}
      </h1>
      <EmptyState
        className="mt-6"
        icon={<Layers />}
        title={t('nav.createSet')}
        action={
          <Button asChild>
            <Link to="/sets/new">{t('nav.createSet')}</Link>
          </Button>
        }
      />
    </div>
  );
}
