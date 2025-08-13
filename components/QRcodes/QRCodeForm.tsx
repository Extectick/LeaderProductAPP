import { useThemeColor } from '@/hooks/useThemeColor';
import { createQRCode, updateQRCode } from '@/utils/qrService';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  findNodeHandle,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
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
    qrData?: string | Record<string, string> | null;
  } | null;
  onSuccess?: () => void;
};

export const QRCodeForm: React.FC<Props> = ({ mode, initialData, onSuccess }) => {
  const textColor = useThemeColor({}, 'text');
  const bgColor = useThemeColor({}, 'background');
  const borderColor = useThemeColor({}, 'inputBorder');
  const primaryColor = '#4A90E2';

  const [qrType, setQrType] = useState('PHONE');
  const [description, setDescription] = useState('');
  const [qrData, setQrData] = useState<any>('');
  const [loading, setLoading] = useState<boolean>(mode === 'edit' && !initialData);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formDataByType, setFormDataByType] = useState<Record<string, any>>({});

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Реф для KeyboardAwareScrollView
  const scrollViewRef = useRef<KeyboardAwareScrollView | null>(null);

  // Рефы для инпутов (для навигации и скролла)
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (initialData) {
      setQrType(initialData.qrType);
      setDescription(initialData.description ?? '');
      let parsedData;
      try {
        parsedData =
          typeof initialData.qrData === 'string'
            ? JSON.parse(initialData.qrData)
            : initialData.qrData;
      } catch {
        parsedData = initialData.qrData;
      }

      setFormDataByType(prev => ({
        ...prev,
        [initialData.qrType]: parsedData,
      }));
      setQrData(parsedData || '');
      setLoading(false);
    }
  }, [initialData]);

  const onQrTypeChange = (newType: string) => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFormDataByType(prev => ({
        ...prev,
        [qrType]: qrData,
      }));

      setQrType(newType);
      setQrData(formDataByType[newType] || (newType === 'CONTACT' || newType === 'WIFI' ? {} : ''));
      setError('');

      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  };

  const validate = (): string => {
    let value = typeof qrData === 'string' ? qrData : qrData.value;
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
        if (!qrData.name || !qrData.phone) return 'Имя и телефон обязательны';
        break;
      case 'WIFI':
        if (!qrData.ssid || !qrData.password) return 'SSID и пароль обязательны';
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

    let payload = {
      qrType,
      description,
      qrData,
    };

    if (
      ['PHONE', 'EMAIL', 'URL', 'TEXT', 'WHATSAPP', 'TELEGRAM', 'WIFI'].includes(qrType)
    ) {
      payload.qrData = typeof qrData === 'string' ? qrData : qrData.value;
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
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось сохранить QR-код');
    } finally {
      setSubmitting(false);
    }
  };

  // Обработка маски для телефона и WhatsApp
  const handlePhoneChange = (masked: string, raw: string) => {
    if (raw.length <= 11) {
      setQrData(masked);
    }
  };

  // Обработка изменения телефона в CONTACT
  const handleContactPhoneChange = (masked: string, raw: string) => {
    if (raw.length <= 11) {
      setQrData((prev: any) => ({ ...prev, phone: masked }));
    }
  };

  // Обработка изменения telegram с добавлением @ по умолчанию
  const handleTelegramChange = (text: string) => {
    if (!text.startsWith('@')) {
      text = '@' + text;
    }
    setQrData(text);
  };

  // Фокус на следующий инпут при нажатии Enter
  const focusNextInput = (index: number) => {
    if (inputRefs.current[index + 1]) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Скролл к активному инпуту при фокусе (через KeyboardAwareScrollView)
  const scrollToInput = (index: number) => {
    if (!inputRefs.current[index] || !scrollViewRef.current) return;
    const input = inputRefs.current[index];
    const scrollView = scrollViewRef.current;

    const node = findNodeHandle(input);
    if (!node) return;

    const scrollViewNode = findNodeHandle(scrollView);
    if (scrollViewNode !== null) {
      UIManager.measureLayout(
        node,
        scrollViewNode,
        () => {},
        (x, y, width, height) => {
          scrollView.scrollToPosition(0, y - 20, true);
        }
      );
    }
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
          {fields.map((field, idx) => {
            if (field === 'phone') {
              return (
                <View key={field} style={[styles.inputWrapper, { borderColor }]}>
                  <MaskedTextInput
                    ref={el => {
                      inputRefs.current[idx] = el;
                    }}
                    mask="+7(999) 999-99-99"
                    onChangeText={handleContactPhoneChange}
                    value={qrData.phone || ''}
                    keyboardType="phone-pad"
                    placeholder={placeholders.phone}
                    style={[styles.input, { color: textColor }]}
                    placeholderTextColor={textColor + '99'}
                    maxLength={17}
                    autoCapitalize="none"
                    returnKeyType={idx === fields.length - 1 ? 'done' : 'next'}
                    onSubmitEditing={() => focusNextInput(idx)}
                    onFocus={() => scrollToInput(idx)}
                  />
                </View>
              );
            }
            return (
              <View key={field} style={[styles.inputWrapper, { borderColor }]}>
                <TextInput
                  ref={el => {
                    inputRefs.current[idx] = el;
                  }}
                  placeholder={placeholders[field]}
                  value={qrData[field] || ''}
                  onChangeText={text => setQrData((prev: any) => ({ ...prev, [field]: text }))}
                  style={[styles.input, { color: textColor }]}
                  placeholderTextColor={textColor + '99'}
                  keyboardType={field === 'email' ? 'email-address' : 'default'}
                  autoCapitalize="none"
                  returnKeyType={idx === fields.length - 1 ? 'done' : 'next'}
                  onSubmitEditing={() => focusNextInput(idx)}
                  onFocus={() => scrollToInput(idx)}
                />
              </View>
            );
          })}
        </>
      );
    }

    if (qrType === 'WIFI') {
      return (
        <>
          <View style={[styles.inputWrapper, { borderColor }]}>
            <TextInput
              placeholder="SSID"
              value={qrData.ssid || ''}
              onChangeText={text => setQrData((prev: any) => ({ ...prev, ssid: text }))}
              style={[styles.input, { color: textColor }]}
              placeholderTextColor={textColor + '99'}
              autoCapitalize="none"
              onFocus={() => scrollToInput(0)}
            />
          </View>
          <View style={[styles.inputWrapper, { borderColor }]}>
            <TextInput
              placeholder="Пароль"
              value={qrData.password || ''}
              onChangeText={text => setQrData((prev: any) => ({ ...prev, password: text }))}
              style={[styles.input, { color: textColor }]}
              placeholderTextColor={textColor + '99'}
              secureTextEntry
              autoCapitalize="none"
              onFocus={() => scrollToInput(1)}
            />
          </View>
        </>
      );
    }

    if (qrType === 'PHONE' || qrType === 'WHATSAPP') {
      return (
        <View style={[styles.inputWrapper, { borderColor }]}>
          <MaskedTextInput
            mask="+7(999) 999-99-99"
            onChangeText={handlePhoneChange}
            value={qrData}
            keyboardType="phone-pad"
            placeholder={qrTypes.find(t => t.key === qrType)?.placeholder || 'Введите номер'}
            style={[styles.input, { color: textColor }]}
            placeholderTextColor={textColor + '99'}
            maxLength={17}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => {}}
            onFocus={() => scrollToInput(0)}
            ref={el => {
              inputRefs.current[0] = el;
            }}
          />
        </View>
      );
    }

    if (qrType === 'TELEGRAM') {
      return (
        <View style={[styles.inputWrapper, { borderColor }]}>
          <TextInput
            placeholder={qrTypes.find(t => t.key === qrType)?.placeholder || '@username'}
            value={typeof qrData === 'string' ? qrData : ''}
            onChangeText={handleTelegramChange}
            style={[styles.input, { color: textColor }]}
            placeholderTextColor={textColor + '99'}
            autoCapitalize="none"
            returnKeyType="done"
            onSubmitEditing={() => {}}
            onFocus={() => scrollToInput(0)}
            ref={el => {
              inputRefs.current[0] = el;
            }}
          />
        </View>
      );
    }

    return (
      <View style={[styles.inputWrapper, { borderColor }]}>
        <TextInput
          placeholder={qrTypes.find(t => t.key === qrType)?.placeholder || 'Введите данные'}
          value={typeof qrData === 'string' ? qrData : qrData.value || ''}
          onChangeText={text => setQrData(typeof qrData === 'string' ? text : { value: text })}
          style={[styles.input, { color: textColor }]}
          placeholderTextColor={textColor + '99'}
          autoCapitalize="none"
          returnKeyType="done"
          onSubmitEditing={() => {}}
          onFocus={() => scrollToInput(0)}
          ref={el => {
            inputRefs.current[0] = el;
          }}
        />
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: bgColor }]}>
        <ActivityIndicator size="large" color={primaryColor} />
        <Text style={[styles.loadingText, { color: textColor }]}>
          {mode === 'edit' ? 'Загрузка данных...' : 'Загрузка формы...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.05)' }}>
      <KeyboardAwareScrollView
        ref={scrollViewRef}
        enableOnAndroid={true}
        keyboardShouldPersistTaps="handled"
        extraScrollHeight={Platform.OS === 'ios' ? 20 : 120}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16 }}
      >
        <Text style={[styles.label, { color: textColor }]}>Тип QR-кода</Text>
        <View style={styles.typeSelectorWrapper}>
          {qrTypes.map(({ key, label, color }) => {
            const isSelected = qrType === key;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.typeButton,
                  {
                    backgroundColor: isSelected ? color : '#ddd',
                    borderColor: isSelected ? '#666' : '#ccc',
                  },
                ]}
                onPress={() => onQrTypeChange(key)}
                activeOpacity={0.7}
              >
                <Animated.Text
                  style={[
                    styles.typeButtonText,
                    { color: isSelected ? '#222' : '#666' },
                    {
                      opacity: fadeAnim,
                      transform: [
                        {
                          scale: fadeAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [0.95, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  {label}
                </Animated.Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.label, { color: textColor }]}>Описание</Text>
        <View style={[styles.inputWrapper, { borderColor }]}>
          <TextInput
            placeholder="Описание"
            value={description}
            onChangeText={setDescription}
            style={[styles.input, { color: textColor }]}
            placeholderTextColor={textColor + '99'}
            onFocus={() => scrollToInput(1000)} // Можно убрать или оставить — не критично
          />
        </View>

        <Text style={[styles.label, { color: textColor }]}>Данные QR-кода</Text>
        <Animated.View style={{ opacity: fadeAnim }}>{renderFields()}</Animated.View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.submitButton, { backgroundColor: primaryColor }]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{mode === 'edit' ? 'Обновить QR' : 'Создать QR'}</Text>
          )}
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '600',
  },
  typeSelectorWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    justifyContent: 'space-between',
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderWidth: 1,
    minWidth: 100,
    alignItems: 'center',
  },
  typeButtonText: {
    fontWeight: '600',
  },
  inputWrapper: {
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 15,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  input: {
    fontSize: 16,
    padding: 0,
    margin: 0,
  },
  errorText: {
    color: 'red',
    fontWeight: '600',
    marginBottom: 15,
    textAlign: 'center',
  },
  submitButton: {
    borderRadius: 10,
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 40,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
  },
});
