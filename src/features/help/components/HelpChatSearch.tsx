import React, { useMemo } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpMessage } from '../helpApi';
import { useHelpReducedMotion, useHelpTheme } from '../helpTheme';
import { helpDate, helpTime } from '../helpUiUtils';
import { HELP_LIST_INSET } from '../helpLayout';
import { HelpChatHeader } from './HelpChatHeader';
import { HelpAvatar, HelpIcon } from './HelpPrimitives';

function literalSearch(query: string) {
  const value = query.trim();
  return value ? new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu') : null;
}

/** Use match offsets from the original string so Unicode case folding cannot shift the highlight. */
export function helpSearchSegments(text: string, query: string): { text: string; match: boolean }[] {
  const expression = literalSearch(query);
  if (!expression) return [{ text, match: false }];
  const result: { text: string; match: boolean }[] = [];
  let start = 0;
  let highlighted = 0;
  for (const match of text.matchAll(expression)) {
    const index = match.index!;
    if (index > start) result.push({ text: text.slice(start, index), match: false });
    result.push({ text: match[0], match: true });
    start = index + match[0].length;
    // A one-letter query in a long message must not allocate thousands of native Text nodes.
    if (++highlighted >= 100) break;
  }
  if (start < text.length) result.push({ text: text.slice(start), match: false });
  return result.length ? result : [{ text, match: false }];
}

export function helpSearchExcerpt(text: string, query: string, limit = 150) {
  const match = literalSearch(query)?.exec(text);
  const start = Math.max(0, (match?.index ?? 0) - 45);
  const end = Math.min(text.length, start + Math.max(limit, (match?.[0].length ?? 0) + 45));
  return `${start ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ')}${end < text.length ? '…' : ''}`;
}

/** Nested Text preserves the message's existing typography and native line measurement. */
export function HelpSearchText({ text, query, style }: { text: string; query: string; style?: StyleProp<TextStyle> }) {
  const c = useHelpTheme();
  const segments = useMemo(() => helpSearchSegments(text, query), [text, query]);
  return <Text style={style}>{segments.map((segment, index) => <Text key={index} style={segment.match ? { backgroundColor: c.dark ? '#725E20' : '#FFE59A', color: c.dark ? '#FFF6D7' : '#2A230F' } : undefined}>{segment.text}</Text>)}</Text>;
}

export type HelpChatSearchProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
  loading?: boolean;
  total?: number;
  /** Index in newest-first search results. */
  selectedIndex?: number;
  canPrevious?: boolean;
  canNext?: boolean;
  onPrevious: () => void;
  onNext: () => void;
  showList: boolean;
  onToggleList: () => void;
  error?: string | null;
};

/** Compatibility wrapper. Keep HelpChatHeader mounted with its search prop for reversible icon motion. */
export function HelpChatSearch({ query, onQueryChange, onClose, onSubmit, autoFocus = false }: HelpChatSearchProps) {
  return <View testID="help-chat-search"><HelpChatHeader title="" meta="" onBack={onClose} search={{query,onQueryChange,onClose,onSubmit,autoFocus}}/></View>;
}

export type HelpChatSearchDockProps = Pick<HelpChatSearchProps,'query'|'total'|'selectedIndex'|'loading'|'showList'|'onToggleList'|'error'>;

/** Replaces the composer while search is open; the screen owns safe-area/blur padding. */
export function HelpChatSearchDock({ query, total = 0, selectedIndex = -1, loading = false, showList, onToggleList, error }: HelpChatSearchDockProps) {
  const c = useHelpTheme();
  const reduced = useHelpReducedMotion();
  const hasQuery = Boolean(query.trim());
  const count = !hasQuery ? 'Введите запрос' : loading ? 'Поиск…' : error ? 'Поиск недоступен' : total ? selectedIndex >= 0 ? `${Math.min(selectedIndex + 1, total)} из ${total}` : `Найдено: ${total}` : 'Ничего не найдено';
  return <View testID="help-chat-search-dock" style={{minHeight:48,borderRadius:24,backgroundColor:c.panel,paddingLeft:16,paddingRight:4,flexDirection:'row',alignItems:'center',gap:8}}>
    <View accessibilityLiveRegion="polite" style={{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:7}}>
      {loading&&!reduced ? <ActivityIndicator size="small" color={c.accentText}/> : null}
      <Text numberOfLines={2} style={{color:error ? c.danger : c.muted,fontSize:13,lineHeight:18}}>{count}</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={showList ? 'Показать сообщение в переписке' : 'Показать список результатов'} accessibilityState={{disabled:!hasQuery||!total||loading,selected:showList}} disabled={!hasQuery||!total||loading} onPress={onToggleList} style={({pressed})=>({minHeight:48,paddingHorizontal:12,flexDirection:'row',alignItems:'center',gap:6,opacity:!hasQuery||!total||loading ? .38 : pressed ? .65 : 1})}><Ionicons name={showList ? 'chatbubble-outline' : 'list-outline'} size={20} color={c.accentText}/><Text style={{color:c.accentText,fontSize:13,fontWeight:'500'}}>{showList ? 'В переписке' : 'Списком'}</Text></Pressable>
  </View>;
}

export type HelpChatSearchArrowsProps = Pick<HelpChatSearchProps,'loading'|'total'|'selectedIndex'|'canPrevious'|'canNext'|'onPrevious'|'onNext'> & {style?:StyleProp<ViewStyle>};

/** Floating right-side controls; root aligns their center with the composer's action button. */
export function HelpChatSearchArrows({loading=false,total=0,selectedIndex=-1,canPrevious,canNext,onPrevious,onNext,style}:HelpChatSearchArrowsProps) {
  const c=useHelpTheme();
  const button={width:48,height:48,borderRadius:24,backgroundColor:c.panel,borderWidth:StyleSheet.hairlineWidth,borderColor:c.line,elevation:2};
  return <View testID="help-chat-search-arrows" style={[{gap:8,alignItems:'center'},style]}>
    <HelpIcon name="chevron-up" label="Следующий результат поиска, раньше" onPress={onNext} disabled={loading||!(canNext??(selectedIndex>=0&&selectedIndex+1<total))} size={25} style={button}/>
    <HelpIcon name="chevron-down" label="Предыдущий результат поиска, позже" onPress={onPrevious} disabled={loading||!(canPrevious??selectedIndex>0)} size={25} style={button}/>
  </View>;
}

export type HelpChatSearchResultsProps = {
  messages: HelpMessage[];
  query: string;
  selectedId?: number | null;
  loading?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  onSelect: (message: HelpMessage) => void;
  error?: string | null;
  onRetry?: () => void;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function HelpChatSearchResults({ messages, query, selectedId, loading = false, hasMore = false, onLoadMore, onSelect, error, onRetry, contentContainerStyle }: HelpChatSearchResultsProps) {
  const c = useHelpTheme();
  const reduced = useHelpReducedMotion();
  return <FlatList testID="help-chat-search-results" data={messages} keyExtractor={message => String(message.id)} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[{ flexGrow: 1, paddingBottom: 16 }, contentContainerStyle]} onEndReached={() => { if (hasMore && !loading && !error) onLoadMore?.(); }} onEndReachedThreshold={0.35}
    renderItem={({ item }) => {
      const author = item.author?.name || (item.kind === 'SYSTEM' ? 'Система' : 'Специалист IT');
      const text = item.text || item.attachments.map(file => file.name).join(', ') || 'Сообщение';
      return <Pressable accessibilityRole="button" accessibilityState={{ selected: selectedId === item.id }} accessibilityLabel={`${author}. ${helpDate(item.createdAt)}, ${helpTime(item.createdAt)}. ${helpSearchExcerpt(text, query)}`} onPress={() => onSelect(item)} style={({ pressed }) => ({ paddingHorizontal: HELP_LIST_INSET, paddingVertical: 12, minHeight: 84, flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: selectedId === item.id ? c.soft : pressed ? c.panel : 'transparent' })}>
        <HelpAvatar id={item.authorId || 0} name={author} uri={item.author?.avatarUrl} size={36} />
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}><Text numberOfLines={1} style={{ flex: 1, color: c.text, fontWeight: '600', fontSize: 13 }}>{author}</Text><Text style={{ color: c.muted, fontSize: 11 }}>{helpTime(item.createdAt)}</Text></View>
          <Text numberOfLines={3} style={{ color: c.text, fontSize: 14, lineHeight: 20 }}><HelpSearchText text={helpSearchExcerpt(text, query)} query={query} /></Text>
          <Text style={{ color: c.muted, fontSize: 11 }}>{helpDate(item.createdAt)}</Text>
        </View>
      </Pressable>;
    }}
    ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line, marginLeft: HELP_LIST_INSET + 48, marginRight: HELP_LIST_INSET }} />}
    ListEmptyComponent={<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, gap: 10 }}>
      <Ionicons name="search-outline" size={30} color={c.muted} accessible={false} />
      <Text accessibilityLiveRegion="polite" style={{ color: c.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' }}>{loading ? 'Ищем сообщения…' : error || (query.trim() ? 'Сообщения не найдены' : 'Введите текст сообщения')}</Text>
    </View>}
    ListFooterComponent={loading && messages.length ? <View style={{ height: 48, justifyContent: 'center', alignItems: 'center' }}>{reduced ? <Text style={{ color: c.muted, fontSize: 12 }}>Загрузка…</Text> : <ActivityIndicator color={c.accentText} />}</View> : error && onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Повторить поиск" onPress={onRetry} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.accentText, fontSize: 14 }}>Повторить поиск</Text></Pressable> : null}
  />;
}
