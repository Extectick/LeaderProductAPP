import {Keyboard,Platform} from 'react-native';

/** Finish the vertical IME transition before sliding a whole scene sideways.
 * Hidden keyboards are immediate; the timeout only covers missing Android events. */
export function dismissHelpSceneKeyboard():Promise<void>{
  if(Platform.OS==='web'||!Keyboard.isVisible?.()){Keyboard.dismiss();return Promise.resolve();}
  return new Promise(resolve=>{
    let settled=false;
    const finish=()=>{if(settled)return;settled=true;subscription.remove();clearTimeout(timeout);resolve();};
    const subscription=Keyboard.addListener('keyboardDidHide',finish);
    const timeout=setTimeout(finish,350);
    Keyboard.dismiss();
    if(!Keyboard.isVisible?.())finish();
  });
}
