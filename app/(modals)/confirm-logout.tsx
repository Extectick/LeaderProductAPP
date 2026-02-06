import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { MotiView } from 'moti';
import { useRouter, type Href } from 'expo-router';
import { logoutUser } from '@/utils/authService';
import { useThemeColor } from '@/hooks/useThemeColor';

export default function ConfirmLogoutModal() {
  const router = useRouter();
  const bgCard = useThemeColor({}, 'cardBackground');
  const textColor = useThemeColor({}, 'text');
  const cancelBg = useThemeColor({}, 'buttonDisabled');
  const confirmBg = useThemeColor({}, 'button');
  const cancelText = textColor;
  const confirmText = textColor;

  const onCancel = () => router.back();
  const onConfirm = async () => {
    try { await logoutUser(); } finally { router.replace('/(auth)/AuthScreen' as Href); }
  };

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={styles.backdropPress} onPress={onCancel}>
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ type: 'timing', duration: 160 }}
          style={styles.backdrop}
        />
      </Pressable>
      <MotiView
        from={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'timing', duration: 180 }}
        style={[styles.card, { backgroundColor: bgCard }]}
      >
        <Text style={[styles.title, { color: textColor }]}>Выйти из аккаунта?</Text>
        <Text style={[styles.msg,   { color: textColor }]}>
          Вы действительно хотите выйти из аккаунта?
        </Text>

        <View style={styles.row}>
          <Pressable onPress={onCancel} style={[styles.btn, { backgroundColor: cancelBg }]}>
            <Text style={[styles.btnText, { color: cancelText }]}>Отмена</Text>
          </Pressable>
          <Pressable onPress={onConfirm} style={[styles.btn, { backgroundColor: confirmBg }]}>
            <Text style={[styles.btnText, { color: confirmText }]}>Выйти</Text>
          </Pressable>
        </View>
      </MotiView>
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
  backdropPress: { ...StyleSheet.absoluteFillObject },
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
  row:   { flexDirection: 'row', justifyContent: 'center', marginTop: 20, gap: 10 },
  btn:   { flex: 1, minHeight: 44, paddingVertical: 12, borderRadius: 12, alignItems: 'center', minWidth: 100 },
  btnText: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
});
