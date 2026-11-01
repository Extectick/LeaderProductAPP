import React, {useState} from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {AppHeader} from '@/components/AppHeader';
import {APP_TOOLBAR_LAYOUT as layout} from '@/components/ui/appToolbarLayout';
import {useThemeColor} from '@/hooks/useThemeColor';
import {servicesTokens} from './servicesTokens';

// Visible bounds inside the supplied transparent assets. Size the visible mark,
// not its transparent canvas, and keep native bitmap decoding at its full aspect.
const logoScale = layout.actionSize / 824;
const wordmarkWidth = 164;
const wordmarkHeight = 20;
const wordmarkScale = wordmarkWidth / 2097;

/** The catalogue alone owns the company lockup; service toolbars keep their own controls. */
export function ServicesHomeHeader({avatar, onProfile}: {avatar?: React.ReactNode; onProfile: () => void}) {
  const [wordmarkFailed,setWordmarkFailed] = useState(false);
  const avatarBackground = useThemeColor({light: '#EAF2FF', dark: '#203043'}, 'background');
  const accent = useThemeColor({light: '#2563EB', dark: '#68B0FF'}, 'text');
  return <AppHeader title="Лидер Продукт" icon="apps-outline" showBack={false} variant="flat" entranceMotion="none" showServerStatus={false}
    contentSlot={<View testID="services-home-header" style={styles.row}>
      <View testID="services-company-logo" style={styles.logoViewport}>
        <Image accessible={false} source={require('../../../../assets/images/icon.png')} resizeMode="contain" style={styles.logoImage}/>
      </View>
      <View accessibilityLabel="Лидер Продукт — мы всегда в рынке" style={styles.identity}>
        <View style={styles.wordmarkViewport}>
          {wordmarkFailed ? <Text testID="services-company-name-fallback" numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.wordmarkFallback}>ЛИДЕР ПРОДУКТ</Text>
            : <Image testID="services-company-wordmark" accessible={false} source={require('../../../../assets/images/company-wordmark.png')} resizeMode="contain" onError={()=>setWordmarkFailed(true)} style={styles.wordmarkImage}/>}
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.tagline}>мы всегда в рынке</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Профиль" accessibilityHint="Ваши данные и настройки" onPress={onProfile}
        style={({pressed}) => [styles.avatar, {backgroundColor: avatarBackground, opacity: pressed ? .7 : 1}]}>
        {avatar ?? <Ionicons name="person-outline" size={25} color={accent}/>}
      </Pressable>
    </View>}/>;
}

const styles = StyleSheet.create({
  row: {width: '100%', maxWidth: servicesTokens.row.maxContentWidth, alignSelf: 'center', paddingHorizontal: layout.inset, paddingTop: layout.top, paddingBottom: layout.bottom, flexDirection: 'row', alignItems: 'center', gap: layout.gap},
  logoViewport: {width: layout.actionSize, height: layout.actionSize},
  logoImage: {position:'absolute',width:1024*logoScale,height:1024*logoScale,left:-131*logoScale,top:-89*logoScale},
  identity: {flex: 1, minWidth: 0, justifyContent: 'center', gap: 0},
  wordmarkViewport: {width:'100%',maxWidth:wordmarkWidth,height:wordmarkHeight,overflow:'hidden'},
  wordmarkImage: {position:'absolute',width:2172*wordmarkScale,height:724*wordmarkScale,left:-45*wordmarkScale,top:(wordmarkHeight-228*wordmarkScale)/2-241*wordmarkScale,tintColor:'#97BF20'},
  wordmarkFallback: {fontSize:16,lineHeight:wordmarkHeight,fontWeight:'800',color:'#97BF20',includeFontPadding:false},
  tagline: {fontSize: 11, lineHeight: 14, color: '#C58B2D', includeFontPadding: false},
  avatar: {width: layout.actionSize, height: layout.actionSize, borderRadius: layout.actionSize / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
});
