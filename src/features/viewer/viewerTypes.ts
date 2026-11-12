import type {HelpHtmlArtifact} from '../help/helpHtml';

/** Already authorized by the message attachment loader, never a remote-site bridge. */
export type ViewerHtmlPayload={artifact:HelpHtmlArtifact;imageDataUrl?:string;link?:string;expectedUserId:number;scopeId:string;isCurrent?:()=>boolean};
export type ViewerPageControls={canGoBack:boolean;goBack:()=>void;reload:()=>void;locationIsExact?:boolean};
