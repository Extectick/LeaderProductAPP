import {useEffect,useRef} from 'react';
import {Platform} from 'react-native';

/** Modal owns Escape/focus restoration. Arrow keys leave caption editing alone. */
export function useHelpMediaKeyboard(previous:()=>void,next:()=>void,enabled=true){
  const actions=useRef({previous,next});actions.current={previous,next};
  useEffect(()=>{
    if(Platform.OS!=='web'||!enabled||typeof window==='undefined'||typeof window.addEventListener!=='function')return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      const target=event.target as HTMLElement|null;
      if(target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'))return;
      if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
      event.preventDefault();event.stopPropagation();
      if(event.key==='ArrowLeft')actions.current.previous();else actions.current.next();
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[enabled]);
}
