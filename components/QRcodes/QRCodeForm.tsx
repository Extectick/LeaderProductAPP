import { useThemeColor } from '@/hooks/useThemeColor';
import { createQRCode, updateQRCode } from '@/utils/qrService';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { MaskedTextInput } from 'react-native-mask-text';

// Массив типов с русскими названиями, цветами и placeholder'ами
const qrTypes = [
  { key: 'PHONE', label: 'Телефон', color: '#B0C4DE', placeholder: '+7 (999) 999-99-99' },
  { key: 'EMAIL', label: 'Email', color: '#D8BFD8', placeholder: 'example@mail.com' },
  { key: 'URL', label: 'Ссылка', color: '#ADD8E6', placeholder: 'https://example.com' },
  { key: 'TEXT', label: 'Текст', color: '#F5DEB3', placeholder: 'Введите текст' },
  { key: 'CONTACT', label: 'Контакт', color: '#E6E6FA', placeholder: '' },
  { key: 'WIFI', label: 'Wi-Fi', color: '#FFE4B5', placeholder: '' },
  { key: 'WHATSAPP', label: 'WhatsApp', color: '#98FB98', placeholder: '+7 (999) 999-99-99' },
  { key: 'TELEGRAM', label: 'Telegram', color: '#87CEFA', placeholder: '@username' },
];

type Props = {
  mode: 'create' | 'edit';
  initialData?: {
    id: string;
    qrType: string;
    description?: string | null;
    qrData?: any | null;
  } | null;
  onSuccess?: () => void;
};

export const QRCodeForm: React.FC<Props> = ({ mode, initialData, onSuccess }) => {
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'inputBorder');
  const primaryColor = '#4A90E2';

  const { width: windowWidth } = useWindowDimensions();

  const [qrType, setQrType] = useState<string>('PHONE');
  const [description, setDescription] = useState<string>('');
  const [qrData, setQrData] = useState<any>('');
  const [loading, setLoading] = useState<boolean>(mode === 'edit' && !initialData);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [formDataByType, setFormDataByType] = useState<Record<string, any>>({});

  // анимируем только поля (кнопка — отдельно)
  const fieldsFade = useRef(new Animated.Value(1)).current;

  const scrollViewRef = useRef<KeyboardAwareScrollView | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (initialData) {
      setQrType(initialData.qrType);
      setDescription(initialData.description ?? '');
      let parsedData;
      try {
        parsedData = typeof initialData.qrData === 'string' ? JSON.parse(initialData.qrData) : initialData.qrData;
      } catch {
        parsedData = initialData.qrData;
      }
      setFormDataByType(prev => ({ ...prev, [initialData.qrType]: parsedData }));
      setQrData(parsedData || '');
      setLoading(false);
    }
  }, [initialData]);

  const onQrTypeChange = (newType: string) => {
    Animated.sequence([
      Animated.timing(fieldsFade, {
        toValue: 0,
        duration: 160,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFormDataByType(prev => ({ ...prev, [qrType]: qrData }));
      setQrType(newType);
      setQrData(formDataByType[newType] || (newType === 'CONTACT' || newType === 'WIFI' ? {} : ''));
      setError('');
      Animated.timing(fieldsFade, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  };

  const validate = (): string => {
    let value = typeof qrData === 'string' ? qrData : qrData?.value;
    switch (qrType) {
      case 'PHONE':
      case 'WHATSAPP':
        if (!/^\+7\(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(value) && !/^\+7\d{10}$/.test(value))
          return 'Введите номер в формате +7(999) 999-99-99 или +79999999999';
        break;
      case 'EMAIL':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Некорректный email';
        break;
      case 'URL':
        if (!/^https?:\/\/.+/.test(value)) return 'Некорректный URL';
        break;
      case 'TEXT':
        if (!value || value.length < 1) return 'Текст не может быть пустым';
        break;
      case 'CONTACT':
        if (!qrData?.name || !qrData?.phone) return 'Имя и телефон обязательны';
        break;
      case 'WIFI':
        if (!qrData?.ssid || !qrData?.password) return 'SSID и пароль обязательны';
        break;
      case 'TELEGRAM':
        if (!/^@?[a-zA-Z0-9_]{5,}$/.test(value)) return 'Некорректный Telegram username';
        break;
    }
    return '';
  };

  const handleSubmit = async () => {
    setError('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    let payload: any = { qrType, description, qrData };
    if (['PHONE', 'EMAIL', 'URL', 'TEXT', 'WHATSAPP', 'TELEGRAM', 'WIFI'].includes(qrType)) {
      payload.qrData = typeof qrData === 'string' ? qrData : qrData?.value;
    }
    try {
      if (mode === 'edit' && initialData?.id) {
        await updateQRCode(initialData.id, payload.qrType, payload.qrData, payload.description);
        Alert.alert('Успешно', 'QR-код обновлён');
      } else {
        await createQRCode(payload.qrType, payload.qrData, payload.description);
        Alert.alert('Успешно', 'QR-код создан');
      }
      onSuccess?.();
    } catch {
      Alert.alert('Ошибка', 'Не удалось сохранить QR-код');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePhoneChange = (masked: string, raw: string) => {
    if (raw.length <= 11) setQrData(masked);
  };
  const handleContactPhoneChange = (masked: string, raw: string) => {
    if (raw.length <= 11) setQrData((prev: any) => ({ ...prev, phone: masked }));
  };
  const handleTelegramChange = (text: string) => {
    if (!text.startsWith('@')) text = '@' + text;
    setQrData(text);
  };

  const focusNextInput = (index: number) => {
    inputRefs.current[index + 1]?.focus?.();
  };

  const scrollToInput = (index: number) => {
    // KeyboardAwareScrollView сам смещает, подталкиваем позицию слегка
    setTimeout(() => scrollViewRef.current?.scrollToPosition(0, Math.max(0, index * 56 - 24), true), 80);
  };

  const renderFields = () => {
    if (qrType === 'CONTACT') {
      const placeholders: Record<string, string> = {
        name: 'Имя',
        phone: 'Телефон',
        email: 'Email',
        url: 'Ссылка',
        company: 'Компания',
        note: 'Примечание',
      };
      const fields = ['name', 'phone', 'email', 'url', 'company', 'note'];
      return (
        <>
          {fields.map((field, idx) =>
            field === 'phone' ? (
              <MaskedTextInput
                key={field}
                ref={el => {
                  // @ts-ignore lib types
                  inputRefs.current[idx] = el as any;
                }}
                mask="+7(999) 999-99-99"
                onChangeText={handleContactPhoneChange}
                value={qrData?.phone || ''}
                keyboardType="phone-pad"
                placeholder={placeholders.phone}
                style={[styles.input, { color: textColor, borderColor }]}
                placeholderTextColor={textColor + '99'}
                maxLength={17}
                autoCapitalize="none"
                returnKeyType={idx === fields.length - 1 ? 'done' : 'next'}
                onSubmitEditing={() => focusNextInput(idx)}
                onFocus={() => scrollToInput(idx)}
              />
            ) : (
              <TextInput
                key={field}
                ref={el => {
                  inputRefs.current[idx] = el;
                }}
                placeholder={placeholders[field]}
                value={qrData?.[field] || ''}
                onChangeText={txt => setQrData((prev: any) => ({ ...prev, [field]: txt }))}
                style={[styles.input, { color: textColor, borderColor }]}
                placeholderTextColor={textColor + '99'}
                keyboardType={field === 'email' ? 'email-address' : 'default'}
                autoCapitalize="none"
                returnKeyType={idx === fields.length - 1 ? 'done' : 'next'}
                onSubmitEditing={() => focusNextInput(idx)}
                onFocus={() => scrollToInput(idx)}
              />
            )
          )}
        </>
      );
    }

    if (qrType === 'WIFI') {
      return (
        <>
          <TextInput
            ref={el => {
              inputRefs.current[0] = el;
            }}
            placeholder="SSID"
            value={qrData?.ssid || ''}
            onChangeText={txt => setQrData((prev: any) => ({ ...prev, ssid: txt }))}
            style={[styles.input, { color: textColor, borderColor }]}
            placeholderTextColor={textColor + '99'}
            autoCapitalize="none"
            onFocus={() => scrollToInput(0)}
          />
          <TextInput
            ref={el => {
              inputRefs.current[1] = el;
            }}
            placeholder="Пароль"
            value={qrData?.password || ''}
            onChangeText={txt => setQrData((prev: any) => ({ ...prev, password: txt }))}
            style={[styles.input, { color: textColor, borderColor }]}
            placeholderTextColor={textColor + '99'}
            secureTextEntry
            autoCapitalize="none"
            onFocus={() => scrollToInput(1)}
          />
        </>
      );
    }

    if (qrType === 'PHONE' || qrType === 'WHATSAPP') {
      return (
        <MaskedTextInput
          ref={el => {
            // @ts-ignore
            inputRefs.current[0] = el as any;
          }}
          mask="+7(999) 999-99-99"
          onChangeText={handlePhoneChange}
          value={qrData || ''}
          keyboardType="phone-pad"
          placeholder={qrTypes.find(t => t.key === qrType)?.placeholder || 'Введите номер'}
          style={[styles.input, { color: textColor, borderColor }]}
          placeholderTextColor={textColor + '99'}
          maxLength={17}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {}}
          onFocus={() => scrollToInput(0)}
        />
      );
    }

    if (qrType === 'TELEGRAM') {
      return (
        <TextInput
          ref={el => {
            inputRefs.current[0] = el;
          }}
          placeholder={qrTypes.find(t => t.key === qrType)?.placeholder || '@username'}
          value={typeof qrData === 'string' ? qrData : ''}
          onChangeText={handleTelegramChange}
          style={[styles.input, { color: textColor, borderColor }]}
          placeholderTextColor={textColor + '99'}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {}}
          onFocus={() => scrollToInput(0)}
        />
      );
    }

    return (
      <TextInput
        ref={el => {
          inputRefs.current[0] = el;
        }}
        placeholder={qrTypes.find(t => t.key === qrType)?.placeholder || 'Введите данные'}
        value={typeof qrData === 'string' ? qrData : qrData?.value || ''}
        onChangeText={txt => setQrData(typeof qrData === 'string' ? txt : { value: txt })}
        style={[styles.input, { color: textColor, borderColor }]}
        placeholderTextColor={textColor + '99'}
        autoCapitalize="none"
        returnKeyType="done"
        onSubmitEditing={() => {}}
        onFocus={() => scrollToInput(0)}
      />
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        {/* Статус сверху */}
        <View style={[styles.modeBadge, { borderColor, backgroundColor: primaryColor + '1A' }]}>
          <View style={[styles.modeDot, { backgroundColor: mode === 'edit' ? '#E67E22' : '#2ECC71' }]} />
          <Text style={[styles.modeText, { color: textColor }]}>
            {mode === 'edit' ? 'Редактирование QR-кода' : 'Создание QR-кода'}
          </Text>
        </View>

        {/* Короткий заголовок */}
        <Text style={[styles.title, { color: textColor }]}>Параметры QR-кода</Text>

        {/* Описание */}
        <TextInput
          placeholder="Описание (необязательно)"
          value={description}
          onChangeText={setDescription}
          style={[styles.input, { color: textColor, borderColor }]}
          placeholderTextColor={textColor + '99'}
        />

        {/* Выбор типа QR (компактные чипсы, не растягиваются по высоте) */}
        <View style={styles.typeRow}>
          <KeyboardAwareScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.typeSelector}
            enableOnAndroid
            extraScrollHeight={0}
          >
            {qrTypes.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: qrType === t.key ? primaryColor : t.color,
                    borderColor: qrType === t.key ? primaryColor : borderColor,
                  },
                ]}
                onPress={() => onQrTypeChange(t.key)}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.typeButtonLabel,
                    { color: qrType === t.key ? '#fff' : textColor },
                  ]}
                >
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </KeyboardAwareScrollView>
        </View>

        {/* Поля (только они исчезают/появляются) */}
        <Animated.View style={{ opacity: fieldsFade, flexGrow: 1 }}>
          <KeyboardAwareScrollView
            ref={scrollViewRef}
            enableAutomaticScroll
            extraScrollHeight={96}
            enableOnAndroid
            keyboardOpeningTime={100}
            contentContainerStyle={{ paddingBottom: 12 }}
          >
            {renderFields()}
          </KeyboardAwareScrollView>

          {error ? <Text style={[styles.error, { color: '#E74C3C' }]}>{error}</Text> : null}
        </Animated.View>

        {/* Кнопка — вне анимированного блока */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            { backgroundColor: submitting ? borderColor : primaryColor },
          ]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonLabel}>
              {mode === 'edit' ? 'Сохранить' : 'Создать'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 12,
    paddingHorizontal: 16,
    gap: 8,
  },

  // Статус
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 4,
  },
  modeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  modeText: {
    fontSize: 13,
    fontWeight: '600',
  },

  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
  },

  // Ряд чипсов
  typeRow: {
    height: 44,               // фиксированная компактная высота ряда
    marginBottom: 6,
  },
  typeSelector: {
    paddingHorizontal: 2,
    alignItems: 'center',
  },
  typeButton: {
    height: 32,               // компактная высота чипса
    paddingHorizontal: 12,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    justifyContent: 'center',
  },
  typeButtonLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    fontSize: 14,
  },
  error: {
    marginTop: 6,
    marginBottom: 2,
  },
  submitButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
