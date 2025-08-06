import { Ionicons } from '@expo/vector-icons';

export interface ActionSheetButton {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

export interface ActionSheetProps {
  visible: boolean;
  buttons: ActionSheetButton[];
  onClose: () => void;
}
