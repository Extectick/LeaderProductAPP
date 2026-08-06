import type {
  ClientOrder,
  ClientOrderInvoice,
  ClientOrderInvoiceState,
} from '@/utils/clientOrdersService';
import { downloadClientOrderInvoice } from '@/utils/clientOrdersService';
import { API_ENDPOINTS } from '@/utils/apiEndpoints';
import { enqueueAuthenticatedAndroidDownload } from '@/utils/androidFileDownload';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

const STATE_LABELS: Record<ClientOrderInvoiceState, string> = {
  NOT_REQUESTED: 'Счёт не требуется',
  WAITING: 'Ожидает готовности',
  QUEUED: 'Счёт в очереди',
  SENDING: 'Счёт отправляется',
  AVAILABLE: 'Счёт готов',
  PARTIAL: 'Отправлен частично',
  SENT: 'Счёт отправлен',
  ERROR: 'Ошибка счёта',
};

const STATE_ICONS: Record<ClientOrderInvoiceState, string> = {
  NOT_REQUESTED: 'file-document-outline',
  WAITING: 'clock-outline',
  QUEUED: 'clock-outline',
  SENDING: 'clock-outline',
  AVAILABLE: 'file-pdf-box',
  PARTIAL: 'alert-circle-outline',
  SENT: 'file-check-outline',
  ERROR: 'file-alert-outline',
};

const STATE_COLORS: Record<ClientOrderInvoiceState, string> = {
  NOT_REQUESTED: '#64748B',
  WAITING: '#D97706',
  QUEUED: '#D97706',
  SENDING: '#D97706',
  AVAILABLE: '#16A34A',
  PARTIAL: '#D97706',
  SENT: '#16A34A',
  ERROR: '#DC2626',
};

export function getClientOrderInvoiceIdentifier(order?: Pick<ClientOrder, 'guid' | 'appGuid'> | null) {
  return order?.appGuid?.trim() || order?.guid?.trim() || null;
}

export function getClientOrderInvoiceState(order?: Pick<ClientOrder, 'invoiceRequested' | 'invoiceState' | 'invoiceDownloadAvailable' | 'invoiceCount' | 'invoiceRequestPending' | 'invoices'> | null): ClientOrderInvoiceState {
  const invoices = (Array.isArray(order?.invoices) ? order.invoices : [])
    .filter((invoice) => !['SUPERSEDED', 'CANCELLED'].includes(invoice.state));
  const pendingInvoice = invoices.find((invoice) => ['WAITING', 'QUEUED', 'SENDING'].includes(invoice.state));
  if (pendingInvoice) return pendingInvoice.state;
  if (order?.invoiceRequestPending) return 'WAITING';

  const hasDownload = !!order?.invoiceDownloadAvailable
    || invoices.some((invoice) => !!invoice.downloadAvailable);
  if (hasDownload) {
    if (order?.invoiceRequested && order.invoiceState && ['SENT', 'PARTIAL', 'ERROR'].includes(order.invoiceState)) {
      return order.invoiceState;
    }
    return 'AVAILABLE';
  }

  const latestInvoice = invoices[0];
  if (latestInvoice) return latestInvoice.state;
  if (Number(order?.invoiceCount || 0) > 0) {
    return order?.invoiceState && order.invoiceState !== 'NOT_REQUESTED' ? order.invoiceState : 'WAITING';
  }
  if (order?.invoiceRequested) return order.invoiceState || 'WAITING';
  return order?.invoiceState && order.invoiceState !== 'NOT_REQUESTED' ? order.invoiceState : 'NOT_REQUESTED';
}

export function getClientOrderInvoicePresentation(order?: Pick<ClientOrder, 'invoiceRequested' | 'invoiceState' | 'invoiceWaitReason' | 'latestInvoiceVersion' | 'invoiceCount' | 'invoiceDownloadAvailable' | 'invoiceRequestPending' | 'invoices'> | null) {
  const state = getClientOrderInvoiceState(order);
  const invoices = Array.isArray(order?.invoices) ? order.invoices : [];
  const latestVersion = Math.max(
    Number(order?.latestInvoiceVersion || 0),
    ...invoices.map((invoice) => Number(invoice?.version || 0)),
  );
  const count = Math.max(Number(order?.invoiceCount || 0), invoices.length);
  const pending = ['WAITING', 'QUEUED', 'SENDING'].includes(state);
  const visible = !!order?.invoiceRequested
    || !!order?.invoiceRequestPending
    || !!order?.invoiceDownloadAvailable
    || count > 0
    || state !== 'NOT_REQUESTED';
  const version = latestVersion > 0 ? latestVersion : null;
  return {
    state,
    label: STATE_LABELS[state],
    icon: STATE_ICONS[state],
    color: STATE_COLORS[state],
    version,
    reason: order?.invoiceWaitReason || invoices.find((invoice) => invoice?.waitReason)?.waitReason || null,
    count,
    pending,
    visible,
    listLabel: `Счёт${!pending && version && version > 1 ? ` v${version}` : ''}`,
  };
}

export function hasPendingClientOrderInvoice(order?: Parameters<typeof getClientOrderInvoicePresentation>[0]) {
  const presentation = getClientOrderInvoicePresentation(order);
  return presentation.visible && presentation.pending;
}

export function getDownloadableClientOrderInvoices(order?: Pick<ClientOrder, 'invoices'> | null) {
  const sorted = (Array.isArray(order?.invoices) ? order.invoices : [])
    .filter((invoice) => !!invoice?.downloadAvailable && !!invoice?.id)
    .sort((left, right) => Number(right.version || 0) - Number(left.version || 0));
  const seenRealizations = new Set<string>();
  return sorted.filter((invoice) => {
    const realizationKey = String(invoice.realizationGuid || invoice.realizationNumber || invoice.id);
    if (seenRealizations.has(realizationKey)) return false;
    seenRealizations.add(realizationKey);
    return true;
  });
}

function safeInvoiceFileName(invoice: ClientOrderInvoice) {
  const version = Number(invoice.version || 1);
  const versionSuffix = version > 1 ? `_v${version}` : '';
  const fallback = `Счет_${invoice.realizationNumber || invoice.realizationGuid || invoice.id}${versionSuffix}.pdf`;
  const value = (invoice.fileName || fallback).replace(/[\\/:*?"<>|]/g, '_').trim();
  return /\.pdf$/i.test(value) ? value : `${value}.pdf`;
}

export function getClientOrderInvoiceActionLabel(invoice: ClientOrderInvoice) {
  const base = invoice.realizationNumber ? `Счёт ${invoice.realizationNumber}` : 'Счёт';
  return Number(invoice.version || 1) > 1 ? `${base} · v${invoice.version}` : base;
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Не удалось прочитать PDF'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function saveClientOrderInvoicePdf(orderGuid: string, invoice: ClientOrderInvoice) {
  const fileName = safeInvoiceFileName(invoice);

  if (Platform.OS === 'android') {
    const result = await enqueueAuthenticatedAndroidDownload({
      path: API_ENDPOINTS.CLIENT_ORDERS.INVOICE_DOWNLOAD(orderGuid, invoice.id),
      fileName,
      mimeType: 'application/pdf',
      title: invoice.realizationNumber ? `Счёт ${invoice.realizationNumber}` : 'Счёт на оплату',
      description: 'Сохранение PDF в папку «Загрузки»',
    });
    return result.fileName;
  }

  const blob = await downloadClientOrderInvoice(orderGuid, invoice.id);

  if (Platform.OS === 'web') {
    const objectUrl = URL.createObjectURL(blob);
    try {
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    }
    return fileName;
  }

  return shareInvoiceBlob(blob, fileName);
}

async function shareInvoiceBlob(blob: Blob, fileName: string) {
  if (Platform.OS === 'web') {
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (typeof navigator !== 'undefined' && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      await navigator.share({ files: [file], title: fileName });
      return fileName;
    }
    return null;
  }

  const baseDirectory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDirectory) throw new Error('Хранилище устройства недоступно');
  const uri = `${baseDirectory}${fileName}`;
  const base64 = await blobToBase64(blob);
  await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName, UTI: 'com.adobe.pdf' });
    return uri;
  }
  await Linking.openURL(uri);
  return uri;
}

export async function shareClientOrderInvoicePdf(orderGuid: string, invoice: ClientOrderInvoice) {
  const blob = await downloadClientOrderInvoice(orderGuid, invoice.id);
  return shareInvoiceBlob(blob, safeInvoiceFileName(invoice));
}
