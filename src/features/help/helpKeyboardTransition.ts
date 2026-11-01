import {Keyboard} from 'react-native';

/** Do not enqueue a visible bubble against a viewport that is still closing IME. */
export function settleHelpKeyboard(hasInset:boolean,onClosed:()=>void):Promise<void>{
  if(!hasInset&&!Keyboard.isVisible?.())return Promise.resolve();
  return new Promise(resolve=>{
    let finished=false;
    const finish=()=>{
      if(finished)return;finished=true;clearTimeout(timer);subscription.remove();
      if(!Keyboard.isVisible?.())onClosed();
      // Let the final inset and Yoga bounds commit before mounting the bubble.
      requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()));
    };
    const subscription=Keyboard.addListener('keyboardDidHide',finish);
    const timer=setTimeout(finish,500);
    Keyboard.dismiss();
  });
}
