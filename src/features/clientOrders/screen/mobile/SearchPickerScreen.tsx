import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import {
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type FlatListProps,
  type LayoutChangeEvent,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Searchbar, Surface, Text } from 'react-native-paper';

import { getClientOrdersSearchTextInputProps } from '../../lib/clientOrdersSearchInput';

export type SearchPickerFilter = {
  key: string;
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  icon?: string;
  selectedIcon?: string;
  disabled?: boolean;
  tone?: 'primary' | 'success';
};

export type SearchPickerScreenProps<T> = {
  visible: boolean;
  pickerKey: string;
  topInset: number;
  title: string;
  titleIcon: string;
  onClose: () => void | false;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchAccessibilityLabel?: string;
  searchInputRef?: React.Ref<any>;
  searchInputProps?: TextInputProps;
  autoFocus?: boolean;
  searchLoading?: boolean;
  debounceMs?: number;
  filters?: SearchPickerFilter[];
  data: readonly T[];
  renderItem: ListRenderItem<T>;
  keyExtractor: (item: T, index: number) => string;
  listRef?: React.Ref<any>;
  listStyle?: StyleProp<ViewStyle>;
  listProps?: Omit<FlatListProps<T>, 'data' | 'renderItem' | 'keyExtractor'>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraData?: FlatListProps<T>['extraData'];
  ListHeaderComponent?: FlatListProps<T>['ListHeaderComponent'];
  ListEmptyComponent?: FlatListProps<T>['ListEmptyComponent'];
  ListFooterComponent?: FlatListProps<T>['ListFooterComponent'];
  onScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onMomentumScrollEnd?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onLayout?: (event: LayoutChangeEvent) => void;
  onContentSizeChange?: (width: number, height: number) => void;
  onEndReached?: () => void;
  onScrollBeginDrag?: () => void;
  onEndReachedThreshold?: number;
  footer?: React.ReactNode;
};

const DEFAULT_SEARCH_INPUT_PROPS = getClientOrdersSearchTextInputProps(Platform.OS);

export function SearchPickerScreen<T>({
  visible,
  pickerKey,
  topInset,
  title,
  titleIcon,
  onClose,
  search,
  onSearchChange,
  searchPlaceholder = 'Поиск',
  searchAccessibilityLabel,
  searchInputRef,
  searchInputProps,
  autoFocus,
  searchLoading = false,
  debounceMs = 280,
  filters = [],
  data,
  renderItem,
  keyExtractor,
  listRef,
  listStyle,
  listProps,
  contentContainerStyle,
  extraData,
  ListHeaderComponent,
  ListEmptyComponent,
  ListFooterComponent,
  onScroll,
  onMomentumScrollEnd,
  onLayout,
  onContentSizeChange,
  onEndReached,
  onScrollBeginDrag,
  onEndReachedThreshold = 0.8,
  footer,
}: SearchPickerScreenProps<T>) {
  const { width: windowWidth } = useWindowDimensions();
  const [inputValue, setInputValue] = React.useState(search);
  const searchbarRef = React.useRef<any>(null);
  const wasVisibleRef = React.useRef(false);
  const lastPickerKeyRef = React.useRef(pickerKey);
  const skipNextDebounceRef = React.useRef(false);

  React.useEffect(() => {
    const opened = visible && !wasVisibleRef.current;
    const pickerChanged = pickerKey !== lastPickerKeyRef.current;
    if (visible && (opened || pickerChanged)) {
      skipNextDebounceRef.current = true;
      setInputValue(search);
    }
    wasVisibleRef.current = visible;
    lastPickerKeyRef.current = pickerKey;
  }, [pickerKey, search, visible]);

  const dismissSearchKeyboard = React.useCallback(() => {
    searchbarRef.current?.blur?.();
    Keyboard.dismiss();
  }, []);

  const assignSearchInputRef = React.useCallback((value: any) => {
    searchbarRef.current = value;
    if (!searchInputRef) return;
    if (typeof searchInputRef === 'function') {
      searchInputRef(value);
      return;
    }
    try {
      (searchInputRef as React.MutableRefObject<any>).current = value;
    } catch {
      // Keep the picker usable when a consumer passes a read-only ref wrapper.
    }
  }, [searchInputRef]);

  const handleClose = React.useCallback(() => {
    dismissSearchKeyboard();
    return onClose();
  }, [dismissSearchKeyboard, onClose]);

  React.useEffect(() => {
    if (visible) return undefined;
    dismissSearchKeyboard();
    return undefined;
  }, [dismissSearchKeyboard, visible]);

  React.useEffect(() => () => {
    searchbarRef.current?.blur?.();
    Keyboard.dismiss();
  }, []);

  React.useEffect(() => {
    if (!visible) return undefined;
    if (skipNextDebounceRef.current) {
      skipNextDebounceRef.current = false;
      return undefined;
    }
    if (inputValue === search) return undefined;
    const timeout = setTimeout(() => onSearchChange(inputValue), Math.max(0, debounceMs));
    return () => clearTimeout(timeout);
  }, [debounceMs, inputValue, onSearchChange, search, visible]);

  const commitSearchImmediately = React.useCallback((value: string) => {
    skipNextDebounceRef.current = true;
    setInputValue(value);
    onSearchChange(value);
  }, [onSearchChange]);

  const resolvedInputProps = {
    ...DEFAULT_SEARCH_INPUT_PROPS,
    ...searchInputProps,
  };
  const showFilterLabels = filters.length === 1 && windowWidth >= 350;

  if (!visible) return null;

  return (
    <View style={styles.root}>
      <Surface
        mode="flat"
        style={[styles.header, { paddingTop: Math.max(topInset, 10) + 8 }]}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleContent}>
            <MaterialCommunityIcons name={titleIcon as any} size={21} color="#2563EB" />
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
          <View style={styles.titleActions}>
            {filters.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                style={styles.headerFiltersScroll}
                contentContainerStyle={styles.headerFiltersContent}
              >
                {filters.map((filter) => {
                  const success = filter.tone === 'success';
                  const selectedColor = success ? '#15803D' : '#1D4ED8';
                  const icon = filter.selected
                    ? (filter.selectedIcon || (success ? 'package-variant-closed-check' : 'account-star'))
                    : (filter.icon || (success ? 'package-variant-closed' : 'account-star-outline'));
                  return (
                    <Pressable
                      key={filter.key}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: filter.selected, disabled: !!filter.disabled }}
                      accessibilityLabel={filter.accessibilityLabel || filter.label}
                      disabled={filter.disabled}
                      hitSlop={{ top: 8, bottom: 8, left: 3, right: 3 }}
                      onPress={filter.onPress}
                      style={({ pressed }) => [
                        styles.filterChip,
                        !showFilterLabels && styles.filterChipIconOnly,
                        filter.selected && (success ? styles.filterChipSuccess : styles.filterChipSelected),
                        filter.disabled && styles.disabled,
                        pressed && !filter.disabled && styles.pressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={icon as any}
                        size={16}
                        color={filter.selected ? selectedColor : '#64748B'}
                      />
                      {showFilterLabels ? (
                        <Text
                          style={[
                            styles.filterLabel,
                            filter.selected && { color: selectedColor },
                          ]}
                          numberOfLines={1}
                        >
                          {filter.label}
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Закрыть ${title.toLocaleLowerCase('ru')}`}
              hitSlop={4}
              onPress={handleClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="close" size={22} color="#0F172A" />
            </Pressable>
          </View>
        </View>

        <Searchbar
          ref={assignSearchInputRef}
          mode="bar"
          value={inputValue}
          onChangeText={setInputValue}
          onClearIconPress={() => commitSearchImmediately('')}
          onSubmitEditing={() => commitSearchImmediately(inputValue)}
          placeholder={searchPlaceholder}
          searchAccessibilityLabel={searchAccessibilityLabel || searchPlaceholder}
          clearAccessibilityLabel="Очистить поиск"
          loading={searchLoading}
          elevation={0}
          autoFocus={autoFocus}
          style={styles.search}
          inputStyle={styles.searchInput}
          iconColor="#475569"
          placeholderTextColor="#64748B"
          testID={`search-picker-${pickerKey}-input`}
          {...resolvedInputProps}
        />

      </Surface>

      <FlatList
        ref={listRef}
        {...listProps}
        style={[styles.list, listStyle]}
        contentContainerStyle={contentContainerStyle}
        data={data as T[]}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={extraData}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        onEndReached={onEndReached}
        onScrollBeginDrag={onScrollBeginDrag}
        onEndReachedThreshold={onEndReachedThreshold}
      />

      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 380,
    elevation: 380,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  titleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleContent: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  titleActions: {
    maxWidth: '55%',
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  title: {
    flex: 1,
    color: '#0F172A',
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '900',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  search: {
    width: '100%',
    height: 42,
    minHeight: 42,
    maxHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
  },
  searchInput: {
    height: 40,
    minHeight: 0,
    maxHeight: 40,
    paddingVertical: 0,
    marginVertical: 0,
    fontSize: 17,
    lineHeight: 20,
    fontWeight: '700',
    color: '#0F172A',
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  headerFiltersScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  headerFiltersContent: {
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  filterChip: {
    height: 28,
    maxWidth: 132,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  filterChipIconOnly: {
    width: 28,
    paddingHorizontal: 0,
    justifyContent: 'center',
  },
  filterChipSelected: {
    borderColor: '#93C5FD',
    backgroundColor: '#EFF6FF',
  },
  filterChipSuccess: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  filterLabel: {
    flexShrink: 1,
    color: '#475569',
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: '800',
    includeFontPadding: false,
  },
  list: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.48,
  },
});
