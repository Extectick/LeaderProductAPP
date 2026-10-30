import type { FixtureSnapshot } from '../qa/help-preview/fixturePersistence';
const mockValues=new Map<string,string>();
jest.mock('@react-native-async-storage/async-storage',()=>({
  getItem:jest.fn(async(key:string)=>mockValues.get(key)??null),
  setItem:jest.fn(async(key:string,value:string)=>{mockValues.set(key,value);}),
  multiGet:jest.fn(async(keys:string[])=>keys.map(key=>[key,mockValues.get(key)??null])),
  multiSet:jest.fn(async(rows:[string,string][])=>{rows.forEach(([key,value])=>mockValues.set(key,value));}),
  multiRemove:jest.fn(async(keys:string[])=>{keys.forEach(key=>mockValues.delete(key));}),
}));
const storage=()=>require('../qa/help-preview/fixturePersistence') as typeof import('../qa/help-preview/fixturePersistence');
function snapshot():FixtureSnapshot {
  return {tickets:[{id:1043,title:'Saved'} as any],histories:[[1043,Array.from({length:750},(_,i)=>({id:i+1,sequence:i+1,text:`Message ${i+1}`} as any))]],anchors:[[1043,{messageId:20,sequence:20,offset:-12,atLatest:false}]],drafts:[['1043','Draft']],readCursors:[[1043,300]],assistantTickets:[1043],nextTicket:1043,nextAssistantMessage:2000005};
}
beforeEach(()=>{mockValues.clear();jest.resetModules();});
test('all history pages, drafts and viewport survive a fresh module load',async()=>{
  const saved=snapshot();await storage().saveFixtureSnapshot(saved);
  jest.resetModules();const fresh=storage();const first=fresh.loadFixtureSnapshot();expect(fresh.loadFixtureSnapshot()).toBe(first);
  const loaded=await first;expect(loaded?.histories[0][1]).toHaveLength(750);
  expect(loaded?.anchors).toEqual(saved.anchors);expect(loaded?.drafts).toEqual(saved.drafts);
  expect(loaded?.nextAssistantMessage).toBe(2000005);
});
test('serialized saves publish the newest manifest and collect previous page keys',async()=>{
  const first=snapshot(),second={...first,drafts:[['1043','New draft']] as [string,string][]};
  await Promise.all([storage().saveFixtureSnapshot(first),storage().saveFixtureSnapshot(second)]);
  expect(mockValues.size).toBe(9);jest.resetModules();expect((await storage().loadFixtureSnapshot())?.drafts).toEqual(second.drafts);
});
test('resuming an AI stream preserves task and partial answer instead of repeating completed steps',()=>{
  jest.useFakeTimers();
  const {FixtureAssistant}=require('../qa/help-preview/assistantFixture');
  const assistant=new FixtureAssistant(),events:any[]=[];
  const run={ticketId:1043,runId:'saved',eventId:9,status:'streaming',step:3,completedSteps:4,startedAt:100,updatedAt:200,taskId:'task',contextMessageCount:2,scenario:'answer'};
  try{assistant.start(1043,'Ошибка заказа','answer',(state:any,text:string)=>events.push({state,text}),undefined,{run,text:'Предлагаю сначала '});
    expect(events[0]).toMatchObject({state:{runId:'saved',taskId:'task',status:'streaming',eventId:10},text:'Предлагаю сначала '});
    jest.advanceTimersByTime(100);expect(events.at(-1).text.length).toBeGreaterThan(events[0].text.length);
  }finally{assistant.dispose();jest.useRealTimers();}
});
