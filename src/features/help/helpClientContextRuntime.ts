import {Platform} from 'react-native';
import {helpOriginTracker,type HelpClientContext} from './helpClientContext';

const text=(value:unknown,max=64)=>typeof value==='string'&&value.trim()?value.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max):undefined;

/** Capture once when creating an outbox item; replays retain that exact snapshot. */
export function captureHelpClientContext(account:string):HelpClientContext{
  const app:HelpClientContext['app']={platform:Platform.OS};
  try{
    const {getAppVersionInfo}=require('../../../utils/appVersion') as typeof import('../../../utils/appVersion');
    const updates=require('expo-updates') as typeof import('expo-updates');
    const constants=(require('expo-constants') as typeof import('expo-constants')).default;
    const application=require('expo-application') as typeof import('expo-application');
    const version=getAppVersionInfo();
    Object.assign(app,{
      version:text(version.fullVersionLabel),nativeVersion:text(version.nativeVersion),build:text(version.nativeBuild,32),
      updateId:text(version.updateId),runtimeVersion:text(version.runtimeVersion),
      channel:text(updates.channel||constants.expoConfig?.updates?.requestHeaders?.['expo-channel-name'],48),
      developmentClient:application.applicationId==='com.leaderproduct.app.dev'||constants.expoConfig?.scheme==='leaderproduct-dev',
    });
  }catch{/* Optional diagnostics must not prevent the durable chat send. */}
  let locale:string|undefined,timeZone:string|undefined;
  try{const current=Intl.DateTimeFormat().resolvedOptions();locale=text(current.locale);timeZone=text(current.timeZone,80);}catch{}
  const origin=helpOriginTracker.read(account);
  return {v:1,app,...(locale?{locale}:{}),...(timeZone?{timeZone}:{}),...(origin?{origin}:{})};
}

export function withHelpClientContext<T extends {clientContext?:HelpClientContext}>(input:T,account:string):T&{clientContext:HelpClientContext}{
  return {...input,clientContext:input.clientContext??captureHelpClientContext(account)};
}
