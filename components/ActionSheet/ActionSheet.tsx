import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { ActionSheetProps } from './types';

const ActionSheet: React.FC<ActionSheetProps> = ({ visible, buttons, onClose }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 1,
          bounciness: 6,
          speed: 12,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        })
      ]).start();
    }
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [300, 0]
  });

  if (!visible) return null;

  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.background, { opacity: fadeAnim }]} />

        <TouchableWithoutFeedback>
          <Animated.View
            style={[
              styles.container,
              { transform: [{ translateY }] }
            ]}
          >
            {buttons.map((button, index) => (
              <AnimatedButton
                key={index}
                title={button.title}
                icon={button.icon}
                destructive={button.destructive}
                onPress={() => {
                  button.onPress();
                  onClose();
                }}
              />
            ))}

            <AnimatedButton
              title="Отмена"
              onPress={onClose}
              cancel
            />
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
};

// Отдельный компонент кнопки с анимацией при нажатии
const AnimatedButton = ({ title, icon, destructive, cancel, onPress }: any) => {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 40,
      bounciness: 4
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }], marginTop: cancel ? 8 : 0 }}>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          destructive && styles.destructiveButton,
          cancel && styles.cancelButton,
          pressed && styles.pressedButton
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {icon && !cancel && (
          <Ionicons
            name={icon}
            size={24}
            color={destructive ? '#FF3B30' : '#007AFF'}
            style={styles.icon}
          />
        )}
        <Text
          style={[
            styles.buttonText,
            destructive && styles.destructiveText,
            cancel && styles.cancelText
          ]}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  container: {
    backgroundColor: 'transparent',
    padding: 16,
    paddingBottom: Platform.select({ ios: 32, android: 16 }),
    marginBottom: Platform.select({ ios: 0, android: 8 }),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'white',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  pressedButton: {
    backgroundColor: '#f7f7f7',
  },
  destructiveButton: {
    backgroundColor: '#fff5f5',
  },
  buttonText: {
    fontSize: 17,
    color: '#000',
    flex: 1,
    flexShrink: 1,
  },
  destructiveText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
  icon: {
    marginRight: 12,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  cancelText: {
    fontWeight: '600',
    fontSize: 17,
    color: '#007AFF',
  },
});

export default ActionSheet;
