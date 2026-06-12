import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';

type UnsavedChangesConfig = {
  active: boolean;
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
          <Dialog.Icon icon={(dialogConfig?.icon || defaultConfig.icon || 'alert-outline') as any} color={dialogConfig?.iconColor || defaultConfig.iconColor} />
          <Dialog.Title style={styles.title}>
            {dialogConfig?.title || defaultConfig.title}
          </Dialog.Title>
          <Dialog.Content style={styles.content}>
            <Text variant="bodyMedium" style={styles.message}>
              {dialogConfig?.message || defaultConfig.message}
            </Text>
            {dialogConfig?.warning ? (
              <Text
                variant="bodySmall"
                style={[
                  styles.warning,
                  {
                    color: dialogConfig.warningTextColor || defaultConfig.warningTextColor,
                    backgroundColor: dialogConfig.warningBackgroundColor || defaultConfig.warningBackgroundColor,
                    borderColor: dialogConfig.warningBorderColor || defaultConfig.warningBorderColor,
                  },
                ]}
              >
                {dialogConfig.warning}
              </Text>
            ) : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeDialog} disabled={discarding} textColor={dialogConfig?.cancelButtonTextColor || defaultConfig.cancelButtonTextColor}>
              {dialogConfig?.cancelText || defaultConfig.cancelText}
            </Button>
            <Button
              mode="contained"
              buttonColor={dialogConfig?.confirmButtonColor || defaultConfig.confirmButtonColor}
              textColor={dialogConfig?.confirmButtonTextColor || defaultConfig.confirmButtonTextColor}
              onPress={confirmDiscard}
              loading={discarding}
              disabled={discarding}
            >
              {dialogConfig?.confirmText || defaultConfig.confirmText}
            </Button>
          </Dialog.Actions>
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
    width: '92%',
    alignSelf: 'center',
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
  },
  title: {
    textAlign: 'center',
    color: '#0F172A',
    fontWeight: '900',
  },
  content: {
    gap: 10,
  },
  message: {
    color: '#475569',
    lineHeight: 20,
    textAlign: 'center',
  },
  warning: {
    color: '#B45309',
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlign: 'center',
  },
});
