import { Colors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

type ThemeColors = typeof Colors.light;

interface ThemeContextType {
  theme: string;
  themes: Record<string, ThemeColors>;
  setTheme: (theme: string) => Promise<void>;
  addTheme: (name: string, colors: ThemeColors) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  themes: Colors,
  setTheme: async () => {},
  addTheme: () => {}
});

export const ThemeProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [theme, setThemeState] = useState<string>('light');
  const [themes, setThemes]    = useState<Record<string, ThemeColors>>(Colors);


  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await AsyncStorage.getItem('@theme');
      if (savedTheme && themes[savedTheme]) {
        setThemeState(savedTheme);
      }
    };
    loadTheme();
  }, []);

  const setTheme = async (newTheme: string) => {
    if (themes[newTheme]) {
      setThemeState(newTheme);
      await AsyncStorage.setItem('@theme', newTheme);
    }
  };

  const addTheme = (name: string, colors: ThemeColors) => {
    setThemes(prev => ({
      ...prev,
      [name]: colors
    }));
  };

  return (
    <ThemeContext.Provider value={{ theme, themes, setTheme, addTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
