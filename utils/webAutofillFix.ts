import { Platform } from 'react-native';

let injected = false;

export function applyWebAutofillFix(background = '#fff', textColor = '#0f172a') {
  if (Platform.OS !== 'web' || injected || typeof document === 'undefined') return;
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    input:-webkit-autofill,
    input:-webkit-autofill:hover,
    input:-webkit-autofill:focus,
    textarea:-webkit-autofill,
    textarea:-webkit-autofill:hover,
    textarea:-webkit-autofill:focus,
    select:-webkit-autofill,
    select:-webkit-autofill:hover,
    select:-webkit-autofill:focus,
    input:-internal-autofill-selected,
    textarea:-internal-autofill-selected,
    select:-internal-autofill-selected {
      -webkit-box-shadow: 0 0 0px 1000px ${background} inset !important;
      box-shadow: 0 0 0px 1000px ${background} inset !important;
      -webkit-text-fill-color: ${textColor} !important;
      caret-color: ${textColor} !important;
      background-color: ${background} !important;
      transition: background-color 9999s ease-in-out 0s;
    }
  `;
  document.head.appendChild(styleEl);
  injected = true;
}
