import { NavLink } from 'react-router';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Sets, folders and classes are three views of one library. */
export function LibraryTabs() {
  const { t } = useI18n();
  const tabs = [
    { to: '/library', label: t('sets.tabSets') },
    { to: '/folders', label: t('sets.tabFolders') },
    { to: '/classes', label: t('sets.tabClasses') },
  ];
  // A single tab is not a choice.
  if (tabs.length < 2) return null;
  return (
    <nav aria-label={t('sets.yourLibrary')} className="flex gap-1 border-b border-border">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              '-mb-px inline-flex h-11 items-center border-b-2 border-transparent px-3 font-semibold text-muted-foreground hover:text-foreground',
              isActive && 'border-primary text-foreground',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
