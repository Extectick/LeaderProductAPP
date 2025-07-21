const tintColorLight = '#007AFF'; // более узнаваемый акцент (iOS-style)
const tintColorDark = '#0A84FF';  // яркий, но не слепящий оттенок

export const Colors = {
  light: {
    text: '#1C1C1E', // глубокий серо-чёрный
    background: '#F9FAFB', // лёгкий фон для лучшего контраста
    tint: tintColorLight,
    icon: '#6C757D', // приятный серый
    tabIconDefault: '#ADB5BD',
    tabIconSelected: tintColorLight,
    inputBackground: '#FFFFFF',
    inputBorder: '#CED4DA',
    button: '#007AFF',
    buttonText: '#FFFFFF',
    buttonDisabled: '#B0C4DE',
    secondaryText: '#5F6368',
    error: '#E53935',
    disabledText: '#AAB0B6',
    cardBackground: '#FFFFFF',
    placeholder: '#6B7280'
  },
  dark: {
    text: '#F4F4F5', // почти белый, не режет глаз
    background: '#0F0F11', // глубокий фоновый цвет (почти чёрный, но не полностью)
    tint: '#4F9CFF', // мягкий, приятный акцент
    icon: '#A1A1AA', // нейтрально-серый
    tabIconDefault: '#5E6470',
    tabIconSelected: '#4F9CFF',
    inputBackground: '#1A1A1E', // немного светлее основного фона
    inputBorder: '#2D2F34', // мягкая граница
    button: '#4F9CFF', // акцентная кнопка
    buttonText: '#FFFFFF',
    buttonDisabled: '#3A3F4B',
    secondaryText: '#8B8B92', // второстепенный текст
    error: '#FF5C5C', // мягкий красный
    disabledText: '#5B5B60',
    cardBackground: '#16171A', // карточки чуть светлее фона
    placeholder: '#A0AEC0'
  },
  orange: {
    text: '#2D2D2D',
    background: '#FFF4E6',
    tint: '#FF6B00',
    icon: '#FF6B00',
    tabIconDefault: '#FFB347',
    tabIconSelected: '#FF6B00',
    inputBackground: '#FFF0D9',
    inputBorder: '#FFB347',
    button: '#FF6B00',
    buttonText: '#FFFFFF',
    buttonDisabled: '#FFD8A8',
    secondaryText: '#A0612C',
    error: '#D32F2F',
    disabledText: '#C49A6C',
    cardBackground: '#FFE8CC',
    placeholder: '#4B5563'
  },
  leaderprod: {
    text: '#1C1C1C',              // основной текст
    background: '#F9FAF8',        // светлый общий фон
    tint: '#FFA000',              // акцент — оранжевый (как стрелка в лого)
    icon: '#5EBF4D',              // акцент — зелёный (как спираль в лого)
    tabIconDefault: '#A0A0A0',
    tabIconSelected: '#FFA000',
    inputBackground: '#FFFFFF',
    inputBorder: '#DADADA',
    button: '#FFA000',            // кнопка — насыщенно-оранжевая
    buttonText: '#FFFFFF',
    buttonDisabled: '#FFD580',    // светло-оранжевая
    secondaryText: '#4E5D52',     // серо-зелёный
    error: '#E53935',             // контрастный красный
    disabledText: '#B0B0B0',
    cardBackground: '#FFFFFF',    // формы, карточки
    placeholder: '#9CA3AF'        // серый плейсхолдер
  }
};
