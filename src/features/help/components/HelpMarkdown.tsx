import React, { memo, useMemo } from 'react';
import { Alert, Linking, Platform, ScrollView, Text, View } from 'react-native';
import {helpMarkdownParser as markdown} from '../helpMarkdownModel';
import { useHelpTheme } from '../helpTheme';
import {classifyAppLink,openAppLink} from '@/src/shared/appLinks';
import {useEntityCards} from '@/src/features/entityCards/EntityCardContext';
import {useHelpHtml} from './HelpHtmlContext';
import {helpChatDestination} from '../helpChatLink';

// Native text/layout only: no WebView, HTML execution or remote image requests.
type Token = ReturnType<typeof markdown.parse>[number];
type Node = { token: Token; children: Node[] };
function tree(tokens: Token[]): Node[] {
  const root: Node[] = [], stack = [root];
  for (const token of tokens) {
    if (token.nesting === -1) { if (stack.length > 1) stack.pop(); continue; }
    const node: Node = { token, children: token.children ? tree(token.children) : [] };
    stack[stack.length - 1].push(node);
    if (token.nesting === 1) stack.push(node.children);
  }
  return root;
}
async function openSystemLink(url: string) {
 try { await Linking.openURL(url); } catch { Alert.alert('Не удалось открыть ссылку'); }
}

/** Shared by saved, live and legacy AI answers; partial Markdown is valid while streaming. */
export const HelpMarkdown = memo(function HelpMarkdown({ text }: { text: string }) {
  const c = useHelpTheme(), nodes = useMemo(() => tree(markdown.parse(text, {})), [text]);
  const entities=useEntityCards(),html=useHelpHtml();
  const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';
  const body = { color: c.text, fontSize: 15, lineHeight: 24, includeFontPadding: false };
  function inline(items: Node[]): React.ReactNode[] {
    return items.map(({ token: t, children }, key) => {
      const content = () => inline(children);
      switch (t.type) {
        case 'text': return t.content;
        case 'softbreak': case 'hardbreak': return '\n';
        case 'strong_open': return <Text key={key} style={{ fontWeight: '700' }}>{content()}</Text>;
        case 'em_open': return <Text key={key} style={{ fontStyle: 'italic' }}>{content()}</Text>;
        case 's_open': return <Text key={key} style={{ textDecorationLine: 'line-through' }}>{content()}</Text>;
        case 'code_inline': return <Text key={key} style={{ fontFamily: mono, backgroundColor: c.elevated }}>{t.content}</Text>;
        case 'link_open': {
          const url = String(t.attrGet('href') || '');
          const mailDraft=/^leaderproduct:\/\/mail\/draft\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(url);
          if(mailDraft)return <Text key={key} accessibilityRole="link" accessibilityHint="Проверить письмо перед отправкой" onPress={()=>{const {router}=require('expo-router') as typeof import('expo-router');router.navigate({pathname:'/services/help/mail' as any,params:{draftId:mailDraft[1]}});}} style={{color:c.accentText,textDecorationLine:'underline'}}>{content()}</Text>;
          const destination=classifyAppLink(url);
          if(!destination||destination.kind==='html'&&!html?.canOpen(destination.id))return <Text key={key}>{content()}</Text>;
          const label=(items:Node[]):string=>items.map(item=>item.children.length?label(item.children):item.token.content).join('');
          const hint=destination.kind==='chat'?'Открыть чат в приложении':(destination.kind==='html'||destination.kind==='help-destination')?'Открыть HTML-пример в приложении':destination.kind==='entity'?'Открыть карточку в приложении':destination.kind==='web'?'Открыть сайт в приложении':'Открыть ссылку';
          return <Text key={key} accessibilityRole="link" accessibilityHint={hint} onPress={()=>{
            const opened=openAppLink(url,{
              openEntity:entities.openEntity,openWeb:entities.openWeb,
              canOpenHtml:html?.canOpen,openHtml:html?.open,
              openHelpDestination:destination=>{const {router}=require('expo-router') as typeof import('expo-router');router.navigate({pathname:'/services/help',params:{ticketId:String(destination.ticketId),messageId:destination.messageId===undefined?undefined:String(destination.messageId),htmlId:destination.htmlId,eventId:undefined}});},
              openChat:ticketId=>{const {router}=require('expo-router') as typeof import('expo-router');router.navigate(helpChatDestination(ticketId));},
              openSystem:target=>void openSystemLink(target),
            },label(children));
            if(!opened)Alert.alert(destination.kind==='web'?'Просмотр сайта недоступен':'Карточка недоступна',entities.status==='authentication-required'?'Для просмотра войдите в приложение.':entities.status==='blocked'?'Учётная запись заблокирована.':'Не удалось подключить просмотр. Полностью перезагрузите приложение; в development client используйте Reload.');
          }} style={{color:c.accentText,textDecorationLine:'underline'}}>{content()}</Text>;
        }
        case 'image': return <Text key={key}>{t.content || 'Изображение'}</Text>;
        default: return children.length ? <Text key={key}>{content()}</Text> : t.content;
      }
    });
  }
  function blocks(items: Node[], tight = false): React.ReactNode[] {
    return items.map(({ token: t, children }, key) => {
      switch (t.type) {
        case 'inline': return <Text key={key} selectable style={body}>{inline(children)}</Text>;
        case 'paragraph_open': return <Text key={key} selectable style={{ ...body, marginVertical: tight ? 0 : 5 }}>{children.map(n => inline(n.children))}</Text>;
        case 'heading_open': {
          const level = Number(t.tag.slice(1));
          return <Text key={key} selectable accessibilityRole="header" style={{ ...body, fontSize: Math.max(16, 24 - level * 2), lineHeight: Math.max(24, 30 - level * 2), fontWeight: '700', marginTop: 8, marginBottom: 4 }}>{children.map(n => inline(n.children))}</Text>;
        }
        case 'bullet_list_open': case 'ordered_list_open': {
          const start = Number(t.attrGet('start') || 1);
          return <View key={key} style={{ gap: 5, marginVertical: 4 }}>{children.map((item, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Text selectable style={{ ...body, minWidth: 20, textAlign: 'right' }}>{t.type === 'ordered_list_open' ? `${start + index}.` : '•'}</Text>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{blocks(item.children, true)}</View>
          </View>)}</View>;
        }
        case 'blockquote_open': return <View key={key} style={{ borderLeftWidth: 3, borderLeftColor: c.accentText, paddingLeft: 12, marginVertical: 5 }}>{blocks(children)}</View>;
        case 'fence': case 'code_block': return <View key={key} style={{ backgroundColor: c.elevated, borderRadius: 8, marginVertical: 5, overflow: 'hidden' }}>
          {t.info.trim() ? <Text style={{ color: c.muted, fontSize: 11, paddingHorizontal: 12, paddingTop: 8 }}>{t.info.trim()}</Text> : null}
          <ScrollView horizontal nestedScrollEnabled contentContainerStyle={{ padding: 12 }}><Text selectable style={{ ...body, fontFamily: mono, fontSize: 13, lineHeight: 20 }}>{t.content.replace(/\n$/, '')}</Text></ScrollView>
        </View>;
        case 'table_open': return <ScrollView key={key} horizontal nestedScrollEnabled style={{ marginVertical: 6 }}><View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 6, overflow: 'hidden' }}>
          {children.flatMap(section => section.children).map((row, rowIndex) => <View key={rowIndex} style={{ flexDirection: 'row', backgroundColor: row.token.type === 'tr_open' && row.children[0]?.token.type === 'th_open' ? c.elevated : undefined }}>
            {row.children.map((cell, column) => <View key={column} style={{ width: 180, padding: 9, borderBottomWidth: 1, borderRightWidth: column < row.children.length - 1 ? 1 : 0, borderColor: c.line }}><Text selectable style={{ ...body, fontSize: 13, lineHeight: 20, fontWeight: cell.token.type === 'th_open' ? '700' : '400', textAlign: String(cell.token.attrGet('style') || '').includes('right') ? 'right' : String(cell.token.attrGet('style') || '').includes('center') ? 'center' : 'left' }}>{cell.children.map(n => inline(n.children))}</Text></View>)}
          </View>)}
        </View></ScrollView>;
        case 'hr': return <View key={key} style={{ height: 1, backgroundColor: c.line, marginVertical: 10 }}/>;
        default: return children.length ? <View key={key}>{blocks(children, tight)}</View> : <Text key={key} selectable style={body}>{t.content}</Text>;
      }
    });
  }
  return <View testID="help-assistant-text" style={{ minWidth: 0, gap: 3 }}>{blocks(nodes)}</View>;
});
