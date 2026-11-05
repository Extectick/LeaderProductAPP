import React,{createContext,useContext} from 'react';
export type HelpHtmlNavigation={canOpen:(id:string)=>boolean;open:(id:string)=>void;previews:React.ReactNode};
export const HelpHtmlContext=createContext<HelpHtmlNavigation|null>(null);
export const useHelpHtml=()=>useContext(HelpHtmlContext);
export function HelpHtmlAttachments(){return useHelpHtml()?.previews??null;}
