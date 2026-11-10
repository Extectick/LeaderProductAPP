import React from 'react';
import {View,type LayoutChangeEvent} from 'react-native';
import {AppHeaderOverlay} from '@/components/ui/AppHeaderOverlay';
import {HelpBlurSurface} from './HelpPrimitives';

/** One floating header material for the ticket list, chat and every viewer. */
export function HelpHeaderOverlay({children,target,topInset=0,id,backdropId,onLayout}:{
 children:React.ReactNode;target:React.RefObject<View|null>;topInset?:number;
 id:string;backdropId?:string;onLayout?:(event:LayoutChangeEvent)=>void;
}){
 return <AppHeaderOverlay id={id} onLayout={onLayout} topInset={topInset} backdropId={backdropId} backdrop={<HelpBlurSurface target={target} edge="bottom"/>}>
  {children}
 </AppHeaderOverlay>;
}
