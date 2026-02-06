import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

import InfoModal from '@/components/InfoModal';
import {
  cleanupUpdates,
  createUpdate,
  deleteUpdate,
  getUpdatesList,
  UpdateItem,
  updateUpdate,
  uploadUpdateWithProgress,
} from '@/utils/updateAdminService';

import { AdminStyles } from '@/components/admin/adminStyles';
import { useTabBarSpacerHeight } from '@/components/Navigation/TabBarSpacer';

type UpdatesTabProps = {
  active: boolean;
  styles: AdminStyles;
  colors: any;
  isWide: boolean;
};

const HELP_TEXT = {
  platform: {
    title: 'Платформа',
    message:
      'Выберите платформу для обновления. Для Android можно загрузить APK, для iOS используется ссылка на App Store/TestFlight.',
  },
  channel: {
    title: 'Канал',
    message:
      'Канал обновлений. prod — основная ветка, dev — тестовая. Клиент берёт канал из EXPO_PUBLIC_UPDATE_CHANNEL.',
  },
  versionCode: {
    title: 'Код версии (versionCode)',
    message:
      'Целочисленный код сборки для сравнения версий (Android versionCode / iOS buildNumber). Должен быть больше текущего.',
  },
  versionName: {
    title: 'Имя версии (versionName)',
    message: 'Человекочитаемая версия, например 1.2.3.',
  },
  minSupportedVersionCode: {
    title: 'Минимальная поддерживаемая версия',
    message:
      'Если версия пользователя ниже этого значения, обновление считается обязательным.',
  },
  rolloutPercent: {
    title: 'Процент раскатки',
    message:
      'Сколько устройств получат обновление. 100 — всем, 10 — примерно 10% (по deviceId).',
  },
  mandatory: {
    title: 'Обязательное обновление',
    message:
      'Если включено, пользователь не сможет продолжить работу без обновления.',
  },
  active: {
    title: 'Активное обновление',
    message:
      'Только активные записи участвуют в проверке обновлений. Неактивные игнорируются.',
  },
  storeUrl: {
    title: 'Store URL',
    message:
      'Ссылка на App Store/TestFlight или Google Play. Для iOS обязательна, если нет APK.',
  },
  releaseNotes: {
    title: 'Release notes',
    message: 'Короткое описание изменений, показывается пользователю.',
  },
  apk: {
    title: 'APK файл',
    message: 'Файл APK для Android. Для iOS загрузка APK не используется.',
  },
  cleanupKeepLatest: {
    title: 'Оставить последних',
    message:
      'Сколько последних версий оставить (по платформе и каналу). Остальные будут удалены.',
  },
  cleanupPurge: {
    title: 'Удалять APK',
    message:
      'Если включено, файл APK будет удалён из хранилища вместе с записью.',
  },
};

export default function UpdatesTab({ active, styles, colors, isWide }: UpdatesTabProps) {
  const tabBarSpacer = useTabBarSpacerHeight();
  const androidVersionCode = Number(Constants.expoConfig?.android?.versionCode ?? 0);
  const iosVersionCode = Number(Constants.expoConfig?.ios?.buildNumber ?? 0);
  const appVersionName = Constants.expoConfig?.version ?? '';

  const getCurrentVersionCode = useCallback(
    (platform: 'android' | 'ios') => (platform === 'ios' ? iosVersionCode : androidVersionCode),
    [androidVersionCode, iosVersionCode]
  );

  const buildDefaultUpdateForm = useCallback(
    (platform: 'android' | 'ios') => {
      const currentCode = getCurrentVersionCode(platform);
      const nextCode = currentCode ? currentCode + 1 : 0;
      return {
        platform,
        channel: 'prod',
        versionCode: nextCode ? String(nextCode) : '',
        versionName: '',
        minSupportedVersionCode: currentCode ? String(currentCode) : '',
        rolloutPercent: '100',
        isMandatory: false,
        isActive: true,
        releaseNotes: '',
        storeUrl: '',
      };
    },
    [getCurrentVersionCode]
  );

  const [updates, setUpdates] = useState<UpdateItem[]>([]);
  const [updatesLoading, setUpdatesLoading] = useState(false);
  const [updateSaving, setUpdateSaving] = useState(false);
  const [selectedUpdateId, setSelectedUpdateId] = useState<number | null>(null);
  const [updateFile, setUpdateFile] = useState<{
    uri?: string;
    name: string;
    size?: number;
    mimeType?: string;
    file?: File;
  } | null>(null);
  const [updateForm, setUpdateForm] = useState(() => buildDefaultUpdateForm('android'));
  const [versionCodeTouched, setVersionCodeTouched] = useState(false);
  const [minSupportedTouched, setMinSupportedTouched] = useState(false);
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [uploadState, setUploadState] = useState<{
    stage: 'idle' | 'preparing' | 'uploading' | 'saving' | 'success' | 'error';
    progress: number;
    message?: string;
  } | null>(null);
  const [cleanupKeepLatest, setCleanupKeepLatest] = useState('1');
  const [cleanupPurgeFile, setCleanupPurgeFile] = useState(true);

  const currentVersionCode = getCurrentVersionCode(updateForm.platform);
  const currentVersionCodeLabel = currentVersionCode ? String(currentVersionCode) : 'неизвестно';
  const currentVersionNameLabel = appVersionName || 'неизвестно';
  const isAndroid = updateForm.platform === 'android';
  const actionLabel = updateSaving
    ? uploadState?.stage === 'uploading'
      ? `Загрузка ${uploadState.progress}%`
      : 'Сохранение...'
    : updateFile
      ? 'Загрузить APK'
      : 'Сохранить';

  const resetUpdateForm = useCallback((keepStatus = false) => {
    setSelectedUpdateId(null);
    setUpdateFile(null);
    setVersionCodeTouched(false);
    setMinSupportedTouched(false);
    setUpdateForm(buildDefaultUpdateForm('android'));
    if (!keepStatus) setUploadState(null);
  }, [buildDefaultUpdateForm]);

  const openInfo = useCallback((title: string, message: string) => {
    setInfoModal({ title, message });
  }, []);

  const closeInfo = useCallback(() => setInfoModal(null), []);

  const notify = useCallback((type: 'success' | 'error' | 'info', text: string) => {
    setNotice({ type, text });
    if (Platform.OS !== 'web') {
      const title = type === 'error' ? 'Ошибка' : type === 'success' ? 'Успех' : 'Инфо';
      Alert.alert(title, text);
    }
  }, []);

  const handlePlatformChange = useCallback(
    (platform: 'android' | 'ios') => {
      setUpdateFile(null);
      setUpdateForm((prev) => {
        if (prev.platform === platform) return prev;
        const next = { ...prev, platform };
        if (!selectedUpdateId) {
          const defaults = buildDefaultUpdateForm(platform);
          if (!versionCodeTouched || !prev.versionCode) {
            next.versionCode = defaults.versionCode;
          }
          if (!minSupportedTouched || !prev.minSupportedVersionCode) {
            next.minSupportedVersionCode = defaults.minSupportedVersionCode;
          }
        }
        return next;
      });
      if (!selectedUpdateId && !versionCodeTouched) setVersionCodeTouched(false);
      if (!selectedUpdateId && !minSupportedTouched) setMinSupportedTouched(false);
    },
    [
      buildDefaultUpdateForm,
      minSupportedTouched,
      selectedUpdateId,
      versionCodeTouched,
    ]
  );

  const loadUpdates = useCallback(async () => {
    setUpdatesLoading(true);
    try {
      const data = await getUpdatesList({ limit: 100 });
      setUpdates(data.data);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось загрузить обновления');
    } finally {
      setUpdatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void loadUpdates();
  }, [active, loadUpdates]);

  const handlePickApk = useCallback(async () => {
    if (!isAndroid) {
      notify('info', 'Для iOS загрузка APK недоступна. Используйте ссылку на Store URL.');
      return;
    }
    if (selectedUpdateId) {
      notify('info', 'Чтобы загрузить новый APK, сбросьте форму и создайте новую запись.');
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.android.package-archive'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      const webFile = (asset as { file?: File }).file;
    setUpdateFile({
      uri: asset.uri,
      name: asset.name || 'app.apk',
      size: asset.size,
      mimeType: asset.mimeType || 'application/vnd.android.package-archive',
      file: webFile,
    });
    setUploadState({
      stage: 'idle',
      progress: 0,
      message: `Файл выбран: ${asset.name || 'app.apk'}`,
    });
  } catch (e: any) {
      notify('error', e?.message || 'Не удалось выбрать файл');
    }
  }, [isAndroid, notify, selectedUpdateId]);

  const handleSubmitUpdate = useCallback(async () => {
    const versionCode = Number(updateForm.versionCode);
    const minSupportedVersionCode = Number(updateForm.minSupportedVersionCode);
    const rolloutPercent = Number(updateForm.rolloutPercent || '100');

    if (!updateForm.versionName.trim() || !Number.isFinite(versionCode)) {
      notify('error', 'Введите корректные versionCode и versionName');
      return;
    }
    if (!Number.isFinite(minSupportedVersionCode)) {
      notify('error', 'Введите корректный minSupportedVersionCode');
      return;
    }
    if (minSupportedVersionCode > versionCode) {
      notify('error', 'minSupportedVersionCode не должен быть больше versionCode');
      return;
    }
    if (!updateFile && !selectedUpdateId && !updateForm.storeUrl.trim()) {
      notify('error', 'Нужно указать Store URL или загрузить APK');
      return;
    }

    setUpdateSaving(true);
    try {
      if (updateFile) {
        setUploadState({ stage: 'preparing', progress: 0, message: 'Подготовка файла...' });
        const form = new FormData();
        if (updateFile.file) {
          form.append('apk', updateFile.file, updateFile.name);
        } else if (updateFile.uri) {
          form.append('apk', {
            uri: updateFile.uri,
            name: updateFile.name,
            type: updateFile.mimeType || 'application/vnd.android.package-archive',
          } as any);
        } else {
          notify('error', 'Не удалось получить файл для загрузки');
          return;
        }
        form.append('platform', updateForm.platform);
        form.append('channel', updateForm.channel || 'prod');
        form.append('versionCode', String(versionCode));
        form.append('versionName', updateForm.versionName.trim());
        form.append('minSupportedVersionCode', String(minSupportedVersionCode));
        form.append('isMandatory', String(updateForm.isMandatory));
        form.append('rolloutPercent', String(rolloutPercent));
        form.append('isActive', String(updateForm.isActive));
        if (updateForm.releaseNotes.trim()) form.append('releaseNotes', updateForm.releaseNotes.trim());
        if (updateForm.storeUrl.trim()) form.append('storeUrl', updateForm.storeUrl.trim());

        setUploadState({ stage: 'uploading', progress: 0, message: 'Загрузка APK...' });
        await uploadUpdateWithProgress(form, (percent) => {
          setUploadState({ stage: 'uploading', progress: percent, message: 'Загрузка APK...' });
        });
        setUploadState({ stage: 'success', progress: 100, message: 'APK загружен и сохранён' });
      } else if (selectedUpdateId) {
        setUploadState({ stage: 'saving', progress: 0, message: 'Сохранение изменений...' });
        await updateUpdate(selectedUpdateId, {
          platform: updateForm.platform,
          channel: updateForm.channel || 'prod',
          versionCode,
          versionName: updateForm.versionName.trim(),
          minSupportedVersionCode,
          isMandatory: updateForm.isMandatory,
          rolloutPercent,
          isActive: updateForm.isActive,
          releaseNotes: updateForm.releaseNotes.trim() || null,
          storeUrl: updateForm.storeUrl.trim() || null,
        });
        setUploadState({ stage: 'success', progress: 100, message: 'Обновление сохранено' });
      } else {
        setUploadState({ stage: 'saving', progress: 0, message: 'Создание релиза...' });
        await createUpdate({
          platform: updateForm.platform,
          channel: updateForm.channel || 'prod',
          versionCode,
          versionName: updateForm.versionName.trim(),
          minSupportedVersionCode,
          isMandatory: updateForm.isMandatory,
          rolloutPercent,
          isActive: updateForm.isActive,
          releaseNotes: updateForm.releaseNotes.trim() || null,
          storeUrl: updateForm.storeUrl.trim() || null,
        });
        setUploadState({ stage: 'success', progress: 100, message: 'Релиз создан' });
      }
      await loadUpdates();
      resetUpdateForm(true);
      notify('success', 'Обновление сохранено');
    } catch (e: any) {
      console.warn('[updates] submit failed', e);
      setUploadState({
        stage: 'error',
        progress: 0,
        message: e?.message || 'Не удалось сохранить обновление',
      });
      notify('error', e?.message || 'Не удалось сохранить обновление');
    } finally {
      setUpdateSaving(false);
    }
  }, [loadUpdates, notify, resetUpdateForm, selectedUpdateId, updateFile, updateForm]);

  const handleEditUpdate = useCallback((item: UpdateItem) => {
    setSelectedUpdateId(item.id);
    setUpdateFile(null);
    setVersionCodeTouched(false);
    setMinSupportedTouched(false);
    setUpdateForm({
      platform: item.platform === 'IOS' ? 'ios' : 'android',
      channel: item.channel?.toLowerCase() === 'dev' ? 'dev' : 'prod',
      versionCode: String(item.versionCode),
      versionName: item.versionName || '',
      minSupportedVersionCode: String(item.minSupportedVersionCode),
      rolloutPercent: String(item.rolloutPercent ?? 100),
      isMandatory: Boolean(item.isMandatory),
      isActive: Boolean(item.isActive),
      releaseNotes: item.releaseNotes || '',
      storeUrl: item.storeUrl || '',
    });
  }, []);

  const handleDeleteUpdate = useCallback(
    async (item: UpdateItem) => {
      if (Platform.OS === 'web') {
        const confirmDelete =
          typeof window !== 'undefined'
            ? window.confirm('Удалить обновление?')
            : true;
        if (!confirmDelete) return;
        try {
          await deleteUpdate(item.id, true);
          await loadUpdates();
          notify('success', `Обновление #${item.id} удалено`);
        } catch (e: any) {
          notify('error', e?.message || 'Не удалось удалить');
        }
        return;
      }
      Alert.alert('Удалить обновление?', 'Запись будет удалена', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUpdate(item.id, true);
              await loadUpdates();
              notify('success', `Обновление #${item.id} удалено`);
            } catch (e: any) {
              notify('error', e?.message || 'Не удалось удалить');
            }
          },
        },
      ]);
    },
    [loadUpdates, notify]
  );

  const handleToggleActive = useCallback(
    async (item: UpdateItem) => {
      try {
        await updateUpdate(item.id, { isActive: !item.isActive });
        await loadUpdates();
        notify('success', `Обновление #${item.id} обновлено`);
      } catch (e: any) {
        notify('error', e?.message || 'Не удалось обновить запись');
      }
    },
    [loadUpdates, notify]
  );

  const handleCleanup = useCallback(async () => {
    const keepLatest = Math.max(parseInt(cleanupKeepLatest || '1', 10) || 1, 1);
    try {
      const result = await cleanupUpdates({
        keepLatest,
        purgeFile: cleanupPurgeFile,
      });
      notify('success', `Удалено: ${result.deletedCount}`);
      await loadUpdates();
    } catch (e: any) {
      notify('error', e?.message || 'Не удалось выполнить очистку');
    }
  }, [cleanupKeepLatest, cleanupPurgeFile, loadUpdates, notify]);

  const renderUpdateMeta = useCallback(
    (item: UpdateItem) => {
      const tags = [
        item.platform === 'IOS' ? 'iOS' : 'Android',
        item.channel?.toLowerCase() === 'dev' ? 'dev' : 'prod',
        item.isMandatory ? 'обязательное' : 'необязательное',
        item.isActive ? 'активное' : 'неактивное',
        item.apkKey ? 'apk' : item.storeUrl ? 'store' : 'без ссылки',
      ];
      return (
        <View style={styles.tagRow}>
          {tags.map((tag) => (
            <View key={`${item.id}-${tag}`} style={styles.tagPill}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      );
    },
    [styles]
  );

  if (!active) {
    return <View style={{ display: 'none' }} />;
  }

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: tabBarSpacer + 12 }}>
        {notice ? (
          <View
            style={[
              styles.notice,
              notice.type === 'success' && styles.noticeSuccess,
              notice.type === 'error' && styles.noticeError,
              notice.type === 'info' && styles.noticeInfo,
            ]}
          >
            <Ionicons
              name={
                notice.type === 'success'
                  ? 'checkmark-circle-outline'
                  : notice.type === 'error'
                    ? 'alert-circle-outline'
                    : 'information-circle-outline'
              }
              size={18}
              color={
                notice.type === 'success'
                  ? '#166534'
                  : notice.type === 'error'
                    ? '#991B1B'
                    : colors.text
              }
            />
            <Text
              style={[
                styles.noticeText,
                notice.type === 'success' && styles.noticeTextSuccess,
                notice.type === 'error' && styles.noticeTextError,
              ]}
            >
              {notice.text}
            </Text>
            <Pressable onPress={() => setNotice(null)} style={styles.noticeClose}>
              <Ionicons name="close" size={16} color={colors.text} />
            </Pressable>
          </View>
        ) : null}
        {uploadState ? (
          <View
            style={[
              styles.progressCard,
              uploadState.stage === 'success' && styles.progressCardSuccess,
              uploadState.stage === 'error' && styles.progressCardError,
            ]}
          >
            <View style={styles.progressHeader}>
              <View style={styles.progressTitleRow}>
                <Ionicons
                  name={
                    uploadState.stage === 'success'
                      ? 'checkmark-circle-outline'
                      : uploadState.stage === 'error'
                        ? 'alert-circle-outline'
                        : 'cloud-upload-outline'
                  }
                  size={18}
                  color={
                    uploadState.stage === 'success'
                      ? '#166534'
                      : uploadState.stage === 'error'
                        ? '#991B1B'
                        : colors.text
                  }
                />
                <Text style={styles.progressTitle}>Загрузка APK</Text>
              </View>
              <View style={styles.progressHeaderRight}>
                {uploadState.stage === 'uploading' ? (
                  <Text style={styles.progressPercent}>{uploadState.progress}%</Text>
                ) : null}
                <Pressable onPress={() => setUploadState(null)} style={styles.noticeClose}>
                  <Ionicons name="close" size={16} color={colors.text} />
                </Pressable>
              </View>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${uploadState.progress}%` }]} />
            </View>
            {uploadState.message ? (
              <Text style={styles.progressMessage}>{uploadState.message}</Text>
            ) : null}
            <View style={styles.progressSteps}>
              {(() => {
                const order = ['preparing', 'uploading', 'saving', 'success'];
                const currentIndex = order.indexOf(uploadState.stage);
                return [
                { key: 'preparing', label: 'Подготовка' },
                { key: 'uploading', label: 'Загрузка' },
                { key: 'saving', label: 'Сохранение' },
                { key: 'success', label: 'Готово' },
              ].map((step) => {
                const stepIndex = order.indexOf(step.key);
                const active = uploadState.stage === step.key;
                const done = currentIndex >= stepIndex && currentIndex !== -1;
                return (
                  <View
                    key={step.key}
                    style={[
                      styles.progressStep,
                      done && styles.progressStepDone,
                      active && styles.progressStepActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.progressStepText,
                        done && styles.progressStepTextDone,
                        active && styles.progressStepTextActive,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              });
              })()}
            </View>
          </View>
        ) : null}
        <View style={[styles.updateGrid, isWide && styles.updateGridWide]}>
          <View style={styles.updateColumn}>
            <View style={styles.updateCard}>
              <View style={styles.updateHeaderRow}>
                <Text style={styles.sectionTitle}>
                  {selectedUpdateId ? `Редактирование #${selectedUpdateId}` : 'Новая версия'}
                </Text>
                {selectedUpdateId ? (
                  <Pressable onPress={resetUpdateForm} style={styles.linkBtn}>
                    <Text style={styles.linkBtnText}>Сбросить форму</Text>
                  </Pressable>
                ) : null}
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldBlock, { minWidth: 200 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Платформа</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.platform.title, HELP_TEXT.platform.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <View style={styles.segmentGroup}>
                    <Pressable
                      onPress={() => handlePlatformChange('android')}
                      style={[styles.segment, updateForm.platform === 'android' && styles.segmentActive]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          updateForm.platform === 'android' && styles.segmentTextActive,
                        ]}
                      >
                        Android
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => handlePlatformChange('ios')}
                      style={[styles.segment, updateForm.platform === 'ios' && styles.segmentActive]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          updateForm.platform === 'ios' && styles.segmentTextActive,
                        ]}
                      >
                        iOS
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={[styles.fieldBlock, { minWidth: 200 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Канал</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.channel.title, HELP_TEXT.channel.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <View style={styles.segmentGroup}>
                    <Pressable
                      onPress={() => setUpdateForm((prev) => ({ ...prev, channel: 'prod' }))}
                      style={[styles.segment, updateForm.channel === 'prod' && styles.segmentActive]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          updateForm.channel === 'prod' && styles.segmentTextActive,
                        ]}
                      >
                        prod
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setUpdateForm((prev) => ({ ...prev, channel: 'dev' }))}
                      style={[styles.segment, updateForm.channel === 'dev' && styles.segmentActive]}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          updateForm.channel === 'dev' && styles.segmentTextActive,
                        ]}
                      >
                        dev
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldBlock, { minWidth: 180 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Код версии</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.versionCode.title, HELP_TEXT.versionCode.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <Text style={styles.labelHint}>Текущий: {currentVersionCodeLabel}</Text>
                  <TextInput
                    placeholder="например 101"
                    value={updateForm.versionCode}
                    onChangeText={(val) => {
                      setVersionCodeTouched(true);
                      setUpdateForm((prev) => ({ ...prev, versionCode: val }));
                    }}
                    style={styles.input}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.fieldBlock, { minWidth: 180 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Имя версии</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.versionName.title, HELP_TEXT.versionName.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <Text style={styles.labelHint}>Текущая: {currentVersionNameLabel}</Text>
                  <TextInput
                    placeholder="например 1.2.3"
                    value={updateForm.versionName}
                    onChangeText={(val) => setUpdateForm((prev) => ({ ...prev, versionName: val }))}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldBlock, { minWidth: 200 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Минимальная версия</Text>
                    <Pressable
                      onPress={() =>
                        openInfo(
                          HELP_TEXT.minSupportedVersionCode.title,
                          HELP_TEXT.minSupportedVersionCode.message
                        )
                      }
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <Text style={styles.labelHint}>Рекомендуем: {currentVersionCodeLabel}</Text>
                  <TextInput
                    placeholder="например 100"
                    value={updateForm.minSupportedVersionCode}
                    onChangeText={(val) => {
                      setMinSupportedTouched(true);
                      setUpdateForm((prev) => ({ ...prev, minSupportedVersionCode: val }));
                    }}
                    style={styles.input}
                    keyboardType="numeric"
                  />
                </View>
                <View style={[styles.fieldBlock, { minWidth: 140, flex: 0.6 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Процент раскатки</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.rolloutPercent.title, HELP_TEXT.rolloutPercent.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <TextInput
                    placeholder="1-100"
                    value={updateForm.rolloutPercent}
                    onChangeText={(val) => setUpdateForm((prev) => ({ ...prev, rolloutPercent: val }))}
                    style={styles.input}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.toggleRow}>
                <View style={styles.labelRow}>
                  <Text style={styles.toggleLabel}>Обязательное</Text>
                  <Pressable
                    onPress={() => openInfo(HELP_TEXT.mandatory.title, HELP_TEXT.mandatory.message)}
                    style={styles.helpBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                  </Pressable>
                </View>
                <Switch
                  value={updateForm.isMandatory}
                  onValueChange={(val) => setUpdateForm((prev) => ({ ...prev, isMandatory: val }))}
                  trackColor={{ false: '#CBD5F5', true: colors.tint }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.toggleRow}>
                <View style={styles.labelRow}>
                  <Text style={styles.toggleLabel}>Активное обновление</Text>
                  <Pressable
                    onPress={() => openInfo(HELP_TEXT.active.title, HELP_TEXT.active.message)}
                    style={styles.helpBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                  </Pressable>
                </View>
                <Switch
                  value={updateForm.isActive}
                  onValueChange={(val) => setUpdateForm((prev) => ({ ...prev, isActive: val }))}
                  trackColor={{ false: '#CBD5F5', true: colors.tint }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            <View style={styles.updateCard}>
              <View style={styles.updateHeaderRow}>
                <Text style={styles.sectionTitle}>Файлы и описание</Text>
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldBlock, { minWidth: 220 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Store URL</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.storeUrl.title, HELP_TEXT.storeUrl.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <TextInput
                    placeholder="https://..."
                    value={updateForm.storeUrl}
                    onChangeText={(val) => setUpdateForm((prev) => ({ ...prev, storeUrl: val }))}
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldBlock, { minWidth: 220 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Release notes</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.releaseNotes.title, HELP_TEXT.releaseNotes.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <TextInput
                    placeholder="Короткое описание изменений"
                    value={updateForm.releaseNotes}
                    onChangeText={(val) => setUpdateForm((prev) => ({ ...prev, releaseNotes: val }))}
                    style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                    multiline
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={[styles.fieldBlock, { minWidth: 220 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>APK файл</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.apk.title, HELP_TEXT.apk.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <View style={styles.updateRow}>
                    <TouchableOpacity
                      style={[
                        styles.smallBtn,
                        { backgroundColor: isAndroid ? colors.tint : colors.inputBorder, opacity: isAndroid ? 1 : 0.6 },
                      ]}
                      onPress={handlePickApk}
                      disabled={!isAndroid || updateSaving}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>
                        {updateFile ? 'Заменить APK' : 'Выбрать APK'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.labelHint}>
                      {updateFile?.name || (isAndroid ? 'Файл не выбран' : 'Для iOS используйте Store URL')}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.updateRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: colors.tint }]}
                  onPress={handleSubmitUpdate}
                  disabled={updateSaving}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>{actionLabel}</Text>
                </TouchableOpacity>
                <Text style={styles.labelHint}>
                  {selectedUpdateId ? 'Редактируете существующую запись' : 'Создайте новую запись для релиза'}
                </Text>
              </View>
            </View>
          </View>

          <View style={[styles.updateColumn, !isWide && styles.updateColumnStack]}>
            <View style={styles.updateCard}>
              <View style={styles.updateHeaderRow}>
                <Text style={styles.sectionTitle}>История релизов</Text>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: colors.inputBorder }]}
                  onPress={loadUpdates}
                  disabled={updatesLoading}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>Обновить</Text>
                </TouchableOpacity>
              </View>
              {updatesLoading ? (
                <View style={styles.center}>
                  <ActivityIndicator />
                </View>
              ) : (
                updates.map((u) => (
                  <View key={u.id} style={styles.updateItemRow}>
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={styles.updateItemTitle}>
                        #{u.id} · v{u.versionName} ({u.versionCode})
                      </Text>
                      {renderUpdateMeta(u)}
                    </View>
                    <View style={styles.updateActions}>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => handleEditUpdate(u)}>
                        <Ionicons name="pencil-outline" size={18} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtn} onPress={() => handleToggleActive(u)}>
                        <Ionicons name={u.isActive ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.iconBtnDanger} onPress={() => handleDeleteUpdate(u)}>
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              {!updatesLoading && !updates.length && (
                <Text style={styles.subtitle}>Пока нет обновлений</Text>
              )}
            </View>

            <View style={styles.updateCard}>
              <View style={styles.updateHeaderRow}>
                <Text style={styles.sectionTitle}>Очистка версий</Text>
              </View>
              <View style={styles.fieldRow}>
                <View style={[styles.fieldBlock, { minWidth: 180 }]}>
                  <View style={styles.labelRow}>
                    <Text style={styles.labelText}>Оставить последних</Text>
                    <Pressable
                      onPress={() => openInfo(HELP_TEXT.cleanupKeepLatest.title, HELP_TEXT.cleanupKeepLatest.message)}
                      style={styles.helpBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                    </Pressable>
                  </View>
                  <TextInput
                    placeholder="1"
                    value={cleanupKeepLatest}
                    onChangeText={setCleanupKeepLatest}
                    style={styles.input}
                    keyboardType="numeric"
                  />
                </View>
              </View>
              <View style={styles.toggleRow}>
                <View style={styles.labelRow}>
                  <Text style={styles.toggleLabel}>Удалять APK</Text>
                  <Pressable
                    onPress={() => openInfo(HELP_TEXT.cleanupPurge.title, HELP_TEXT.cleanupPurge.message)}
                    style={styles.helpBtn}
                    hitSlop={8}
                  >
                    <Ionicons name="help-circle-outline" size={16} color={colors.secondaryText} />
                  </Pressable>
                </View>
                <Switch
                  value={cleanupPurgeFile}
                  onValueChange={setCleanupPurgeFile}
                  trackColor={{ false: '#CBD5F5', true: colors.tint }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.updateRow}>
                <TouchableOpacity
                  style={[styles.smallBtn, { backgroundColor: '#FEE2E2' }]}
                  onPress={handleCleanup}
                  disabled={updatesLoading}
                >
                  <Text style={{ color: '#991B1B', fontWeight: '700' }}>Очистить</Text>
                </TouchableOpacity>
                <Text style={styles.labelHint}>Удаляет старые версии по платформе и каналу.</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <InfoModal
        visible={!!infoModal}
        title={infoModal?.title || ''}
        message={infoModal?.message || ''}
        onClose={closeInfo}
      />
    </>
  );
}
