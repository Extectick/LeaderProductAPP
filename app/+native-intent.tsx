import {redirectEntitySystemPath} from '@/src/shared/entityLinkIntent';
/** Expo Router rewrites only our versioned links; existing auth/development links are untouched. */
export function redirectSystemPath({path}:{path:string;initial:boolean}):string {
 return redirectEntitySystemPath(path);
}
