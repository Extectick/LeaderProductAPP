import React from 'react';
import {AppWebScrollbar} from '@/components/ui/AppWebScrollbar.web';
import {useHelpTheme} from '../helpTheme';
import type {HelpWebScrollbarProps} from './HelpWebScrollbar';

/** Preserve Help's public IDs while using the shared web scrollbar. */
export function HelpWebScrollbar(props:HelpWebScrollbarProps){
  const colors=useHelpTheme();
  return <AppWebScrollbar {...props} colors={colors} label="Прокрутка списка обращений" testID="help-ticket-scrollbar" thumbTestID="help-ticket-scrollbar-thumb"/>;
}
