import { packageLabel, unitLabel } from '../../lib/clientOrdersUi';
import React from 'react';
import { View } from 'react-native';
import {
  Button as PaperButton,
  Card,
  Chip,
  Dialog,
  Divider,
  IconButton as PaperIconButton,
  List,
  Modal as PaperModal,
  Portal,
  Surface,
  Text,
} from 'react-native-paper';

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
} | null;

export function ActionButton({
  styles,
  label,
  icon,
  kind = 'secondary',
  onPress,
  disabled,
  height,
}: {
  styles: any;
  label: string;
  icon?: string;
  kind?: 'primary' | 'secondary' | 'danger' | 'success';
  onPress: () => void;
  disabled?: boolean;
  height?: number;
}) {
  const mode = kind === 'secondary' ? 'outlined' : 'contained';
  const buttonColor = kind === 'danger' ? '#DC2626' : kind === 'success' ? '#16A34A' : kind === 'primary' ? '#0F172A' : '#FFFFFF';
  const textColor = kind === 'secondary' ? '#2563EB' : '#FFFFFF';

  return (
    <PaperButton
      mode={mode}
      disabled={disabled}
      onPress={onPress}
      icon={icon}
      buttonColor={buttonColor}
      textColor={textColor}
      contentStyle={height ? { minHeight: height, height } : undefined}
      style={[styles.actionPaper, disabled && styles.disabled]}
      labelStyle={styles.actionPaperLabel}
    >
      {label}
    </PaperButton>
  );
}

export function Pill({ styles, text, tone }: { styles: any; text: string; tone?: 'success' | 'danger' }) {
  return (
    <Chip
      compact
      style={[styles.pillPaper, tone === 'success' && styles.pillSuccess, tone === 'danger' && styles.pillDanger]}
      textStyle={[styles.pillText, tone === 'success' && styles.pillSuccessText, tone === 'danger' && styles.pillDangerText]}
    >
      {text}
    </Chip>
  );
}

export function InfoText({ styles, text }: { styles: any; text: string }) {
  return <Text style={styles.infoText}>{text}</Text>;
}

export function SelectionCard({
  styles,
  label,
  value,
  onPress,
  disabled,
  compact,
  onDetails,
}: {
  styles: any;
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  compact?: boolean;
  onDetails?: () => void;
}) {
  return (
    <Card mode="outlined" onPress={disabled ? undefined : onPress} style={[styles.selection, compact && styles.selectionCompact, disabled && styles.disabled]}>
      <Card.Content style={styles.selectionContentPaper}>
        <Text style={styles.selectionLabel}>{label}</Text>
        <View style={styles.selectionValueRow}>
          <Text style={[styles.selectionValue, { flex: 1 }]} numberOfLines={2}>
            {value}
          </Text>
          {onDetails ? <PaperIconButton icon="magnify" size={18} onPress={onDetails} disabled={disabled} style={styles.detailsButtonPaper} /> : null}
        </View>
      </Card.Content>
    </Card>
  );
}

export function PackagePickerDialog({
  styles,
  item,
  onDismiss,
  onSelect,
}: {
  styles: any;
  item: any | null;
  onDismiss: () => void;
  onSelect: (packageGuid: string | null) => void;
}) {
  const packages = item?.packages || [];

  return (
    <Portal>
      <Dialog visible={!!item} onDismiss={onDismiss} style={styles.dialogPaper}>
        <Dialog.Title>Выбор упаковки</Dialog.Title>
        <Dialog.Content>
          <List.Item
            title={unitLabel(item?.baseUnit)}
            left={(props) => <List.Icon {...props} icon={!item?.packageGuid ? 'check-circle' : 'cube-outline'} />}
            onPress={() => onSelect(null)}
          />
          {packages.map((pack: any) => (
            <List.Item
              key={pack.guid}
              title={packageLabel(pack, item)}
              left={(props) => <List.Icon {...props} icon={item?.packageGuid === pack.guid ? 'check-circle' : 'cube-outline'} />}
              onPress={() => onSelect(pack.guid)}
            />
          ))}
        </Dialog.Content>
        <Dialog.Actions>
          <PaperButton onPress={onDismiss}>Закрыть</PaperButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export function ConfirmDialog({
  styles,
  state,
  onDismiss,
}: {
  styles: any;
  state: ConfirmDialogState;
  onDismiss: () => void;
}) {
  const [confirming, setConfirming] = React.useState(false);

  React.useEffect(() => {
    if (!state) setConfirming(false);
  }, [state]);

  const confirm = React.useCallback(async () => {
    if (!state || confirming) return;
    setConfirming(true);
    try {
      await state.onConfirm();
      onDismiss();
    } finally {
      setConfirming(false);
    }
  }, [confirming, onDismiss, state]);

  return (
    <Portal>
      <Dialog visible={!!state} onDismiss={onDismiss} style={styles.dialogPaper}>
        <Dialog.Title>{state?.title || ''}</Dialog.Title>
        <Dialog.Content>
          <Text style={styles.orderMeta}>{state?.message || ''}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <PaperButton onPress={onDismiss} disabled={confirming}>
            {state?.cancelLabel || 'Отмена'}
          </PaperButton>
          <PaperButton
            onPress={() => void confirm()}
            loading={confirming}
            disabled={confirming}
            textColor={state?.destructive ? '#DC2626' : undefined}
          >
            {state?.confirmLabel || 'Продолжить'}
          </PaperButton>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export function SheetModal({
  styles,
  visible,
  title,
  onClose,
  children,
  fullScreen,
}: {
  styles: any;
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  fullScreen?: boolean;
}) {
  return (
    <Portal>
      <PaperModal visible={visible} onDismiss={onClose} contentContainerStyle={[styles.modalBackdropPaper, fullScreen ? styles.modalBackdropPaperFull : null]}>
        <Surface style={[styles.modalSheetPaper, fullScreen && styles.modalSheetPaperFull]} elevation={2}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <PaperIconButton icon="close" size={22} onPress={onClose} style={styles.sheetCloseButton} />
          </View>
          <Divider />
          <View style={styles.sheetBody}>{children}</View>
        </Surface>
      </PaperModal>
    </Portal>
  );
}
