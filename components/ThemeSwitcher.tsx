import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const ThemeSwitcher = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, themes, setTheme } = useTheme();
  const themeKeys = Object.keys(themes);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleBackdropPress = () => {
    setIsOpen(false);
  };

  const handlePress = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.9,
      useNativeDriver: true,
    }).start(() => {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    });
    setIsOpen(!isOpen);
  };

  const handleThemeChange = (newTheme: string) => {
    setTheme(newTheme);
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      {isOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleBackdropPress}
        />
      )}
      
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        <TouchableOpacity
          style={[
            styles.themeButton,
            { backgroundColor: themes[theme].button }
          ]}
          onPress={handlePress}
        />
      </Animated.View>

      {isOpen && (
        <View style={styles.dropdown}>
          {themeKeys.map((t) => (
            <TouchableOpacity
              key={t}
              style={[
                styles.themeOption,
                { backgroundColor: themes[t].button }
              ]}
              onPress={() => handleThemeChange(t)}
            />
          ))}
        </View>
      )}
    </View>
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
    position: 'absolute',
    top: -50,
    left: -20,
    right: -20,
    bottom: -50,
    backgroundColor: 'transparent'
  },
  themeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    elevation: 5,
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
  themeOption: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginVertical: 5,
  },
});

export default ThemeSwitcher;
