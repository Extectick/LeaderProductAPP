/** Public universal-viewer aliases. Existing entity callers keep the same context. */
export {EntityCardProvider as AppViewerProvider} from '../entityCards/EntityCardProvider';
export {EntityCardContext as AppViewerContext,useEntityCards as useAppViewer} from '../entityCards/EntityCardContext';
export type {EntityCardNavigation as AppViewerNavigation} from '../entityCards/EntityCardContext';
export type {ViewerHtmlPayload,ViewerPageControls} from './viewerTypes';
