import {useEffect} from 'react';
import {useAppSurfaceTheme} from './appSurfaceTokens';
import {APP_WEB_FONT} from './appWebInteraction';

/** Shared web feedback follows the same mobile surfaces, including portal menus. */
export default function WebInteractionStyles() {
  const c=useAppSurfaceTheme();
  useEffect(()=>{
    const style=document.createElement('style');
    style.dataset.leaderInteractions='true';
    style.textContent=`
      body { font-family: ${APP_WEB_FONT}; }
      /* RN Web's shorthand '14px System' has no fallback on Windows. Explicit
         inline icon/monospace fonts retain precedence over these defaults. */
      :is([class*="css-text-"],[class*="css-textinput-"]) { font-family: ${APP_WEB_FONT}; }
      /* Shared surfaces provide focus feedback; UA/MUI outlines otherwise
         introduce rectangular frames around icons, rounded buttons and cells. */
      :is(:focus,:focus-visible,:focus-within,:active) {
        outline: none !important;
      }
      :is(button,a,select,summary,[role="button"],[role="radio"],[role="checkbox"],[role="switch"],[role="menuitem"],[role="tab"],[role="option"],[tabindex]):not(input):not(textarea):not([tabindex="-1"]):not([data-app-control]):not([aria-hidden="true"]):not([aria-disabled="true"]):not(:disabled):focus-visible {
        background-color: ${c.soft} !important;
        color: ${c.accentText} !important;
      }
      /* Form containers own their focused border. Browser outlines add a
         second, rectangular frame inside the rounded input on desktop. */
      input:not([type="checkbox"]):not([type="radio"]), textarea {
        outline: none !important;
      }
      [data-testid="help-composer-entry"] textarea {
        box-shadow: none !important;
      }
      [data-app-control] {
        outline: none !important;
        transition: background-color 150ms ease, color 150ms ease, opacity 120ms ease, transform 120ms ease;
      }
      [data-app-control] [data-app-control-content] { transition: color 150ms ease; }
      [data-app-control]:not([aria-disabled="true"]):not(:disabled):focus-visible { background-color: ${c.soft} !important; }
      [data-app-control]:not([aria-disabled="true"]):not(:disabled):focus-visible [data-app-control-content] { color: ${c.accentText} !important; }
      @media (hover: hover) and (pointer: fine) {
        [data-app-control]:not([aria-disabled="true"]):not(:disabled):hover { background-color: ${c.soft} !important; }
        [data-app-control]:not([aria-disabled="true"]):not(:disabled):hover [data-app-control-content] { color: ${c.accentText} !important; }
        [data-app-control="filled"]:not([aria-disabled="true"]):not(:disabled):hover { background-color: color-mix(in srgb, ${c.accent}, ${c.text} 12%) !important; }
        [data-app-control="filled"]:not([aria-disabled="true"]):not(:disabled):hover [data-app-control-content] { color: #fff !important; }
      }
      [data-app-control]:not([aria-disabled="true"]):not(:disabled):active { background-color: ${c.accent}33 !important; }
      [data-app-control]:not([aria-disabled="true"]):not(:disabled):active [data-app-control-content] { color: ${c.accentText} !important; }
      [data-app-control="subtle"]:not([aria-disabled="true"]):not(:disabled):active,
      [data-app-control="filled"]:not([aria-disabled="true"]):not(:disabled):active { transform: scale(.96); }
      [data-app-control="filled"]:not([aria-disabled="true"]):not(:disabled):is(:active,:focus-visible) { background-color: color-mix(in srgb, ${c.accent}, ${c.text} 20%) !important; }
      [data-app-control="filled"]:not([aria-disabled="true"]):not(:disabled):is(:active,:focus-visible) [data-app-control-content] { color: #fff !important; }
      @media (prefers-reduced-motion: reduce) {
        [data-app-control], [data-app-control] [data-app-control-content] { transition: none !important; }
        [data-app-control]:active { transform: none !important; }
      }
      @supports (height: 100dvh) { html, body, #root { height: 100dvh; } }
      [data-testid="web-sidebar"] * {
        scrollbar-width: thin;
        scrollbar-color: ${c.muted}66 transparent;
      }
      [data-testid="web-sidebar"] *::-webkit-scrollbar { width: 8px; height: 8px; }
      [data-testid="web-sidebar"] *::-webkit-scrollbar-track { background: transparent; }
      [data-testid="web-sidebar"] *::-webkit-scrollbar-thumb {
        background-color: ${c.muted}66; border: 2px solid transparent; background-clip: padding-box; border-radius: 8px;
      }
      [data-testid="web-sidebar"] *::-webkit-scrollbar-thumb:hover { background-color: ${c.muted}99; }
      [data-testid="web-sidebar"] *::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
    `;
    document.head.appendChild(style);
    return()=>style.remove();
  },[c]);
  return null;
}
