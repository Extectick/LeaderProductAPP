import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {helpDateJumpMode,helpLocalDayBounds} from '../src/features/help/helpDateNavigation';
import {findFixtureDateMessage} from '../qa/help-preview/historyFixture';
import type {HelpMessage} from '../src/features/help/helpApi';

function inTimezone(timezone:string,inputs:string[]){
  const source=readFileSync(path.join(__dirname,'../src/features/help/helpDateNavigation.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const script=`${compiled}\nprocess.stdout.write(JSON.stringify(${JSON.stringify(inputs)}.map(exports.helpLocalDayBounds)));`;
  return JSON.parse(execFileSync(process.execPath,['-e',script],{env:{...process.env,TZ:timezone},encoding:'utf8'}));
}
test('calendar day uses local midnight and ISO inputs resolve to the local date',()=>{
  const [plain,instant]=inTimezone('Asia/Novosibirsk',['2026-10-28','2026-10-27T20:30:00.000Z']);
  expect(plain).toEqual({dateKey:'2026-10-28',from:'2026-10-27T17:00:00.000Z',to:'2026-10-28T17:00:00.000Z'});
  expect(instant).toEqual(plain);
});
test('DST days span 23 or 25 hours rather than adding 86400000 milliseconds',()=>{
  const [spring,fall]=inTimezone('America/New_York',['2026-03-08','2026-11-01']);
  expect(Date.parse(spring.to)-Date.parse(spring.from)).toBe(23*3600000);
  expect(Date.parse(fall.to)-Date.parse(fall.from)).toBe(25*3600000);
  expect(spring).toMatchObject({from:'2026-03-08T05:00:00.000Z',to:'2026-03-09T04:00:00.000Z'});
  expect(fall).toMatchObject({from:'2026-11-01T04:00:00.000Z',to:'2026-11-02T05:00:00.000Z'});
});
test('invalid dates cannot roll into another calendar day silently',()=>{
  for(const value of ['2026-02-29','2026-02-30','2026-13-01','2026-00-01','2026-10-00','1','not-a-date'])expect(()=>helpLocalDayBounds(value)).toThrow('корректную дату');
  expect(helpLocalDayBounds('2024-02-29').dateKey).toBe('2024-02-29');
});
test('fixture finds earliest sequence within the complete day, not first timestamp or visible window',()=>{
  const {from,to}=helpLocalDayBounds('2026-10-28'),start=Date.parse(from);
  const message=(sequence:number,time:string)=>({id:sequence+100,sequence,createdAt:time} as HelpMessage);
  const rows=[message(1,new Date(start-1).toISOString()),message(9,new Date(start+1000).toISOString()),message(4,new Date(start+2000).toISOString()),message(3,to)];
  expect(findFixtureDateMessage(rows,'2026-10-28')).toEqual({messageId:104,sequence:4});
  expect(findFixtureDateMessage(rows,'2026-10-30')).toBeNull();
});

describe('date jump chooses motion from the actual target position',()=>{
  const viewport={viewportTop:100,viewportBottom:700};
  test('readable beginning already on screen stays in place, including a tall message',()=>{
    for(const targetTop of [100,200,668])expect(helpDateJumpMode({...viewport,targetTop,targetHeight:90})).toBe('visible');
    expect(helpDateJumpMode({...viewport,targetTop:180,targetHeight:2000})).toBe('visible');
    expect(helpDateJumpMode({...viewport,targetTop:690,targetHeight:10})).toBe('visible');
    expect(helpDateJumpMode({...viewport,targetTop:99.5,targetHeight:90})).toBe('visible');
  });
  test('a beginning behind the header or just outside the viewport needs only a short scroll',()=>{
    for(const targetTop of [98,50,-100,669,700])expect(helpDateJumpMode({...viewport,targetTop,targetHeight:90})).toBe('near');
  });
  test('a distant or unloaded target uses a bounded transition instead of scrolling the full history',()=>{
    for(const targetTop of [-501,701,undefined,NaN,Infinity])expect(helpDateJumpMode({...viewport,targetTop,targetHeight:90})).toBe('far');
    expect(helpDateJumpMode({viewportTop:100,viewportBottom:100,targetTop:120})).toBe('far');
  });
});
