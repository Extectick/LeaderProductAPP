import 'react-native-gesture-handler';
import {registerRootComponent} from 'expo';
import React from 'react';
import {View,Text,Pressable,TextInput} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {PaperProvider} from 'react-native-paper';
import {BottomSheetModalProvider} from '@gorhom/bottom-sheet';
import {EntityCardProvider} from '../../src/features/entityCards/EntityCardProvider';
import {useEntityCards} from '../../src/features/entityCards/EntityCardContext';
import {HelpMarkdown} from '../../src/features/help/components/HelpMarkdown';
import {parseHelpHtmlArtifact} from '../../src/features/help/helpHtml';
import {FixtureAuthProvider} from './fixtureAuth';
import {ThemeProvider} from './fixtureTheme';
const id='7c59fb53-dc12-424e-a0a3-a82775a8b88f';
const artifact=parseHelpHtmlArtifact(JSON.stringify({version:1,id,title:'HTML со ссылкой',description:'Изолированный публичный пример',full:{html:'<main><h1>HTML со ссылкой</h1><p>Локальный пример без API и учётных данных.</p><p><a href="https://tass.ru/">Открыть ТАСС</a></p></main>',css:'body{font-family:sans-serif}p{font-size:20px;line-height:1.8}a{color:#2563eb}'}}),id);
function Fixture(){const viewer=useEntityCards();return <View style={{flex:1,padding:24,paddingTop:70,gap:24,backgroundColor:'#fff'}}>
 <Text accessibilityRole="header" style={{fontSize:23,fontWeight:'700'}}>Проверка ссылок в окне</Text>
 <Text>Настоящие компоненты. Публичный сайт. Нет API-записей.</Text>
 <HelpMarkdown text="[Открыть заказ по HTTPS](https://app.dev.lidprod.ru/services/client_orders?orderGuid=b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664&orderBaseKey=torg2026)"/>
 <HelpMarkdown text="[Открыть заказ из ИИ](leaderproduct://entity/v1/onec/torg2026/Documents/ЗаказКлиента/b8b8cb5c-d9b9-11f1-9d3e-f6ac37589664)"/>
 <HelpMarkdown text="[Профиль сотрудника](leaderproduct://entity/v1/user/902) · [Склад и связанный заказ](leaderproduct://entity/v1/onec/fixture/Catalogs/Склады/00000000-0000-4000-8000-000000000004)"/>
 <HelpMarkdown text="Вот, например, [ТАСС — новости России и мира](https://tass.ru/)."/>
 <Pressable accessibilityRole="button" accessibilityLabel="Открыть HTML со ссылкой" style={{padding:16,backgroundColor:'#eee'}} onPress={()=>viewer.openHtml?.({artifact,expectedUserId:901,scopeId:'qa-public-html',isCurrent:()=>true})}><Text>Открыть HTML со ссылкой</Text></Pressable>
 <TextInput accessibilityLabel="Черновик" defaultValue="Черновик остаётся в чате" style={{padding:12,borderWidth:1,borderRadius:8}}/>
 </View>}
registerRootComponent(()=>React.createElement(GestureHandlerRootView,{style:{flex:1}},React.createElement(SafeAreaProvider,null,React.createElement(PaperProvider,null,React.createElement(BottomSheetModalProvider,null,React.createElement(ThemeProvider,null,React.createElement(FixtureAuthProvider,null,React.createElement(EntityCardProvider,null,React.createElement(Fixture)))))))));
