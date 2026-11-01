import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHelpTheme } from '../helpTheme';
import { HelpIcon } from './HelpPrimitives';
import { HELP_LIST_META_WIDTH } from '../helpLayout';
import { HelpHeaderFrame } from './HelpHeaderFrame';
import {HelpDropdown, HelpDropdownAction} from './HelpDropdown';
import { helpDevActions, helpDevRef, helpDevState } from '../helpDiagnostics';
import { knowledgeApi } from '../../knowledge/api';

type Props = {
  connecting?: boolean;
  search: string;
  onSearch: (value: string) => void;
  archived: boolean;
  onArchive: () => void;
  onBack: () => void;
  canManage?: boolean;
  scope?: 'mine' | 'queue';
  onScope?: () => void;
  onKnowledge?: () => void;
};

export function HelpListHeader({ search, onSearch, archived, onArchive, onBack, canManage = false, scope = 'mine', onScope, onKnowledge, connecting=false }: Props) {
  const c = useHelpTheme();
  const window = useWindowDimensions();
  const menuButton = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [canReviewKnowledge, setCanReviewKnowledge] = useState(false);
  useEffect(() => {
    if (!menuVisible || !onKnowledge) return;
    const abort = new AbortController(); setCanReviewKnowledge(false);
    knowledgeApi.config(abort.signal).then(config => { if (!abort.signal.aborted) setCanReviewKnowledge(config.canManage); }).catch(() => {});
    return () => abort.abort();
  }, [menuVisible, !!onKnowledge]);
  const [anchor, setAnchor] = useState({ x: window.width - 64, y: 36, width: 48, height: 48 });
  const menuWidth = archived || canManage || canReviewKnowledge ? 224 : 160;
  const menuLeft = Math.max(12, Math.min(window.width - menuWidth - 12, anchor.x + anchor.width - menuWidth));
  const menuTop = Math.max(12, Math.min(window.height - (canManage ? 120 : 72) - (canReviewKnowledge ? 48 : 0), anchor.y + anchor.height + 6));
  const openMenu = () => {
    menuButton.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
    setMenuVisible(true);
  };
  const closeMenu = () => setMenuVisible(false);
  const archiveAction = () => { closeMenu(); onArchive(); };
  const scopeAction = () => { closeMenu(); onScope?.(); };
  useEffect(() => helpDevActions('header', { 'header.openMenu': openMenu, 'header.closeMenu': closeMenu, 'header.archive': archiveAction, ...(canManage ? { 'header.scope': scopeAction } : {}) }));
  useEffect(() => helpDevState({ menuVisible, archived, scope }), [menuVisible, archived, scope]);
  return <><HelpHeaderFrame connecting={connecting} onBack={onBack} trailing={<Pressable ref={node => { menuButton.current = node; helpDevRef('header.menu', node); }} accessibilityRole="button" accessibilityLabel="Меню поддержки" accessibilityState={{ expanded: menuVisible }} onPress={openMenu} style={({ pressed }) => ({ width: HELP_LIST_META_WIDTH, height: 48, borderRadius:24, backgroundColor:c.panel, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .65 : 1 })}>
        <Ionicons name="ellipsis-horizontal" size={24} color={archived ? c.accentText : c.text} />
      </Pressable>}>
      <Ionicons name="search-outline" size={20} color={c.muted} style={{ marginRight: 8 }} />
      <TextInput accessibilityLabel="Поиск обращений" value={search} onChangeText={onSearch} placeholder="Поиск" placeholderTextColor={c.muted} returnKeyType="search" autoCorrect={false} underlineColorAndroid="transparent" style={{ flex: 1, minWidth: 0, height: 44, padding: 0, color: c.text, fontSize: 16, includeFontPadding: false, textAlignVertical: 'center', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
      {search ? <HelpIcon name="close" label="Очистить поиск" size={17} style={{ width: 28, height: 44 }} onPress={() => onSearch('')} /> : null}
    </HelpHeaderFrame>
    {menuVisible ? <HelpDropdown testID="help-header-menu" label="Закрыть меню поддержки" onClose={closeMenu} top={menuTop} left={menuLeft} width={menuWidth}>
      <HelpDropdownAction label={archived ? 'Открытые обращения' : 'Архив'} accessibilityLabel={archived ? 'Показать открытые обращения' : 'Показать архив обращений'} icon={archived ? 'chatbubbles-outline' : 'archive-outline'} onPress={archiveAction}/>
      {canManage ? <HelpDropdownAction label={scope === 'mine' ? 'Очередь IT' : 'Мои обращения'} accessibilityLabel={scope === 'mine' ? 'Показать очередь IT' : 'Показать мои обращения'} icon={scope === 'mine' ? 'people-outline' : 'person-outline'} onPress={scopeAction}/> : null}
      {canReviewKnowledge && onKnowledge ? <HelpDropdownAction label="База знаний" icon="book-outline" onPress={()=>{closeMenu();onKnowledge();}}/> : null}
    </HelpDropdown> : null}
  </>;
}
