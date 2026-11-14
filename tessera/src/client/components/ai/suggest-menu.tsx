import { BookOpenText, Lightbulb, LoaderCircle, MessageSquareQuote, Sparkles } from 'lucide-react';
import type { AiSuggestKind } from '@shared/ai';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { useI18n } from '@/lib/i18n';

interface SuggestMenuProps {
  number: number;
  busy: boolean;
  onSuggest: (kind: AiSuggestKind) => void;
}

/** Per-card AI help in the editor: a definition, an example or a memory trick. */
export function SuggestMenu({ number, busy, onSuggest }: SuggestMenuProps) {
  const { t } = useI18n();
  const label = busy ? t('ai.suggestWorking') : t('ai.suggestMenu', { number });
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} title={label} disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem onSelect={() => onSuggest('definition')}>
          <BookOpenText aria-hidden="true" />
          {t('ai.suggestDefinition')}
        </MenuItem>
        <MenuItem onSelect={() => onSuggest('example')}>
          <MessageSquareQuote aria-hidden="true" />
          {t('ai.suggestExample')}
        </MenuItem>
        <MenuItem onSelect={() => onSuggest('mnemonic')}>
          <Lightbulb aria-hidden="true" />
          {t('ai.suggestMnemonic')}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
