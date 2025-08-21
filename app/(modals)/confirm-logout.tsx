import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { logoutUser } from '@/utils/authService';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function ConfirmLogoutModal() {
  const router = useRouter();
  const bgCard     = useThemeColor({}, 'cardBackground');
  const textColor  = useThemeColor({}, 'text');
  const btnText    = useThemeColor({}, 'buttonText');
  const cancelBg   = useThemeColor({}, 'buttonDisabled');
  const confirmBg  = useThemeColor({}, 'button');

  const onCancel = () => router.back();
  const onConfirm = async () => {
    try { await logoutUser(); } finally { router.replace('/(auth)/AuthScreen' as Href); }
  };

  return (
    <View style={styles.root}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={[styles.card, { backgroundColor: bgCard }]}>
        <Text style={[styles.title, { color: textColor }]}>Выйти из аккаунта?</Text>
        <Text style={[styles.msg,   { color: textColor }]}>
          Вы действительно хотите выйти из аккаунта?
        </Text>

        <View style={styles.row}>
          <Pressable onPress={onCancel} style={[styles.btn, styles.left,  { backgroundColor: cancelBg }]}>
            <Text style={[styles.btnText, { color: btnText }]}>Отмена</Text>
          </Pressable>
          <Pressable onPress={onConfirm} style={[styles.btn, styles.right, { backgroundColor: confirmBg }]}>
            <Text style={[styles.btnText, { color: btnText }]}>Выйти</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    ...Platform.select({ web: { position: 'fixed' as any, inset: 0 } }),
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  card: {
    width: '100%', maxWidth: 420, borderRadius: 16, padding: 20,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 10 },
      web: { boxShadow: '0 10px 30px rgba(0,0,0,0.25)' as any },
    }),
  },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 10 },
  msg:   { fontSize: 16, textAlign: 'center' },
  row:   { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  btn:   { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', minWidth: 100 },
  left:  { marginRight: 8 },
  right: { marginLeft: 8 },
  btnText: { fontSize: 16, fontWeight: '600' },
});
