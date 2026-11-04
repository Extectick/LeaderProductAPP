import React from 'react';
import {Image, Platform, Pressable, StyleSheet, Text, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {Ionicons} from '@expo/vector-icons';
import {AppHeader} from '@/components/AppHeader';
import {APP_TOOLBAR_LAYOUT as layout} from '@/components/ui/appToolbarLayout';
import {useThemeColor} from '@/hooks/useThemeColor';
import {servicesTokens} from './servicesTokens';
import {COMPANY_WORDMARK_PATH,COMPANY_WORDMARK_VIEWBOX} from '../assets/companyWordmark';

// Size the visible company symbol, rather than its transparent bitmap canvas.
const logoScale = layout.actionSize / 824;
const wordmarkWidth = 164;
const wordmarkHeight = 20;

/** The catalogue alone owns the company lockup; service toolbars keep their own controls. */
export function ServicesHomeHeader({avatar, onProfile}: {avatar?: React.ReactNode; onProfile: () => void}) {
  const avatarBackground = useThemeColor({light: '#EAF2FF', dark: '#203043'}, 'background');
  const accent = useThemeColor({light: '#2563EB', dark: '#68B0FF'}, 'text');
  return <AppHeader title="Лидер Продукт" icon="apps-outline" showBack={false} variant="flat" entranceMotion="none" showServerStatus={false}
    contentSlot={<View testID="services-home-header" style={styles.row}>
      <View testID="services-company-logo" style={styles.logoViewport}>
        <Image accessible={false} source={require('../../../../assets/images/icon.png')} resizeMode="contain" style={styles.logoImage}/>
      </View>
      <View accessibilityLabel="Лидер Продукт — мы всегда в рынке" style={styles.identity}>
        <View testID="services-company-name" style={styles.wordmarkViewport}>
          <Svg {...(Platform.OS === 'web' ? { 'aria-hidden': true, focusable: false } : { accessible: false })} width="100%" height={wordmarkHeight} viewBox={COMPANY_WORDMARK_VIEWBOX} preserveAspectRatio="xMinYMid meet">
            <Path d={COMPANY_WORDMARK_PATH} fill="#97BF20" fillRule="evenodd"/>
          </Svg>
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
  wordmarkViewport: {width:'100%',maxWidth:wordmarkWidth,height:wordmarkHeight},
  tagline: {fontSize: 11, lineHeight: 14, color: '#C58B2D', includeFontPadding: false},
  avatar: {width: layout.actionSize, height: layout.actionSize, borderRadius: layout.actionSize / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center'},
});
