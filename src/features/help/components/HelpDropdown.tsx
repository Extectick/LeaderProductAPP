import React from 'react';
import {useHelpReducedMotion,useHelpTheme} from '../helpTheme';
import {AppActionMenu,AppActionMenuItem,type AppActionMenuProps,type AppActionMenuItemProps} from '@/components/ui/AppActionMenu';

export function HelpDropdown(props:Omit<AppActionMenuProps,'colors'|'reducedMotion'>){
  const colors=useHelpTheme(),reducedMotion=useHelpReducedMotion();
  return <AppActionMenu {...props} colors={colors} reducedMotion={reducedMotion}/>;
}

export function HelpDropdownAction(props:Omit<AppActionMenuItemProps,'colors'>){
  const colors=useHelpTheme();
  return <AppActionMenuItem {...props} colors={colors}/>;
}
