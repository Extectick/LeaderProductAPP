import React, { useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { ThemeKey, gradientColors } from '../constants/Colors';
import { useTheme } from '../context/ThemeContext';

const ThemeSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, themes, setTheme } = useTheme();
  const themeTyped = theme as ThemeKey;
  const themeKeys = Object.keys(themes) as ThemeKey[];
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.spring(scaleAnim, { toValue: 0.9, useNativeDriver: true }).start(() => {
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }).start();
    });
    setIsOpen((prev) => !prev);
  };

  const handleThemeChange = (newTheme: ThemeKey) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  const renderSegmentedCircle = (colors: readonly string[], radius: number) => (
    <View
      style={{
        width: radius * 2,
        height: radius * 2,
        borderRadius: radius,
        backgroundColor: '#D1D5DB',
        padding: 2,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          flex: 1,
          borderRadius: radius,
          overflow: 'hidden',
        }}
      >
        {colors.map((color, index) => (
          <View
            key={index}
            style={{
              backgroundColor: color,
              flex: 1,
              borderTopLeftRadius: index === 0 ? radius : 0,
              borderBottomLeftRadius: index === 0 ? radius : 0,
              borderTopRightRadius: index === colors.length - 1 ? radius : 0,
              borderBottomRightRadius: index === colors.length - 1 ? radius : 0,
            }}
          />
        ))}
      </View>
    </View>
  );

  return (
    <>
      {/* Этот слой ловит клики вне ThemeSwitcher и закрывает его */}
      {isOpen && (
        <TouchableWithoutFeedback
          onPress={() => {
            Keyboard.dismiss();
            setIsOpen(false);
          }}
        >
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
      )}

      <View style={styles.container}>
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <TouchableOpacity onPress={handlePress} activeOpacity={0.8} style={styles.themeButton}>
            {renderSegmentedCircle(gradientColors[themeTyped], 20)}
          </TouchableOpacity>
        </Animated.View>

        {isOpen && (
          <View style={styles.dropdown}>
            {themeKeys.map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => handleThemeChange(t)}
                activeOpacity={0.8}
                style={{ marginVertical: 5 }}
              >
                <View style={styles.themeOption}>
                  {renderSegmentedCircle(gradientColors[t], 15)}
                  {t === themeTyped && <View style={styles.borderOverlay} />}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 100,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99,
  },
  themeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 5,
    borderWidth: 2,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#D1D5DB',
  },
  themeOption: {
    width: 30,
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  borderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 15,
  },
  dropdown: {
    position: 'absolute',
    top: 50,
    right: 0,
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 10,
    elevation: 5,
  },
});

export default ThemeSwitcher;
