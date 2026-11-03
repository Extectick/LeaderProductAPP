import React,{forwardRef} from 'react';
import {AppSceneTransition,type AppSceneTransitionHandle,type AppSceneTransitionProps} from '@/components/Navigation/AppSceneTransition';
import {useHelpReducedMotion} from '../helpTheme';

export type HelpChatEntryHandle=AppSceneTransitionHandle;
type Props=Omit<AppSceneTransitionProps,'reducedMotion'|'sceneTestID'>;

/** Keep Help readiness/ref compatibility; navigation motion lives in the app component. */
export const HelpChatEntry=forwardRef<HelpChatEntryHandle,Props>(function HelpChatEntry(props,ref){
  const reducedMotion=useHelpReducedMotion();
  return <AppSceneTransition {...props} ref={ref} reducedMotion={reducedMotion} sceneTestID="help-chat-viewport"/>;
});
