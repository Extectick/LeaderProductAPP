import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { HelpIcon } from './HelpPrimitives';
import { HELP_LIST_META_WIDTH } from '../helpLayout';
import { HelpHeaderFrame } from './HelpHeaderFrame';
import { helpDevActions, helpDevRef, helpDevState } from '../helpDiagnostics';

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
};

export function HelpListHeader({ search, onSearch, archived, onArchive, onBack, canManage = false, scope = 'mine', onScope, connecting=false }: Props) {
  const c = useHelpTheme();
  const reducedMotion = useHelpReducedMotion();
  const window = useWindowDimensions();
  const menuButton = useRef<View>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [anchor, setAnchor] = useState({ x: window.width - 64, y: 36, width: 48, height: 48 });
  const menuWidth = archived || canManage ? 224 : 160;
  const menuLeft = Math.max(12, Math.min(window.width - menuWidth - 12, anchor.x + anchor.width - menuWidth));
  const menuTop = Math.max(12, Math.min(window.height - (canManage ? 120 : 72), anchor.y + anchor.height + 6));
  const openMenu = () => {
    menuButton.current?.measureInWindow((x, y, width, height) => setAnchor({ x, y, width, height }));
    setMenuVisible(true);
  };
  const closeMenu = () => setMenuVisible(false);
  const archiveAction = () => { closeMenu(); onArchive(); };
  const scopeAction = () => { closeMenu(); onScope?.(); };
  useEffect(() => helpDevActions('header', { 'header.openMenu': openMenu, 'header.closeMenu': closeMenu, 'header.archive': archiveAction, ...(canManage ? { 'header.scope': scopeAction } : {}) }));
  useEffect(() => helpDevState({ menuVisible, archived, scope }), [menuVisible, archived, scope]);
  return <><HelpHeaderFrame onBack={onBack} connecting={connecting}>
      <Ionicons name="search-outline" size={20} color={c.muted} style={{ marginRight: 8 }} />
      <TextInput accessibilityLabel="Поиск обращений" value={search} onChangeText={onSearch} placeholder="Поиск" placeholderTextColor={c.muted} returnKeyType="search" autoCorrect={false} underlineColorAndroid="transparent" style={{ flex: 1, minWidth: 0, height: 44, padding: 0, color: c.text, fontSize: 16, includeFontPadding: false, textAlignVertical: 'center', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) }} />
      {search ? <HelpIcon name="close" label="Очистить поиск" size={17} style={{ width: 28, height: 44 }} onPress={() => onSearch('')} /> : null}
      <Pressable ref={node => { menuButton.current = node; helpDevRef('header.menu', node); }} accessibilityRole="button" accessibilityLabel="Меню поддержки" accessibilityState={{ expanded: menuVisible }} onPress={openMenu} style={({ pressed }) => ({ width: HELP_LIST_META_WIDTH, height: 48, alignItems: 'center', justifyContent: 'center', opacity: pressed ? .65 : 1 })}>
        <Ionicons name="ellipsis-horizontal" size={24} color={archived ? c.accentText : c.text} />
      </Pressable>
    </HelpHeaderFrame>
    {menuVisible ? <Modal transparent visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={closeMenu} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть меню поддержки" onPress={closeMenu} style={StyleSheet.absoluteFill} />
        <View testID="help-header-menu" accessibilityViewIsModal style={{ position: 'absolute', top: menuTop, left: menuLeft, width: menuWidth, padding: 4, backgroundColor: c.elevated, borderRadius: 14, borderWidth: 1, borderColor: c.line, elevation: 8, shadowColor: '#000', shadowOpacity: .16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
          <Pressable accessibilityRole="button" accessibilityLabel={archived ? 'Показать открытые обращения' : 'Показать архив обращений'} onPress={archiveAction} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? c.soft : 'transparent' })}>
            <Ionicons name={archived ? 'chatbubbles-outline' : 'archive-outline'} size={22} color={c.text} />
            <Text style={{ color: c.text, fontSize: 16, lineHeight: 22 }}>{archived ? 'Открытые обращения' : 'Архив'}</Text>
          </Pressable>
          {canManage ? <Pressable accessibilityRole="button" accessibilityLabel={scope === 'mine' ? 'Показать очередь IT' : 'Показать мои обращения'} onPress={scopeAction} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: pressed ? c.soft : 'transparent' })}>
            <Ionicons name={scope === 'mine' ? 'people-outline' : 'person-outline'} size={22} color={c.text}/>
            <Text style={{color:c.text,fontSize:16,lineHeight:22}}>{scope === 'mine' ? 'Очередь IT' : 'Мои обращения'}</Text>
          </Pressable> : null}
        </View>
      </View>
    </Modal> : null}
  </>;
}
