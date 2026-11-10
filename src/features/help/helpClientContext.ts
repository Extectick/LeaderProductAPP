import {normalizeEntityTarget,type EntityTarget} from '../../shared/entityLinks';

export type HelpClientContext={
  v:1;
  app:{platform:string;version?:string;nativeVersion?:string;build?:string;updateId?:string;
    channel?:string;runtimeVersion?:string;developmentClient?:boolean};
  locale?:string;
  timeZone?:string;
  origin?:{screen:string;target?:EntityTarget;capturedAt:string;state:'current'|'previous'};
};
type Origin=NonNullable<HelpClientContext['origin']>;
const previousOriginTtl=30*60*1000;
const helpScreen=(screen:string)=>screen.split('/').includes('help');

/** Route file segments only. Never use pathname, URL search or navigation params. */
export function helpContextScreen(segments:readonly string[]):string{
  return segments.filter(segment=>!/^\([^)]*\)$/.test(segment)).slice(0,12).map(segment=>{
    if(/^\[(?:\.\.\.)?[A-Za-z_][A-Za-z0-9_]*\]$/.test(segment))return segment;
    if(/^[0-9]+$/.test(segment)||/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment))return '[id]';
    return /^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(segment)?segment:'[id]';
  }).join('/').slice(0,160)||'home';
}

/** One account-scoped RAM snapshot. It is deliberately not persisted in history. */
export function createHelpOriginTracker(){
  let account='',screen='',panelTarget:string|null=null,origin:Origin|undefined,revision=0,temporaryLease:number|undefined;
  function previous(now:number){if(origin?.state==='current')origin={...origin,state:'previous',capturedAt:new Date(now).toISOString()};}
  return {
    observe(nextAccount:string,nextScreen:string,target:unknown,now=Date.now()){
      ++revision;temporaryLease=undefined;
      if(nextAccount!==account){account=nextAccount;screen='';panelTarget=null;origin=undefined;}
      if(!account)return;
      const normalized=normalizeEntityTarget(target),targetKey=normalized?JSON.stringify(normalized):null;
      if(normalized){
        if(targetKey!==panelTarget||nextScreen!==screen)origin={screen:normalized.source==='onec'?`entity/onec/${normalized.metaType}`:`entity/app/${normalized.kind}`,target:normalized,capturedAt:new Date(now).toISOString(),state:'current'};
      }else if(panelTarget){
        previous(now);
      }else if(nextScreen!==screen){
        if(helpScreen(nextScreen)&&origin)previous(now);
        else origin={screen:nextScreen,capturedAt:new Date(now).toISOString(),state:'current'};
      }
      // Moving to another ordinary page must not carry a closed panel's object.
      if(nextScreen!==screen&&!helpScreen(nextScreen)&&!normalized)origin={screen:nextScreen,capturedAt:new Date(now).toISOString(),state:'current'};
      screen=nextScreen;panelTarget=targetKey;
    },
    temporary(forAccount:string,target:unknown,now=Date.now()){
      const normalized=normalizeEntityTarget(target);
      if(!forAccount||forAccount!==account||!normalized)return()=>{};
      const previousOrigin=origin,previousPanel=panelTarget,previousWasTemporary=temporaryLease!==undefined;
      const lease=++revision;temporaryLease=lease;panelTarget=JSON.stringify(normalized);
      origin={screen:normalized.source==='onec'?`entity/onec/${normalized.metaType}`:`entity/app/${normalized.kind}`,target:normalized,capturedAt:new Date(now).toISOString(),state:'current'};
      return (closedAt=Date.now())=>{
        if(account!==forAccount||revision!==lease)return;
        ++revision;temporaryLease=undefined;
        if(previousPanel&&!previousWasTemporary&&previousOrigin?.state==='current'){
          panelTarget=previousPanel;origin=previousOrigin;
        }else{panelTarget=null;previous(closedAt);}
      };
    },
    read(forAccount:string,now=Date.now()):Origin|undefined{
      if(!forAccount||forAccount!==account||!origin)return undefined;
      if(origin.state==='previous'&&now-Date.parse(origin.capturedAt)>previousOriginTtl)return undefined;
      return {...origin,...(origin.target?{target:{...origin.target}}:{})};
    },
  };
}
export const helpOriginTracker=createHelpOriginTracker();
