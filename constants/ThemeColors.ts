type Theme = {
  button: string;
  shadow: string;
  background: string;
  text: string;
  inputBackground: string;
  inputBorder: string;
};

type ThemeColors = {
  light: Theme;
  dark: Theme;
  orange: Theme;
};

export const themeColors: ThemeColors = {
  light: {
    button: '#5a67d8',
    shadow: '#000',
    background: '#ffffff',
    text: '#000000',
    inputBackground: '#f7fafc',
    inputBorder: '#e2e8f0'
  },
  dark: {
    button: '#4c51bf',
    shadow: '#fff',
    background: '#1a202c',
    text: '#ffffff',
    inputBackground: '#2d3748',
    inputBorder: '#4a5568'
  },
  orange: {
    button: '#dd6b20',
    shadow: '#000',
    background: '#fffaf0',
    text: '#2d3748',
    inputBackground: '#feebc8',
    inputBorder: '#fbd38d'
  }
};
