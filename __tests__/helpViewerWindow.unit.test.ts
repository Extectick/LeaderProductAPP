import {helpWebViewerFrame,isHelpViewerTouch} from '../src/features/help/helpViewerWindow';

test('phone pages use the whole viewport, while desktop panels leave the conversation visible',()=>{
 expect(helpWebViewerFrame(390,844)).toEqual({compact:true,windowed:false,top:0,left:0,width:390,height:844,borderRadius:0});
 expect(helpWebViewerFrame(1440,900)).toEqual({compact:false,windowed:true,top:16,left:704,width:720,height:868,borderRadius:20});
 expect(helpWebViewerFrame(768,600)).toMatchObject({top:16,left:32,width:720,height:568});
});
test('expand and narrow resize preserve usable bounds without a separate mobile layout state',()=>{
 expect(helpWebViewerFrame(1440,900,true)).toMatchObject({windowed:false,top:0,left:0,width:1440,height:900,borderRadius:0});
 expect(helpWebViewerFrame(360,640,true)).toEqual(helpWebViewerFrame(360,640));
 const short=helpWebViewerFrame(800,130);
 expect(short.top).toBe(5);expect(short.height).toBe(120);expect(short.top+short.height).toBeLessThanOrEqual(130);
});
test('mouse events normalized to fake touches cannot dismiss a page while selecting text',()=>{
 expect(isHelpViewerTouch({nativeEvent:{type:'mousemove',touches:[{identifier:0}]}})).toBe(false);
 expect(isHelpViewerTouch({nativeEvent:{type:'touchmove',touches:[{identifier:1}]}})).toBe(true);
 expect(isHelpViewerTouch({nativeEvent:{type:'pointermove',pointerType:'touch'}})).toBe(true);
 expect(isHelpViewerTouch({nativeEvent:{type:'pointermove',pointerType:'mouse'}})).toBe(false);
 expect(isHelpViewerTouch({nativeEvent:{touches:[{}]}})).toBe(false);
});
