// ===== File: components/QRcodes/QRCodeForm.tsx =====
import type { QRCodeItemType, QRType } from '@/types/qrTypes';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import Animated, { FadeInDown, SlideInLeft, SlideOutRight, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

// ======= Русские названия типов + иконки =======
const RU_LABELS: Record<QRType, string> = {
  PHONE: 'Телефон',
  LINK: 'Ссылка',
  EMAIL: 'Email',
  TEXT: 'Текст',
  WHATSAPP: 'WhatsApp',
  TELEGRAM: 'Telegram',
  CONTACT: 'Контакт',
  WIFI: 'Wi-Fi', // обычный дефис, чтобы не было проблем с шириной глифа
  SMS: 'SMS',
  GEO: 'Геолокация',
  BITCOIN: 'Bitcoin',
};

const TYPE_ICONS: Record<QRType, keyof typeof Ionicons.glyphMap> = {
  PHONE: 'call-outline',
  LINK: 'link-outline',
  EMAIL: 'mail-outline',
  TEXT: 'text-outline',
  WHATSAPP: 'logo-whatsapp',
  TELEGRAM: 'paper-plane-outline',
  CONTACT: 'person-outline',
  WIFI: 'wifi-outline',
  SMS: 'chatbubble-ellipses-outline',
  GEO: 'location-outline',
  BITCOIN: 'logo-bitcoin',
};

const TYPE_COLORS: Record<QRType, string> = {
  PHONE: '#0CA678',
  LINK: '#1D4ED8',
  EMAIL: '#EF4444',
  TEXT: '#6B7280',
  WHATSAPP: '#25D366',
  TELEGRAM: '#0088cc',
  CONTACT: '#9333EA',
  WIFI: '#0EA5E9',
  SMS: '#F59E0B',
  GEO: '#059669',
  BITCOIN: '#F7931A',
};

// отключаемые типы (будут как «скоро»)
const DISABLED_TYPES: QRType[] = ['BITCOIN', 'SMS', 'WIFI', 'GEO', 'EMAIL'];

// ======= Плейсхолдеры =======
const PLACEHOLDERS: Partial<Record<QRType, Record<string, string>>> = {
  PHONE: { phone: '+79991234567' },
  LINK: { url: 'https://example.com' },
  EMAIL: { email: 'name@example.com', subject: 'Тема', body: 'Текст письма' },
  TEXT: { text: 'Любой текст' },
  WHATSAPP: { phone: '+79991234567', message: 'Текст сообщения' },
  TELEGRAM: { username: 'username' },
  CONTACT: { firstname: 'Имя', lastname: 'Фамилия', phone: '+79991234567', email: 'name@example.com', website: 'https://', org: 'Компания', contactAddress: 'Адрес', note: 'Заметка' },
  WIFI: { ssid: 'MyWiFi', password: 'secret123', encryption: 'WPA' },
  SMS: { phone: '+79991234567', message: 'Текст SMS' },
  GEO: { lat: '55.7558', lng: '37.6176' },
  BITCOIN: { address: 'bc1q...', amount: '0.001', label: 'Платёж', message: 'Спасибо!' },
};

// ======= Тип формы =======
export type QRFormValues = {
  description: string;
  qrType: QRType;
  // общие:
  phone?: string; url?: string; email?: string; subject?: string; body?: string; text?: string;
  message?: string; username?: string;
  // контакт подробно
  firstname?: string; lastname?: string; org?: string; website?: string; contactAddress?: string; note?: string;
  // wifi
  ssid?: string; password?: string; encryption?: string; hidden?: boolean;
  // geo
  lat?: string; lng?: string;
  // bitcoin
  address?: string; amount?: string; label?: string;
};

export interface QRCodeFormProps {
  mode: 'create' | 'edit';
  initialItem?: QRCodeItemType;
  onSubmit: (values: QRFormValues & { qrData: string }) => Promise<boolean>;
}

// ======= Утилиты парсинга =======
function parseVCard(vcard: string) {
  const lines = vcard.split(/\r?\n/);
  const out: any = {};
  for (const ln of lines) {
    if (ln.startsWith('FN:')) out.firstname = ln.replace(/^FN:/, '').split(' ')[0] || '';
    if (ln.startsWith('N:')) {
      const n = ln.replace(/^N:/, '').split(';');
      out.lastname = n[0] || out.lastname;
      out.firstname = n[1] || out.firstname;
    }
    if (/^TEL/i.test(ln)) out.phone = ln.split(':')[1]?.replace(/\D/g, '') || '';
    if (/^EMAIL/i.test(ln)) out.email = ln.split(':')[1] || '';
    if (/^URL/i.test(ln)) out.website = ln.split(':')[1] || '';
    if (/^ORG/i.test(ln)) out.org = ln.split(':')[1] || '';
    if (/^ADR/i.test(ln)) out.contactAddress = ln.split(':')[1] || '';
    if (/^NOTE/i.test(ln)) out.note = ln.split(':')[1] || '';
  }
  return out;
}

function buildVCard(v: QRFormValues) {
  const N = `${v.lastname ?? ''};${v.firstname ?? ''};;;`;
  const FN = `${[v.firstname, v.lastname].filter(Boolean).join(' ')}`;
  const TEL = v.phone ? `TEL;TYPE=CELL:${v.phone}` : '';
  const EMAIL = v.email ? `EMAIL:${v.email}` : '';
  const URL = v.website ? `URL:${v.website}` : '';
  const ORG = v.org ? `ORG:${v.org}` : '';
  const ADR = v.contactAddress ? `ADR;TYPE=HOME:${v.contactAddress}` : '';
  const NOTE = v.note ? `NOTE:${v.note}` : '';
  return [
    'BEGIN:VCARD', 'VERSION:3.0', `N:${N}`, `FN:${FN}`, ORG, TEL, EMAIL, URL, ADR, NOTE, 'END:VCARD'
  ].filter(Boolean).join('\n');
}

function parseByType(item?: QRCodeItemType): Partial<QRFormValues> {
  if (!item) return {};
  const t = item.qrType;
  const data = item.qrData ?? '';
  switch (t) {
    case 'PHONE': {
      const m = data.match(/tel:(\+?\d+)/i);
      return { phone: m?.[1] ?? data.replace(/\D/g, '') };
    }
    case 'LINK': return { url: data };
    case 'EMAIL': {
      const email = data.startsWith('mailto:') ? data.slice(7).split('?')[0] : '';
      let subject = '', body = '';
      try { const u = new URL(data); subject = u.searchParams.get('subject') ?? ''; body = u.searchParams.get('body') ?? ''; } catch {}
      return { email, subject, body };
    }
    case 'TEXT': return { text: data };
    case 'WHATSAPP': {
      let phone = data.replace(/^https?:\/\/wa\.me\//, '').split('?')[0];
      phone = phone.replace(/\D/g, '');
      let message = '';
      try { const u = new URL(data); message = u.searchParams.get('text') ?? ''; } catch {}
      return { phone, message };
    }
    case 'TELEGRAM': {
      const m = data.match(/t\.me\/([^/?]+)/i);
      return { username: m?.[1] ?? '' };
    }
    case 'CONTACT': return parseVCard(data);
    case 'WIFI': {
      const o: any = {};
      data.replace(/^WIFI:/, '').split(';').forEach(s => {
        const [k, v] = s.split(':');
        if (!k || !v) return;
        if (k === 'T') o.encryption = v; if (k === 'S') o.ssid = v; if (k === 'P') o.password = v; if (k === 'H') o.hidden = v === 'true';
      });
      return o;
    }
    case 'SMS': {
      const m = data.match(/^SMSTO:([^:]+):?(.*)$/i);
      return { phone: m?.[1]?.replace(/\D/g, ''), message: m?.[2] ?? '' };
    }
    case 'GEO': {
      const m = data.match(/^geo:([+-]?\d+(\.\d+)?),([+-]?\d+(\.\d+)?)/i);
      return { lat: m?.[1], lng: m?.[3] };
    }
    case 'BITCOIN': {
      const raw = data.replace(/^bitcoin:/i, '');
      const [address, qs] = raw.split('?');
      const sp = new URLSearchParams(qs ?? '');
      return { address, amount: sp.get('amount') ?? undefined, label: sp.get('label') ?? undefined, message: sp.get('message') ?? undefined };
    }
  }
}

function buildQRData(t: QRType, v: QRFormValues) {
  switch (t) {
    case 'PHONE': return `tel:${v.phone?.startsWith('+') ? v.phone : `+${v.phone}`}`;
    case 'LINK': return v.url || '';
    case 'EMAIL': {
      const sp = new URLSearchParams(); if (v.subject) sp.set('subject', v.subject); if (v.body) sp.set('body', v.body);
      return `mailto:${v.email}${sp.toString() ? `?${sp.toString()}` : ''}`;
    }
    case 'TEXT': return v.text || '';
    case 'WHATSAPP': {
      const sp = new URLSearchParams(); if (v.message) sp.set('text', v.message);
      return `https://wa.me/${v.phone}${sp.toString() ? `?${sp.toString()}` : ''}`;
    }
    case 'TELEGRAM': return `https://t.me/${v.username}`;
    case 'CONTACT': return buildVCard(v);
    case 'WIFI': return `WIFI:T:${v.encryption ?? 'WPA'};S:${v.ssid};P:${v.password ?? ''};${v.hidden ? 'H:true;' : ''};`;
    case 'SMS': return `SMSTO:${v.phone}:${v.message ?? ''}`;
    case 'GEO': return `geo:${v.lat},${v.lng}`;
    case 'BITCOIN': {
      const sp = new URLSearchParams(); if (v.amount) sp.set('amount', v.amount); if (v.label) sp.set('label', v.label); if (v.message) sp.set('message', v.message);
      return `bitcoin:${v.address}${sp.toString() ? `?${sp.toString()}` : ''}`;
    }
  }
}

export default function QRCodeForm({ mode, initialItem, onSubmit }: QRCodeFormProps) {
  const defaultType: QRType = initialItem?.qrType ?? 'LINK';

  // изолированные значения по типам (не переносятся между типами)
  const [perTypeValues, setPerTypeValues] = useState<Record<QRType, Partial<QRFormValues>>>({} as any);

  const { control, handleSubmit, setValue, getValues, reset, watch } = useForm<QRFormValues>({
    defaultValues: {
      description: initialItem?.description ?? '',
      qrType: defaultType,
      ...(initialItem ? parseByType(initialItem) : {}),
    },
    mode: 'onChange',
  });

  const currentType = watch('qrType') as QRType;
  const color = TYPE_COLORS[currentType];

  useEffect(() => {
    if (mode === 'edit' && initialItem) {
      setPerTypeValues(prev => ({ ...prev, [initialItem.qrType]: parseByType(initialItem) }));
    }
  }, [mode, initialItem]);

  // Слайдер-переход форм при смене типа
  const slideKey = useRef(0);
  useEffect(() => { slideKey.current++; }, [currentType]);

  // Анимация кнопки (круглая волна)
  const [submitting, setSubmitting] = useState(false);
  const ripple = useSharedValue(0);
  const rippleStyle = useAnimatedStyle(() => ({ transform: [{ scale: ripple.value }] }));

  // Смена типа: кэш текущего и загрузка сохранённого
  const onChangeType = (t: QRType) => {
    const fromType = getValues('qrType') as QRType;
    const snapshot = getValues();
    setPerTypeValues(prev => ({ ...prev, [fromType]: snapshot }));
    const base = { description: snapshot.description, qrType: t } as QRFormValues;
    const next = perTypeValues[t] || {};
    reset({ ...base, ...(next as any) });
  };

  // Сабмит
  const submit = handleSubmit(async () => {
    try {
      setSubmitting(true);
      ripple.value = 0;
      ripple.value = withTiming(1, { duration: 450 });
      const t = getValues('qrType') as QRType;
      const v = getValues();
      const qrData = buildQRData(t, v);
      const ok = await onSubmit({ ...v, qrData });
      if (ok) Alert.alert('Успешно', mode === 'edit' ? 'QR обновлён' : 'QR создан');
      else Alert.alert('Ошибка', 'Не удалось сохранить');
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить');
    } finally {
      setSubmitting(false);
      ripple.value = withTiming(0, { duration: 200 });
    }
  });

  const normalizePhone = (val: string) => val.replace(/[^\d+]/g, '').replace(/\s+/g, '');

  const renderFieldsByType = (t: QRType) => {
    switch (t) {
      case 'PHONE':
      case 'WHATSAPP':
      case 'SMS':
        return (
          <>
            <LabeledInput name="phone" control={control} placeholder={PLACEHOLDERS.PHONE?.phone} color={color} keyboardType="phone-pad" onNormalize={normalizePhone} />
            {t !== 'PHONE' && (
              <LabeledInput name="message" control={control} placeholder={PLACEHOLDERS.WHATSAPP?.message} color={color} multiline />
            )}
          </>
        );
      case 'LINK':
        return (
          <LabeledInput name="url" control={control} placeholder={PLACEHOLDERS.LINK?.url} color={color} keyboardType={Platform.OS === 'web' ? 'default' : 'url'} autoCapitalize="none" />
        );
      case 'EMAIL':
        return (
          <>
            <LabeledInput name="email" control={control} placeholder={PLACEHOLDERS.EMAIL?.email} color={color} keyboardType="email-address" autoCapitalize="none" />
            <LabeledInput name="subject" control={control} placeholder={PLACEHOLDERS.EMAIL?.subject} color={color} />
            <LabeledInput name="body" control={control} placeholder={PLACEHOLDERS.EMAIL?.body} color={color} multiline />
          </>
        );
      case 'TELEGRAM':
        return (
          <LabeledInput name="username" control={control} placeholder={PLACEHOLDERS.TELEGRAM?.username} color={color} autoCapitalize="none" />
        );
      case 'CONTACT':
        return (
          <>
            <LabeledInput name="firstname" control={control} placeholder={PLACEHOLDERS.CONTACT?.firstname} color={color} />
            <LabeledInput name="lastname" control={control} placeholder={PLACEHOLDERS.CONTACT?.lastname} color={color} />
            <LabeledInput name="org" control={control} placeholder={PLACEHOLDERS.CONTACT?.org} color={color} />
            <LabeledInput name="phone" control={control} placeholder={PLACEHOLDERS.CONTACT?.phone} color={color} keyboardType="phone-pad" onNormalize={normalizePhone} />
            <LabeledInput name="email" control={control} placeholder={PLACEHOLDERS.CONTACT?.email} color={color} keyboardType="email-address" autoCapitalize="none" />
            <LabeledInput name="website" control={control} placeholder={PLACEHOLDERS.CONTACT?.website} color={color} autoCapitalize="none" />
            <LabeledInput name="contactAddress" control={control} placeholder={PLACEHOLDERS.CONTACT?.contactAddress} color={color} />
            <LabeledInput name="note" control={control} placeholder={PLACEHOLDERS.CONTACT?.note} color={color} multiline />
          </>
        );
      case 'WIFI':
        return (
          <>
            <LabeledInput name="ssid" control={control} placeholder={PLACEHOLDERS.WIFI?.ssid} color={color} />
            <LabeledInput name="password" control={control} placeholder={PLACEHOLDERS.WIFI?.password} color={color} secureTextEntry />
            <LabeledInput name="encryption" control={control} placeholder={PLACEHOLDERS.WIFI?.encryption ?? 'WPA / WPA2 / WEP / nopass'} color={color} />
          </>
        );
      case 'GEO':
        return (
          <>
            <LabeledInput name="lat" control={control} placeholder={PLACEHOLDERS.GEO?.lat} color={color} keyboardType="decimal-pad" />
            <LabeledInput name="lng" control={control} placeholder={PLACEHOLDERS.GEO?.lng} color={color} keyboardType="decimal-pad" />
          </>
        );
      case 'BITCOIN':
        return (
          <>
            <LabeledInput name="address" control={control} placeholder={PLACEHOLDERS.BITCOIN?.address} color={color} autoCapitalize="none" />
            <LabeledInput name="amount" control={control} placeholder={PLACEHOLDERS.BITCOIN?.amount} color={color} keyboardType="decimal-pad" />
            <LabeledInput name="label" control={control} placeholder={PLACEHOLDERS.BITCOIN?.label} color={color} />
            <LabeledInput name="message" control={control} placeholder={PLACEHOLDERS.BITCOIN?.message} color={color} />
          </>
        );
      case 'TEXT':
      default:
        return (
          <LabeledInput name="text" control={control} placeholder={PLACEHOLDERS.TEXT?.text} color={color} multiline />
        );
    }
  };

  const TYPES: QRType[] = ['PHONE','LINK','EMAIL','TEXT','WHATSAPP','TELEGRAM','CONTACT','WIFI','SMS','GEO','BITCOIN'];

  return (
    <View style={{ flex: 1 }}>
      <KeyboardAwareScrollView
        enableOnAndroid
        extraScrollHeight={24}
        keyboardOpeningTime={0}
        contentContainerStyle={{ paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Шапка + режим + ID */}
        <Animated.View entering={FadeInDown.springify().damping(16)} style={styles.header}>
          <View style={[styles.badge, { backgroundColor: color }]}>
            <Ionicons name={mode === 'edit' ? 'pencil' : 'add'} size={16} color="#fff" />
            <Text style={styles.badgeText}>{mode === 'edit' ? 'Редактирование QR' : 'Создание QR'}</Text>
          </View>
          {mode === 'edit' && initialItem?.id && (
            <Text style={styles.shadowId}>id: {initialItem.id}</Text>
          )}
        </Animated.View>

        {/* Выбор типа (иконка+текст) */}
        <Animated.View entering={FadeInDown.delay(60)} style={styles.typesWrap}>
          {TYPES.map(t => {
            const disabled = DISABLED_TYPES.includes(t);
            return (
              <Pressable
                key={t}
                onPress={() => disabled ? Alert.alert('Скоро', `${RU_LABELS[t]} будет доступен позднее`) : onChangeType(t)}
                style={[styles.typeChip, { borderColor: TYPE_COLORS[t] },
                  currentType === t && { backgroundColor: TYPE_COLORS[t] + '22' },
                  disabled && { opacity: 0.45 }]
                }
              >
                <Ionicons name={TYPE_ICONS[t]} size={14} color={currentType === t ? TYPE_COLORS[t] : '#111'} style={{ marginRight: 3 }} />
              <TypeLabel color={currentType === t ? TYPE_COLORS[t] : '#111'}>
                {RU_LABELS[t] + '\u00A0'}{disabled ? ' · скоро' : ''}
              </TypeLabel>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Описание */}
        <Animated.View entering={FadeInDown.delay(120)} style={styles.block}>
          <LabeledInput name="description" control={control} placeholder="Наименование QR" color={color} />
        </Animated.View>

        {/* Слайдер полей */}
        <Animated.View key={slideKey.current} entering={SlideInLeft.springify().stiffness(120)} exiting={SlideOutRight.duration(180)} style={styles.block}>
          {renderFieldsByType(currentType)}
        </Animated.View>

        {/* Кнопка */}
        <Animated.View entering={FadeInDown.delay(240)}>
          <Pressable onPress={submit} disabled={submitting} style={[styles.submitBtn, { backgroundColor: color }, submitting && { opacity: 0.8 }]}>
            {!submitting ? (
              <>
                <Ionicons name={mode === 'edit' ? 'save-outline' : 'sparkles-outline'} size={18} color="#fff" />
                <Text style={styles.submitText}>{mode === 'edit' ? 'Сохранить' : 'Создать'}</Text>
              </>
            ) : (
              <View style={styles.loaderDotRow}>
                <View style={styles.loaderDot} /><View style={[styles.loaderDot, { opacity: 0.6 }]} /><View style={[styles.loaderDot, { opacity: 0.3 }]} />
              </View>
            )}
            {/* круглая волна */}
            <Animated.View pointerEvents="none" style={[styles.ripple, rippleStyle]} />
          </Pressable>
        </Animated.View>
      </KeyboardAwareScrollView>
    </View>
  );
}

function LabeledInput({ name, control, placeholder, color, error, keyboardType, secureTextEntry, autoCapitalize, multiline, numberOfLines, onNormalize }: any) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field: { onChange, onBlur, value } }) => (
        <View style={{ marginBottom: 14 }}>
          <Text style={[styles.label, { color }]}>{placeholder ? placeholder.split('\n')[0] : String(name)}</Text>
          <TextInput
            value={value ?? ''}
            onChangeText={(t) => onChange(onNormalize ? onNormalize(t) : t)}
            onBlur={onBlur}
            placeholder={placeholder}
            placeholderTextColor={color + '88'}
            style={[styles.input, { borderColor: color }]}
            keyboardType={keyboardType}
            secureTextEntry={secureTextEntry}
            autoCapitalize={autoCapitalize}
            multiline={multiline}
            numberOfLines={numberOfLines}
            inputMode={keyboardType === 'decimal-pad' ? 'decimal' : undefined}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      )}
    />
  );
}

function TypeLabel({
  children,
  color,
}: {
  children: React.ReactNode;
  color: string;
}) {
  return (
    <Text
      style={[styles.typeChipText, { color }]}
      ellipsizeMode="clip"
      allowFontScaling={false}
      {...(Platform.OS === 'android'
        ? { includeFontPadding: true as any, textBreakStrategy: 'simple' as any }
        : {})}
    >
      {children}
      {/* «Сторожевой» невидимый символ предотвращает срезание последнего глифа */}
      <Text style={{ opacity: 0 }}> </Text>
    </Text>
  );
}


const styles = StyleSheet.create({
  header: { marginBottom: 12 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeText: { color: '#fff', fontWeight: '600' },
  shadowId: { opacity: 0.35, fontSize: 10, marginTop: 6 },
  typesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0, // увеличена минимальная ширина
  },
  typeChipText: {
    color: '#111',
    fontSize: 12,
    flexShrink: 1,
  },
  block: { backgroundColor: '#fafafa', borderRadius: 16, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#eee' },
  label: { fontSize: 12, marginBottom: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.select({ ios: 12, android: 8, web: 10 }), fontSize: 16, backgroundColor: '#fff' },
  error: { color: '#EF4444', fontSize: 12, marginTop: 6 },
  submitBtn: { height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, overflow: 'hidden' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  loaderDotRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  loaderDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  ripple: { position: 'absolute', width: 500, height: 500, borderRadius: 250, backgroundColor: 'rgba(255,255,255,0.2)' },
});
