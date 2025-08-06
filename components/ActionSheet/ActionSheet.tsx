import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
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
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 300,
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
              <Pressable
                key={index}
                style={({ pressed }) => [
                  styles.button,
                  button.destructive && styles.destructiveButton,
                  pressed && styles.pressedButton
                ]}
                onPress={() => {
                  button.onPress();
                  onClose();
                }}
              >
                {button.icon && (
                  <Ionicons 
                    name={button.icon} 
                    size={24} 
                    color={button.destructive ? '#FF3B30' : '#007AFF'} 
                    style={styles.icon}
                  />
                )}
                <Text style={[
                  styles.buttonText,
                  button.destructive && styles.destructiveText
                ]}>
                  {button.title}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.pressedButton
              ]}
              onPress={onClose}
            >
              <Text style={styles.cancelText}>Отмена</Text>
            </Pressable>
          </Animated.View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
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
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  container: {
    backgroundColor: 'white',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: 16,
    paddingBottom: Platform.select({ ios: 32, android: 16 }),
    marginBottom: Platform.select({ ios: 0, android: 8 }),
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  pressedButton: {
    opacity: 0.7,
  },
  destructiveButton: {
    borderBottomWidth: 0,
  },
  buttonText: {
    fontSize: 18,
    color: '#000',
  },
  destructiveText: {
    color: '#FF3B30',
  },
  icon: {
    marginRight: 12,
  },
  cancelButton: {
    marginTop: 8,
    padding: 16,
    backgroundColor: '#f0f0f0',
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 18,
    fontWeight: '600',
  },
});

export default ActionSheet;
