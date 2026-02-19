import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { AnimatePresence, MotiView } from 'moti';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import AppealChatInput from '@/components/Appeals/AppealChatInput';
import type { AppealStatus } from '@/src/entities/appeal/types';
import type { AttachmentFile } from '@/components/ui/AttachmentsPicker';

type DockMode = 'chat' | 'claim' | 'creator_resolved' | 'closed';
type PendingDockAction = 'claim' | 'complete' | 'reject';

type Props = {
  visible: boolean;
  dockMode: DockMode;
  isPaneMode: boolean;
  contentSidePadding: number;
  dockBottom: number;
  isAtBottom: boolean;
  closedStatus?: AppealStatus;
  actionLoading: boolean;
  onAction: (action: PendingDockAction) => void;
  canAssignInClaimMode?: boolean;
  onAssign?: () => void;
  onHeightChange: (height: number) => void;
  onScrollToBottom: () => void;
  onSend: (payload: { text?: string; files?: AttachmentFile[] }) => Promise<void> | void;
  onInputFocus?: () => void;
};

function handleLayout(onHeightChange: (height: number) => void) {
  return (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (height > 0) {
      onHeightChange(height);
    }
  };
}

export default function AppealActionDock({
  visible,
  dockMode,
  isPaneMode,
  contentSidePadding,
  dockBottom,
  isAtBottom,
  closedStatus,
  actionLoading,
  onAction,
  canAssignInClaimMode,
  onAssign,
  onHeightChange,
  onScrollToBottom,
  onSend,
  onInputFocus,
}: Props) {
  if (!visible) return null;

  const onDockLayout = handleLayout(onHeightChange);

  return (
    <View
      style={[
        styles.inputDock,
        {
          bottom: dockBottom,
          left: contentSidePadding,
          right: contentSidePadding,
        },
      ]}
    >
      <View style={isPaneMode ? styles.inputWrapPane : styles.inputWrap}>
        <AnimatePresence exitBeforeEnter>
          {dockMode === 'chat' ? (
            <MotiView
              key="dock-chat"
              from={{ opacity: 0, translateY: 8, scale: 0.98 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
              transition={{ type: 'timing', duration: 210 }}
            >
              <AppealChatInput
                bottomInset={0}
                onHeightChange={onHeightChange}
                showScrollToBottom={!isAtBottom}
                onScrollToBottom={onScrollToBottom}
                onSend={onSend}
                onInputFocus={onInputFocus}
              />
            </MotiView>
          ) : null}

          {dockMode === 'closed' ? (
            <MotiView
              key="dock-closed"
              onLayout={onDockLayout}
              from={{ opacity: 0, translateY: 8, scale: 0.98 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
              transition={{ type: 'timing', duration: 210 }}
            >
              <View style={styles.actionCard}>
                <View style={styles.closedNoticeCard}>
                  <Ionicons name="lock-closed-outline" size={16} color="#64748B" />
                  <Text style={styles.closedNoticeText}>
                    {closedStatus === 'DECLINED' ? 'Обращение отклонено' : 'Обращение закрыто'}
                  </Text>
                </View>
              </View>
            </MotiView>
          ) : null}

          {dockMode === 'claim' ? (
            <MotiView
              key="dock-claim"
              onLayout={onDockLayout}
              from={{ opacity: 0, translateY: 8, scale: 0.98 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
              transition={{ type: 'timing', duration: 210 }}
            >
              <View style={styles.actionCard}>
                {canAssignInClaimMode && onAssign ? (
                  <View style={styles.splitActionRow}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.splitActionBtn,
                        styles.splitActionBtnClaim,
                        pressed && styles.splitActionBtnPressed,
                      ]}
                      onPress={() => onAction('claim')}
                      disabled={actionLoading}
                    >
                      <Text style={styles.splitActionBtnText}>Принять</Text>
                    </Pressable>
                    <View style={styles.splitDivider} />
                    <Pressable
                      style={({ pressed }) => [
                        styles.splitActionBtn,
                        styles.splitActionBtnAssign,
                        pressed && styles.splitActionBtnPressed,
                      ]}
                      onPress={onAssign}
                      disabled={actionLoading}
                    >
                      <Text style={styles.splitActionBtnText}>Назначить</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionBtnSingle,
                      pressed && styles.actionBtnSinglePressed,
                    ]}
                    onPress={() => onAction('claim')}
                    disabled={actionLoading}
                  >
                    <Text style={styles.actionBtnSingleText}>Принять обращение</Text>
                  </Pressable>
                )}
              </View>
            </MotiView>
          ) : null}

          {dockMode === 'creator_resolved' ? (
            <MotiView
              key="dock-creator-resolved"
              onLayout={onDockLayout}
              from={{ opacity: 0, translateY: 8, scale: 0.98 }}
              animate={{ opacity: 1, translateY: 0, scale: 1 }}
              exit={{ opacity: 0, translateY: 6, scale: 0.98 }}
              transition={{ type: 'timing', duration: 210 }}
            >
              <View style={styles.actionCard}>
                <View style={styles.splitActionRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.splitActionBtn,
                      styles.splitActionBtnApprove,
                      pressed && styles.splitActionBtnPressed,
                    ]}
                    onPress={() => onAction('complete')}
                    disabled={actionLoading}
                  >
                    <Text style={styles.splitActionBtnText}>Подтвердить</Text>
                  </Pressable>
                  <View style={styles.splitDivider} />
                  <Pressable
                    style={({ pressed }) => [
                      styles.splitActionBtn,
                      styles.splitActionBtnReject,
                      pressed && styles.splitActionBtnPressed,
                    ]}
                    onPress={() => onAction('reject')}
                    disabled={actionLoading}
                  >
                    <Text style={styles.splitActionBtnText}>Отклонить</Text>
                  </Pressable>
                </View>
              </View>
            </MotiView>
          ) : null}
        </AnimatePresence>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inputDock: {
    position: 'absolute',
  },
  inputWrap: {
    width: '100%',
    maxWidth: 1000,
    alignSelf: 'center',
  },
  inputWrapPane: {
    width: '100%',
    maxWidth: undefined,
    alignSelf: 'stretch',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  closedNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  closedNoticeText: {
    color: '#475569',
    fontSize: 14,
    fontWeight: '600',
  },
  actionBtnSingle: {
    borderRadius: 12,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  actionBtnSinglePressed: {
    opacity: 0.9,
  },
  actionBtnSingleText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  splitActionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  splitDivider: {
    width: 1,
    backgroundColor: '#E2E8F0',
  },
  splitActionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  splitActionBtnApprove: {
    backgroundColor: '#16A34A',
  },
  splitActionBtnClaim: {
    backgroundColor: '#2563EB',
  },
  splitActionBtnAssign: {
    backgroundColor: '#1D4ED8',
  },
  splitActionBtnReject: {
    backgroundColor: '#F97316',
  },
  splitActionBtnPressed: {
    opacity: 0.9,
  },
  splitActionBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
