import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type FlatListProps, type ScrollViewProps } from 'react-native';
import { AuthContext } from '@/context/AuthContext';
import { ProfileView } from '@/components/Profile/ProfileView';
import { loadEntityCard, entityIdentity, type EntityCardResult } from './entityApi';
import { EntityCardError, type EntityTarget } from './entityTypes';
import { ClientOrderEntityCard, GenericEntityCard, ProductEntityCard, type EntityDataCardProps } from './cards/EntityDataCard';
import { useEntityColors } from './cards/EntityFields';

/** Register one renderer to extend the presentation; unknown object kinds use the generic contract. */
export const entityCardRegistry: Readonly<Record<'product' | 'client-order' | 'generic', React.ComponentType<EntityDataCardProps>>> = {
  product: ProductEntityCard, 'client-order': ClientOrderEntityCard, generic: GenericEntityCard,
};

export type EntityCardContentProps = {
  target: EntityTarget;
  onOpen: (target: EntityTarget, label: string) => void;
  onTitleChange?: (title: string) => void;
  onConnect?: (baseKey: string) => void;
  ScrollComponent?: React.ComponentType<ScrollViewProps>;
  ListComponent?: React.ComponentType<FlatListProps<any>>;
  scrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
  contentTopInset?: number;
};
type State = { scope: string; result?: EntityCardResult; error?: EntityCardError; loading?: boolean };

/** The caller owns the sheet, gesture coordinator and navigation history. This component owns only card data. */
export function EntityCardContent({ target, onOpen, onTitleChange, onConnect, ScrollComponent = ScrollView,ListComponent,
  scrollOffset = 0, onScrollOffsetChange, contentTopInset = 0 }: EntityCardContentProps) {
  const auth = React.useContext(AuthContext), userId = auth?.isAuthenticated ? auth.profile?.id : undefined;
  const colors = useEntityColors();
  let targetKey: string;
  try { targetKey = entityIdentity(target); } catch { targetKey = 'invalid'; }
  const scope = JSON.stringify([userId ?? null, targetKey]);
  const [state, setState] = React.useState<State>({ scope: '' });
  const [attempt, retry] = React.useReducer((value: number) => value + 1, 0);
  const [rowRequest, setRowRequest] = React.useState({ scope: '', limit: 100 });
  const rowsLimit = rowRequest.scope === scope ? rowRequest.limit : 100;
  const titleCallback = React.useRef(onTitleChange);
  titleCallback.current = onTitleChange;
  React.useEffect(() => {
    const controller = new AbortController();
    setState(current => ({ scope, loading: true, ...(current.scope === scope ? { result: current.result } : {}) }));
    void (async () => {
      try {
        const result = await loadEntityCard(target, userId ?? 0, controller.signal, { maxTabularRows: rowsLimit });
        if (controller.signal.aborted) return;
        setState({ scope, result });
        const title = result.kind==='stock-product'?result.product.name:result.kind === 'entity' ? result.data.title : [result.profile.lastName, result.profile.firstName, result.profile.middleName].filter(Boolean).join(' ') || 'Профиль';
        titleCallback.current?.(title);
      } catch (error) {
        if (controller.signal.aborted) return;
        const failure = error instanceof EntityCardError ? error : new EntityCardError('unavailable', 'ENTITY_REQUEST_FAILED', 'Не удалось загрузить карточку. Повторите попытку.');
        setState(current => ({ scope, error: failure, ...(failure.kind === 'unavailable' && current.scope === scope ? { result: current.result } : {}) }));
      }
    })();
    return () => controller.abort();
    // Object identity is derived from validated fields, not the caller's transient object allocation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, attempt, rowsLimit]);

  const current = state.scope === scope ? state : undefined;
  if (!current?.result && !current?.error) return <View testID="entity-card-loading" style={[styles.center,{paddingTop:28+contentTopInset}]} accessibilityLiveRegion="polite">
    <ActivityIndicator color={colors.tint} /><Text style={{ color: colors.secondaryText }}>Загружаю карточку…</Text>
  </View>;
  if (current.error && !current.result) {
    const error = current.error;
    return <View testID={`entity-card-error-${error.kind}`} style={[styles.center,{paddingTop:28+contentTopInset}]} accessibilityLiveRegion="polite">
      <Text style={[styles.errorText, { color: colors.text }]}>{error.message}</Text>
      {error.kind === 'connect' && target.source === 'onec' && onConnect ? <Pressable accessibilityRole="button" onPress={() => onConnect(target.baseKey)} style={[styles.button, { backgroundColor: colors.tint }]}>
        <Text style={[styles.buttonText, { color: colors.buttonText }]}>Подключить 1С</Text>
      </Pressable> : null}
      {['connect', 'unavailable', 'denied', 'not-found'].includes(error.kind) ? <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}>
        <Text style={{ color: colors.tint, fontSize: 15 }}>Повторить</Text>
      </Pressable> : null}
    </View>;
  }
  const result = current.result!;
  if(result.kind==='stock-product'){
    // Defer the stock pager/gallery module graph until an app product is opened.
    const {StockEntityCard}=require('./StockEntityCard') as typeof import('./StockEntityCard');
    return <StockEntityCard product={result.product} userId={userId!} ListComponent={ListComponent} contentTopInset={contentTopInset} scrollOffset={scrollOffset} onScrollOffsetChange={onScrollOffsetChange}/>;
  }
  const Renderer = result.kind === 'entity' && result.data.view !== 'user' ? entityCardRegistry[result.data.view] : GenericEntityCard;
  const canShowMore = result.kind === 'entity' && result.data.tables.some(table => table.truncated) && rowsLimit < 1000;
  return <ScrollComponent testID="entity-card-scroll" style={styles.scroll} contentContainerStyle={[styles.content,{paddingTop:18+contentTopInset}]}
    keyboardShouldPersistTaps="handled" scrollEventThrottle={16} showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} contentOffset={{ x: 0, y: Math.max(0, scrollOffset) }}
    onScroll={event => { const y = event.nativeEvent.contentOffset.y; if (Number.isFinite(y)) onScrollOffsetChange?.(Math.max(0, y)); }}>
    {result.kind === 'profile' ? <ProfileView userId={result.profile.id} profileOverride={result.profile} disableAppearAnimation />
      : <Renderer data={result.data} onOpen={onOpen} />}
    {current.error ? <View testID="entity-card-refresh-error" style={styles.more} accessibilityLiveRegion="polite">
      <Text style={[styles.errorText, { color: colors.secondaryText }]}>{current.error.message}</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={styles.retry}><Text style={{color:colors.tint}}>Повторить</Text></Pressable>
    </View> : null}
    {canShowMore ? <View style={styles.more}><Pressable testID="entity-card-show-more" accessibilityRole="button" accessibilityState={{disabled:!!current.loading,busy:!!current.loading}}
      disabled={current.loading} onPress={() => setRowRequest({scope,limit:rowsLimit < 250 ? 250 : 1000})} style={[styles.button, {borderColor:colors.inputBorder,borderWidth:StyleSheet.hairlineWidth}]}>
      <Text style={{color:colors.tint,fontSize:15}}>{current.loading ? 'Загружаю строки…' : 'Показать больше строк'}</Text>
    </Pressable></View> : null}
  </ScrollComponent>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 }, content: { padding: 18, paddingBottom: 32, flexGrow: 1 },
  center: { flex: 1, padding: 28, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 16 },
  errorText: { fontSize: 15, lineHeight: 22, textAlign: 'center' }, button: { minHeight: 44, borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' }, retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18 },
  more: { alignItems: 'center', marginTop: 18, gap: 6 },
});
