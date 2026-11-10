import {helpTailContentChanged,helpTailDisplacement,helpTailMotionLimit,helpTailHistoryChange} from '../src/features/help/helpTailMotion';
import {helpTimelineRows} from '../src/features/help/helpTimelineModel';
import type {HelpMessage} from '../src/features/help/helpApi';
const before={width:390,height:800,content:300,margin:400};
const active={active:true,liveGrowth:true};

test.each([['text',60],['voice',88],['photo',360],['album',620]])('%s uses the full measured growth in both short and long histories',(_kind,growth)=>{
  expect(helpTailDisplacement(before,{...before,content:before.content+growth,margin:Math.max(0,before.margin-growth)},active)).toBe(growth);
  const long={...before,content:1600,margin:0};
  expect(helpTailDisplacement(long,{...long,content:long.content+growth},active)).toBe(growth);
});

test('crossing from bottom alignment to scrolling has one continuous owner',()=>{
  expect(helpTailDisplacement({...before,content:680,margin:20},{...before,content:1040,margin:0},active)).toBe(360);
});

test('keyboard geometry, history prepend and reading away from the end do not get an arrival animation',()=>{
  const next={...before,content:660,margin:40};
  expect(helpTailDisplacement(before,next,{...active,active:false})).toBe(0);
  expect(helpTailDisplacement(before,next,{...active,liveGrowth:false})).toBe(0);
  expect(helpTailDisplacement(before,{...next,height:500},active)).toBe(0);
  expect(helpTailDisplacement(null,next,active)).toBe(0);
});

test('a shorter replacement eases down and rapid accumulated growth stays inside rendered viewports',()=>{
  expect(helpTailDisplacement(before,{...before,content:250,margin:450},active)).toBe(-50);
  expect(helpTailDisplacement(before,{...before,content:1300,margin:0},active)).toBe(800);
  expect(helpTailDisplacement({...before,content:1300},{...before,content:300},active)).toBe(-800);
  expect(helpTailMotionLimit(320)).toBe(320);
  expect(helpTailMotionLimit(Infinity)).toBe(0);
});
test('superseded AI removal keeps streaming motion while real older pages stay anchored',()=>{
  const before=['date:one','message:1','date:two','message:2'];
  expect(helpTailHistoryChange(before,['date:two','message:2'])).toBe(false);
  expect(helpTailHistoryChange(before,['date:new','message:0',...before])).toBe(true);
  expect(helpTailHistoryChange(before,['date:renamed','message:1','date:two','message:2'])).toBe(false);
  expect(helpTailHistoryChange(before,['date:other','message:9'])).toBe(true);
  expect(helpTailHistoryChange([],before)).toBe(false);
});

test('tail motion starts from body/pending changes, not replay identity, read markers or profile metadata',()=>{
  const message={id:1,sequence:1,text:'Answer',kind:'TEXT',createdAt:'2026-11-06T10:00:00Z',assistantRun:{status:'completed',updatedAt:1,eventId:1,metrics:{elapsedMs:20}},attachments:[{id:'file',name:'image.png',kind:'IMAGE',size:100,width:10}]} as HelpMessage;
  const before=helpTimelineRows([message]);
  const replay={...message,createdAt:'2026-11-06T11:00:00Z',author:{id:5,name:'Profile',avatarUrl:'avatar.png'},attachments:message.attachments.map(file=>({...file,width:100})),assistantRun:{...message.assistantRun!,updatedAt:2,eventId:2,metrics:{startedAt:1,elapsedMs:40}}};
  expect(helpTailContentChanged(before,helpTimelineRows([replay],1))).toBe(false);
  expect(helpTailContentChanged(before,helpTimelineRows([{...replay,text:'Edited answer'}]))).toBe(true);
  expect(helpTailContentChanged(before,helpTimelineRows([{...replay,assistantRun:{...replay.assistantRun!,draftText:'Streaming answer'}}]))).toBe(true);
  expect(helpTailContentChanged(before,helpTimelineRows([{...message,id:0,sequence:0},message]))).toBe(false);
  expect(helpTailContentChanged(before,helpTimelineRows([{...message,id:8,sequence:8}]))).toBe(false);
  const pending={key:'pending',create:false,ticketId:7,createdAt:Date.now(),input:{text:'New message',clientMessageId:'pending'}};
  expect(helpTailContentChanged(before,helpTimelineRows([message],null,[pending]))).toBe(true);
});
