import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { HELP_AI_MARK_PATH, HELP_AI_MARK_VIEW_BOX } from '../helpAiBrand';

/** Shared real ChatGPT/OpenAI mark for the empty state, avatars and banners. */
export const HelpAiIcon = memo(function HelpAiIcon({size=24,color='#FFF'}:{size?:number;color?:string}) {
  return <Svg testID="help-ai-icon" width={size} height={size} viewBox={HELP_AI_MARK_VIEW_BOX} accessible={false} importantForAccessibility="no-hide-descendants">
    <Path d={HELP_AI_MARK_PATH} fill={color}/>
  </Svg>;
});
