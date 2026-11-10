import {APP_TOOLBAR_LAYOUT as layout} from '@/components/ui/appToolbarLayout';

export const HELP_HEADER_EYEBROW_INSET=16;
export const HELP_DESKTOP_LIST_HEADING={top:18,lineHeight:26,bottom:8} as const;
export const helpHeaderFrameHeight=(reserveEyebrow=false)=>layout.actionSize+layout.bottom+(reserveEyebrow?HELP_HEADER_EYEBROW_INSET:layout.top);
export const helpListHeaderHeight=(desktop=false)=>helpHeaderFrameHeight()+(desktop?HELP_DESKTOP_LIST_HEADING.top+HELP_DESKTOP_LIST_HEADING.lineHeight+HELP_DESKTOP_LIST_HEADING.bottom:0);
