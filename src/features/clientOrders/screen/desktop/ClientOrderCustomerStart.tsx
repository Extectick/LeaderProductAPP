import React from 'react';
import {Alert, Box, Button, CircularProgress, MenuItem, Stack, TextField, Typography} from '@mui/material';
import type {ClientOrderCounterpartyOption, ClientOrderDeliveryAddressOption, ClientOrderOrganization} from '@/utils/clientOrdersService';
import {ScrollView, View, Text, Pressable, useWindowDimensions} from 'react-native';
import {useIsFocused} from 'expo-router/react-navigation';
import {AppListPanel,AppListPanelHeader,AppListPanelMenuButton,AppListPanelActionButton} from '@/components/ui/AppListPanel';
import {AppActionMenu,AppActionMenuItem} from '@/components/ui/AppActionMenu';
import {APP_LAYOUT} from '@/src/shared/layout/appLayout';
import {SendDeviceOrdersButton} from '../SendDeviceOrdersButton';
import {AppWorkspaceHeader} from '@/components/ui/AppWorkspaceHeader';
import {appWebControlProps} from '@/components/ui/appWebInteraction';
import {useCustomerDocuments} from './useCustomerDocuments';
import {ClientOrderCustomerDocuments} from './ClientOrderCustomerDocuments';
import type {ClientOrder} from '@/utils/clientOrdersService';
import {ClientOrderDeliveryPoints} from './ClientOrderDeliveryPoints';
import {ClientOrderOrganizationPicker} from './ClientOrderOrganizationPicker';
import {useAppSurfaceTheme} from '@/components/ui/appSurfaceTokens';

type Customer = ClientOrderCounterpartyOption;
type Point = ClientOrderDeliveryAddressOption;
type Pending = {phase: 'organization' | 'client' | 'point' | 'open'; customer: Customer; point: Point; organization: ClientOrderOrganization; account: unknown; id: number};
const addressText = (point?: Point | null) => point?.fullAddress || point?.address || point?.name || 'Точка доставки';
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Customer/point selection is local until New order passes the workspace discard guard. */
export function ClientOrderCustomerStart({workspace, onOpenOrder, onOrderContextMenu, desktop=false, active=true}: {workspace: any; onOpenOrder: (guid?: string) => void; onOrderContextMenu?: (order:ClientOrder,x:number,y:number)=>void; desktop?: boolean; active?:boolean}) {
  const colors = useAppSurfaceTheme(), routeFocused = useIsFocused(), window = useWindowDimensions();
  const focused=routeFocused&&active;
  const [tab,setTab]=React.useState<'documents'|'points'>('documents');
  const scrollRef = React.useRef<ScrollView>(null), menuButton = React.useRef<View>(null);
  const scrollId = `customer-list-${React.useId().replace(/:/g,'')}`;
  const [menuOpen,setMenuOpen] = React.useState(false);
  const [menuAnchor,setMenuAnchor] = React.useState({x:0,y:0,width:48,height:48});
  React.useEffect(()=>{if(!desktop||!focused)setMenuOpen(false);},[desktop,focused]);
  const openMenu = () => {menuButton.current?.measureInWindow((x,y,width,height)=>setMenuAnchor({x,y,width,height}));setMenuOpen(true);};
  const [query, setQuery] = React.useState('');
  const [customer, setCustomer] = React.useState<Customer | null>(null);
  const [point, setPoint] = React.useState<Point | null>(null);
  const [pointQuery, setPointQuery] = React.useState('');
  const [organizationGuid, setOrganizationGuid] = React.useState('');
  const [customers, setCustomers] = React.useState<Customer[]>([]);
  const [points, setPoints] = React.useState<Point[]>([]);
  const [customerMore, setCustomerMore] = React.useState(false);
  const [pointMore, setPointMore] = React.useState(false);
  const [customerOffset, setCustomerOffset] = React.useState(0);
  const [pointOffset, setPointOffset] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [loadingPoints, setLoadingPoints] = React.useState(false);
  const [error, setError] = React.useState('');
  const [customerError,setCustomerError] = React.useState('');
  const [pointError,setPointError] = React.useState('');
  const [pointRetry,setPointRetry] = React.useState(0);
  const [retry, setRetry] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const current = React.useRef(workspace); current.current = workspace;
  const mounted = React.useRef(true);
  const operation = React.useRef(0);
  const startedPhase = React.useRef('');
  const customerRequest = React.useRef(0), pointRequest = React.useRef(0);
  const account = workspace.offlineUserId;
  const organizations: ClientOrderOrganization[] = workspace.settings?.organizations || [];
  const organization = organizations.find(x => x.guid === organizationGuid)
    || workspace.settings?.preferredOrganization || organizations[0] || workspace.selections?.organization;
  const documents=useCustomerDocuments({workspace,customerGuid:customer?.guid,organizationGuid:organization?.guid,enabled:desktop&&focused});
  const customerPageSize = desktop ? 60 : 30;
  const searchScope = `${account || ''}:${organization?.guid || ''}:${query.trim()}`;
  const pointScope = `${account || ''}:${organization?.guid || ''}:${customer?.guid || ''}:${pointQuery.trim()}`;
  const latestSearchScope = React.useRef(searchScope); latestSearchScope.current = searchScope;
  const latestPointScope = React.useRef(pointScope); latestPointScope.current = pointScope;
  const locked = busy || !!workspace.mutationLocked || !!workspace.loadingDetail;
  React.useEffect(() => { mounted.current = true; return () => {mounted.current = false; operation.current++;}; }, []);
  React.useEffect(() => {
    operation.current++; setPending(null); setBusy(false); setCustomer(null); setPoint(null);
    setQuery(''); setPointQuery(''); setOrganizationGuid(''); setError('');setTab('documents');
  }, [account]);
  React.useEffect(() => {setCustomerOffset(0); setCustomers([]); setCustomerMore(false);}, [searchScope]);
  React.useEffect(() => {setPoint(null); setPoints([]); setPointOffset(0); setPointMore(false);}, [pointScope]);

  React.useEffect(() => {
    const id = ++customerRequest.current, scope = searchScope;
    setLoading(true); setCustomerError('');
    const timer = setTimeout(() => {
      Promise.resolve().then(() => current.current.searchCounterparties({search: query.trim(), organizationGuid: organization?.guid,
        limit: customerPageSize, offset: customerOffset, includeInactive: false})).then(result => {
        if (!mounted.current || id !== customerRequest.current || scope !== latestSearchScope.current) return;
        const rows: Customer[] = result?.items || [];
        setCustomers(previous => customerOffset ? [...new Map([...previous, ...rows].map(x => [x.guid, x])).values()] : rows);
        setCustomerMore(rows.length>0&&(result?.meta?.total != null ? customerOffset + rows.length < result.meta.total : rows.length === customerPageSize));
        setLoading(false);
      }, () => {if (mounted.current && id === customerRequest.current && scope === latestSearchScope.current) {setCustomerError('Не удалось загрузить клиентов'); setLoading(false);}});
    }, desktop && customerOffset > 0 ? 0 : 180);
    return () => {clearTimeout(timer); customerRequest.current++;};
  }, [searchScope, customerOffset, retry, customerPageSize, desktop]);

  React.useEffect(() => {
    const id = ++pointRequest.current, scope = pointScope;
    setPointError('');
    if (!customer?.guid || !organization?.guid) {setLoadingPoints(false); return;}
    setLoadingPoints(true);
    const timer = setTimeout(() => {
      Promise.resolve().then(() => current.current.searchDeliveryAddresses({counterpartyGuid: customer.guid, organizationGuid: organization.guid,
        search: pointQuery.trim(), limit: 30, offset: pointOffset, includeInactive: false})).then(result => {
        if (!mounted.current || id !== pointRequest.current || scope !== latestPointScope.current) return;
        const rows: Point[] = (result?.items || []).filter((x: Point) => x.guid && (!x.counterpartyGuid || same(x.counterpartyGuid, customer.guid)));
        setPoints(previous => pointOffset ? [...new Map([...previous, ...rows].map(x => [x.guid, x])).values()] : rows);
        setPointMore(rows.length>0&&(result?.meta?.total != null ? pointOffset + rows.length < result.meta.total : rows.length === 30));
        setLoadingPoints(false);
      }, () => {if (mounted.current && id === pointRequest.current && scope === latestPointScope.current) {setPointError('Не удалось загрузить точки доставки'); setLoadingPoints(false);}});
    }, 180);
    return () => {clearTimeout(timer); pointRequest.current++;};
  }, [pointScope, pointOffset, retry, pointRetry]);

  const validOperation = (p: Pending) => mounted.current && operation.current === p.id && current.current.offlineUserId === p.account;
  React.useEffect(() => {
    if (!pending || !validOperation(pending)) return;
    const w = current.current;
    const phaseKey = `${pending.id}:${pending.phase}`;
    if (startedPhase.current === phaseKey) return;
    if (pending.phase === 'point' && w.loadingDefaults) return;
    if (pending.phase === 'open' && !same(w.draft.deliveryAddressGuid, pending.point.guid)) return;
    startedPhase.current = phaseKey;
    const advance = (phase: Pending['phase']) => {if (validOperation(pending)) setPending({...pending, phase});};
    const fail = () => {if (validOperation(pending)) {setPending(null); setBusy(false); setError('Не удалось подготовить заказ. Повторите выбор.');}};
    if (pending.phase === 'organization') {
      if (w.draft.organizationGuid === pending.organization.guid) advance('client');
      else Promise.resolve(w.setOrganization(pending.organization)).then(() => advance('client'), fail);
    } else if (pending.phase === 'client') {
      Promise.resolve(w.setCounterparty(pending.customer)).then(() => advance('point'), fail);
    } else if (pending.phase === 'point') {
      if (w.loadingDefaults) return;
      if (!same(w.draft.counterpartyGuid, pending.customer.guid) || !same(w.draft.organizationGuid, pending.organization.guid)) {fail(); return;}
      w.setDeliveryAddress(pending.point); advance('open');
    } else if (same(w.draft.deliveryAddressGuid, pending.point.guid)) {
      setPending(null); setBusy(false); onOpenOrder();
    }
  }, [pending, workspace.loadingDefaults, workspace.draft.organizationGuid, workspace.draft.counterpartyGuid, workspace.draft.deliveryAddressGuid]);

  const create = async () => {
    if (locked || !customer || !point?.guid || !organization?.guid) return;
    const chosen: Pending = {phase: 'organization', customer, point, organization, account, id: ++operation.current};
    setBusy(true); setError('');
    try {
      const created = await current.current.createDocument();
      if (!validOperation(chosen)) return;
      if (!created) {setBusy(false); return;}
      // A separate render is essential: createDocument resets the preferred organization.
      setPending(chosen);
    } catch {if (validOperation(chosen)) {setBusy(false); setError('Не удалось создать заказ');}}
  };
  const resume = async (guid?: string) => {
    if (locked) return;
    const id = ++operation.current, selectedAccount = account;
    setBusy(true); setError('');
    try {
      const opened = !guid || guid === current.current.selectedGuid || await current.current.selectOrder(guid);
      if (mounted.current && operation.current === id && selectedAccount === current.current.offlineUserId && opened) onOpenOrder(guid);
    } catch {if (mounted.current && operation.current === id) setError('Не удалось открыть черновик');}
    finally {if (mounted.current && operation.current === id) setBusy(false);}
  };

  const orders: any[] = workspace.allOrders || workspace.orders || [];
  const localAddressMatches = query.trim() ? orders.filter(order => order.counterparty?.guid
    && addressText(order.deliveryAddress).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) : [];
  const shownCustomers = [...new Map([...customers, ...localAddressMatches.map(order => order.counterparty)].map(x => [x.guid, x])).values()];
  const matchingDrafts = point?.guid && customer ? orders.filter(order => !order.readOnly && order.status === 'DRAFT'
    && !['QUEUED', 'SYNCED', 'SENT_TO_1C'].includes(order.syncState)
    && same(order.counterparty?.guid, customer.guid) && same(order.deliveryAddress?.guid, point.guid)
    && same(order.organization?.guid, organization?.guid)) : [];
  const currentMatches = !workspace.readOnly && workspace.draftMode && point?.guid && customer
    && same(workspace.draft.counterpartyGuid, customer.guid) && same(workspace.draft.deliveryAddressGuid, point.guid)
    && same(workspace.draft.organizationGuid, organization?.guid);
  const rowSx = {width:'100%',display:'block',textAlign:'left',px:desktop?2:1.5,py:1.5,border:0,
    minHeight:desktop?76:undefined,borderBottom:desktop?0:'1px solid var(--co-line)',borderRadius:0,
    color:'var(--co-text)',cursor:'pointer','&:hover':{bgcolor:'var(--co-soft)'},
    '&:focus-visible':{outline:'2px solid var(--co-accent)',outlineOffset:-2}} as const;
  const changeQuery = (value:string) => {setQuery(value);setCustomer(null);setPointQuery('');setPoint(null);};
  const changeOrganization = (guid:string) => {setOrganizationGuid(guid);setCustomer(null);setPoint(null);setTab('documents');};
  const organizationControl = desktop ? <ClientOrderOrganizationPicker organizations={organizations} value={organization} disabled={locked||!focused} onChange={changeOrganization}/> : organizations.length>1 ? <TextField select size="small" label="Организация" value={organization?.guid||''} disabled={locked}
    onChange={event=>changeOrganization(event.target.value)} sx={{minWidth:190,maxWidth:300}}>
    {organizations.map(item=><MenuItem key={item.guid} value={item.guid}>{item.name}</MenuItem>)}
  </TextField> : null;
  const displayedError=error||(!desktop?customerError||pointError:'');
  const errorNotice = displayedError ? <Alert severity="warning" action={<Button disabled={locked} onClick={()=>setRetry(x=>x+1)}>Повторить</Button>}>{displayedError}</Alert> : null;
  const customerRows = <>
        {shownCustomers.map(item => {
          const addressMatch = localAddressMatches.find(order => same(order.counterparty.guid, item.guid));
          return <Box component="button" key={item.guid} disabled={locked} aria-pressed={customer?.guid === item.guid}
            onClick={() => {setCustomer(item); setPointQuery(''); setPoint(null); setError('');setTab('documents');}}
            title={item.name}
            sx={{...rowSx, ...(desktop?{minHeight:48}:{}), bgcolor: customer?.guid === item.guid ? 'var(--co-soft)' : 'transparent'}}>
            <Typography component="div" sx={{fontWeight:600,fontSize:15,lineHeight:'22px',...(desktop?{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}:{})}}>{item.name}</Typography>
            {!desktop&&<Typography component="div" sx={{fontSize:desktop?13:12,color:'var(--co-muted)',mt:.25,...(desktop?{lineHeight:'20px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}:{})}}>{addressMatch ? `${addressText(addressMatch.deliveryAddress)} · из журнала` : item.inn ? `ИНН ${item.inn}` : item.fullName || ''}</Typography>}
          </Box>;
        })}
        {!desktop&&(loading ? <CircularProgress size={20} sx={{m: 2}} /> : !shownCustomers.length ? <Typography sx={{py: 2, color: 'var(--co-muted)'}}>Клиенты не найдены</Typography> : null)}
        {!desktop&&customerMore ? <Button disabled={loading || locked} onClick={() => setCustomerOffset(customers.length)}>Показать ещё</Button> : null}
  </>;
  const orderActions = <Stack direction="row" spacing={1} sx={{pt: 2, flexWrap: 'wrap'}}>
          {!desktop ? <Button variant="contained" disabled={locked || !point?.guid || !organization?.guid} onClick={() => void create()}>Новый заказ</Button> : null}
          {currentMatches ? <Button disabled={locked} onClick={() => void resume(workspace.selectedGuid || undefined)}>Продолжить</Button> : null}
          {matchingDrafts.filter(order => order.guid !== workspace.selectedGuid).map(order => <Button key={order.guid} disabled={locked}
            onClick={() => void resume(order.guid)}>Продолжить {order.number1c || order.clientOrderId || ''}</Button>)}
          {busy ? <CircularProgress size={20} sx={{alignSelf: 'center'}} /> : null}
        </Stack>;
  const pointPanel = <>
      {customer ? <Box sx={{minWidth:0}}>
        <Typography sx={{fontWeight: 600, py: 1}}>{customer.name}</Typography>
        <TextField fullWidth size="small" placeholder="Точка доставки или адрес" value={pointQuery} disabled={locked}
          onChange={event => setPointQuery(event.target.value)} slotProps={{htmlInput: {'aria-label': 'Найти точку доставки'}}} />
        {points.map(item => <Box component="button" key={item.guid!} disabled={locked} aria-pressed={point?.guid === item.guid}
          onClick={() => setPoint(item)} sx={{...rowSx, bgcolor: point?.guid === item.guid ? 'var(--co-soft)' : 'transparent'}}>
          <Typography component="div" sx={{fontSize: 14}}>{addressText(item)}</Typography>
        </Box>)}
        {loadingPoints ? <CircularProgress size={20} sx={{m: 2}} /> : !points.length ? <Typography sx={{py: 2, color: 'var(--co-muted)'}}>Точки доставки не найдены</Typography> : null}
        {pointMore ? <Button disabled={loadingPoints || locked} onClick={() => setPointOffset(points.length)}>Показать ещё</Button> : null}
        {orderActions}
      </Box> : null}
  </>;
  if (desktop) return <Box sx={{display:'flex',flex:1,minHeight:0,overflow:'hidden',bgcolor:'var(--co-background)'}}>
    <Box sx={{width:APP_LAYOUT.helpListWidth,flexShrink:0,display:'flex',borderRight:'1px solid var(--co-line)',minHeight:0}}>
      <AppListPanel active={focused} scrollRef={scrollRef} scrollId={scrollId}
        loadState={{scope:`${searchScope}:${retry}`,itemCount:shownCustomers.length,loading,hasMore:customerMore,prefetchScreens:1.5,disabled:locked,error:customerError,query,
          loadingLabel:'Загружаем клиентов…',emptyTitle:'Клиентов пока нет',emptyDescription:'Доступные клиенты выбранной организации появятся здесь.',
          onClear:()=>changeQuery(''),onRetry:()=>setRetry(x=>x+1),onLoadMore:()=>setCustomerOffset(customers.length)}}
        ids={{root:'client-orders-customer-panel',viewport:'client-orders-customer-viewport',header:'client-orders-customer-header',footer:'client-orders-customer-dock',scrollbar:'client-orders-customer-scrollbar',thumb:'client-orders-customer-scrollbar-thumb'}}
        header={<AppListPanelHeader title="Заказы клиентов" value={query} onChangeText={changeQuery} searchLabel="Найти клиента" disabled={locked} autoFocus
          trailing={<AppListPanelMenuButton ref={menuButton} label="Меню клиентов" expanded={menuOpen} onPress={openMenu}/>}/>}
        footer={<AppListPanelActionButton text="Новый заказ" disabled={locked||!customer||!organization?.guid} onPress={()=>{if(!point?.guid)setTab('points');else void create();}}/>}
        renderList={({paddingTop,paddingBottom,emptyState,footerState,onScroll,onLayout,onContentSizeChange})=><ScrollView ref={scrollRef} nativeID={scrollId} testID="client-orders-customer-list" style={{flex:1}}
          showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop,paddingBottom}}
          onScroll={onScroll} scrollEventThrottle={16} onLayout={onLayout} onContentSizeChange={onContentSizeChange}>{shownCustomers.length?customerRows:emptyState}{footerState}</ScrollView>}/>
    </Box>
    <Box sx={{flex:1,minWidth:0,minHeight:0,display:'flex',flexDirection:'column'}}>
      <AppWorkspaceHeader colors={colors} contentSurface="plain" trailing={organizationControl}>
        <View style={{flexDirection:'row',gap:4}}>
          {(['documents','points'] as const).map(value=><Pressable key={value} {...appWebControlProps()} accessibilityRole="tab" accessibilityState={{selected:tab===value}} onPress={()=>setTab(value)}
            style={{paddingHorizontal:14,paddingVertical:12,borderRadius:24,backgroundColor:tab===value?colors.panel:'transparent'}}>
            <Text style={{fontSize:14,fontWeight:'500',color:tab===value?colors.text:colors.muted}}>{value==='documents'?'Документы':'Точки доставки'}</Text>
          </Pressable>)}
        </View>
      </AppWorkspaceHeader>
      <View style={{flex:1,minHeight:0,display:tab==='documents'?'flex':'none'}}>
        <ClientOrderCustomerDocuments documents={documents} customerName={customer?.name} active={focused&&tab==='documents'} disabled={locked} selectedGuid={workspace.selectedGuid}
          onOpen={guid=>void resume(guid)} onContextMenu={onOrderContextMenu} footer={errorNotice||workspace.ordersConnectionNotice||workspace.queuedDeviceDraftsCount>0?<>
            {errorNotice}
            {workspace.ordersConnectionNotice?<Text style={{color:colors.muted,fontSize:13,padding:8}}>{workspace.ordersConnectionNotice}</Text>:null}
            {workspace.queuedDeviceDraftsCount>0?<SendDeviceOrdersButton count={workspace.queuedDeviceDraftsCount} online={workspace.online} sending={workspace.syncingDeviceDrafts} disabled={workspace.submitting} onPress={()=>void workspace.syncDeviceDrafts({force:true})}/>:null}
          </>:undefined}/>
      </View>
      <View style={{flex:1,minHeight:0,display:tab==='points'?'flex':'none'}}>
      <ClientOrderDeliveryPoints active={focused&&tab==='points'} customerName={customer?.name} organizationControl={null}
        scope={`${pointScope}:${retry}:${pointRetry}`} items={points} selectedGuid={point?.guid} query={pointQuery} loading={loadingPoints} hasMore={pointMore}
        disabled={locked} error={pointError} onQueryChange={setPointQuery} onSelect={setPoint} onLoadMore={()=>setPointOffset(points.length)} onRetry={()=>setPointRetry(x=>x+1)}
        footer={errorNotice||currentMatches||matchingDrafts.length||busy?<>{errorNotice}{customer?orderActions:null}</>:undefined}/>
      </View>
    </Box>
    {menuOpen ? <AppActionMenu testID="client-orders-customer-menu" colors={colors} label="Закрыть меню клиентов" onClose={()=>setMenuOpen(false)}
      top={Math.max(12,Math.min(window.height-160,menuAnchor.y+menuAnchor.height-4))}
      left={Math.max(12,Math.min(window.width-236,menuAnchor.x+menuAnchor.width-224))} width={224}>
      <AppActionMenuItem colors={colors} label="Обновить список" icon="reload-outline" disabled={locked} onPress={()=>{setMenuOpen(false);setCustomerOffset(0);setPointOffset(0);setRetry(x=>x+1);}}/>
    </AppActionMenu> : null}
  </Box>;
  return <Box sx={{px:2,pb:2,flex:1,minHeight:0,overflow:'auto'}}>
    <Stack direction="row" spacing={1.5} sx={{py:1.5}}>
      <TextField fullWidth autoFocus size="small" placeholder="Клиент, ИНН или адрес из журнала" value={query} disabled={locked}
        onChange={event=>changeQuery(event.target.value)} slotProps={{htmlInput:{'aria-label':'Найти клиента'}}}/>
      {organizationControl}
    </Stack>
    {errorNotice}
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'minmax(240px, 1fr) minmax(300px, 1fr)'},gap:3,alignItems:'start'}}>
      <Box>{customerRows}</Box>{pointPanel}
    </Box>
  </Box>;
}
