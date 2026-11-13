import { useQueryClient } from '@tanstack/react-query';
import {
  ChartColumn,
  Crown,
  FolderPlus,
  GraduationCap,
  House,
  Layers,
  Library,
  LogOut,
  Monitor,
  Moon,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sun,
  UserPlus,
  WifiOff,
  Sparkles,
} from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { authClient } from '@/lib/auth';
import { BUILT } from '@/lib/built';
import { useQuery } from '@tanstack/react-query';
import type { ReviewSummary } from '@shared/api';
import { useI18n } from '@/lib/i18n';
import { keys } from '@/lib/query';
import { useAiAvailable } from '@/lib/ai';
import { isActive, useMe } from '@/lib/me';
import { useOnline } from '@/lib/online';
import { useAnnouncedTitle } from '@/lib/page';
import { useTheme, type ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';
import type { MeUser } from '@shared/api';
import { Logo } from './logo';
import { Button } from './ui/button';
import { Tooltip } from './ui/controls';
import { Avatar } from './ui/feedback';
import { Input } from './ui/input';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioGroup, MenuRadioItem, MenuSeparator, MenuTrigger } from './ui/menu';

/** Announces client-side navigations to assistive technology. */
export function RouteAnnouncer() {
  const title = useAnnouncedTitle();
  return (
    <div aria-live="polite" aria-atomic="true" className="sr-only">
      {title}
    </div>
  );
}

export function SkipLink() {
  const { t } = useI18n();
  return (
    <a
      href="#main"
      className="sr-only z-[60] rounded-xl bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
    >
      {t('common.skipToContent')}
    </a>
  );
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof House;
  /** A count shown on the item, with the phrase a screen reader should hear. */
  badge?: { count: number; label: string };
}

function useNavItems(signedIn: boolean): NavItem[] {
  const { t } = useI18n();
  const review = useQuery({
    queryKey: [...keys.review(), 'summary'],
    queryFn: ({ signal }) => api<ReviewSummary>('/api/review/summary', { signal }),
    enabled: signedIn && BUILT.review,
    staleTime: 60_000,
  });
  const due = review.data?.dueCount ?? 0;
  return [
    { to: '/home', label: t('nav.home'), icon: House },
    { to: '/library', label: t('nav.library'), icon: Library },
    ...(BUILT.review
      ? [{ to: '/review', label: t('nav.review'), icon: RotateCcw, badge: due > 0 ? { count: due, label: t('nav.dueBadge', { count: due }) } : undefined }]
      : []),
    ...(BUILT.stats ? [{ to: '/stats', label: t('nav.stats'), icon: ChartColumn }] : []),
  ];
}

function SearchForm({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  };
  return (
    <form role="search" onSubmit={submit} className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('nav.searchPlaceholder')}
        aria-label={t('nav.search')}
        autoFocus={autoFocus}
        enterKeyHint="search"
        className="h-10 rounded-full bg-secondary ps-10 [&::-webkit-search-cancel-button]:appearance-none"
      />
    </form>
  );
}

function CreateMenu({ user }: { user: MeUser }) {
  const { t } = useI18n();
  const aiAvailable = useAiAvailable();
  // With only sets to create, the button goes straight there.
  if (!BUILT.folders && !BUILT.classes) {
    return (
      <Button asChild className="hidden lg:inline-flex">
        <Link to="/sets/new">
          <Plus aria-hidden="true" />
          {t('nav.createSet')}
        </Link>
      </Button>
    );
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button className="hidden lg:inline-flex">
          <Plus aria-hidden="true" />
          {t('common.create')}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem asChild>
          <Link to="/sets/new">
            <Layers aria-hidden="true" />
            {t('nav.newSet')}
          </Link>
        </MenuItem>
        {aiAvailable ? (
          <MenuItem asChild>
            <Link to="/sets/new?ai=1">
              <Sparkles aria-hidden="true" />
              {t('ai.createWithAi')}
            </Link>
          </MenuItem>
        ) : null}
        <MenuItem asChild>
          <Link to="/folders?new=1">
            <FolderPlus aria-hidden="true" />
            {t('nav.newFolder')}
          </Link>
        </MenuItem>
        {user.role === 'teacher' ? (
          <MenuItem asChild>
            <Link to="/classes?new=1">
              <GraduationCap aria-hidden="true" />
              {t('nav.newClass')}
            </Link>
          </MenuItem>
        ) : (
          <MenuItem asChild>
            <Link to="/classes?join=1">
              <UserPlus aria-hidden="true" />
              {t('nav.joinClass')}
            </Link>
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

function AccountMenu({ user }: { user: MeUser }) {
  const { t } = useI18n();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const client = useQueryClient();

  const logOut = async () => {
    await authClient.signOut();
    client.clear();
    toast(t('auth.loggedOut'));
    navigate('/', { replace: true });
  };

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={t('nav.accountMenu')}
          className="flex size-11 items-center justify-center rounded-full transition-colors hover:bg-accent"
        >
          <Avatar name={user.name} image={user.image} />
        </button>
      </MenuTrigger>
      <MenuContent className="w-64">
        <div className="px-2.5 py-2">
          <p className="truncate font-bold" dir="auto">
            {user.name}
          </p>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
        </div>
        <MenuSeparator />
        {BUILT.settings ? (
          <MenuItem asChild>
            <Link to="/settings">
              <Settings aria-hidden="true" />
              {t('nav.settings')}
            </Link>
          </MenuItem>
        ) : null}
        {BUILT.classes ? (
          <MenuItem asChild>
            <Link to="/classes">
              <GraduationCap aria-hidden="true" />
              {t('nav.classes')}
            </Link>
          </MenuItem>
        ) : null}
        {BUILT.upgrade && user.plan === 'free' ? (
          <MenuItem asChild>
            <Link to="/upgrade">
              <Crown aria-hidden="true" className="!text-gold" />
              {t('nav.upgrade')}
            </Link>
          </MenuItem>
        ) : null}
        <MenuSeparator />
        <MenuLabel>{t('common.theme')}</MenuLabel>
        <MenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeChoice)}>
          <MenuRadioItem value="system" className="relative">
            <Monitor aria-hidden="true" />
            {t('common.themeSystem')}
          </MenuRadioItem>
          <MenuRadioItem value="light" className="relative">
            <Sun aria-hidden="true" />
            {t('common.themeLight')}
          </MenuRadioItem>
          <MenuRadioItem value="dark" className="relative">
            <Moon aria-hidden="true" />
            {t('common.themeDark')}
          </MenuRadioItem>
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onSelect={() => void logOut()}>
          <LogOut aria-hidden="true" />
          {t('nav.logOut')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function VerifyBanner({ user }: { user: MeUser }) {
  const { t } = useI18n();
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'hidden'>('idle');
  if (user.emailVerified || state === 'hidden') return null;
  const resend = async () => {
    setState('sending');
    const { error } = await authClient.sendVerificationEmail({ email: user.email, callbackURL: '/home?verified=1' });
    if (error) {
      setState('idle');
      toast.error(t('errors.generic'));
    } else {
      setState('sent');
    }
  };
  return (
    <div className="border-b border-border bg-warning-soft text-warning-soft-foreground">
      <div className="container-page flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
        <p className="min-w-0 flex-1" role="status">
          {state === 'sent' ? t('auth.verifySent', { email: user.email }) : t('auth.verifyBanner')}
        </p>
        {state !== 'sent' ? (
          <Button variant="link" size="sm" className="text-warning-soft-foreground underline" loading={state === 'sending'} onClick={resend}>
            {t('auth.verifyResend')}
          </Button>
        ) : null}
        <Button variant="link" size="sm" className="text-warning-soft-foreground" onClick={() => setState('hidden')}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}

function Header({ user }: { user: MeUser | null }) {
  const { t } = useI18n();
  const items = useNavItems(Boolean(user));
  const online = useOnline();
  return (
    <header className="no-print sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4">
        <Link to={user ? '/home' : '/'} className="rounded-lg" aria-label={t('common.appName')}>
          <Logo />
        </Link>
        {user ? (
          <nav aria-label={t('nav.primary')} className="ms-2 hidden lg:block">
            <ul className="flex items-center gap-1">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive: active }) =>
                      cn(
                        'inline-flex h-10 items-center rounded-lg px-3 font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                        active && 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft',
                      )
                    }
                  >
                    {item.label}
                    {item.badge ? <NavBadge badge={item.badge} className="ms-1.5" /> : null}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {BUILT.search ? <SearchForm className="ms-auto hidden max-w-md flex-1 md:block" /> : null}
        <div className={cn('ms-auto flex items-center gap-1', BUILT.search && 'md:ms-0')}>
          {!online ? (
            <Tooltip label={t('common.offlineHint')}>
              <span
                tabIndex={0}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-warning-soft px-3 text-sm font-semibold text-warning-soft-foreground"
              >
                <WifiOff className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('common.offline')}</span>
                <span className="sr-only sm:hidden">{t('common.offline')}</span>
              </span>
            </Tooltip>
          ) : null}
          {BUILT.search ? (
            <Button variant="ghost" size="icon" asChild className="md:hidden">
              <Link to="/search" aria-label={t('nav.search')}>
                <Search aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
          {user ? (
            <>
              <CreateMenu user={user} />
              <AccountMenu user={user} />
            </>
          ) : (
            <>
              {BUILT.search ? (
                <Button variant="ghost" asChild className="hidden sm:inline-flex">
                  <Link to="/browse">{t('nav.browse')}</Link>
                </Button>
              ) : null}
              <Button variant="ghost" asChild>
                <Link to="/login">{t('nav.logIn')}</Link>
              </Button>
              <Button asChild>
                <Link to="/signup">{t('nav.signUp')}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/** Thumb-reachable navigation on phones and tablets. */
function NavBadge({ badge, className }: { badge: NonNullable<NavItem['badge']>; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-5 font-bold text-primary-foreground', className)}>
      <span aria-hidden="true">{badge.count > 99 ? '99+' : badge.count}</span>
      <span className="sr-only">{badge.label}</span>
    </span>
  );
}

function BottomTabs() {
  const { t } = useI18n();
  const items = useNavItems(true);
  const tab = ({ to, label, icon: Icon, badge }: NavItem) => (
    <li key={to} className="flex-1">
      <NavLink
        to={to}
        className={({ isActive: active }) =>
          cn(
            'flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold text-muted-foreground',
            active && 'text-primary',
          )
        }
      >
        <span className="relative">
          <Icon className="size-5.5" aria-hidden="true" />
          {badge ? <NavBadge badge={badge} className="absolute -end-3.5 -top-1.5" /> : null}
        </span>
        {label}
      </NavLink>
    </li>
  );
  return (
    <nav
      aria-label={t('nav.primary')}
      className="no-print pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto flex max-w-xl items-center px-1">
        {items.slice(0, 2).map(tab)}
        <li className="flex flex-1 justify-center">
          <Link
            to="/sets/new"
            aria-label={t('nav.createSet')}
            className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-raised transition-colors hover:bg-primary-hover"
          >
            <Plus className="size-6" aria-hidden="true" />
          </Link>
        </li>
        {items.slice(2).map(tab)}
      </ul>
    </nav>
  );
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="no-print border-t border-border">
      <div className="container-page flex flex-col items-center justify-between gap-3 py-6 text-sm text-muted-foreground sm:flex-row">
        <p>{t('nav.footerNote')}</p>
        <nav aria-label="Legal" className="flex gap-5">
          {BUILT.search ? (
            <Link to="/browse" className="hover:text-foreground hover:underline">
              {t('nav.browse')}
            </Link>
          ) : null}
          <Link to="/privacy" className="hover:text-foreground hover:underline">
            {t('nav.privacy')}
          </Link>
          <Link to="/terms" className="hover:text-foreground hover:underline">
            {t('nav.terms')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}

/** Header, page content and (when signed in) the mobile tab bar. */
export function AppLayout({ children }: { children?: ReactNode }) {
  const { data } = useMe();
  const user = isActive(data?.user) ? data.user : null;
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <Header user={user} />
      {user ? <VerifyBanner user={user} /> : null}
      <main id="main" tabIndex={-1} className={cn('container-page flex-1 py-6 outline-none sm:py-8', user ? 'pb-28 lg:pb-12' : 'pb-12')}>
        {children ?? <Outlet />}
      </main>
      {user ? <BottomTabs /> : <Footer />}
      <ScrollRestoration />
    </div>
  );
}

/** Keeps the server's idea of the user's time zone in step with the device. */
export function syncTimezone(user: MeUser): void {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz && tz !== user.timezone) {
    api('/api/me', { method: 'PATCH', body: { timezone: tz } }).catch(() => undefined);
  }
}
