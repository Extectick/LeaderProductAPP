import {HelpSelectionDock} from './components/HelpSelectionDock';
import {HelpMessageSelectionRow} from './components/HelpMessageSelectionRow';
import {AppListPanel,AppListPanelActionButton,type AppListPanelListProps} from '@/components/ui/AppListPanel';
import {createHelpHtmlCache,HelpHtmlCacheContext} from './helpHtmlCache';
import {appWebControlProps,appWebControlContentProps} from '@/components/ui/appWebInteraction';
import {helpHeaderFrameHeight,helpListHeaderHeight} from './helpHeaderGeometry';
import {helpWebSelectionUrl,readHelpWebLocation,type HelpWebSelection} from './helpWebNavigation';
import {helpTicketMenuFrame,type HelpTicketMenuAnchor} from './helpTicketMenu';
import {APP_LAYOUT,appLayoutMode} from '@/src/shared/layout/appLayout';
import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Keyboard, KeyboardAvoidingView, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Reanimated, {useSharedValue} from 'react-native-reanimated';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect, useIsFocused } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { BlurTargetView } from 'expo-blur';
import { useHelpService } from './useHelpService';
import {useHelpListClock} from './useHelpListClock';
import {helpHaptic} from './helpHaptics';
import {publishHelpActivity} from './helpActivity';
import {isHelpConnectionIssue} from './helpConnectionState';
import {matchingPendingCreate} from './helpPendingCreate';
import type { HelpAttachment, HelpMessage, HelpTicket } from './helpApi';
import {API_BASE_URL} from '@/utils/config';
import { useHelpTheme, useHelpReducedMotion } from './helpTheme';
import { canEditHelpMessage, canReopenHelpTicket, helpCreated, sortHelpTicketsByActivity } from './helpUiUtils';
import { HelpDock, HelpIcon, HelpNotice, HelpPrimaryButton, HelpSheet, HelpTyping } from './components/HelpPrimitives';
import {HelpItBriefPanel} from './components/HelpItBriefPanel';
import { HelpComposer, type HelpComposeMode, type HelpLocalFile, type HelpComposerHandle } from './components/HelpComposer';
import { HelpQuestionPanel, type HelpQuestionPanelHandle, type HelpQuestionInputMode, type HelpQuestionChange } from './components/HelpQuestionPanel';
import { helpQuestions, mergeQuestionMessageDraft } from './helpQuestions';
import { HelpNativeChatLayout, hasNativeChatLayout, hasNativeImeLayout, hasNativeStableImeLayout, hasNativeDockControls, hasNativeAtomicTailMotion, hasNativeEmptyHintMotion } from './components/HelpNativeChatLayout';
import {HelpContinueAi,HelpItStatus} from './components/HelpItStatus';
import {HelpDockControls} from './components/HelpDockControls';
import { HelpMessageBubble } from './components/HelpMessageBubble';
import {HelpPendingMessage} from './components/HelpPendingMessage';
import type {HelpPending} from './helpDurableTypes';
import { HelpAssistantMessage, HelpAssistantPreviewMenu } from './components/HelpAssistantMessage';
import type { HelpAssistantPreview } from './helpAssistant';
import {HelpAiIcon} from './components/HelpAiIcon';
import { HelpEmptyConversation } from './components/HelpEmptyConversation';
import { HelpListHeader } from './components/HelpListHeader';
import { HelpChatHeader } from './components/HelpChatHeader';
import {HelpHeaderOverlay} from './components/HelpHeaderOverlay';
import {helpQuestionReplySequence,helpQuestionExchanges,helpPendingQuestionExchanges,type HelpQuestionExchange} from './helpQuestionHistory';
import {useHelpWebMarginWheel} from './useHelpWebMarginWheel';
import {HelpTicketRow as TicketRow} from './components/HelpTicketRow';
import {HelpForwardSheet} from './components/HelpForwardSheet';
import {HelpDropdown, HelpDropdownAction} from './components/HelpDropdown';
import {useHelpKeyboardInset} from './useHelpKeyboardInset';
import {helpQuestionBodyHeight} from './helpQuestionLayout';
import {HelpVisualEffectsContext} from './helpVisualEffects';
import { HelpPlaybackScope, HelpChatPlayback } from './components/HelpPlaybackScope';
import { HelpJumpToLatest, type HelpDockControlPresentation } from './components/HelpTimelineIndicators';
import {HelpTimelineDatesHost,type HelpTimelineDatesHandle,type HelpDatePresentation} from './components/HelpTimelineDates';
import { HelpChatEntry, type HelpChatEntryHandle } from './components/HelpChatEntry';
import {useAppSceneUnderlayMotion} from '@/components/Navigation/AppSceneTransition';
import {dismissHelpSceneKeyboard} from './helpSceneKeyboard';
import {useEntityCards} from '../entityCards/EntityCardContext';
import {HelpMessageArrivalContext} from './components/HelpMessageArrival';
import { HelpTicketReference } from './components/HelpTicketReference';
import { createHelpImageCache, HelpImageCacheContext } from './helpMediaLoading';
import { createHelpMessageLayoutCache, HelpMessageLayoutCacheContext } from './helpMessageLayoutCache';
import { HelpTimeline, type HelpTimelineHandle, type HelpLatestControlState } from './components/HelpTimeline';
import { HelpChatSearchDock, HelpChatSearchArrows, HelpChatSearchResults } from './components/HelpChatSearch';
import { helpMessageGroups, helpTimelineEntries } from './helpTimelineModel';
import { HELP_LIST_INSET, HELP_COMPOSER_ACTION_RIGHT } from './helpLayout';
import { helpDevActions, helpDevEvent, helpDevRef, helpDevState } from './helpDiagnostics';
import { downloadHelpAttachment, HelpGallery, type HelpImageOrigin } from './components/HelpMedia';
import { HelpPhotoPortalProvider } from './components/HelpPhotoPortal';
import { clearHelpAttachmentDraft, holdHelpAttachmentFiles, loadHelpAttachmentDraft, saveHelpAttachmentDraft } from './helpAttachmentDrafts';

type SourceTicket = { id: number; number: number; title: string };
type Overlay = { kind: 'menu' | 'it' | 'it-brief' } | { kind: 'row'; ticket: HelpTicket; anchor?:HelpTicketMenuAnchor } | { kind: 'forward'; message: HelpMessage; messages?:HelpMessage[] };
type ReturnContext = { active: number | 'new'; filter: 'OPEN' | 'CLOSED'; source: SourceTicket | null; draft: string; files: HelpLocalFile[]; mode: HelpComposeMode; reply: HelpMessage | null; edit: HelpMessage | null; editAttachments: HelpAttachment[]; rating: number };

export default function HelpScreen() {
  const entityCards=useEntityCards();
  const windowSize=useWindowDimensions();
  const [workspaceWidth,setWorkspaceWidth]=useState(0);
  const desktopWeb=Platform.OS==='web'&&appLayoutMode(windowSize.width)!=='compact';
  const splitView=desktopWeb&&appLayoutMode(windowSize.width)==='wide'&&(workspaceWidth||windowSize.width)>=960;
  const [listDrawerOpen,setListDrawerOpen]=useState(false);
  useEffect(()=>{if(!desktopWeb||splitView)setListDrawerOpen(false);},[desktopWeb,splitView]);
  const nativeLayoutId = useId();
  const nativeScrollId = `help-chat-scroll-${nativeLayoutId}`, nativeDockId = `help-chat-dock-${nativeLayoutId}`, nativeControlsId = `help-chat-controls-${nativeLayoutId}`, nativeViewportId = `help-chat-visible-${nativeLayoutId}`, nativeEmptyHintId = `help-chat-empty-${nativeLayoutId}`;
  const isFocused = useIsFocused();
  const service = useHelpService(isFocused); const c = useHelpTheme(); const insets = useSafeAreaInsets(); const router = useRouter(); const params = useLocalSearchParams<{ ticketId?: string;messageId?:string;eventId?:string;draft?:string;filter?:string }>();
  const routeTicketId=Number(params.ticketId),routeIntentKey=`${params.ticketId}:${params.messageId??''}:${params.eventId??''}:${params.draft??''}:${params.filter??''}`;
  const hasRouteTicket=Number.isSafeInteger(routeTicketId)&&routeTicketId>0;
  const [openingFromRoute,setOpeningFromRoute]=useState(hasRouteTicket);
  const imageCache=useMemo(()=>createHelpImageCache(),[service.userId]);
  const htmlCache=useMemo(()=>createHelpHtmlCache(),[service.userId,service.mediaSource]);
  useEffect(()=>()=>htmlCache.clear(),[htmlCache]);
  const messageLayoutCache=useMemo(()=>createHelpMessageLayoutCache(),[service.userId]);
  // Optional capability supplied only by the isolated QA service alias.
  const assistantPreview = (service as typeof service & { assistantPreview?: HelpAssistantPreview }).assistantPreview;
  const renderAccount=service.userId;
  const currentAccount = useRef(service.userId); currentAccount.current = service.userId;
  const screenMounted=useRef(true);useEffect(()=>{screenMounted.current=true;return()=>{screenMounted.current=false;};},[]);
  const [routeLeaving,setRouteLeaving]=useState(false),serviceExitPending=useRef(false);
  useEffect(()=>{if(isFocused){serviceExitPending.current=false;setRouteLeaving(false);}},[isFocused]);
  useLayoutEffect(()=>{
    if(!routeLeaving||!isFocused)return;
    // Commit removal of all capture layers before starting the retained-stack
    // route transition. A focus-loss cleanup alone is one native frame too late.
    const frame=requestAnimationFrame(()=>{if(screenMounted.current)router.dismissTo('/services' as any);});
    return()=>cancelAnimationFrame(frame);
  },[routeLeaving,isFocused,router]);
  const draftRevisions = useRef(new Map<string,number>());
  const sentDraftRevisions = useRef(new Map<string,number>());
  const chatProgress=useSharedValue(0);
  const returningToList=useRef(false);
  const [listHeaderMeasurement,setListHeaderMeasurement]=useState<{desktop:boolean;top:number;height:number}|null>(null);
  const listSceneHeaderHeight=listHeaderMeasurement?.desktop===desktopWeb&&listHeaderMeasurement.top===insets.top?listHeaderMeasurement.height:helpListHeaderHeight(desktopWeb)+insets.top;
  const setListSceneHeaderHeight=useCallback((height:number)=>setListHeaderMeasurement({desktop:desktopWeb,top:insets.top,height}),[desktopWeb,insets.top]);
  const [entrySettled,setEntrySettled]=useState(false);
  const [preparedScene,setPreparedScene]=useState('');
  const [entryKeyboardReady,setEntryKeyboardReady]=useState(true),[leavingChat,setLeavingChat]=useState(false),[sceneWidth,setSceneWidth]=useState(0);
  const [attachmentsVisible,setAttachmentsVisible]=useState(false);
  const [closeAttachmentsKey,setCloseAttachmentsKey]=useState(0);
  const photoBlurTarget=useRef<View>(null);
  const pendingChatOpen=useRef<{id:number;start:()=>void;cancel:()=>void}|null>(null);
  useEffect(()=>()=>{pendingChatOpen.current?.cancel();pendingChatOpen.current=null;},[service.userId]);
  const chatEntry = useRef<HelpChatEntryHandle>(null);
  const [scene,setScene]=useState({key:0,bottomAligned:false});
  const arrivalRegistry=useMemo(()=>new Set<string>(),[service.userId,scene.key]);
  const listBlurTarget = useRef<View>(null);
  const [active, setActive] = useState<number | 'new' | null>(null); const [filter, setFilter] = useState<'OPEN' | 'CLOSED'>('OPEN'); const [scope, setScope] = useState<'mine' | 'queue'>('mine');
  const listVisible=active===null||splitView||(desktopWeb&&listDrawerOpen);
  const listMotion=useAppSceneUnderlayMotion(chatProgress,active!==null&&!splitView&&!listDrawerOpen,sceneWidth);
  const [search, setSearch] = useState(''); const [draft, setDraft] = useState(''); const [files, setFiles] = useState<HelpLocalFile[]>([]); const [source, setSource] = useState<SourceTicket | null>(null);
  const [listDrafts,setListDrafts]=useState<Record<number,string>>({});
  const [mode, setMode] = useState<HelpComposeMode>('message'); const [rating, setRating] = useState(0); const [reply, setReply] = useState<HelpMessage | null>(null); const [editing, setEditing] = useState<HelpMessage | null>(null); const [editAttachments, setEditAttachments] = useState<HelpAttachment[]>([]); const [focusKey, setFocusKey] = useState(0);
  const [chatMenuAnchor,setChatMenuAnchor]=useState<{top:number;right:number}|null>(null);
  const [overlay, setOverlay] = useState<Overlay | null>(null); const [selectedMessage, setSelectedMessage] = useState<number | null>(null); const [notice, setNotice] = useState(''); const [gallery, setGallery] = useState<{ images: HelpAttachment[]; index: number; origin?:HelpImageOrigin } | null>(null);
  useEffect(()=>{
    if(!desktopWeb||splitView||!listDrawerOpen||overlay)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setListDrawerOpen(false);}};
    window.addEventListener('keydown',escape);
    return()=>window.removeEventListener('keydown',escape);
  },[desktopWeb,splitView,listDrawerOpen,overlay]);
  const [highlighted, setHighlighted] = useState<number | null>(null); const [dockHeight, setDockHeight] = useState(64); const [sending, setSending] = useState(false); const [sheetOffset, setSheetOffset] = useState(0);
  const [chatViewportHeight,setChatViewportHeight]=useState(0);
  const [questionComposerHeight,setQuestionComposerHeight]=useState(48);
  const [latestControl,setLatestControl]=useState<HelpLatestControlState>({visible:false,count:0,loading:false});
  const [nativeFollow,setNativeFollow]=useState(false);
  const [liveTailScene,setLiveTailScene]=useState<string|null>(null);
  const [chatSearchOpen,setChatSearchOpen]=useState(false),[chatSearchQuery,setChatSearchQuery]=useState('');
  const [chatResults,setChatResults]=useState<HelpMessage[]>([]),[chatSearchTotal,setChatSearchTotal]=useState(0),[chatSearchCursor,setChatSearchCursor]=useState<number|null>(null);
  const [chatResultIndex,setChatResultIndex]=useState(-1),[chatSearchLoading,setChatSearchLoading]=useState(false),[chatSearchList,setChatSearchList]=useState(false),[chatSearchError,setChatSearchError]=useState<string|null>(null);
  const chatSearchGeneration=useRef(0),highlightTimer=useRef<ReturnType<typeof setTimeout>|null>(null);

  const [chatHeaderMeasurement,setChatHeaderMeasurement]=useState<{scene:number;top:number;height:number}|null>(null);
  const listHeaderHeight=active===null?listSceneHeaderHeight:chatHeaderMeasurement?.scene===scene.key&&chatHeaderMeasurement.top===insets.top?chatHeaderMeasurement.height:helpHeaderFrameHeight(true)+insets.top;
  const setListHeaderHeight=useCallback((height:number)=>setChatHeaderMeasurement({scene:scene.key,top:insets.top,height}),[scene.key,insets.top]);
  const timelineDates=useRef<HelpTimelineDatesHandle>(null);
  const publishTimelineDates=useCallback((presentation:HelpDatePresentation|null)=>timelineDates.current?.update(presentation),[]);
  const listDateNow=useHelpListClock(isFocused&&!routeLeaving&&listVisible);
  const listScroll=useRef<FlashListRef<HelpTicket>>(null);
  const listPaging=useRef(false);
  const [listDockHeight,setListDockHeight]=useState(64+insets.bottom);
  const [listAtTop,setListAtTop]=useState(true),listAtTopRef=useRef(true);
  // At the top show new activity immediately. Away from the top FlashList owns
  // the visible-row anchor; do not add a competing scrollToOffset/RAF loop.
  const listPositionPolicy=useMemo(()=>({disabled:listAtTop}),[listAtTop]);
  const onTicketListScroll=useCallback((event:NativeSyntheticEvent<NativeScrollEvent>)=>{
    const y=event.nativeEvent.contentOffset.y,atTop=y<=2;
    helpDevState({listScrollY:y});
    if(atTop!==listAtTopRef.current){listAtTopRef.current=atTop;setListAtTop(atTop);}
  },[]);
  const [imeInset,setImeInset]=useState(0);
  const measuredDockHeight=useRef(dockHeight),imeInsetRef=useRef(imeInset),obscuredBottom=useRef(dockHeight+imeInset);
  imeInsetRef.current=imeInset;obscuredBottom.current=measuredDockHeight.current+imeInset;
  const onDockHeightFrame=useCallback((height:number)=>{measuredDockHeight.current=height;obscuredBottom.current=height+imeInsetRef.current;},[]);
  useLayoutEffect(()=>{setImeInset(0);setQuestionComposerHeight(48);setNativeFollow(false);},[scene.key]);
  useLayoutEffect(()=>{if(active===null)chatProgress.value=0;},[active,chatProgress]);
  useLayoutEffect(()=>{setLatestControl({visible:false,count:0,loading:false});},[scene.key,active===null]);
  const chatBounds = useRef<View>(null);
  const conversationPane=useRef<View>(null);
  const measureKeyboard = useHelpKeyboardInset(chatBounds, isFocused && active !== null && !hasNativeImeLayout, setImeInset);
  const boundedChat = hasNativeImeLayout || Platform.OS === 'android';
  const scroll = useRef<HelpTimelineHandle>(null); const followBottom = useRef(true); const stack = useRef<ReturnContext[]>([]); const regularDraft = useRef({ text: '', files: [] as HelpLocalFile[], reply: null as HelpMessage | null });
  const draftGeneration = useRef(0); const navigationGeneration = useRef(0); const draftLoaded = useRef(false); const fileDrafts = useRef(new Map<string,HelpLocalFile[]>()); const restoredDraft = useRef<{key: string; text: string} | null>(null); const uploadCache = useRef(new Map<string, HelpAttachment>()); const submitLock = useRef(false); const typingAt = useRef(0); const deepLink = useRef<string | undefined>(undefined); const blurTarget = useRef<View>(null);
  const [draftHydrationVersion,setDraftHydrationVersion]=useState(0);
  const [messageSelection,setMessageSelection]=useState<Map<number,HelpMessage>>(()=>new Map());
  const selectingMessages=messageSelection.size>0;
  const clearMessageSelection=useCallback(()=>setMessageSelection(previous=>previous.size?new Map():previous),[]);
  const startMessageSelection=useCallback((message:HelpMessage)=>{Keyboard.dismiss();setChatSearchOpen(false);setChatSearchList(false);setCloseAttachmentsKey(value=>value+1);setSelectedMessage(null);setOverlay(null);helpHaptic('selection');setMessageSelection(new Map([[message.id,message]]));},[]);
  const toggleMessageSelection=useCallback((message:HelpMessage)=>{helpHaptic('selection');setMessageSelection(previous=>{const next=new Map(previous);if(next.has(message.id))next.delete(message.id);else next.set(message.id,message);return next;});},[]);
  useEffect(()=>{clearMessageSelection();},[active,service.userId,clearMessageSelection]);
  const ticket = active && active !== 'new' && service.selectedTicket?.id === active ? service.selectedTicket : null;
  const headerTicket=ticket??(typeof active==='number'?service.tickets.find(item=>item.id===active):undefined);
  const isOwner = ticket?.ownerId === service.userId;
  const isItMember = Boolean(service.canManage && ticket?.members.some(member=>member.userId===service.userId&&member.role==='IT'));
  const [managingIt,setManagingIt]=useState(false);
  const itActionLock=useRef(false);
  const canRequestIt = Boolean(isOwner && ticket?.status === 'OPEN' && !ticket.itRequested && !ticket.members.some(member => member.role === 'IT'));
  const waitingForIt = Boolean(isOwner && ticket?.status==='OPEN' && ticket.itRequested && !ticket.members.some(member=>member.role==='IT'));
  const waitingForItRef=useRef(waitingForIt);waitingForItRef.current=waitingForIt;
  const [continuingAi,setContinuingAi]=useState(false);
  const continueAiLock=useRef(false);
  useEffect(()=>{if(waitingForIt){Keyboard.dismiss();setCloseAttachmentsKey(value=>value+1);setSelectedMessage(null);}},[waitingForIt]);
  const itRequestLock = useRef(false);
  const questionPanel = useRef<HelpQuestionPanelHandle>(null);
  const composerActions = useRef<HelpComposerHandle>(null);
  const questionSubmission = useRef<{userId:number;key:string;identity:string;messageId?:number;revision:number;text:string;navigation:number;filesKey:string;started:boolean}|null>(null);
  const questionChatDraft = useRef<{userId:number;key:string;text:string;identity:string;scene:number}|null>(null);
  const openingQuestion = useRef({scene:'',identity:''});
  const [questionMode, setQuestionMode] = useState<{identity:string;value:HelpQuestionInputMode}>({identity:'',value:'message'});
  const [questionCursor,setQuestionCursor] = useState({identity:'',index:0,review:false});
  const questionPositionChanged = useCallback((next:HelpQuestionChange,identity:string)=>setQuestionCursor(previous=>previous.identity===identity&&previous.index===next.index&&previous.review===next.review?previous:{identity,index:next.index,review:next.review}),[]);
  const [requestingIt, setRequestingIt] = useState(false);
  const isParticipant = Boolean(isOwner || ticket?.members.some(member => member.userId === service.userId));
  const messages = useMemo(() => {
    if (!ticket) return [];
    const lastInput = [...service.messages].reverse().find(message => message.authorId === service.userId)?.sequence ?? 0;
    return service.messages.filter(message => message.text || !message.assistantRun || !(message.assistantRun.stopReason === 'superseded' || message.sequence < lastInput && ['thinking','streaming'].includes(message.assistantRun.status)));
  }, [ticket?.id, service.messages, service.userId]);
  function openGallery(images:HelpAttachment[],index:number,origin?:HelpImageOrigin){
    const selected=images[index];if(!selected)return;
    const ordered=new Map<string,HelpAttachment>();
    // Only real message attachments participate; quoted thumbnails are not
    // additional messages in the photo history.
    for(const message of messages)for(const attachment of message.attachments)if(attachment.kind==='IMAGE')ordered.set(attachment.id,attachment);
    for(const attachment of images)if(attachment.kind==='IMAGE'&&!ordered.has(attachment.id))ordered.set(attachment.id,attachment);
    const history=[...ordered.values()],selectedIndex=history.findIndex(attachment=>attachment.id===selected.id);
    if(selectedIndex<0)return;Keyboard.dismiss();setGallery({images:history,index:selectedIndex,origin});
  }
  const lastAssistant = useMemo(() => [...messages].reverse().find(message => message.assistantRun), [messages]);
  const assistantActions=service as unknown as {lastCreatedOperation?:{key:string;ticketId:number;text:string;sourceTicketId?:number};pendingMessages?:HelpPending[];retryPendingOperation?:(key:string)=>Promise<unknown>;stopAssistant?:(ticketId:number,runId:string)=>Promise<unknown>;retryAssistant?:(ticketId:number,runId:string)=>Promise<unknown>;aiEnabled?:boolean};
  const recoverablePending=(assistantActions.pendingMessages??[]).filter(item=>item.status==='failed'||item.status==='queued'&&(item.attempts??0)>0);
  const pendingCreate=active==='new'?matchingPendingCreate(assistantActions.pendingMessages??[],draft,source?.id):undefined;
  const seenPendingCreates=useRef(new Set<string>()),consumedCreations=useRef(new Set<string>());
  const earlyClearedCreations=useRef(new Set<string>());
  for(const item of assistantActions.pendingMessages??[])if(item.create)seenPendingCreates.current.add(item.key);
  const activeAssistant = (assistantPreview||assistantActions.stopAssistant) && mode === 'message' && lastAssistant?.assistantRun && ['thinking','streaming'].includes(lastAssistant.assistantRun.status) ? lastAssistant : undefined;
  const busy = sending || service.busy || requestingIt || continuingAi || managingIt; const draftKey = active === 'new' ? `new:${source?.id ?? 'plain'}` : `ticket:${active}`;
  const questionIdentity = lastAssistant?.assistantRun ? `${service.userId}:${lastAssistant.ticketId}:${lastAssistant.assistantRun.runId}` : '';
  const questionMessage = useMemo(() => canRequestIt && mode === 'message' && lastAssistant && !messages.some(message => message.authorId === service.userId && message.sequence > lastAssistant.sequence) && !(assistantActions.pendingMessages??[]).some(item => item.ticketId === ticket?.id) ? lastAssistant : null, [canRequestIt, mode, lastAssistant, messages, service.userId, assistantActions.pendingMessages, ticket?.id]);
  const questions = useMemo(() => questionMessage ? helpQuestions(questionMessage) : [], [questionMessage]);
  const questionScene=`${service.userId}:${scene.key}`;
  if(openingQuestion.current.scene!==questionScene)openingQuestion.current={scene:questionScene,identity:''};
  // Remember historical questions while the scene is hidden, even when the
  // ordinary draft finishes loading after entry. Live questions keep typing.
  if(!scene.bottomAligned&&!entrySettled&&questions.length&&!openingQuestion.current.identity)openingQuestion.current.identity=questionIdentity;
  const lastQuestionReplySequence = useMemo(()=>helpQuestionReplySequence(messages,ticket),[messages,ticket]);
  const questionExchanges = useMemo(()=>helpQuestionExchanges(messages,ticket?.ownerId),[messages,ticket?.ownerId]);
  const questionReady = questionCursor.identity===questionIdentity && Boolean(questionIdentity);
  const questionPosition = questionReady ? questionCursor : {index:0,review:false};
  const questionDraftKey = `questions:${questionIdentity}`;
  const questionInputMode:HelpQuestionInputMode = questions.length && questionMode.identity===questionIdentity ? questionMode.value : 'message';
  const isQuestionInput = questionInputMode==='question';
  function startQuestionSubmit() {
    const snapshot={userId:service.userId,key:draftKey,identity:questionIdentity,messageId:questionMessage?.id,revision:draftRevisions.current.get(draftKey)??0,text:draft,navigation:navigationGeneration.current,filesKey:JSON.stringify(files.map(file=>file.uri)),started:false};
    questionSubmission.current=snapshot;
    return snapshot;
  }
  function switchQuestionInput(next:HelpQuestionInputMode) {
    if(sending || service.busy || next===questionInputMode)return;
    if(next==='question') {
      questionChatDraft.current={userId:service.userId,key:draftKey,text:draft,identity:questionIdentity,scene:scene.key};
      void service.setDraft(draftKey,draft).catch(()=>tell('Не удалось сохранить черновик сообщения.'));
      setDraft(questionPanel.current?.getDraftText() || '');
    } else {
      questionPanel.current?.capture(draft);
      const saved=questionChatDraft.current;
      setDraft(saved?.userId===service.userId&&saved.key===draftKey?saved.text:'');
    }
    draftRevisions.current.set(draftKey,(draftRevisions.current.get(draftKey)??0)+1);
    setQuestionMode({identity:questionIdentity,value:next});
  }
  useLayoutEffect(()=>{
    if(mode!=='message'||!draftLoaded.current)return;
    const saved=questionChatDraft.current;
    if(questions.length && (saved?.identity!==questionIdentity||saved.scene!==scene.key)) {
      const text=questionMode.value==='question'&&saved?.userId===service.userId&&saved.key===draftKey&&saved.scene===scene.key?saved.text:draft;
      questionChatDraft.current={userId:service.userId,key:draftKey,text,identity:questionIdentity,scene:scene.key};
      const value:HelpQuestionInputMode=openingQuestion.current.identity===questionIdentity?'question':text.trim()||files.length?'message':'question';
      setQuestionMode({identity:questionIdentity,value});
      if(value==='question')setDraft(questionPanel.current?.getDraftText()||'');
      else if(text!==draft)setDraft(text);
    } else if(!questions.length && questionMode.value==='question') {
      if(saved?.userId===service.userId&&saved.key===draftKey) {
        const snapshot=questionSubmission.current;
        const consumed=snapshot?.userId===service.userId&&snapshot.key===draftKey&&snapshot.identity===saved.identity&&snapshot.started&&snapshot.revision===(draftRevisions.current.get(draftKey)??0);
        const text=consumed?saved.text:mergeQuestionMessageDraft(saved.text,draft);
        setDraft(text); saved.text=text; questionSubmission.current=null;
        if(text)sentDraftRevisions.current.delete(draftKey);
        void service.setDraft(draftKey,text).catch(()=>tell('Не удалось сохранить черновик сообщения.'));
      }
      setQuestionMode({identity:'',value:'message'});
    }
  },[questions.length,questionIdentity,draftKey,service.userId,scene.key,mode,draft,files,questionMode.value,draftHydrationVersion]);
  async function submitComposer(voice?:HelpLocalFile,selected?:HelpLocalFile[],retain?:boolean) {
    if(waitingForItRef.current || itRequestLock.current || continueAiLock.current)return false;
    if(isQuestionInput && !voice) {
      if(selected)changeFiles(selected);
      const result=await questionPanel.current?.answer(draft,selected?{count:selected.length,names:selected.map(file=>file.name),keys:selected.map(file=>file.uri)}:undefined,Boolean(selected));
      // The picker stages files and closes; the existing composer arrow sends
      // the last answer after those file identities have reached React state.
      return selected?true:result??false;
    }
    return submit(voice,selected,retain);
  }
  const creationEcho=useRef<{account:number;scene:number;item:HelpPending}|null>(null);
  const creationRequest=useRef<{account:number;scene:number}|null>(null);
  const acceptedClientIds=useMemo(()=>new Set(messages.flatMap(message=>message.clientMessageId?[message.clientMessageId]:[])),[messages]);
  const filteredPending=useMemo(()=>(assistantActions.pendingMessages??[]).filter(item=>(active==='new'?item.create:item.ticketId===active)&&!acceptedClientIds.has(item.input.clientMessageId??'')),[assistantActions.pendingMessages,active,acceptedClientIds]);
  let echoItem:HelpPending|undefined;
  if(active==='new'){
    const pending=pendingCreate;
    if(pending&&creationRequest.current?.account===service.userId&&creationRequest.current.scene===scene.key)creationEcho.current={account:service.userId,scene:scene.key,item:pending};
    const echo=creationEcho.current;
    // The durable queue is cleared before createTicket finishes installing its
    // server page. Keep its visible row until that same scene becomes the chat.
    if(!filteredPending.length&&echo?.account===service.userId&&echo.scene===scene.key&&(busy||earlyClearedCreations.current.has(echo.item.key)&&!consumedCreations.current.has(echo.item.key)||(assistantActions.pendingMessages??[]).some(item=>item.key===echo.item.key)||assistantActions.lastCreatedOperation?.key===echo.item.key))echoItem=echo.item;
  }
  const displayedPending=useMemo(()=>echoItem?[echoItem]:filteredPending,[echoItem,filteredPending]);
  const pendingQuestionExchanges=useMemo(()=>helpPendingQuestionExchanges(messages,displayedPending,service.userId===ticket?.ownerId?service.userId:undefined),[messages,displayedPending,service.userId,ticket?.ownerId]);
  const queuedOwnCreate=active==='new'&&creationEcho.current?.account===service.userId&&creationEcho.current.scene===scene.key&&((assistantActions.pendingMessages??[]).some(item=>item.key===creationEcho.current!.item.key)||earlyClearedCreations.current.has(creationEcho.current.item.key)&&!consumedCreations.current.has(creationEcho.current.item.key));
  useEffect(()=>{
    const created=assistantActions.lastCreatedOperation;
    if(!created||busy||consumedCreations.current.has(created.key))return;
    consumedCreations.current.add(created.key);
    const echo=creationEcho.current;
    const ownScene=echo?.account===service.userId&&echo.scene===scene.key&&echo.item.key===created.key;
    const continuingDraft=ownScene&&earlyClearedCreations.current.has(created.key);
    const clearedOwnDraft=ownScene&&earlyClearedCreations.current.has(created.key)&&!draft.trim();
    const unchangedRestoredDraft=(draftRevisions.current.get(draftKey)??0)===0;
    const matchesDraft=continuingDraft||clearedOwnDraft||(ownScene||unchangedRestoredDraft)&&created.text.trim()===draft.trim();
    if(!seenPendingCreates.current.has(created.key)||active!=='new'||!matchesDraft||(created.sourceTicketId??null)!==(source?.id??null))return;
    const nextKey=`ticket:${created.ticketId}`,nextText=continuingDraft?draft:'',nextFiles=continuingDraft?files:[];
    const sourceRevision=draftRevisions.current.get(draftKey)??0,sourceAccount=service.userId;
    if(!continuingDraft)sentDraftRevisions.current.set(draftKey,draftRevisions.current.get(draftKey)??0);
    fileDrafts.current.set(nextKey,nextFiles);
    const revision=(draftRevisions.current.get(nextKey)??0)+1;draftRevisions.current.set(nextKey,revision);
    const release=holdHelpAttachmentFiles(nextFiles);
    // Move the next, unsent correction to the acknowledged ticket. Persist its
    // ownership before removing the old manifest, even if files share a URI.
    void Promise.all([service.setDraft(nextKey,nextText),persistFiles(nextFiles,nextKey,service.userId,revision)])
      .then(()=>{if(currentAccount.current!==sourceAccount||(draftRevisions.current.get(draftKey)??0)!==sourceRevision)return;return Promise.all([service.setDraft(draftKey,''),clearHelpAttachmentDraft(sourceAccount,draftKey)]);})
      .catch(()=>tell('Не удалось полностью перенести черновик.')).finally(release);
    setDraft('');setFiles([]);restoredDraft.current={key:nextKey,text:nextText};
    earlyClearedCreations.current.delete(created.key);void open(created.ticketId,undefined,true);
  },[assistantActions.lastCreatedOperation,busy,active,draft,source?.id,draftKey,service.userId,scene.key]);
  const draftScope = useRef({account:service.userId,key:draftKey,mode}); draftScope.current={account:service.userId,key:draftKey,mode};
  const filePersistence = useRef(new Map<string,{revision:number;promise:Promise<HelpLocalFile[]>}>());
  const pendingGroupKey=displayedPending.map(item=>item.key+':'+item.createdAt).join('|');
  const {messageGroups,pendingGroups}=useMemo(()=>{
    const entries=helpTimelineEntries(messages,displayedPending,service.userId);
    const messageGroups=helpMessageGroups(entries.map(entry=>entry.message),service.firstUnreadSequence);
    return {messageGroups,pendingGroups:new Map(entries.filter(entry=>entry.pending).map(entry=>[entry.pending!.key,messageGroups.get(entry.message.id)!]))};
  },[messages,pendingGroupKey,service.userId,service.firstUnreadSequence]);
  const tell = useCallback((message: string) => setNotice(message), []);
  const run = async (work: () => Promise<unknown>) => { try { await work(); } catch (e) { tell(e instanceof Error ? e.message : 'Не удалось выполнить действие.'); } };
  const confirmRequestIt = async () => {
    if (!ticket || !canRequestIt || busy || itRequestLock.current) return;
    itRequestLock.current = true;
    setRequestingIt(true);
    const account = service.userId, navigation = navigationGeneration.current;
    try {
      await service.requestIt(ticket.id);
      if (screenMounted.current && currentAccount.current === account && navigationGeneration.current === navigation) {setOverlay(null);helpHaptic('success');}
    } catch (error) {
      if (screenMounted.current && currentAccount.current === account && navigationGeneration.current === navigation) tell(error instanceof Error ? error.message : 'Не удалось вызвать IT-специалиста.');
    } finally {
      itRequestLock.current = false;
      if (screenMounted.current) setRequestingIt(false);
    }
  };
  const manageIt = async (action:'join'|'leave'|'close') => {
    if(!ticket||!service.canManage||isOwner||busy||itActionLock.current)return;
    if(action!=='join'&&!isItMember)return;
    itActionLock.current=true;setManagingIt(true);Keyboard.dismiss();
    const account=service.userId,navigation=navigationGeneration.current;
    try{
      if(action==='join')await service.claimTicket(ticket.id);
      else if(action==='leave')await service.leaveIt(ticket.id);
      else await service.closeIt(ticket.id);
      if(screenMounted.current&&currentAccount.current===account&&navigationGeneration.current===navigation)setOverlay(null);
    }catch(error){if(screenMounted.current&&currentAccount.current===account&&navigationGeneration.current===navigation)tell(error instanceof Error?error.message:'Не удалось изменить участие в чате.');}
    finally{itActionLock.current=false;if(screenMounted.current)setManagingIt(false);}
  };
  const continueWithAi = async () => {
    if(!ticket || !waitingForIt || busy || continueAiLock.current)return;
    continueAiLock.current=true;setContinuingAi(true);
    const account=service.userId,navigation=navigationGeneration.current;
    try{await service.continueAi(ticket.id);}
    catch(error){if(screenMounted.current&&currentAccount.current===account&&navigationGeneration.current===navigation)tell(error instanceof Error?error.message:'Не удалось продолжить с AI.');}
    finally{continueAiLock.current=false;if(screenMounted.current)setContinuingAi(false);}
  };
  const composerResizingUntil = useRef(0);
  const scrollBottom = (animated = true) => { if (!hasNativeChatLayout && followBottom.current) requestAnimationFrame(() => { if (followBottom.current) scroll.current?.scrollToEnd({ animated }); }); };
  const draftTicketIds=useMemo(()=>service.tickets.map(item=>item.id).join(','),[service.tickets]);
  useEffect(()=>{setListDrafts({});},[service.userId]);
  useEffect(()=>{if(active!==null)return;let alive=true;const account=service.userId;void (service.getDrafts?service.getDrafts(service.tickets.map(item=>`ticket:${item.id}`)).then(values=>service.tickets.map(item=>[item.id,values[`ticket:${item.id}`]??''] as const)):Promise.all(service.tickets.map(async item=>[item.id,await service.getDraft(`ticket:${item.id}`)] as const))).then(values=>{if(alive&&currentAccount.current===account)setListDrafts(previous=>{const next=Object.fromEntries(values);return Object.keys(previous).length===values.length&&values.every(([id,text])=>previous[id]===text)?previous:next;});}).catch(()=>{});return()=>{alive=false;};},[active,service.userId,draftTicketIds,service.getDraft]);
  useLayoutEffect(() => { ++draftGeneration.current; draftLoaded.current = false; restoredDraft.current = null; setActive(null); setDraft(''); setFiles([]); setSource(null); setMode('message'); setReply(null); setEditing(null); setEditAttachments([]); setGallery(null); setOverlay(null); setNotice(''); setSelectedMessage(null);  setFilter('OPEN'); setScope('mine'); setSending(false); submitLock.current=false; earlyClearedCreations.current.clear(); stack.current = []; uploadCache.current.clear(); fileDrafts.current.clear(); filePersistence.current.clear(); draftRevisions.current.clear(); sentDraftRevisions.current.clear(); regularDraft.current = {text:'',files:[],reply:null}; deepLink.current = undefined; }, [service.userId]);
  useEffect(() => {
    if(!active)return;
    const generation=++draftGeneration.current;
    const complete=()=>{
      draftLoaded.current=true;
      // An empty draft with the same cached attachments may not update any
      // state. Its completion still initializes this scene's question mode.
      setDraftHydrationVersion(value=>value+1);
    };
    setFiles(fileDrafts.current.get(draftKey)??[]);
    if(restoredDraft.current?.key===draftKey){
      setDraft(restoredDraft.current.text);restoredDraft.current=null;complete();return;
    }
    draftLoaded.current=false;setDraft('');
    void Promise.all([
      service.getDraft(draftKey),
      fileDrafts.current.has(draftKey)?Promise.resolve(fileDrafts.current.get(draftKey)!):loadHelpAttachmentDraft(service.userId,draftKey),
    ]).then(([value,attachments])=>{
      if(generation!==draftGeneration.current)return;
      setDraft(value);setFiles(attachments);fileDrafts.current.set(draftKey,attachments);complete();
    }).catch(()=>{if(generation===draftGeneration.current)complete();});
    return()=>{++draftGeneration.current;};
  },[draftKey,service.userId]);
  useEffect(() => { if (!active || mode !== 'message' || !draftLoaded.current) return; const revision=draftRevisions.current.get(draftKey)??0;const timer = setTimeout(() => { if((draftRevisions.current.get(draftKey)??0)===revision&&sentDraftRevisions.current.get(draftKey)!==revision){if(isQuestionInput)questionPanel.current?.capture(draft);else void service.setDraft(draftKey, draft);} }, 250); return () => clearTimeout(timer); }, [draft, active, mode, draftKey, service.setDraft, isQuestionInput, questionIdentity]);
  const listQueryRequest=useRef<{load:typeof service.loadTickets;key:string}|null>(null);
  useEffect(() => {
    const key=JSON.stringify([filter,scope,search.trim()]),previous=listQueryRequest.current;
    listQueryRequest.current={load:service.loadTickets,key};
    // useHelpService already loads the default list on mount/account change.
    // Only filter/search changes belong to this debounced request.
    if((!previous||previous.load!==service.loadTickets||previous.key===key)&&filter==='OPEN'&&scope==='mine'&&!search.trim())return;
    const timer=setTimeout(()=>{void service.loadTickets(filter,scope,false,search.trim());},250);
    return()=>clearTimeout(timer);
  },[search,filter,scope,service.loadTickets]);
  useEffect(() => {
    // useHelpService resets its account in a passive effect. Route opening must
    // run after that reset, or the freshly started request is invalidated. The
    // initial openingFromRoute cover already hides the unprepared scene.
    if(!service.userId||deepLink.current===routeIntentKey)return;
    deepLink.current=routeIntentKey;
    if(Platform.OS==='web')setFilter(params.filter==='closed'?'CLOSED':'OPEN');
    const messageId=Number(params.messageId);
    if(hasRouteTicket){setOpeningFromRoute(true);void open(routeTicketId,Number.isSafeInteger(messageId)&&messageId>0?messageId:undefined,false,{recordHistory:false,restart:true});}
    else if(Platform.OS==='web'&&params.draft==='new')newTicket(null,false);
    // Effect replay also resets the service. Consume the route again after that
    // reset, without clearing a newer intent recorded by a click or browser Back.
    return()=>{if(deepLink.current===routeIntentKey)deepLink.current=undefined;};
  },[routeIntentKey,service.userId]);
  useEffect(()=>{
    const generation=++chatSearchGeneration.current;
    if(!chatSearchOpen || !chatSearchQuery.trim() || typeof active!=='number') {setChatResults([]);setChatSearchTotal(0);setChatSearchCursor(null);setChatResultIndex(-1);setChatSearchLoading(false);return;}
    setChatSearchLoading(true);setChatSearchError(null);
    const timer=setTimeout(()=>{void service.searchMessages(chatSearchQuery.trim()).then(result=>{
      if(generation!==chatSearchGeneration.current)return;
      setChatResults(result.messages);setChatSearchTotal(result.total);setChatSearchCursor(result.nextCursor);setChatResultIndex(result.messages.length?0:-1);
      if(result.messages[0])void showSearchResult(result.messages[0],0,false);
    }).catch(e=>{if(generation===chatSearchGeneration.current)setChatSearchError(e instanceof Error?e.message:'Поиск недоступен');})
      .finally(()=>{if(generation===chatSearchGeneration.current)setChatSearchLoading(false);});},300);
    return()=>{clearTimeout(timer);++chatSearchGeneration.current;};
  },[chatSearchOpen,chatSearchQuery,active,service.userId]);
  useEffect(()=>{setChatSearchOpen(false);setChatSearchQuery('');setChatSearchList(false);},[active,service.userId]);
  useEffect(()=>()=>{if(highlightTimer.current)clearTimeout(highlightTimer.current);},[]);
  function highlight(id:number){setHighlighted(id);if(highlightTimer.current)clearTimeout(highlightTimer.current);highlightTimer.current=setTimeout(()=>setHighlighted(null),1600);}
  async function showSearchResult(message:HelpMessage,index:number,dismissKeyboard=true){
    setChatResultIndex(index);setChatSearchList(false);if(dismissKeyboard)Keyboard.dismiss();scroll.current?.prepareJump(message.sequence);
    try {if(!await(scroll.current?.waitForJumpReady?.()??true))return;await service.jumpToMessage(message.id,message.sequence);}catch(e){scroll.current?.cancelJump();tell(e instanceof Error?e.message:'Не удалось открыть сообщение');}
  }
  async function moreSearch(selectNext=false){
    if(chatSearchCursor===null || chatSearchLoading)return;
    const generation=chatSearchGeneration.current;setChatSearchLoading(true);
    try {const page=await service.searchMessages(chatSearchQuery.trim(),chatSearchCursor);
      if(generation!==chatSearchGeneration.current)return;
      const existing=new Set(chatResults.map(message=>message.id)),next=page.messages.filter(message=>!existing.has(message.id));
      setChatResults(old=>[...old,...next]);setChatSearchCursor(page.nextCursor);setChatSearchTotal(page.total);
      if(selectNext && next[0])await showSearchResult(next[0],chatResults.length);
    }catch(e){if(generation===chatSearchGeneration.current)setChatSearchError(e instanceof Error?e.message:'Не удалось загрузить результаты');}
    finally{if(generation===chatSearchGeneration.current)setChatSearchLoading(false);}
  }
  function nextSearch(){const index=chatResultIndex+1;if(chatResults[index])void showSearchResult(chatResults[index],index);else void moreSearch(true);}
  function closeSearch(){++chatSearchGeneration.current;setChatSearchOpen(false);setChatSearchList(false);Keyboard.dismiss();}
  const activityOwner=useRef({});
  useEffect(()=>publishHelpActivity(activityOwner.current,{userId:service.userId,ticketId:isFocused&&typeof active==='number'?active:null}),[service.userId,isFocused,active]);
  useFocusEffect(useCallback(() => { return () => { if (typeof active === 'number') service.emitTyping(active, false); }; }, [active, service.emitTyping]));

  useEffect(() => helpDevActions('screen', {
    'screen.back': () => back(), 'screen.list': () => list(), 'screen.new': () => newTicket(), 'screen.send': () => submit(),
    'screen.open': value => { const id=Number(value); if(Number.isSafeInteger(id)&&id>0)return open(id); },
    'screen.search': value => { if(typeof value==='string')setSearch(value); },
    'screen.chatSearch': value => {if(typeof value==='string'){setChatSearchOpen(true);setChatSearchQuery(value);}},
    'screen.searchNext': ()=>nextSearch(), 'screen.searchClose':()=>closeSearch(), 'screen.dismissKeyboard':()=>Keyboard.dismiss(),
    'screen.jump': value=>{const id=Number(value);if(Number.isSafeInteger(id))jump(id);},
    'screen.scroll': value => { const y=Number(value); if(Number.isFinite(y)){if(active===null)listScroll.current?.scrollToOffset({offset:Math.max(0,y),animated:false});else scroll.current?.scrollTo({y:Math.max(0,y),animated:false});} },
  }));
  useEffect(() => helpDevState({ screen:active===null ? 'list' : active==='new' ? 'new' : 'chat', filter, scope, canManage:service.canManage, searchLength:search.length, dockHeight, listHeaderHeight, theme:c.dark ? 'dark' : 'light' }), [active,filter,scope,service.canManage,search.length,dockHeight,listHeaderHeight,c.dark]);

  async function open(id: number,messageId?:number,promote=false,{recordHistory=true,restart=false}:{recordHistory?:boolean;restart?:boolean}={}) {
    if(active===id&&!messageId&&!promote&&!restart){setListDrawerOpen(false);return;}
    setListDrawerOpen(false);
    if(recordHistory)recordWebSelection(id,promote?'replace':'push');
    if(!promote){setScene(previous=>({key:previous.key+1,bottomAligned:false}));setEntrySettled(false);}

    // Reply/edit focus belongs to that composer, not every subsequently opened chat.
    if (active !== 'new') setFocusKey(0);
    const openedAt = Date.now();
    helpDevEvent('chat.open.request', { ticketId: id, openedAt });
    saveDraftNow();
    draftLoaded.current=false;
    const generation=++navigationGeneration.current,account=service.userId;
    if(!promote){
      setLeavingChat(false);setEntryKeyboardReady(false);
      void dismissHelpSceneKeyboard().then(()=>{if(screenMounted.current&&generation===navigationGeneration.current&&account===currentAccount.current)setEntryKeyboardReady(true);});
    }
    setOverlay(null); setSelectedMessage(null); setMode('message'); setReply(null); setEditing(null); setFiles([]); setSource(null); setActive(id); followBottom.current = false;
    try {
      let deferNetworkUntil:Promise<boolean>|undefined;
      if(!promote){
        // Read local history now. Only server work waits for the scene; a warm
        // window belongs in the entering page, not behind its loading screen.
        deferNetworkUntil=new Promise<boolean>(resolve=>{
          pendingChatOpen.current?.cancel();
          pendingChatOpen.current={id,start:()=>{pendingChatOpen.current=null;resolve(true);},cancel:()=>resolve(false)};
        });
      }
      if(deferNetworkUntil)await service.openTicket(id,messageId?{messageId}:undefined,{deferNetworkUntil});
      else await service.openTicket(id,messageId?{messageId}:undefined);
      helpDevEvent('chat.open.data', { ticketId: id, openedAt, elapsedMs: Date.now() - openedAt });
    } catch (e) {
      if(generation!==navigationGeneration.current)return;
      // A failed open must release the retained list and invisible entry. Keeping
      // active=id with no selected ticket leaves the previous list unresponsive.
      returningToList.current=false;setLeavingChat(false);setOpeningFromRoute(false);chatProgress.value=0;setEntrySettled(false);setActive(null);service.clearSelection();
      tell(e instanceof Error ? e.message : 'Не удалось открыть обращение');
    }
  }
  function persistFiles(value:HelpLocalFile[],key=draftKey,account=renderAccount,revision=draftRevisions.current.get(key)??0):Promise<HelpLocalFile[]> {
    const existing=filePersistence.current.get(key);if(account===currentAccount.current&&existing?.revision===revision)return existing.promise;
    if(account===currentAccount.current)fileDrafts.current.set(key,value);
    const promise=saveHelpAttachmentDraft(account,key,value).then(durable=>{
      if(currentAccount.current===account&&(draftRevisions.current.get(key)??0)===revision){fileDrafts.current.set(key,durable);if(screenMounted.current&&draftScope.current.key===key&&draftScope.current.mode==='message')setFiles(durable);}
      return durable;
    });
    filePersistence.current.set(key,{revision,promise});
    void promise.catch(()=>{if(filePersistence.current.get(key)?.promise===promise)filePersistence.current.delete(key);});
    return promise;
  }
  function saveDraftNow() { scroll.current?.save(); if (active && mode === 'message' && draftLoaded.current) { const sent=sentDraftRevisions.current.get(draftKey)===(draftRevisions.current.get(draftKey)??0);void persistFiles(sent?[]:files).catch(()=>tell('Не удалось сохранить вложения черновика.')); if(isQuestionInput)questionPanel.current?.capture(draft); const saved=questionChatDraft.current; void service.setDraft(draftKey, isQuestionInput&&saved?.userId===service.userId&&saved.key===draftKey?saved.text:sent?'':draft).catch(()=>tell('Не удалось сохранить черновик.')); } }
  async function list(next: 'OPEN' | 'CLOSED' = filter,recordHistory=true) {
    if(returningToList.current)return;
    setListDrawerOpen(false);
    if(recordHistory)recordWebSelection(null,'push',next);
    pendingChatOpen.current?.cancel();pendingChatOpen.current=null;
    const navigation=++navigationGeneration.current,account=service.userId;
    saveDraftNow();setFocusKey(0);
    if(active!==null){
      returningToList.current=true;setLeavingChat(true);
      await dismissHelpSceneKeyboard();
      if(!screenMounted.current||navigation!==navigationGeneration.current||account!==currentAccount.current){returningToList.current=false;setLeavingChat(false);return;}
      setNativeFollow(false);
      const finished=await chatEntry.current?.dismiss();returningToList.current=false;setLeavingChat(false);
      if(finished===false||!screenMounted.current||navigation!==navigationGeneration.current||account!==currentAccount.current)return;
    }
    setEntrySettled(false);setFocusKey(0);
    // Keep the retained list's viewport, while new messages may reorder its rows.
    setOpeningFromRoute(false);setActive(null);service.clearSelection();setMode('message');setFiles([]);setReply(null);setEditing(null);setSource(null);setFilter(next);stack.current=[];
    if(active!==null&&next===filter)void service.loadTickets(next,scope,false,search.trim(),true);
    else void service.loadTickets(next,scope,false,search.trim());
  }
  function newTicket(linked: SourceTicket | null = null,recordHistory=true) {
    setListDrawerOpen(false);
    if(recordHistory)recordWebSelection('new');
    pendingChatOpen.current?.cancel();pendingChatOpen.current=null;
    const navigation=++navigationGeneration.current,account=service.userId;
    setScene(previous=>({key:previous.key+1,bottomAligned:true}));setEntrySettled(false);setLeavingChat(false);setEntryKeyboardReady(false);
    // Finish an existing IME (e.g. list search), enter the scene, then focus.
    // The transition's onEntered is the only initial autofocus request owner.
    void dismissHelpSceneKeyboard().then(()=>{
      if(screenMounted.current&&navigation===navigationGeneration.current&&account===currentAccount.current)setEntryKeyboardReady(true);
    });
    saveDraftNow();stack.current=[];service.clearSelection();setActive('new');setSource(linked);setDraft('');setFiles([]);setMode('message');setReply(null);setEditing(null);setSelectedMessage(null);followBottom.current=true;setFocusKey(0);
  }
  function cancelMode() { ++navigationGeneration.current; setMode('message'); setDraft(regularDraft.current.text); setFiles(regularDraft.current.files); setReply(regularDraft.current.reply); setEditing(null); Keyboard.dismiss(); }
  async function back() {
    if(entityCards.isOpen){entityCards.back();return;}
    if(attachmentsVisible){setCloseAttachmentsKey(key=>key+1);return;}
    if(desktopWeb&&!splitView&&listDrawerOpen){setListDrawerOpen(false);return;}
    Keyboard.dismiss();
    if(selectingMessages){clearMessageSelection();return;} if (gallery) { setGallery(null); return; } if (overlay) { setOverlay(null); return; } if (selectedMessage !== null) { setSelectedMessage(null); return; }
    if(chatSearchOpen){closeSearch();return;}
    if (mode !== 'message') { cancelMode(); return; }
    const previous = stack.current.pop();
    if (previous) {
      recordWebSelection(previous.active,'replace',previous.filter);
      setScene(scene=>({key:scene.key+1,bottomAligned:previous.active==='new'}));setEntrySettled(false);setLeavingChat(false);setEntryKeyboardReady(false);
      const restoreNavigation = ++navigationGeneration.current, restoreAccount = service.userId;
      void dismissHelpSceneKeyboard().then(()=>{if(screenMounted.current&&restoreNavigation===navigationGeneration.current&&restoreAccount===currentAccount.current)setEntryKeyboardReady(true);});
      restoredDraft.current = {key: previous.active === 'new' ? `new:${previous.source?.id ?? 'plain'}` : `ticket:${previous.active}`, text: previous.draft};
      saveDraftNow(); Keyboard.dismiss(); setActive(previous.active); setSource(previous.source); setFilter(previous.filter); setMode(previous.mode); setReply(previous.reply); setEditing(previous.edit); setEditAttachments(previous.editAttachments); setRating(previous.rating); setFiles(previous.files); draftLoaded.current = false;
      if (previous.active === 'new') service.clearSelection(); else await run(() => service.openTicket(previous.active as number));
      if (currentAccount.current !== restoreAccount || navigationGeneration.current !== restoreNavigation) return;
      // Restoring an existing draft is intentional; prevent the async storage read from replacing it.
      ++draftGeneration.current; setDraft(previous.draft); draftLoaded.current = true; return;
    }
    if (active !== null) { list(); return; } if (filter === 'CLOSED') { list('OPEN'); return; }
    if(serviceExitPending.current)return;serviceExitPending.current=true;setRouteLeaving(true);
  }
  const latestBack = useRef(back); latestBack.current = back;
  const chatSwipeBackEnabled = useRef(false);
  chatSwipeBackEnabled.current = Platform.OS!=='web' && isFocused && active !== null && entrySettled && !attachmentsVisible && !gallery && !overlay && !entityCards.isOpen && selectedMessage === null && !selectingMessages;
  const chatSwipeBackBlocked = useRef(false);
  const chatSwipeBackPeak = useRef(0);
  const chatSwipeBack = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponderCapture: () => {
      chatSwipeBackBlocked.current = false; chatSwipeBackPeak.current = 0; return false;
    },
    onMoveShouldSetPanResponderCapture: (_, g) => {
      if (!chatSwipeBackEnabled.current || g.numberActiveTouches !== 1 || g.dx < -10 || Math.abs(g.dy) > Math.max(12, Math.abs(g.dx))) chatSwipeBackBlocked.current = true;
      return !chatSwipeBackBlocked.current && g.dx > 12 && g.dx > Math.abs(g.dy) * 1.7;
    },
    onPanResponderMove: (_, g) => {
      chatSwipeBackPeak.current = Math.max(chatSwipeBackPeak.current, g.dx);
      if (g.numberActiveTouches !== 1 || chatSwipeBackPeak.current - g.dx > 16 || Math.abs(g.dy) > Math.max(32, Math.abs(g.dx))) chatSwipeBackBlocked.current = true;
    },
    onPanResponderRelease: (_, g) => {
      if (chatSwipeBackEnabled.current && !chatSwipeBackBlocked.current && g.dx >= 96 && g.dx > Math.abs(g.dy) * 1.7) void latestBack.current();
      chatSwipeBackBlocked.current = true;
    },
    onPanResponderTerminationRequest: () => false,
    onPanResponderTerminate: () => { chatSwipeBackBlocked.current = true; },
  }), []);
  useFocusEffect(useCallback(() => { const subscription = BackHandler.addEventListener('hardwareBackPress', () => { void latestBack.current(); return true; }); return () => subscription.remove(); }, []));
  function markWebIntent(url:URL){deepLink.current=`${url.searchParams.get('ticketId')??undefined}:${url.searchParams.get('messageId')??''}:${url.searchParams.get('eventId')??''}:${url.searchParams.get('draft')??''}:${url.searchParams.get('filter')??''}`;}
  function recordWebSelection(selection:HelpWebSelection,method:'push'|'replace'='push',nextFilter=filter){
    if(Platform.OS!=='web'||typeof window==='undefined')return;
    const href=helpWebSelectionUrl(window.location.href,selection,nextFilter);
    markWebIntent(new URL(href));
    if(href!==window.location.href)window.history[method==='push'?'pushState':'replaceState'](window.history.state,'',href);
  }
  const webNavigation=useRef({open,list,newTicket,saveDraftNow});webNavigation.current={open,list,newTicket,saveDraftNow};
  useFocusEffect(useCallback(()=>{
    if(Platform.OS!=='web'||typeof window==='undefined')return;
    const path=window.location.pathname;
    const onPop=(event:PopStateEvent)=>{
      if(window.location.pathname!==path)return;
      event.stopImmediatePropagation();stack.current=[];setListDrawerOpen(false);markWebIntent(new URL(window.location.href));
      const target=readHelpWebLocation(window.location.href);setFilter(target.filter);
      if(typeof target.selection==='number')void webNavigation.current.open(target.selection,target.messageId,false,{recordHistory:false});
      else if(target.selection==='new')webNavigation.current.newTicket(null,false);
      else void webNavigation.current.list(target.filter,false);
    };
    const save=()=>webNavigation.current.saveDraftNow();
    window.addEventListener('popstate',onPop,true);window.addEventListener('pagehide',save);
    return()=>{window.removeEventListener('popstate',onPop,true);window.removeEventListener('pagehide',save);save();};
  },[]));
  const visible = useMemo(() => sortHelpTicketsByActivity(service.tickets.filter(t => t.status === filter)), [service.tickets, filter]);
  const listActions=useRef({open,prepare:(id:number)=>{if(listVisible)void service.prepareTicket?.(id);},menu:(item:HelpTicket,anchor?:HelpTicketMenuAnchor)=>{helpHaptic('menu');Keyboard.dismiss();setOverlay({kind:'row',ticket:item,anchor});}});
  listActions.current={open,prepare:(id:number)=>{if(listVisible)void service.prepareTicket?.(id);},menu:(item:HelpTicket,anchor?:HelpTicketMenuAnchor)=>{helpHaptic('menu');Keyboard.dismiss();setOverlay({kind:'row',ticket:item,anchor});}};
  const prepareVisibleTickets=useCallback(({viewableItems}:{viewableItems:{item:HelpTicket;isViewable:boolean}[]})=>{for(const row of viewableItems)if(row.isViewable)listActions.current.prepare(row.item.id);},[]);
  const listExtraData=useMemo(()=>({drafts:listDrafts,typing:service.typingByTicket,dateNow:listDateNow,selected:splitView?active:null}),[listDrafts,service.typingByTicket,listDateNow,splitView,active]);
  const renderTicketRow=useCallback(({item}:{item:HelpTicket})=><TicketRow selected={splitView&&active===item.id} ticket={item} dateNow={listDateNow} draft={listDrafts[item.id]} typing={service.typingByTicket[item.id]} onPress={()=>{void listActions.current.open(item.id);}} onMenu={anchor=>listActions.current.menu(item,anchor)}/>,[listDrafts,service.typingByTicket,listDateNow,splitView,active]);
  const sourceLink = ticket ? ticket.sourceTicket : source;
  async function openSource() {
    if (!sourceLink || !active) return;
    stack.current.push({ active, filter, source, draft, files, mode, reply, edit: editing, editAttachments, rating }); saveDraftNow(); await open(sourceLink.id);
  }
  function startMode(next: HelpComposeMode, message?: HelpMessage) {
    if(waitingForItRef.current)return;
    ++navigationGeneration.current;
    if (mode === 'message') regularDraft.current = { text: draft, files, reply };
    setMode(next); setDraft(message?.text ?? ''); setFiles([]); setReply(null); setRating(message?.rating ?? 0); setEditing(message ?? null); setEditAttachments(message?.attachments ?? []); setOverlay(null); setSelectedMessage(null); setFocusKey(n => n + 1); followBottom.current = true;
  }
  function replyTo(message: HelpMessage) { if (waitingForItRef.current || mode !== 'message' || ticket?.status !== 'OPEN' || !isParticipant) return; setReply(message); setSelectedMessage(null); setFocusKey(n => n + 1); }
  function jump(id: number) { followBottom.current=false;scroll.current?.prepareJump(messages.find(message=>message.id===id)?.sequence);void (async()=>{if(await(scroll.current?.waitForJumpReady?.()??true))await service.jumpToMessage(id);})().catch(e=>{scroll.current?.cancelJump();tell(e instanceof Error?e.message:'Исходное сообщение недоступно');}); }
  async function submit(voice?: HelpLocalFile, selectedFiles?: HelpLocalFile[], retainVoiceDraft=false, answerText?:string, questionCheckpoint?:NonNullable<typeof questionSubmission.current>):Promise<boolean> {
    if(waitingForItRef.current || itRequestLock.current || continueAiLock.current)return false;
    const inputText = answerText ?? draft.trim();
    if(isQuestionInput&&!questionCheckpoint)questionCheckpoint=startQuestionSubmit();
    if(pendingCreate||queuedOwnCreate){tell('Это обращение уже ожидает отправки. Повтор доступен у сохранённого сообщения.');return false;}
    const account = renderAccount;
    const savedChat=questionChatDraft.current;
    const restoreChatText=isQuestionInput&&savedChat?.userId===account&&savedChat.key===draftKey?savedChat.text:'';
    const navigation = navigationGeneration.current;
    if(questionCheckpoint) {
      if(questionCheckpoint.userId!==account||questionCheckpoint.key!==draftKey||questionCheckpoint.navigation!==navigation||questionCheckpoint.identity!==questionIdentity)return false;
      if(questionCheckpoint.filesKey!==JSON.stringify(files.map(file=>file.uri))){tell('Вложения изменились. Проверьте ответы перед отправкой.');return false;}
    }
    // Capture the question ID before async uploads/outbox work. The existing
    // reply relation survives retries, cache reloads and cross-device sync.
    const submissionReplyToId = answerText !== undefined && questionCheckpoint ? questionCheckpoint.messageId : reply?.id;
    if (submitLock.current || !active || !screenMounted.current || currentAccount.current!==account || draftScope.current.key!==draftKey || draftScope.current.mode!==mode) return false;
    let chosenFiles=voice?[voice]:[...(selectedFiles??files)];
    if (mode === 'reopen' && !inputText) { tell('Напишите, что случилось снова.'); return false; }
    if (mode === 'message' && !inputText && !chosenFiles.length) return false;
    if (chosenFiles.length+(mode==='edit'?editAttachments.length:0)>10){tell('В одном сообщении можно прикрепить до 10 файлов.');return false;}
    if (mode === 'edit' && editing && !canEditHelpMessage(editing, service.userId)) { tell('Редактировать сообщение можно только в течение часа.'); return false; }
    if(selectedFiles&&!voice)changeFiles(chosenFiles);
    const draftRevision = questionCheckpoint?.revision ?? draftRevisions.current.get(draftKey)??0;
    if(questionCheckpoint)questionCheckpoint.started=true;
    submitLock.current = true; setSending(true);
    const releaseFiles=[holdHelpAttachmentFiles(chosenFiles)];let committed=false,feedbackGiven=false;
    const acceptedFeedback=()=>{if(!feedbackGiven&&screenMounted.current&&currentAccount.current===account&&navigationGeneration.current===navigation){feedbackGiven=true;helpHaptic(mode==='message'?'send':'success');}};
    try {
      if(!screenMounted.current||currentAccount.current!==account||navigationGeneration.current!==navigation||draftScope.current.key!==draftKey)return false;
      if(mode==='message'&&!voice){chosenFiles=await persistFiles(chosenFiles,draftKey,account,draftRevision);releaseFiles.push(holdHelpAttachmentFiles(chosenFiles));}
      if(currentAccount.current!==account)return false;
      if (mode === 'message' && chosenFiles.length && !(voice && active === 'new') && !assistantPreview && service.queueFileTicket) {
        const clearQueuedDraft = async (item?: HelpPending) => {
          committed=true;acceptedFeedback();
          if(active==='new'&&item){creationEcho.current={account,scene:scene.key,item};seenPendingCreates.current.add(item.key);earlyClearedCreations.current.add(item.key);}
          if(voice||(draftRevisions.current.get(draftKey)??0)!==draftRevision||currentAccount.current!==account)return;
          sentDraftRevisions.current.set(draftKey,draftRevision);
          fileDrafts.current.set(draftKey,[]);
          const clearing=clearHelpAttachmentDraft(account,draftKey).then(()=>[] as HelpLocalFile[]);
          filePersistence.current.set(draftKey,{revision:draftRevision,promise:clearing});
          if(screenMounted.current&&navigationGeneration.current===navigation){setDraft(restoreChatText);setFiles([]);setReply(null);}
          await Promise.all([service.setDraft(draftKey,restoreChatText),clearing]).catch(()=>{if(screenMounted.current&&currentAccount.current===account)tell('Сообщение в очереди, но не удалось очистить черновик.');});
        };
        if(active==='new'){
          creationRequest.current={account,scene:scene.key};
          await service.queueFileTicket({text:voice?'':inputText,sourceTicketId:source?.id},chosenFiles,clearQueuedDraft);
        }else{
          await service.sendMessage(active,{text:voice?'':inputText,replyToId:submissionReplyToId},chosenFiles);
          await clearQueuedDraft();
        }
        if(screenMounted.current&&currentAccount.current===account&&navigationGeneration.current===navigation){
          if(voice)setReply(null);
          if(!hasNativeChatLayout){followBottom.current=true;scroll.current?.scrollToEnd({animated:false});}
        }
        return true;
      }
      const uploads: HelpAttachment[] = [];
      for (const file of chosenFiles) { let upload = uploadCache.current.get(file.uri); if (!upload) { [upload] = await service.uploadAttachments([file]); if(currentAccount.current!==account) return false; uploadCache.current.set(file.uri, upload); } uploads.push(upload); }
      if(currentAccount.current!==account) return false;
      const text = voice ? '' : inputText; let detail;
      if (mode === 'edit' && editing) detail = await service.editMessage(editing.id, { text, ...(editing.kind === 'CLOSURE' ? { rating } : {}), attachmentIds: [...editAttachments.map(a => a.id), ...uploads.map(a => a.id)] });
      else if (mode === 'close' && ticket) detail = await service.closeTicket(ticket.id, { text, rating, attachmentIds: uploads.map(a => a.id) });
      else if (mode === 'reopen' && ticket) { if (!canReopenHelpTicket(ticket)) throw new Error('Прошло больше 3 дней. Создайте новое обращение.'); detail = await service.reopenTicket(ticket.id, { text, attachmentIds: uploads.map(a => a.id) }); }
      else if (active === 'new') {
        creationRequest.current={account,scene:scene.key};
        detail = await service.createTicket({ text, attachmentIds: uploads.map(a => a.id), sourceTicketId: source?.id },async item=>{
          if(!screenMounted.current||currentAccount.current!==account||navigationGeneration.current!==navigation||active!=='new'||draftScope.current.key!==draftKey)return;
          acceptedFeedback();
          creationEcho.current={account,scene:scene.key,item};
          seenPendingCreates.current.add(item.key);
          if(voice||(draftRevisions.current.get(draftKey)??0)!==draftRevision)return;
          // The durable outbox owns this payload now. Clear only the exact draft
          // revision that was queued; a later edit or navigation remains intact.
          sentDraftRevisions.current.set(draftKey,draftRevision);
          earlyClearedCreations.current.add(item.key);
          fileDrafts.current.set(draftKey,[]);
          const filesClearing=clearHelpAttachmentDraft(account,draftKey).then(()=>[] as HelpLocalFile[]);
          filePersistence.current.set(draftKey,{revision:draftRevision,promise:filesClearing});
          setDraft(restoreChatText);setFiles([]);setReply(null);
          await Promise.all([service.setDraft(draftKey,restoreChatText),filesClearing]).catch(()=>{if(screenMounted.current&&currentAccount.current===account)tell('Сообщение сохранено в очереди, но черновик не удалось очистить полностью.');});
        });
      }
      else detail = await service.sendMessage(active, { text, attachmentIds: uploads.map(a => a.id), replyToId: submissionReplyToId });
      if (!detail) return false;committed=true;acceptedFeedback();chosenFiles.forEach(file=>uploadCache.current.delete(file.uri));
      if(currentAccount.current!==account)return true;
      const unchanged=()=>currentAccount.current===account&&(draftRevisions.current.get(draftKey)??0)===draftRevision;
      const alreadyClearedAtEnqueue=active==='new'&&creationEcho.current?.account===account&&creationEcho.current.scene===scene.key&&earlyClearedCreations.current.has(creationEcho.current.item.key);
      if (mode === 'message' && !voice && unchanged()&&!alreadyClearedAtEnqueue) {
        sentDraftRevisions.current.set(draftKey,draftRevision);
        const filesClearing=clearHelpAttachmentDraft(account,draftKey).then(()=>[] as HelpLocalFile[]);
        const clearing=Promise.all([service.setDraft(draftKey,restoreChatText),filesClearing]);
        fileDrafts.current.set(draftKey,[]);filePersistence.current.set(draftKey,{revision:draftRevision,promise:filesClearing});
        if(screenMounted.current&&unchanged()&&navigationGeneration.current===navigation){setDraft(restoreChatText);setFiles([]);setReply(null);}
        await clearing;
      }
      if(!screenMounted.current||navigationGeneration.current!==navigation||!unchanged())return true;
      if (mode === 'message' && voice) setReply(null);
      if (active === 'new') { restoredDraft.current = {key:`ticket:${detail.ticket.id}`,text:voice ? draft : ''}; setActive(detail.ticket.id); setSource(null); await service.setDraft(`ticket:${detail.ticket.id}`, voice ? draft : ''); }
      if(currentAccount.current!==account||navigationGeneration.current!==navigation)return true;
      if (mode !== 'message') { setMode('message'); setDraft(regularDraft.current.text); setFiles(regularDraft.current.files); setReply(regularDraft.current.reply); setEditing(null); }
      if(mode === 'message') {
        if(!hasNativeChatLayout){followBottom.current=true;if(active!=='new')scroll.current?.scrollToEnd({animated:false});else scrollBottom(false);}
      } else if(active!=='new') {
        // A close receipt is already merged into a loaded tail. Reopening that
        // same history page replaces live rows and briefly hides the rating.
        if(mode==='close'&&!service.hasNewer){followBottom.current=true;scroll.current?.scrollToEnd({animated:false});}
        else await service.jumpToLatest();
      } else scrollBottom();
      return true;
    } catch (e) {
      if(currentAccount.current!==account)return committed;
      if(voice&&!committed&&!retainVoiceDraft){const old=fileDrafts.current.get(draftKey)??files;const retained=old.some(file=>file.uri===voice.uri)?old:[...old,voice];const revision=(draftRevisions.current.get(draftKey)??0)+1;draftRevisions.current.set(draftKey,revision);void persistFiles(retained,draftKey,account,revision).catch(()=>{});if(navigationGeneration.current===navigation)setFiles(retained);}
      const queuedCreate=active==='new'&&creationEcho.current?.account===account&&creationEcho.current.scene===scene.key&&earlyClearedCreations.current.has(creationEcho.current.item.key);
      if(screenMounted.current&&navigationGeneration.current===navigation){
        if(committed||queuedCreate)acceptedFeedback();else helpHaptic('error');
        tell(committed?'Сообщение отправлено, но не удалось обновить черновик.':queuedCreate?'Сообщение сохранено в очереди и будет отправлено автоматически.':e instanceof Error ? e.message : 'Сообщение не отправлено. Черновик сохранён.');
      }
      return committed||queuedCreate;
    } finally { if(!committed&&questionSubmission.current===questionCheckpoint)questionSubmission.current=null; if(committed&&restoreChatText&&currentAccount.current===account)sentDraftRevisions.current.delete(draftKey); releaseFiles.forEach(release=>release());if(currentAccount.current===account){submitLock.current = false;if(screenMounted.current)setSending(false);} }
  }
  function changeDraft(text: string) { if(mode==='message')draftRevisions.current.set(draftKey,(draftRevisions.current.get(draftKey)??0)+1); draftLoaded.current = true; ++draftGeneration.current; setDraft(text); if (typeof active === 'number' && Date.now() - typingAt.current > 1800) { typingAt.current = Date.now(); service.emitTyping(active, Boolean(text.trim())); } }
  function changeFiles(value: HelpLocalFile[]) { if(value.map(file=>file.uri).join('\n')!==files.map(file=>file.uri).join('\n'))helpHaptic('selection'); if(mode==='message'){draftRevisions.current.set(draftKey,(draftRevisions.current.get(draftKey)??0)+1);++draftGeneration.current;draftLoaded.current=true;void persistFiles(value).catch(()=>{if(currentAccount.current===service.userId)tell('Не удалось сохранить вложения черновика.');});} setFiles(value); }
  // Actions follow the current draft/navigation/account without invalidating list rows.
  // The renderer dependencies below contain every value that changes row pixels.
  const timelineActions=useRef({service,run,jump,openGallery,replyTo,startMode,scope,router,assistantPreview,assistantActions,isParticipant,openSource});
  timelineActions.current={service,run,jump,openGallery,replyTo,startMode,scope,router,assistantPreview,assistantActions,isParticipant,openSource};
  const renderPending=useCallback((item:HelpPending)=><HelpPendingMessage {...pendingGroups.get(item.key)} item={item} onQuote={id=>timelineActions.current.jump(id)} resolve={service.mediaSource} onRetry={()=>void timelineActions.current.run(()=>timelineActions.current.assistantActions.retryPendingOperation!(item.key))}/>,[pendingGroups,service.mediaSource]);
  const resolveQuestionMedia=useCallback((attachment:HelpAttachment)=>attachment.localUri?Promise.resolve({uri:attachment.localUri}):service.mediaSource(attachment),[service.mediaSource]);
  const renderHumanMessage=useCallback((message:HelpMessage,questionExchange?:HelpQuestionExchange,pending?:HelpPending)=><HelpMessageBubble questionExchange={questionExchange} delivery={pending?(pending.status??'queued'):undefined} onRetry={pending?()=>void timelineActions.current.run(()=>timelineActions.current.assistantActions.retryPendingOperation!(pending.key)):undefined} canRequestIt={canRequestIt} {...messageGroups.get(message.id)} message={message} readByOthers={!pending && message.authorId===service.userId && Boolean(ticket?.members.some(member=>member.userId!==service.userId && (member.lastReadSequence??0)>=message.sequence))} searchQuery={chatSearchOpen?chatSearchQuery:undefined} userId={service.userId} open={!pending && mode === 'message' && ticket?.status === 'OPEN' && isParticipant} canInteract={!pending && isParticipant} selected={!pending && selectedMessage === message.id} highlighted={!pending && highlighted === message.id} solution={false} resolve={questionExchange?resolveQuestionMedia:service.mediaSource} onDismissMenu={() => setSelectedMessage(null)} onMenu={() => {if(!pending)startMessageSelection(message);}} onReply={() => timelineActions.current.replyTo(message)} onCopy={() => void timelineActions.current.run(async () => { await Clipboard.setStringAsync(message.text || message.attachments.map(a => a.name).join('\n')); helpHaptic('success');setSelectedMessage(null); tell('Скопировано'); })} onEdit={() => timelineActions.current.startMode('edit', message)} onForward={() => { Keyboard.dismiss();selectedForwardProgress.current.clear(); setSelectedMessage(null); setOverlay({ kind: 'forward', message }); void timelineActions.current.service.loadTickets('OPEN', timelineActions.current.scope); }} onReaction={emoji => {if(timelineActions.current.isParticipant){helpHaptic('selection');void timelineActions.current.run(() => timelineActions.current.service.toggleReaction(message, emoji));}}} onQuote={id=>timelineActions.current.jump(id)} onImage={(images,index,origin)=>{if(!pending)timelineActions.current.openGallery(images,index,origin);}} onFile={(file,signal,onProgress) => pending?undefined:downloadHelpAttachment(file, timelineActions.current.service.mediaSource,signal,onProgress)} onCloseTicket={() => timelineActions.current.startMode('close')} onRequestIt={() => { Keyboard.dismiss(); setOverlay({ kind: 'it' }); }} onError={tell} />, [startMessageSelection,resolveQuestionMedia,lastQuestionReplySequence,messageGroups,ticket,service.userId,service.mediaSource,mode,isParticipant,isOwner,selectedMessage,highlighted,chatSearchOpen,chatSearchQuery,canRequestIt,busy,lastAssistant?.id,Boolean(assistantPreview),Boolean(assistantActions.retryAssistant)]);
  const renderMessageContent=useCallback((message:HelpMessage)=>message.assistantRun ? <HelpAssistantMessage questionReply={pendingQuestionExchanges.has(message.id)?renderHumanMessage(pendingQuestionExchanges.get(message.id)!.message,pendingQuestionExchanges.get(message.id),pendingQuestionExchanges.get(message.id)!.pending):undefined} questionState={helpQuestions(message).length ? lastQuestionReplySequence>message.sequence?'answered':'waiting':undefined} message={message} resolve={service.mediaSource} onFileError={tell} onRequestIt={canRequestIt && !busy && message.id === lastAssistant?.id ? () => { Keyboard.dismiss(); setOverlay({ kind: 'it' }); } : undefined} onConnectOnec={canRequestIt && message.assistantRun?.action?.type === 'connect_onec' ? () => { Keyboard.dismiss(); timelineActions.current.router.push({ pathname: '/profile/settings', params: { section: 'onec', ...(message.assistantRun?.action?.baseKey ? { base: message.assistantRun.action.baseKey } : {}), returnTicket: String(message.ticketId), returnRun: message.assistantRun!.runId } } as any); } : undefined} onRetry={!canRequestIt?undefined:assistantPreview ? ()=>timelineActions.current.assistantPreview?.retry(message.ticketId,message.assistantRun!.runId) : assistantActions.retryAssistant?()=>void timelineActions.current.run(()=>timelineActions.current.assistantActions.retryAssistant!(message.ticketId,message.assistantRun!.runId)):undefined}/> : renderHumanMessage(message), [selectingMessages,questionExchanges,pendingQuestionExchanges,renderPending,renderHumanMessage,lastQuestionReplySequence,service.mediaSource,canRequestIt,busy,lastAssistant?.id,Boolean(assistantPreview),Boolean(assistantActions.retryAssistant)]);
  const renderMessage=useCallback((message:HelpMessage)=>{
    const wrap=(item:HelpMessage,child:React.ReactNode,incoming=Boolean(item.assistantRun)||item.authorId!==service.userId)=><HelpMessageSelectionRow key={item.id} messageId={item.id} active={selectingMessages} selected={messageSelection.has(item.id)} incoming={incoming} onToggle={()=>toggleMessageSelection(item)} onStart={()=>startMessageSelection(item)}>{child}</HelpMessageSelectionRow>;
    const exchange=message.assistantRun?questionExchanges.get(message.id):undefined;
    return <>{wrap(message,renderMessageContent(message))}{exchange?wrap(exchange.message,renderHumanMessage(exchange.message,exchange),true):null}</>;
  },[selectingMessages,messageSelection,service.userId,toggleMessageSelection,startMessageSelection,renderMessageContent,renderHumanMessage,questionExchanges]);
  const selectedMessages=[...messageSelection.values()].map(item=>messages.find(row=>row.id===item.id)??item).sort((a,b)=>a.sequence-b.sequence);
  const replySelected=()=>{if(selectedMessages.length!==1)return;const message=selectedMessages[0];clearMessageSelection();replyTo(message);};
  const canReplySelected=selectedMessages.length===1&&!waitingForIt&&mode==='message'&&ticket?.status==='OPEN'&&isParticipant;
  const selectedForwardProgress=useRef(new Map<number,Set<number>>());
  const forwardSelected=()=>{if(!selectedMessages.length)return;selectedForwardProgress.current.clear();setOverlay({kind:'forward',message:selectedMessages[0],messages:selectedMessages});void service.loadTickets('OPEN',scope);};
  const copySelected=()=>void run(async()=>{await Clipboard.setStringAsync(selectedMessages.map(item=>item.text||item.attachments.map(file=>file.name).join('\n')).join('\n\n'));tell('Скопировано');});
  const selectionBar=<View testID="help-message-selection-toolbar" style={{height:64,flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:8}}>
    <HelpIcon name="close-outline" label="Отменить выделение" onPress={clearMessageSelection} style={{width:48,height:48,borderRadius:24,backgroundColor:c.panel}}/>
    <View style={{flex:1,height:48,borderRadius:24,backgroundColor:c.panel,justifyContent:'center',paddingHorizontal:16}}><Text accessibilityLiveRegion="polite" style={{color:c.text,fontSize:18,fontWeight:'600'}}>Выбрано {messageSelection.size}</Text></View>
    <View style={{height:48,borderRadius:24,backgroundColor:c.panel,flexDirection:'row',alignItems:'center',paddingHorizontal:4}}><HelpIcon name="copy-outline" label="Копировать выбранные сообщения" onPress={copySelected}/><HelpIcon name="arrow-redo-outline" label="Переслать выбранные сообщения" onPress={forwardSelected} disabled={!isParticipant}/>{selectedMessages.length===1&&!selectedMessages[0].assistantRun?<HelpIcon name="ellipsis-horizontal" label="Действия с выбранным сообщением" onPress={()=>{const item=selectedMessages[0];clearMessageSelection();setSelectedMessage(item.id);}}/>:null}</View>
  </View>;
  const sourceReference=useMemo(()=>sourceLink?(service.tickets.find(row=>row.id===sourceLink.id)??sourceLink):null,[sourceLink,service.tickets]);
  const timelineHeader=useMemo(()=><>{sourceReference?<HelpTicketReference ticket={sourceReference} onPress={()=>void timelineActions.current.openSource()}/>:null}</>,[sourceReference]);
  const typingUsers=ticket?service.typingByTicket[ticket.id]:undefined;
  // Membership is current state, not a timeline event. A JOINED footer would
  // always move below later messages while its durable row is still syncing.
  // Only history rows own join placement; waiting remains a current-state hint.
  const fallbackItStatus=useMemo(()=>{
    if(!ticket||ticket.status!=='OPEN'||service.hasNewer)return null;
    const specialists=ticket.members.filter(member=>member.role==='IT');
    if(specialists.length)return null;
    return ticket.itRequested&&messages.filter(message=>message.itStatusChange).at(-1)?.itStatusChange!=='REQUESTED'?<HelpItStatus status="REQUESTED"/>:null;
  },[ticket,messages,service.hasNewer]);
  const timelineFooter=useMemo(()=><>{fallbackItStatus}{typingUsers?.length?<View style={{paddingHorizontal:16,paddingVertical:8}}><HelpTyping users={typingUsers}/></View>:null}</>,[typingUsers,fallbackItStatus]);
  const recoverPending=()=>void run(()=>Promise.all(recoverablePending.map(item=>service.retryPendingOperation(item.key))));
  const listHeader = <HelpListHeader recovery={recoverablePending.length?{count:recoverablePending.length,disabled:busy,onPress:recoverPending}:undefined} onRetryLoad={service.error&&!service.loading&&!isHelpConnectionIssue(service.error)?()=>void run(()=>service.loadTickets(filter,scope,false,search.trim())):undefined} desktop={desktopWeb} connecting={!service.connected} connectionPhase={service.connectionPhase} onReconnect={service.reconnect} onKnowledge={assistantPreview ? undefined : () => router.push('/services/help/knowledge')} search={search} onSearch={setSearch} archived={filter === 'CLOSED'} onArchive={() => {const next=filter==='OPEN'?'CLOSED':'OPEN';if(splitView){setFilter(next);recordWebSelection(active,'push',next);}else void list(next);}} onBack={() => void back()} canManage={service.canManage} scope={scope} onScope={()=>{const next=scope==='mine' ? 'queue' : 'mine';setScope(next);void service.loadTickets(filter,next,false,search.trim());}} />; const header = active === null ? listHeader : <HelpChatHeader connecting={!service.connected} connectionPhase={service.connectionPhase} onReconnect={service.reconnect} search={chatSearchOpen && (ticket || active === 'new') ? {query:chatSearchQuery,onQueryChange:setChatSearchQuery,onClose:closeSearch,onSubmit:()=>Keyboard.dismiss(),autoFocus:true} : undefined} menuActive={overlay?.kind==='menu'} onSearch={ticket?()=>{saveDraftNow();Keyboard.dismiss();setChatSearchOpen(true);}:undefined} title={headerTicket?.title || (active==='new' ? 'Новое обращение' : 'Обращение')} number={headerTicket?.number} status={headerTicket?.status} meta={headerTicket ? helpCreated(headerTicket.createdAt) : ''} onBack={splitView?undefined:desktopWeb?()=>setListDrawerOpen(value=>!value):()=>void back()} backIcon={desktopWeb?'list-outline':undefined} backLabel={desktopWeb?'Список обращений':undefined} onMenu={ticket || assistantPreview || active === 'new' ? ()=>{Keyboard.dismiss();chatBounds.current?.measureInWindow((x,y,width)=>setChatMenuAnchor({top:y+listHeaderHeight-6,right:Math.max(16,windowSize.width-x-width+16)}));setOverlay(previous=>previous?.kind==='menu'?null:{kind:'menu'});} : undefined}/>;

  const legacyDockControls=hasNativeStableImeLayout&&!hasNativeDockControls;
  const renderDockControls=(bottom:number,presentation:HelpDockControlPresentation)=><>
    <HelpJumpToLatest visible={latestControl.visible&&entrySettled&&!selectingMessages&&!chatSearchOpen&&isFocused} count={latestControl.count} loading={latestControl.loading} onPress={()=>{if(scroll.current?.prepareJump()===false)return;void(async()=>{if(await(scroll.current?.waitForJumpReady?.()??true))await service.jumpToLatest();})().catch(()=>{scroll.current?.cancelJump();tell('Не удалось открыть последние сообщения');});}} presentation={presentation} style={{position:'absolute',right:HELP_COMPOSER_ACTION_RIGHT,...(presentation==='visual'?{bottom:'100%' as const,marginBottom:12}:{bottom})}}/>
          {chatSearchOpen && !chatSearchList ? <HelpChatSearchArrows total={chatSearchTotal} selectedIndex={chatResultIndex} loading={chatSearchLoading} canPrevious={chatResultIndex>0} canNext={chatResultIndex+1<chatResults.length || chatSearchCursor!==null} onPrevious={()=>{if(chatResultIndex>0)void showSearchResult(chatResults[chatResultIndex-1],chatResultIndex-1);}} onNext={nextSearch} presentation={presentation} style={{position:'absolute',right:HELP_COMPOSER_ACTION_RIGHT-5,...(presentation==='visual'?{bottom:'100%' as const,marginBottom:12}:{bottom})}}/> : null}
  </>;
  const chatHeaderOverlay = <HelpHeaderOverlay id="help-chat-header-overlay" backdropId="help-chat-header-backdrop" target={blurTarget} topInset={insets.top} onLayout={event=>setListHeaderHeight(event.nativeEvent.layout.height)}>{selectingMessages?selectionBar:<>{header}<HelpChatPlayback onJump={jump}/></>}</HelpHeaderOverlay>;
  const questionInputPanel = !chatSearchOpen && questions.length > 0 ? <HelpQuestionPanel integrated submitOnLastAnswer animate={entrySettled} key={questionIdentity} ref={questionPanel} questions={questions} draft={draft} inputMode={questionInputMode} onInputModeChange={switchQuestionInput} onQuestionChange={next=>questionPositionChanged(next,questionIdentity)} attachmentCount={files.length} attachmentNames={files.map(file=>file.name)} attachmentKeys={files.map(file=>file.uri)} onAttachFiles={()=>void composerActions.current?.pickFiles()} disabled={busy || !entrySettled} maxBodyHeight={helpQuestionBodyHeight({viewportHeight:chatViewportHeight,imeInset,headerHeight:listHeaderHeight,composerHeight:questionComposerHeight,extraDockHeight:(files.length?88:0)+(reply?64:0)})} loadDraft={()=>service.getDraft(questionDraftKey)} saveDraft={value=>service.setDraft(questionDraftKey,value)} onDraftChange={text=>{if(isQuestionInput)changeDraft(text);}} onWriteAnswer={()=>{switchQuestionInput('question');setFocusKey(value=>value+1);}} onSubmitStart={startQuestionSubmit} onSubmit={(text,snapshot)=>snapshot && snapshot===questionSubmission.current?submit(undefined,undefined,false,text,questionSubmission.current):Promise.resolve(false)}/> : null;
  const webRowMenu=Platform.OS==='web'&&overlay?.kind==='row'&&overlay.anchor?overlay:null;
  useHelpWebMarginWheel(conversationPane,scroll,desktopWeb&&active!==null&&isFocused&&entrySettled&&!leavingChat&&!routeLeaving&&!chatSearchList&&!overlay&&!gallery&&!entityCards.isOpen&&!attachmentsVisible&&!(listDrawerOpen&&!splitView));
  const webRowMenuFrame=webRowMenu?helpTicketMenuFrame(webRowMenu.anchor!,windowSize,webRowMenu.ticket.status==='OPEN'&&webRowMenu.ticket.ownerId===service.userId?2:1):null;
  const renderTicketList = ({paddingTop,paddingBottom,emptyState,footerState,onEndReached}:{paddingTop:number;paddingBottom:number}&Partial<AppListPanelListProps>) => <FlashList ref={listScroll} testID="help-ticket-list" nativeID={`help-ticket-scroll-${nativeLayoutId}`} showsVerticalScrollIndicator={Platform.OS!=='web'} data={visible} maintainVisibleContentPosition={listPositionPolicy} keyExtractor={item=>String(item.id)} extraData={listExtraData} style={{backgroundColor:c.background}} keyboardShouldPersistTaps="handled" contentContainerStyle={{paddingTop,paddingBottom}} drawDistance={300}
          onScroll={onTicketListScroll} scrollEventThrottle={16} onViewableItemsChanged={prepareVisibleTickets}
          onEndReachedThreshold={.5} onEndReached={onEndReached??(()=>{if(!listVisible||!service.hasMore||service.loading||listPaging.current)return;listPaging.current=true;void service.loadTickets(filter,scope,true,search.trim()).finally(()=>{listPaging.current=false;});})}
          ListEmptyComponent={emptyState??<View style={{ alignItems: 'center', justifyContent:'center', minHeight:service.loading?300:undefined, padding: 35, gap: 12 }}>{service.loading ? <View testID="help-chats-loading" accessibilityRole="progressbar" accessibilityLabel="Загрузка чатов" style={{alignItems:'center',gap:14}}><ActivityIndicator size="large" color={c.accent}/><Text accessibilityLiveRegion="polite" style={{color:c.muted,fontSize:14}}>Загружаем чаты…</Text></View> : <><Ionicons name={filter === 'CLOSED' ? 'archive-outline' : 'chatbubbles-outline'} color={c.muted} size={38} /><Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{search ? 'Ничего не найдено' : filter === 'CLOSED' ? 'Закрытых обращений пока нет' : 'Расскажите, чем помочь'}</Text><Text style={{ color: c.muted, textAlign: 'center', fontSize: 13 }}>{search ? 'Попробуйте другой запрос' : 'Ваши сообщения и вложения увидят специалисты IT.'}</Text></>}</View>}
          ListFooterComponent={footerState??null}
          renderItem={renderTicketRow}
        />;
  return <HelpVisualEffectsContext.Provider value={isFocused&&!routeLeaving}><HelpHtmlCacheContext.Provider value={htmlCache}><HelpImageCacheContext.Provider value={imageCache}><HelpMessageLayoutCacheContext.Provider value={messageLayoutCache}><HelpPlaybackScope userId={service.userId} ticketId={typeof active === 'number' ? active : null} onError={tell}><HelpPhotoPortalProvider headerHeight={active===null?0:listHeaderHeight} blurTarget={photoBlurTarget} foreground={attachmentsVisible&&active!==null?chatHeaderOverlay:null}><KeyboardAvoidingView testID="help-screen-navigation" pointerEvents={routeLeaving?'none':'auto'} {...chatSwipeBack.panHandlers} style={{ flex: 1, backgroundColor: c.background, paddingTop: 0 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View testID="help-workspace" onLayout={event=>setWorkspaceWidth(event.nativeEvent.layout.width)} style={{flex:1,width:'100%',maxWidth:Platform.OS==='web'?undefined:900,alignSelf:'center',flexDirection:'row',overflow:'hidden'}}>
      {/* Preserve the list/scroll position under the chat, but release its live
          blur once covered. Opacity/translation alone does not detach BlurView. */}
      <HelpVisualEffectsContext.Provider value={isFocused&&!routeLeaving&&(listVisible||!openingFromRoute&&!entrySettled&&!leavingChat&&preparedScene!==`${service.userId}:${scene.key}`)}>
      <Reanimated.View testID="help-list-scene" key="help-list-scene" pointerEvents={listVisible&&(!openingFromRoute||splitView)?'auto':'none'} accessibilityElementsHidden={!listVisible} importantForAccessibility={listVisible?'auto':'no-hide-descendants'} aria-hidden={!listVisible} style={[
        splitView?{width:APP_LAYOUT.helpListWidth,flexShrink:0,borderRightWidth:1,borderRightColor:c.line}:active===null?{flex:1}:StyleSheet.absoluteFill,
        listMotion,
        desktopWeb&&listDrawerOpen&&!splitView?{right:undefined,width:APP_LAYOUT.helpListWidth,zIndex:5,borderRightWidth:1,borderRightColor:c.line,backgroundColor:c.background,transform:[{translateX:0}]}:undefined,
        Platform.OS==='web'&&!listVisible?{opacity:0,visibility:'hidden'} as any:openingFromRoute&&!splitView?{opacity:0}:undefined,
      ]}>

        {Platform.OS==='web' ? <AppListPanel header={listHeader} footer={<AppListPanelActionButton text="Новое обращение" onPress={()=>newTicket()}/>}
          loadState={{scope:`${service.userId}:${filter}:${scope}:${search.trim()}`,itemCount:visible.length,loading:service.listLoading??(active===null&&service.loading),
            hasMore:service.hasMore,error:service.listError,query:search,
            loadingLabel:'Загружаем обращения…',emptyTitle:filter==='CLOSED'?'Закрытых обращений пока нет':'Расскажите, чем помочь',
            emptyDescription:'Ваши сообщения и вложения увидят специалисты IT.',onClear:()=>setSearch(''),
            onRetry:()=>service.loadTickets(filter,scope,false,search.trim()),onLoadMore:()=>service.loadTickets(filter,scope,true,search.trim())}}
          renderList={renderTicketList} scrollRef={listScroll} scrollId={`help-ticket-scroll-${nativeLayoutId}`}
          active={listVisible&&isFocused&&!routeLeaving} topInset={insets.top} bottomInset={insets.bottom} headerKey={desktopWeb?'desktop':'compact'} scrollbarLabel="Прокрутка списка обращений" initialHeaderHeight={listSceneHeaderHeight}
          initialFooterHeight={listDockHeight} onHeaderHeight={setListSceneHeaderHeight} onFooterHeight={setListDockHeight}
          ids={{root:'help-list-panel',viewport:'help-ticket-viewport',header:'help-list-header-overlay',backdrop:'help-list-header-backdrop',footer:'help-list-dock',scrollbar:'help-ticket-scrollbar',thumb:'help-ticket-scrollbar-thumb'}}/>
          : <>
        {/* Keep rows behind both floating panels so the shared blur can sample
            them. Only the separate scrollbar track excludes header/dock space. */}
        <BlurTargetView testID="help-ticket-viewport" ref={listBlurTarget} style={{flex:1}}>{renderTicketList({paddingTop:listSceneHeaderHeight,paddingBottom:100})}</BlurTargetView><HelpHeaderOverlay id="help-list-header-overlay" backdropId="help-list-header-backdrop" target={listBlurTarget} topInset={insets.top} onLayout={event=>{setListSceneHeaderHeight(event.nativeEvent.layout.height);}}>{listHeader}</HelpHeaderOverlay><View testID="help-list-dock" style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}><HelpDock target={listBlurTarget}><View style={{ paddingHorizontal: HELP_LIST_INSET - 8 }}><HelpPrimaryButton text="Новое обращение" onPress={() => newTicket()} /></View></HelpDock></View>
        </>}
      </Reanimated.View>
      </HelpVisualEffectsContext.Provider>
      {desktopWeb&&listDrawerOpen&&!splitView&&active!==null?<Pressable testID="help-list-drawer-dismiss" accessibilityRole="button" accessibilityLabel="Закрыть список обращений" onPress={()=>setListDrawerOpen(false)} style={[StyleSheet.absoluteFill,{zIndex:4,left:APP_LAYOUT.helpListWidth,backgroundColor:'#00000022'}]}/>:null}
      <View testID="help-conversation-pane" ref={node=>{conversationPane.current=node;if(Platform.OS==='web'&&node)(node as unknown as HTMLElement).inert=desktopWeb&&!splitView&&listDrawerOpen;}} style={{flex:1,minWidth:0,display:active!==null||splitView?'flex':'none',overflow:'hidden'}}>
      <View ref={chatBounds} onLayout={event=>{setSceneWidth(event.nativeEvent.layout.width);measureKeyboard();}} style={{flex:1,width:'100%',maxWidth:desktopWeb?APP_LAYOUT.chatMaxWidth:undefined,alignSelf:'center'}}>
      {active===null&&splitView?<View testID="help-select-conversation" style={{flex:1,alignItems:'center',justifyContent:'center',padding:32,gap:14}}><HelpAiIcon size={44}/><Text style={{color:c.text,fontSize:24,fontWeight:'600',textAlign:'center'}}>Чем помочь?</Text><Text style={{color:c.muted,fontSize:15,lineHeight:22,textAlign:'center'}}>Выберите обращение слева или начните новое</Text><View style={{marginTop:12,minWidth:220}}><HelpPrimaryButton text="Новое обращение" onPress={()=>newTicket()}/></View></View>:null}
      {openingFromRoute?<View testID="help-direct-chat-loading" pointerEvents="none" style={[StyleSheet.absoluteFill,{alignItems:'center',justifyContent:'center',gap:12,backgroundColor:c.background}]}><ActivityIndicator color={c.accent}/><Text style={{color:c.muted,fontSize:14}}>Открываем обращение…</Text></View>:null}
      {active !== null ? <HelpChatEntry key={`${service.userId}:${scene.key}`} ref={chatEntry} progress={chatProgress} animateEntry={!openingFromRoute&&!desktopWeb} animateExit={!desktopWeb} initialWidth={sceneWidth} ready={entryKeyboardReady&&(active==='new'||preparedScene===`${service.userId}:${scene.key}`)} interactive={!leavingChat} backgroundColor={c.background} onEntered={()=>{setEntrySettled(true);setOpeningFromRoute(false);if(active==='new'&&!leavingChat)setFocusKey(value=>value+1);if(pendingChatOpen.current?.id===active&&!leavingChat)pendingChatOpen.current.start();helpDevEvent('chat.open.transitionFinished',{ticketId:typeof active==='number'?active:null,finishedAt:Date.now()});}} onLayout={event=>setChatViewportHeight(event.nativeEvent.layout.height)}>
        <HelpMessageArrivalContext.Provider value={arrivalRegistry}>
        <View nativeID={nativeViewportId} collapsable={false} testID="help-chat-visible-viewport" style={boundedChat?{position:'absolute',top:0,left:0,right:0,bottom:hasNativeStableImeLayout?0:dockHeight+imeInset,overflow:'hidden'}:{flex:1}}><BlurTargetView ref={blurTarget} style={{ flex: 1 }}>
          <HelpTimeline suppressTailMotion={selectingMessages} pendingQuestionExchanges={pendingQuestionExchanges} questionExchanges={questionExchanges} onLiveTailStart={()=>setLiveTailScene(`${service.userId}:${scene.key}`)} prepareBeforeEntry={active!=='new'} entrySettled={entrySettled} obscuredBottom={hasNativeStableImeLayout?obscuredBottom:undefined} pendingMessages={displayedPending} renderPending={renderPending} bottomAligned={scene.bottomAligned} key={`${service.userId}:${scene.key}`} onReady={()=>{setPreparedScene(`${service.userId}:${scene.key}`);helpDevEvent('chat.open.historyReady',{ticketId:typeof active==='number'?active:null,at:Date.now()});}} ref={scroll} messages={messages} nativeID={nativeScrollId} headerHeight={listHeaderHeight} dockHeight={boundedChat?(hasNativeStableImeLayout?dockHeight+imeInset:0):dockHeight+imeInset}
            navigationTarget={service.navigationTarget} firstUnreadSequence={service.firstUnreadSequence} hasOlder={service.hasOlder} hasNewer={service.hasNewer}
            loadingOlder={service.loadingOlder} loadingNewer={service.loadingNewer} loading={service.loading||(typeof active==='number'&&!ticket)} online={service.online}
            onLatestState={setLatestControl} onDatePresentationChange={publishTimelineDates} hideLatestButton={chatSearchOpen} active={isFocused && entrySettled && !chatSearchList && !overlay && !gallery && !entityCards.isOpen} unreadCount={ticket?.unreadCount}
            loadOlder={service.loadOlder} loadNewer={service.loadNewer} onLatest={async()=>{if(await(scroll.current?.waitForJumpReady?.()??true))return service.jumpToLatest();}} onDate={async date=>{if(await(scroll.current?.waitForJumpReady?.()??true))return service.jumpToDate(date);}} onUserScroll={service.cancelNavigation} onSave={(anchor,options)=>service.saveViewport(anchor,typeof active==='number'?active:undefined,options)} onRead={service.markVisibleRead}
            onFollow={value=>{followBottom.current=value;setNativeFollow(value);}} onHighlight={highlight} onError={tell}
            header={timelineHeader} footer={timelineFooter} renderMessage={renderMessage}/>
        </BlurTargetView></View>
        {active === 'new'&&!displayedPending.length ? <HelpEmptyConversation nativeID={hasNativeEmptyHintMotion?nativeEmptyHintId:undefined} keyboardInset={hasNativeEmptyHintMotion?0:imeInset} active={isFocused} style={{position:'absolute',top:listHeaderHeight,left:0,right:0,bottom:dockHeight+(Platform.OS==='web'?imeInset:0)}}/> : null}
        {chatSearchOpen && chatSearchList ? <View testID="help-chat-search-results-overlay" style={{position:'absolute',top:listHeaderHeight,left:0,right:0,bottom:dockHeight+imeInset,backgroundColor:c.background,zIndex:1}}><HelpChatSearchResults messages={chatResults} query={chatSearchQuery} selectedId={chatResults[chatResultIndex]?.id} loading={chatSearchLoading} hasMore={chatSearchCursor!==null} onLoadMore={()=>void moreSearch()} onSelect={message=>void showSearchResult(message,chatResults.findIndex(item=>item.id===message.id))} error={chatSearchError}/></View> : null}
        {!attachmentsVisible?chatHeaderOverlay:null}
        <HelpTimelineDatesHost ref={timelineDates} hidden={chatSearchList||attachmentsVisible} headerHeight={listHeaderHeight} bottom={dockHeight+imeInset} onPress={date=>scroll.current?.jumpToDate(date)}/>
        <View nativeID={nativeDockId} testID="help-chat-dock-layout" pointerEvents="box-none" style={{ zIndex:2, position: 'absolute', bottom: (boundedChat&&!hasNativeStableImeLayout)||Platform.OS==='web'?imeInset:0, left: 0, right: 0 }}>
          {legacyDockControls?<View testID="help-dock-controls-native-visual" pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill,{zIndex:0}]}>{renderDockControls(dockHeight+12,'visual')}</View>:null}
          {notice ? <HelpNotice key={notice} text={notice} onDone={() => setNotice('')} /> : null}<View testID="help-chat-dock-surface" style={{zIndex:1}}><HelpDock onHeightFrame={hasNativeStableImeLayout?onDockHeightFrame:undefined} stableKeyboardLayout={hasNativeStableImeLayout} target={blurTarget} onHeight={setDockHeight}>
          <HelpSelectionDock active={selectingMessages} canReply={canReplySelected} canForward={Boolean(isParticipant)} onReply={replySelected} onForward={forwardSelected}>{chatSearchOpen ? <HelpChatSearchDock query={chatSearchQuery} total={chatSearchTotal} selectedIndex={chatResultIndex} loading={chatSearchLoading} showList={chatSearchList} onToggleList={()=>setChatSearchList(value=>!value)} error={chatSearchError}/> : waitingForIt ? <HelpContinueAi busy={continuingAi} disabled={busy || !service.aiEnabled} onPress={()=>void continueWithAi()}/> : ticket?.status === 'CLOSED' && mode === 'message' ? !isOwner ? <HelpPrimaryButton text="Закрыт" icon="lock-closed-outline" disabled onPress={()=>{}}/> : <View>{ticket.canRate?<Pressable testID="help-rate-ticket" accessibilityRole="button" accessibilityLabel="Оценить помощь" onPress={()=>startMode('close')} disabled={busy} style={{minHeight:44,alignItems:'center',justifyContent:'center'}}><Text style={{color:c.accentText,fontSize:15}}>Оценить помощь</Text></Pressable>:null}{canReopenHelpTicket(ticket) ? <HelpPrimaryButton text="Открыть повторно" icon="sync-outline" onPress={()=>startMode('reopen')}/> : <><View style={{flexDirection:'row',justifyContent:'center',alignItems:'center',gap:6,paddingHorizontal:8,paddingBottom:9}}><Ionicons name="lock-closed-outline" size={15} color={c.muted}/><Text style={{color:c.muted,fontSize:12,lineHeight:18}}>Закрыт{ticket.closedAt ? ' · прошло больше 3 дней' : ''}</Text></View><HelpPrimaryButton text="Создать новое обращение" onPress={()=>newTicket({id:ticket.id,number:ticket.number,title:ticket.title})}/></>}</View> : ticket&&!isParticipant ? <HelpPrimaryButton text="Взять обращение" icon="headset-outline" disabled={busy||!service.canManage} onPress={()=>void manageIt('join')}/> : <HelpComposer ref={composerActions} hideSendAction={isQuestionInput&&!questionReady} questionPanel={questionInputPanel} inputHint={isQuestionInput?'Напишите свой ответ':undefined} questionActionLabel={isQuestionInput?(questionPosition.index<questions.length-1?'Далее':'Отправить ответы'):undefined} focusSuspended={selectingMessages||Boolean(gallery)||entityCards.isOpen} closeAttachmentsKey={closeAttachmentsKey} blurTarget={blurTarget} navigationReady={entrySettled&&!leavingChat} onAttachmentVisibility={setAttachmentsVisible} screenActive={isFocused&&entrySettled} voiceDraftKey={`${encodeURIComponent(API_BASE_URL)}:${service.userId}:${draftKey}`} key={`${service.userId}:${scene.key}:${mode}`} value={draft} onChange={changeDraft} files={files} onFiles={changeFiles} onSend={submitComposer} sendBlocked={Boolean(pendingCreate)||queuedOwnCreate||active!=='new'&&!ticket} onStopAssistant={activeAssistant?.assistantRun ? ()=>{helpHaptic('selection');if(assistantPreview)assistantPreview.stop(activeAssistant.ticketId,activeAssistant.assistantRun!.runId);else void run(()=>assistantActions.stopAssistant!(activeAssistant.ticketId,activeAssistant.assistantRun!.runId));} : undefined} busy={busy} mode={mode} rating={rating} onRating={value=>{if(value!==rating)helpHaptic('selection');setRating(value);}} onCancelMode={cancelMode} quote={reply ? {name:reply.author?.name||'Сообщение',text:reply.text||'Вложение',thumbnail:reply.attachments.find(item=>item.kind==='IMAGE'),onPress:()=>jump(reply.id)} : undefined} resolve={service.mediaSource} recordingAreaHeight={Math.max(0,chatViewportHeight-listHeaderHeight-dockHeight-imeInset+8)} onCancelQuote={()=>setReply(null)} error={tell} focusKey={focusKey} onResize={inputHeight=>{ if(inputHeight!==undefined&&Number.isFinite(inputHeight))setQuestionComposerHeight(previous=>Math.abs(previous-inputHeight)<1?previous:Math.max(48,inputHeight));composerResizingUntil.current=Date.now()+320; scrollBottom(false); }} disabled={active!=='new'&&!ticket&&!entrySettled} editClosure={editing?.kind==='CLOSURE'} existingFiles={mode==='edit' ? editAttachments : undefined} onRemoveExisting={id=>setEditAttachments(values=>values.filter(a=>a.id!==id))}/>}
        </HelpSelectionDock>
</HelpDock></View></View>
        <HelpDockControls nativeID={nativeControlsId} nativeSynced={hasNativeDockControls} dockHeight={dockHeight} imeInset={boundedChat||Platform.OS==='web'?imeInset:0}>{bottom=><>
          {renderDockControls(bottom,legacyDockControls?'interaction':'full')}
        </>}
        </HelpDockControls>
        {/* Timeline owns measured message growth; native layout keeps IME/dock
            following without adding a second, text-sized arrival spring. */}
        {hasNativeChatLayout ? <HelpNativeChatLayout manageIme={isFocused} key={`${service.userId}:${scene.key}`} scrollId={nativeScrollId} dockId={nativeDockId} controlsId={nativeControlsId} emptyHintId={active==='new'&&!displayedPending.length?nativeEmptyHintId:undefined} viewportId={nativeViewportId} allowFollow={nativeFollow && !service.hasNewer} animateTail={!selectingMessages&&hasNativeAtomicTailMotion&&entrySettled&&liveTailScene===`${service.userId}:${scene.key}`} onImeInsetChange={hasNativeImeLayout ? setImeInset : undefined}/> : null}
        </HelpMessageArrivalContext.Provider>
      </HelpChatEntry> : null}
      </View></View>
    </View>
    {active === null && notice ? <View style={{ position: 'absolute', bottom: 85 + insets.bottom, left: 0, right: 0 }}><HelpNotice key={notice} text={notice} onDone={() => setNotice('')} /></View> : null}
    {gallery ? <HelpGallery attachments={gallery.images} initialIndex={gallery.index} origin={gallery.origin} resolve={service.mediaSource} onClose={() => setGallery(null)} onError={tell} /> : null}
    {overlay?.kind === 'menu' && (ticket || active === 'new' || assistantPreview) ? <HelpDropdown testID="help-chat-dropdown" label="Закрыть меню обращения" onClose={()=>setOverlay(null)} top={chatMenuAnchor?.top??listHeaderHeight-6} right={chatMenuAnchor?.right??HELP_LIST_INSET} width={264}>
        {assistantPreview ? <HelpAssistantPreviewMenu preview={assistantPreview} ticketId={ticket?.id} onClose={() => setOverlay(null)}/> : null}
        {recoverablePending.length ? <HelpDropdownAction label={`Восстановить отправку (${recoverablePending.length})`} accessibilityLabel="Восстановить отправку" icon="refresh-outline" disabled={busy} onPress={()=>{setOverlay(null);recoverPending();}}/> : null}
        <HelpDropdownAction label="Поиск в переписке" icon="search-outline" onPress={()=>{setOverlay(null);saveDraftNow();Keyboard.dismiss();setChatSearchOpen(true);}}/>
        {ticket&&service.canManage&&!isOwner?<>
          <HelpDropdownAction label="Контекст для IT" icon="document-text-outline" onPress={()=>setOverlay({kind:'it-brief'})}/>
          {!isItMember&&ticket.status==='OPEN'?<HelpDropdownAction disabled={busy} label="Подключиться к чату" icon="headset-outline" onPress={()=>void manageIt('join')}/>:null}
          {isItMember&&ticket.status==='OPEN'?<HelpDropdownAction disabled={busy} label="Покинуть чат" icon="exit-outline" onPress={()=>void manageIt('leave')}/>:null}
          {isItMember&&ticket.status==='OPEN'?<HelpDropdownAction disabled={busy} label="Закрыть чат" icon="checkmark-circle-outline" onPress={()=>void manageIt('close')}/>:null}
        </>:null}
        {active === 'new' || ticket?.status === 'OPEN' && isOwner ? <><HelpDropdownAction disabled={active === 'new'||waitingForIt} label="Закрыть обращение" icon="checkmark-circle-outline" onPress={()=>startMode('close')}/><HelpDropdownAction disabled={!canRequestIt} label="Подключить IT" icon="headset-outline" onPress={()=>setOverlay({kind:'it'})}/></> : null}
    </HelpDropdown> : null}
    {webRowMenu&&webRowMenuFrame?<HelpDropdown testID="help-ticket-dropdown" label="Закрыть действия с обращением" onClose={()=>setOverlay(null)} {...webRowMenuFrame}>
      <HelpDropdownAction label="Открыть переписку" icon="chatbubble-outline" onPress={()=>{setOverlay(null);void open(webRowMenu.ticket.id);}}/>
      {webRowMenu.ticket.status==='OPEN'&&webRowMenu.ticket.ownerId===service.userId?<HelpDropdownAction label="Закрыть обращение" icon="checkmark-circle-outline" onPress={()=>{setOverlay(null);void run(async()=>{await open(webRowMenu.ticket.id);startMode('close');});}}/>:null}
    </HelpDropdown>:null}
    {overlay?.kind==='forward'?<HelpForwardSheet key={`${service.userId}:${overlay.message.id}`} tickets={service.tickets} currentTicketId={ticket?.id} userId={service.userId} dateNow={listDateNow} drafts={listDrafts} typing={service.typingByTicket} onClose={()=>setOverlay(null)} onError={tell} onForward={async destination=>{const account=service.userId,navigation=navigationGeneration.current;const sent=selectedForwardProgress.current.get(destination.id)??new Set<number>();selectedForwardProgress.current.set(destination.id,sent);for(const item of overlay.messages??[overlay.message]){if(currentAccount.current!==account||navigationGeneration.current!==navigation)throw new Error('Пересылка отменена: чат или аккаунт изменился.');if(sent.has(item.id))continue;await service.sendMessage(destination.id,{text:item.text,forwardedFromId:item.id});sent.add(item.id);}if(overlay.messages)clearMessageSelection();setOverlay(current=>current===overlay?null:current);tell('Сообщение переслано');}}/>:null}
    {overlay && overlay.kind !== 'menu' && overlay.kind !== 'forward' && !webRowMenu ? <HelpSheet resizable={false} maxHeight={overlay.kind==='it'?420:undefined} scrollOffset={overlay.kind==='it-brief' ? sheetOffset : 0} title={overlay.kind === 'it' ? 'Вызвать IT-специалиста?' : overlay.kind==='it-brief'?'Контекст для IT':'Действия с обращением'} onClose={() => { setOverlay(null); setSheetOffset(0); }}>
      {overlay.kind==='it-brief'&&ticket&&service.canManage&&!isOwner?<HelpItBriefPanel key={`${service.userId}:${ticket.id}`} ticketId={ticket.id} userId={service.userId} onScroll={setSheetOffset} onMessage={id=>{setOverlay(null);setSheetOffset(0);jump(id);}}/>:null}
      {overlay.kind === 'it' && ticket ? <><Text style={{color:c.muted,fontSize:14,lineHeight:21,marginBottom:18}}>После подтверждения обращение будет передано IT-специалистам вместе со всей перепиской и вложениями.</Text><HelpPrimaryButton variant="sheet" text={requestingIt ? 'Передаём обращение…' : 'Подтвердить вызов'} icon="headset-outline" disabled={busy || !canRequestIt} onPress={() => void confirmRequestIt()} /><Pressable accessibilityRole="button" accessibilityLabel="Отмена" disabled={requestingIt} onPress={() => setOverlay(null)} style={{minHeight:44,alignItems:'center',justifyContent:'center',marginTop:8}}><Text style={{color:c.muted,fontSize:14}}>Отмена</Text></Pressable></> : null}
      {overlay.kind === 'row' ? <View style={{ gap: 10 }}><SheetAction label="Открыть переписку" icon="chatbubble-outline" onPress={() => void open(overlay.ticket.id)} />{overlay.ticket.status === 'OPEN' && overlay.ticket.ownerId === service.userId ? <SheetAction label="Закрыть обращение" icon="checkmark-circle-outline" onPress={() => void run(async () => { await open(overlay.ticket.id); startMode('close'); })} /> : null}</View> : null}
    </HelpSheet> : null}
  </KeyboardAvoidingView></HelpPhotoPortalProvider></HelpPlaybackScope></HelpMessageLayoutCacheContext.Provider></HelpImageCacheContext.Provider></HelpHtmlCacheContext.Provider></HelpVisualEffectsContext.Provider>;
}

function SheetAction({ label, icon, onPress, disabled = false }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; disabled?: boolean }) {
  const c = useHelpTheme(); const reduced=useHelpReducedMotion(); return <Pressable {...appWebControlProps('row')} accessibilityRole="button" accessibilityLabel={label} disabled={disabled} accessibilityState={{disabled}} onPress={onPress} style={({ pressed }) => ({minHeight:51,paddingVertical:8,borderBottomWidth:1,borderBottomColor:c.line,flexDirection:'row',alignItems:'center',gap:7,opacity:disabled ? .38 : pressed ? .6 : 1,transform:[{scale:pressed&&!disabled&&!reduced ? .96 : 1}]})}><Ionicons {...appWebControlContentProps()} name={icon} color={c.accentText} size={22}/><Text {...appWebControlContentProps()} style={{color:c.text,flex:1,fontSize:14}}>{label}</Text></Pressable>;
}
