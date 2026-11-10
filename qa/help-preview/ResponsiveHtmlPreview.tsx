/** Local presentation fixture, without an authenticated account or API calls. */
import React,{useState} from 'react';
import {Pressable,Text,View} from 'react-native';
import {HelpHtmlViewer} from '../../src/features/help/components/HelpHtmlViewer';
import {HelpHtmlSurface} from '../../src/features/help/components/HelpHtmlSurface';
import {useHelpTheme} from '../../src/features/help/helpTheme';
import type {HelpHtmlArtifact} from '../../src/features/help/helpHtml';

const artifact:HelpHtmlArtifact={version:1,id:'8cb01504-f89b-4e55-ad30-f8f6eb686547',title:'Сводка заказа',description:'Локальный пример',full:{html:'<article><h1>Заказ готов к выдаче</h1><p>Проверьте состав и способ получения.</p><dl><dt>Позиций</dt><dd>4</dd><dt>Способ получения</dt><dd>Самовывоз</dd></dl><p>Это локальный пример HTML без данных пользователя.</p></article>',css:'article{padding:24px;font:16px/1.6 system-ui}h1{font-size:24px}dt{opacity:.65}dd{margin:0 0 20px;font-weight:600}'}};
export function ResponsiveHtmlPreview({compactMode=false}:{compactMode?:boolean}){
  const [open,setOpen]=useState(!compactMode),c=useHelpTheme();
  return <View style={{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:c.background}}>
    {compactMode?<View testID="qa-html-compact-frame" style={{height:132,width:'95%',maxWidth:760,overflow:'hidden'}}><HelpHtmlSurface compact label="Тестовый профиль" variant={{html:'<div class="card"><div class="avatar">ТП</div><div><strong>Тестовый профиль</strong><p>Открыть профиль →</p></div></div>',css:`.card{height:132px;border-radius:18px;background:${c.panel};display:flex;align-items:center;gap:18px;padding:16px;font:16px/1.5 system-ui}.avatar{border-radius:50%;width:72px;height:72px;display:grid;place-items:center;background:${c.soft};font-size:24px}p{color:${c.accentText};margin:4px 0;font-size:14px}`}}/></View>:null}
    <Pressable accessibilityRole="button" accessibilityLabel="Открыть пример HTML" onPress={()=>setOpen(true)} style={{padding:16}}><Text style={{color:c.accentText}}>Открыть пример HTML</Text></Pressable>
    {open?<HelpHtmlViewer artifact={artifact} onClose={()=>setOpen(false)}/>:null}
  </View>;
}
