import React from 'react';
import { Pressable, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ClientOrder } from '@/utils/clientOrdersService';
import { getDownloadableClientOrderInvoices, getClientOrderInvoicePresentation,
  hasClientOrderInvoiceDocument } from '../../lib/clientOrderInvoices';

export function InvoiceRequestField({
  styles,
  workspace,
  readOnly,
  onDownload,
  onShare,
  onRequestInvoice,
  downloadBusy,
  shareBusy,
  requestBusy,
  requestPending,
}: {
  styles: any;
  workspace: any;
  readOnly: boolean;
  onDownload: () => void;
  onShare: () => void;
  onRequestInvoice: () => void;
  downloadBusy: boolean;
  shareBusy: boolean;
  requestBusy: boolean;
  requestPending: boolean;
}) {
  const selectedOrder = hasClientOrderInvoiceDocument(workspace.selectedOrder)
    ? workspace.selectedOrder as ClientOrder
    : null;
  const committedAutoSend = !!workspace.draft.invoiceRequested;
  const [optimisticAutoSend, setOptimisticAutoSend] = React.useState(committedAutoSend);
  const optimisticAutoSendRef = React.useRef(committedAutoSend);
  const invoices = getDownloadableClientOrderInvoices(selectedOrder);
  const invoiceDownloadAvailable = invoices.length > 0 || !!selectedOrder?.invoiceDownloadAvailable;
  const hasPendingInvoice = requestPending || getClientOrderInvoicePresentation(selectedOrder).pending;
  const hasCounterparty = !!(
    workspace.draft.counterpartyGuid
    || workspace.selections.counterparty?.guid
  );
  const preferenceLoading = hasCounterparty && workspace.loadingDefaults;
  const autoSendDisabled = readOnly || !hasCounterparty || preferenceLoading;

  React.useEffect(() => {
    optimisticAutoSendRef.current = committedAutoSend;
    setOptimisticAutoSend(committedAutoSend);
  }, [committedAutoSend, workspace.draft.clientOrderId, workspace.draft.guid]);

  const toggle = () => {
    if (autoSendDisabled) return;
    const nextValue = !optimisticAutoSendRef.current;
    optimisticAutoSendRef.current = nextValue;
    // Keep the control responsive even when recalculating the full draft is expensive.
    // The draft update (and its later persistence) is deliberately low priority.
    setOptimisticAutoSend(nextValue);
    React.startTransition(() => {
      workspace.patchDraft({ invoiceRequested: nextValue });
    });
  };

  if (invoiceDownloadAvailable) {
    return (
      <View style={[styles.flatField, styles.invoiceReadyField, readOnly && styles.readOnlyFieldSurface]}>
        <View style={styles.flatFieldIcon}>
          <MaterialCommunityIcons name="file-pdf-box" size={20} color="#16A34A" />
        </View>
        <View style={styles.flatFieldTextWrap}>
          <Text style={styles.flatFieldValue} numberOfLines={1}>Скачать счёт</Text>
        </View>
        <View style={styles.invoiceFileActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Скачать счёт"
            disabled={downloadBusy || shareBusy}
            onPress={onDownload}
            style={({ pressed }) => [styles.invoiceFileAction, pressed && !downloadBusy && !shareBusy && styles.flatPressed]}
          >
            {downloadBusy ? (
              <ActivityIndicator size={24} color="#1D4ED8" />
            ) : (
              <MaterialCommunityIcons name="download-outline" size={24} color="#1D4ED8" />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Поделиться счётом"
            disabled={downloadBusy || shareBusy}
            onPress={onShare}
            style={({ pressed }) => [styles.invoiceFileAction, styles.invoiceFileActionDivider, pressed && !downloadBusy && !shareBusy && styles.flatPressed]}
          >
            {shareBusy ? (
              <ActivityIndicator size={24} color="#1D4ED8" />
            ) : (
              <MaterialCommunityIcons name="share-variant-outline" size={24} color="#1D4ED8" />
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  // A temporary save/submit lock must not turn the new-order checkbox into invoice UI.
  if (selectedOrder && workspace.readOnly) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasPendingInvoice ? 'Счёт формируется' : 'Запросить счёт'}
        disabled={requestBusy || hasPendingInvoice}
        onPress={onRequestInvoice}
        style={({ pressed }) => [styles.flatField, styles.invoiceReadyField, styles.readOnlyFieldSurface, pressed && !requestBusy && !hasPendingInvoice && styles.flatPressed]}
      >
        <View style={styles.flatFieldIcon}>
          <MaterialCommunityIcons name="file-download-outline" size={20} color="#1D4ED8" />
        </View>
        <View style={styles.flatFieldTextWrap}>
          <Text style={styles.flatFieldValue} numberOfLines={1}>{hasPendingInvoice ? 'Счёт формируется' : 'Запросить счёт'}</Text>
        </View>
        <View style={[styles.invoiceFileAction, styles.invoiceFileActionDivider]}>
          {requestBusy || hasPendingInvoice ? (
            <ActivityIndicator size={24} color="#1D4ED8" />
          ) : (
            <MaterialCommunityIcons name="cloud-download-outline" size={24} color="#1D4ED8" />
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: optimisticAutoSend, disabled: autoSendDisabled, busy: preferenceLoading }}
      disabled={autoSendDisabled}
      onPress={toggle}
      style={({ pressed }) => [
        styles.flatField,
        autoSendDisabled && styles.readOnlyFieldSurface,
        pressed && !autoSendDisabled && styles.flatPressed,
      ]}
    >
      <View style={styles.flatFieldIcon}>
        <MaterialCommunityIcons name="receipt-text-outline" size={20} color={autoSendDisabled ? 'rgba(71, 85, 105, 0.48)' : '#475569'} />
      </View>
      <View style={styles.flatFieldTextWrap}>
        <Text style={[styles.flatFieldValue, autoSendDisabled && styles.readOnlyFieldValue]} numberOfLines={2}>
          Отправлять счёт автоматически
        </Text>
      </View>
      {preferenceLoading ? (
        <View style={styles.flatFieldAction}>
          <ActivityIndicator size={17} color="#2563EB" />
        </View>
      ) : (
        <MaterialCommunityIcons
          name={optimisticAutoSend ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={24}
          color={optimisticAutoSend ? '#2563EB' : '#94A3B8'}
        />
      )}
    </Pressable>
  );
}
