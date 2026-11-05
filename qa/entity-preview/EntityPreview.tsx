import React from 'react';
import {KeyboardAvoidingView,Platform,Pressable,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {HelpMarkdown} from '../../src/features/help/components/HelpMarkdown';
import {useEntityCards} from '../../src/features/entityCards/EntityCardContext';
import {buildEntityLink} from '../../src/shared/entityLinks';
import {productTarget,orderTarget,userTarget,warehouseTarget} from './fixtureApi';
import {useTheme} from './fixtureTheme';

export default function EntityPreview(){
 const insets=useSafeAreaInsets(),entities=useEntityCards(),{theme,setTheme}=useTheme();
 const [draft,setDraft]=React.useState('Черновик сохраняется при открытии карточки');
 const dark=theme==='dark',background=dark?'#151B22':'#F7F9FC',text=dark?'#F2F4F7':'#18212D',surface=dark?'#222B35':'#FFFFFF';
 const markdown=`В заказе [ТЕСТ-002](${buildEntityLink(orderTarget)}) есть [Тестовый товар 1](${buildEntityLink(productTarget())}).\n\nОтветственный — [Тестовый сотрудник](${buildEntityLink(userTarget)}).\n\nМесто хранения: [Тестовый склад](${buildEntityLink(warehouseTarget)}).`;
 return <KeyboardAvoidingView style={[styles.root,{paddingTop:insets.top,paddingBottom:insets.bottom,backgroundColor:background}]} behavior={Platform.OS==='ios'?'padding':undefined}>
  <StatusBar barStyle={dark?'light-content':'dark-content'}/>
  <View style={[styles.header,{backgroundColor:surface}]}><Text accessibilityRole="header" style={[styles.title,{color:text}]}>Проверка карточек</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Сменить тему" style={styles.theme} onPress={()=>void setTheme(dark?'light':'dark')}><Text style={{color:dark?'#68B0FF':'#2563EB'}}>{dark?'Светлая':'Тёмная'}</Text></Pressable></View>
  <ScrollView testID="entity-preview-parent-scroll" style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
   <Text style={[styles.note,{color:dark?'#A6B0BE':'#627185'}]}>Локальные синтетические данные. API, 1С и отправка сообщений отключены.</Text>
   <View style={[styles.answer,{backgroundColor:surface}]}><Text style={[styles.answerLabel,{color:dark?'#A6B0BE':'#627185'}]}>Пример ответа ИИ</Text><HelpMarkdown text={markdown}/></View>
   <View style={styles.buttons}>{[[productTarget(),'Товар'],[orderTarget,'Заказ'],[userTarget,'Сотрудник']] .map(([target,label])=><Pressable key={String(label)} accessibilityRole="button" accessibilityLabel={`Открыть ${label}`} onPress={()=>entities.openEntity(target as typeof orderTarget,String(label))} style={[styles.button,{backgroundColor:surface}]}><Text style={{color:dark?'#68B0FF':'#2563EB'}}>{String(label)}</Text></Pressable>)}</View>
   <Text style={[styles.note,{color:dark?'#A6B0BE':'#627185'}]}>В карточке заказа нажмите название товара, затем ответственного. Кнопка «Назад» возвращает по истории карточек, крестик — к этому экрану.</Text>
   {Array.from({length:12},(_,i)=><Text key={i} style={[styles.history,{color:text}]}>Сообщение истории {i+1}. Положение этого списка и черновик должны сохраниться после закрытия карточки.</Text>)}
  </ScrollView>
  <View style={[styles.composer,{backgroundColor:surface}]}><TextInput testID="entity-preview-draft" accessibilityLabel="Черновик сообщения" placeholder="Черновик сообщения" value={draft} onChangeText={setDraft} multiline style={[styles.input,{color:text}]} /></View>
 </KeyboardAvoidingView>;
}
const styles=StyleSheet.create({root:{flex:1},header:{minHeight:58,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},title:{fontSize:19,fontWeight:'700'},theme:{minHeight:44,justifyContent:'center',paddingLeft:12},scroll:{flex:1},content:{padding:18,gap:18},note:{fontSize:13,lineHeight:20},answer:{padding:16,borderRadius:18,gap:8},answerLabel:{fontSize:12},buttons:{flexDirection:'row',gap:10},button:{flex:1,minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:12},history:{fontSize:15,lineHeight:23,paddingVertical:10},composer:{paddingHorizontal:16,paddingVertical:12},input:{minHeight:48,maxHeight:110,padding:12,borderWidth:StyleSheet.hairlineWidth,borderColor:'#94A3B8',borderRadius:16,fontSize:15}});
