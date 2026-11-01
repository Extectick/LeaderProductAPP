/** The product screen/header with fixture access; no login or API requests. */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import {ServicesHomeHeader} from '../../src/features/services/ui/ServicesHomeHeader';
import {useRouter} from './routerFixture';
import {Text} from 'react-native';
import { ScreenBlurProvider } from '../../components/ui/AppScreenBlur';
import { useThemeColor } from '../../hooks/useThemeColor';
import ServicesCatalogScreen from '../../src/features/services/ui/ServicesCatalogScreen';

export default function ServicesPreview() {
  const background = useThemeColor({}, 'background');
  const avatarColor = useThemeColor({light:'#2563EB',dark:'#68B0FF'}, 'text');
  const router = useRouter();
  return <ScreenBlurProvider><View testID="services-qa-surface" style={{ flex: 1, backgroundColor: background }}>
    <ServicesCatalogScreen/>
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { bottom: undefined, zIndex: 20 }]}>
      <ServicesHomeHeader onProfile={() => router.push('/profile')} avatar={<Text style={{color:avatarColor,fontSize:15,fontWeight:'600'}}>АБ</Text>}/>
    </View>
  </View></ScreenBlurProvider>;
}
