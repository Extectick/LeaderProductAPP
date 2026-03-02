import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { trackingStyles as styles } from '../styles';

type ModalVariant = 'default' | 'fullscreen';

type Props = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  compact?: boolean;
  variant?: ModalVariant;
  bodyScroll?: boolean;
  bodyStyle?: StyleProp<ViewStyle>;
};

export default function TrackingModalShell({
  visible,
  title,
  onClose,
  children,
  footer,
  compact = false,
  variant = 'default',
  bodyScroll = false,
  bodyStyle,
}: Props) {
  const { width } = useWindowDimensions();
  const compactViewport = width < 860;
  const tinyViewport = width < 620;
  const suppressNextBackdropCloseRef = React.useRef(false);

  const markModalInteractionStart = React.useCallback(() => {
    suppressNextBackdropCloseRef.current = true;
  }, []);

  const markModalInteractionEnd = React.useCallback(() => {
    suppressNextBackdropCloseRef.current = false;
  }, []);

  const handleBackdropPress = React.useCallback(() => {
    if (suppressNextBackdropCloseRef.current) {
      suppressNextBackdropCloseRef.current = false;
      return;
    }
    onClose();
  }, [onClose]);

  const modalContentGuardProps =
    Platform.OS === 'web'
      ? ({
          onMouseDownCapture: markModalInteractionStart,
          onMouseDown: markModalInteractionStart,
          onTouchStart: markModalInteractionStart,
          onMouseUp: markModalInteractionEnd,
          onTouchEnd: markModalInteractionEnd,
          onClick: (event: any) => {
            event.stopPropagation?.();
            markModalInteractionEnd();
          },
          onStartShouldSetResponderCapture: () => {
            markModalInteractionStart();
            return false;
          },
        } as any)
      : ({
          onTouchStart: markModalInteractionStart,
          onTouchEnd: markModalInteractionEnd,
          onStartShouldSetResponderCapture: () => {
            markModalInteractionStart();
            return false;
          },
        } as any);

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={handleBackdropPress}>
        <Pressable
          style={[
            styles.modalCard,
            compact && styles.modalCardCompact,
            compactViewport && styles.modalCardResponsive,
            tinyViewport && styles.modalCardTiny,
            variant === 'fullscreen' && styles.modalCardFullscreen,
            styles.webDefaultCursor,
          ]}
          onPress={(event) => event.stopPropagation()}
          {...modalContentGuardProps}
        >
          <View style={[styles.modalHeader, tinyViewport && styles.modalHeaderCompact]}>
            <Text style={styles.modalTitle}>{title}</Text>
            <Pressable
              style={(state: any) => [
                styles.modalCloseBtn,
                state?.hovered && styles.modalCloseBtnHover,
                state?.pressed && styles.modalCloseBtnPressed,
              ]}
              onPress={onClose}
            >
              <Ionicons name="close" size={18} color="#0F172A" />
            </Pressable>
          </View>

          {bodyScroll ? (
            <ScrollView
              style={styles.modalBodyScroll}
              contentContainerStyle={[styles.modalBody, tinyViewport && styles.modalBodyCompact, bodyStyle]}
            >
              {children}
            </ScrollView>
          ) : (
            <View style={[styles.modalBody, tinyViewport && styles.modalBodyCompact, bodyStyle]}>
              {children}
            </View>
          )}

          {footer ? (
            <View style={[styles.modalFooter, tinyViewport && styles.modalFooterCompact]}>{footer}</View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
