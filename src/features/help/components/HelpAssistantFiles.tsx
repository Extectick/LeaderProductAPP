import {LoadingPlaceholder} from '@/components/ui/LoadingPlaceholder';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HelpAttachment } from '../helpApi';
import { useHelpTheme } from '../helpTheme';
import { helpFileSize } from '../helpUiUtils';
import {helpHtmlAttachmentId} from '../helpHtml';
import type { ResolveHelpMedia } from './HelpMedia';

export type HelpAssistantFilesProps = {
  attachments: HelpAttachment[];
  resolve?: ResolveHelpMedia;
  onError?: (text: string) => void;
};

type DownloadOperation = { id: string; resolver: ResolveHelpMedia; controller: AbortController; generation: number };

/** Uses the same authenticated attachment path as the rest of the Help chat. */
export function HelpAssistantFiles({ attachments, resolve, onError }: HelpAssistantFilesProps) {
  const c = useHelpTheme();
  const files = attachments.filter(file => file.kind === 'FILE' && helpHtmlAttachmentId(file) === null);
  const identity = files.map(file => `${file.id}:${file.url}`).join('|');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [cancelledId,setCancelledId]=useState<string|null>(null);
  const operation = useRef<DownloadOperation | null>(null), generation = useRef(0), mounted = useRef(false);
  const resolver = useRef(resolve); resolver.current = resolve;
  const report = useRef(onError); report.current = onError;
  useLayoutEffect(() => {
    const version = ++generation.current;
    mounted.current = true; setDownloadingId(null); setFailedId(null);setCancelledId(null);
    return () => {
      if (generation.current !== version) return;
      mounted.current = false;
      operation.current?.controller.abort(); operation.current = null;
    };
  }, [resolve, identity]);

  async function download(file: HelpAttachment) {
    if (!resolve || operation.current || !mounted.current) return;
    const current: DownloadOperation = { id: file.id, resolver: resolve, controller: new AbortController(), generation: generation.current };
    operation.current = current; setDownloadingId(file.id); setFailedId(null);setCancelledId(null);
    const isCurrent = () => mounted.current && operation.current === current && generation.current === current.generation && resolver.current === current.resolver && !current.controller.signal.aborted;
    try {
      // Load media only for an explicit file action; a text-only AI row should
      // not initialize the audio/gallery subsystem.
      const { downloadHelpAttachment } = require('./HelpMedia') as typeof import('./HelpMedia');
      await downloadHelpAttachment(file, current.resolver, current.controller.signal);
    } catch {
      if (isCurrent()) {
        setFailedId(file.id);
        report.current?.('Не удалось скачать файл. Попробуйте ещё раз.');
      }
    } finally {
      if (isCurrent()) { operation.current = null; setDownloadingId(null); }
    }
  }

  if (!files.length) return null;
  return <View testID="help-assistant-files" style={{ gap: 8, marginTop: 8 }}>
    {files.map(file => {
      const busy = downloadingId === file.id, disabled = !resolve || downloadingId !== null;
      const extension = file.name.match(/\.([a-z0-9]{1,8})$/i)?.[1].toUpperCase() || 'ФАЙЛ';
      const action = Platform.OS === 'web' ? 'Скачать' : 'Сохранить';
      return <View key={file.id} style={{ gap: 4 }}>
        <Pressable testID={`help-assistant-file-${file.id}`} accessibilityRole="button"
          accessibilityLabel={`${action} файл ${file.name}`} accessibilityState={{ disabled, busy }} disabled={disabled}
          onPress={() => void download(file)} style={{ minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12,
            borderRadius: 16, borderWidth: 1, borderColor: failedId === file.id ? c.danger : c.line,
            backgroundColor: busy?(c.dark?'#343A42':'#E4E7EB'):c.elevated, paddingHorizontal: 14, paddingVertical: 12, opacity: !resolve ? 0.55 : 1 }}>
          <View style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: c.dark?'#343A42':'#E4E7EB' }}>
            {busy?<LoadingPlaceholder dark={c.dark} variant="icon" accessibilityLabel="Загрузка файла" style={{width:40,height:44}}/>:<Ionicons name="document-text-outline" size={23} color={c.accentText}/>}
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text numberOfLines={2} style={{ color: c.text, fontSize: 14, fontWeight: '600', lineHeight: 19 }}>{file.name}</Text>
            <Text style={{ color: c.muted, fontSize: 11 }}>{extension} · {helpFileSize(file.size)}</Text>
          </View>
          <View style={{ alignItems: 'center', justifyContent: 'center', minWidth: 56, gap: 4 }}>
            {busy ? <ActivityIndicator size="small" color={c.accentText}/> : <Ionicons name="download-outline" size={20} color={c.accentText}/>}
            <Text style={{ color: c.accentText, fontSize: 11 }}>{busy ? 'Загрузка…' : action}</Text>
          </View>
        </Pressable>
        {busy?<Pressable testID={`help-assistant-file-cancel-${file.id}`} accessibilityRole="button" accessibilityLabel={`Отменить загрузку файла ${file.name}`} onPress={()=>{
          const current=operation.current;if(!current||current.id!==file.id)return;
          current.controller.abort();operation.current=null;setDownloadingId(null);setCancelledId(file.id);
        }} style={{minHeight:44,alignSelf:'flex-end',justifyContent:'center',paddingHorizontal:12}}><Text style={{color:c.muted,fontSize:12}}>Отменить загрузку</Text></Pressable>:null}
        {cancelledId===file.id?<Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:12}}>Загрузка отменена. Можно скачать файл снова.</Text>:null}
        {failedId === file.id ? <Text accessibilityRole="alert" style={{ color: c.danger, fontSize: 12, lineHeight: 17 }}>Не удалось скачать файл. Нажмите, чтобы повторить.</Text> : null}
      </View>;
    })}
  </View>;
}
