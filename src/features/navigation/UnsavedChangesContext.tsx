import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Dialog, Portal, Text } from 'react-native-paper';

type UnsavedChangesConfig = {
  active: boolean;
  minimal?: boolean;
  title: string;
  message: string;
  warning?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: string;
  iconColor?: string;
  confirmButtonColor?: string;
  confirmButtonTextColor?: string;
  cancelButtonTextColor?: string;
  warningTextColor?: string;
  warningBackgroundColor?: string;
  warningBorderColor?: string;
  onDiscard?: () => void | Promise<void>;
};

type PendingNavigation = (() => void) | null;

type UnsavedChangesContextValue = {
  registerUnsavedChanges: (config: UnsavedChangesConfig | null) => void;
  confirmNavigation: (navigate: () => void) => boolean;
};

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

const defaultConfig: UnsavedChangesConfig = {
  active: false,
  title: 'Есть несохраненные изменения',
  message: 'Если выйти сейчас, изменения в документе будут потеряны.',
  warning: 'Сохраните изменения или подтвердите выход без сохранения.',
  confirmText: 'Выйти',
  cancelText: 'Остаться',
  icon: 'alert-outline',
  iconColor: '#F97316',
  confirmButtonColor: '#F97316',
  confirmButtonTextColor: '#FFFFFF',
  cancelButtonTextColor: '#475569',
  warningTextColor: '#B45309',
  warningBackgroundColor: '#FFF7ED',
  warningBorderColor: '#FED7AA',
};

const DIALOG_CLOSE_MS = 180;

function withAlpha(color: string | undefined, alpha: number, fallback: string) {
  const source = color || fallback;
  if (!source.startsWith('#')) return source;
  const hex = source.slice(1);
  const normalized = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return fallback;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const configRef = useRef<UnsavedChangesConfig | null>(null);
  const pendingNavigationRef = useRef<PendingNavigation>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialogConfig, setDialogConfig] = useState<UnsavedChangesConfig | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const clearCloseTimer = useCallback(() => {
    if (!closeTimerRef.current) return;
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const hideDialog = useCallback((afterClose?: () => void, clearConfig = true) => {
    clearCloseTimer();
    setDialogVisible(false);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (clearConfig) setDialogConfig(null);
      afterClose?.();
    }, DIALOG_CLOSE_MS);
  }, [clearCloseTimer]);

  const registerUnsavedChanges = useCallback((config: UnsavedChangesConfig | null) => {
    const nextConfig = config?.active ? { ...defaultConfig, ...config, active: true } : null;
    configRef.current = nextConfig;
    setDialogConfig((current) => {
      if (!current) return current;
      if (!nextConfig) {
        pendingNavigationRef.current = null;
        return null;
      }
      return { ...nextConfig };
    });
  }, []);

  const closeDialog = useCallback(() => {
    if (discarding) return;
    pendingNavigationRef.current = null;
    hideDialog();
  }, [discarding, hideDialog]);

  const confirmNavigation = useCallback((navigate: () => void) => {
    const config = configRef.current;
    if (!config?.active) {
      navigate();
      return true;
    }

    pendingNavigationRef.current = navigate;
    setDialogConfig(config);
    setDialogVisible(true);
    return false;
  }, []);

  const confirmDiscard = useCallback(() => {
    const navigate = pendingNavigationRef.current;
    const config = configRef.current;
    pendingNavigationRef.current = null;
    setDiscarding(true);

    Promise.resolve()
      .then(() => config?.onDiscard?.())
      .catch(() => {})
      .finally(() => {
        configRef.current = null;
        hideDialog(() => {
          setDiscarding(false);
          navigate?.();
        });
      });
  }, [hideDialog]);

  const value = useMemo(
    () => ({
      registerUnsavedChanges,
      confirmNavigation,
    }),
    [confirmNavigation, registerUnsavedChanges]
  );

  return (
    <UnsavedChangesContext.Provider value={value}>
      {children}
      <Portal>
        <Dialog visible={dialogVisible} onDismiss={closeDialog} dismissable={!discarding} style={styles.dialog}>
          <Dialog.Content style={styles.content}>
            {dialogConfig?.minimal ? (
              <Text variant="headlineSmall" style={styles.minimalTitle}>
                {dialogConfig?.title || defaultConfig.title}
              </Text>
            ) : (
              <>
                <View style={styles.header}>
                  <View
                    style={[
                      styles.iconSurface,
                      {
                        borderColor: withAlpha(dialogConfig?.iconColor, 0.22, defaultConfig.iconColor || '#2563EB'),
                        backgroundColor: withAlpha(dialogConfig?.iconColor, 0.1, defaultConfig.iconColor || '#2563EB'),
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={(dialogConfig?.icon || defaultConfig.icon || 'alert-outline') as any}
                      size={24}
                      color={dialogConfig?.iconColor || defaultConfig.iconColor}
                    />
                  </View>
                  <View style={styles.titleBlock}>
                    <Text variant="labelMedium" style={styles.eyebrow}>
                      Подтверждение перехода
                    </Text>
                    <Text variant="headlineSmall" style={styles.title}>
                      {dialogConfig?.title || defaultConfig.title}
                    </Text>
                  </View>
                </View>
                <Text variant="bodyMedium" style={styles.message}>
                  {dialogConfig?.message || defaultConfig.message}
                </Text>
                {dialogConfig?.warning ? (
                  <View
                    style={[
                      styles.warning,
                      {
                        backgroundColor: dialogConfig.warningBackgroundColor || defaultConfig.warningBackgroundColor,
                        borderColor: dialogConfig.warningBorderColor || defaultConfig.warningBorderColor,
                      },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="information-outline"
                      size={17}
                      color={dialogConfig.warningTextColor || defaultConfig.warningTextColor}
                    />
                    <Text
                      variant="bodySmall"
                      style={[
                        styles.warningText,
                        { color: dialogConfig.warningTextColor || defaultConfig.warningTextColor },
                      ]}
                    >
                      {dialogConfig.warning}
                    </Text>
                  </View>
                ) : null}
              </>
            )}
            <View style={styles.actions}>
              <Button
                mode="outlined"
                onPress={closeDialog}
                disabled={discarding}
                textColor={dialogConfig?.cancelButtonTextColor || defaultConfig.cancelButtonTextColor}
                style={styles.cancelButton}
                contentStyle={styles.actionButtonContent}
                labelStyle={styles.actionButtonLabel}
              >
                {dialogConfig?.cancelText || defaultConfig.cancelText}
              </Button>
              <Button
                mode="contained"
                buttonColor={dialogConfig?.confirmButtonColor || defaultConfig.confirmButtonColor}
                textColor={dialogConfig?.confirmButtonTextColor || defaultConfig.confirmButtonTextColor}
                onPress={confirmDiscard}
                loading={discarding}
                disabled={discarding}
                style={styles.confirmButton}
                contentStyle={styles.actionButtonContent}
                labelStyle={styles.actionButtonLabel}
              >
                {dialogConfig?.confirmText || defaultConfig.confirmText}
              </Button>
            </View>
          </Dialog.Content>
        </Dialog>
      </Portal>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  const context = useContext(UnsavedChangesContext);
  if (!context) {
    throw new Error('useUnsavedChanges must be used within UnsavedChangesProvider');
  }
  return context;
}

export function useOptionalUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

const styles = StyleSheet.create({
  dialog: {
    maxWidth: 430,
    width: '90%',
    alignSelf: 'center',
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconSurface: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: '#64748B',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 2,
    color: '#0F172A',
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
  },
  minimalTitle: {
    color: '#0F172A',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
    textAlign: 'center',
    paddingTop: 6,
    paddingHorizontal: 4,
  },
  message: {
    color: '#475569',
    fontSize: 14,
    lineHeight: 20,
  },
  warning: {
    minHeight: 44,
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  warningText: {
    flex: 1,
    minWidth: 0,
    lineHeight: 18,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 2,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 14,
    borderColor: '#CBD5E1',
  },
  confirmButton: {
    flex: 1,
    borderRadius: 14,
  },
  actionButtonContent: {
    minHeight: 46,
  },
  actionButtonLabel: {
    marginVertical: 0,
    fontSize: 14,
    fontWeight: '900',
  },
});
