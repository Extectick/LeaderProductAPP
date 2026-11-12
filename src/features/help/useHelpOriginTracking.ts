import {useEffect} from 'react';
import {useSegments} from 'expo-router';
import {helpContextScreen,helpOriginTracker} from './helpClientContext';
import type {EntityTarget} from '../../shared/entityLinks';

/** Mounted once beside the global entity viewer, below the existing auth owner. */
export function useHelpOriginTracking(account:string,target?:EntityTarget){
  const segments=useSegments();
  const screen=helpContextScreen(segments);
  const key=target?JSON.stringify(target):'';
  useEffect(()=>{helpOriginTracker.observe(account,screen,key?JSON.parse(key):undefined);},[account,screen,key]);
}
