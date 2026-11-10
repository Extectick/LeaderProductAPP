import {helpTicketMenuAnchor,helpTicketMenuFrame} from '../src/features/help/helpTicketMenu';

test('pointer menu uses viewport coordinates and remains inside the bottom-right edge',()=>{
 const anchor=helpTicketMenuAnchor({clientX:1430,clientY:895});
 expect(anchor).toEqual({x:1430,y:895});
 expect(helpTicketMenuFrame(anchor,{width:1440,height:900},2)).toEqual({left:1168,top:786,width:264});
});

test('keyboard menu anchors to the focused row, independent of stale pointer coordinates',()=>{
 expect(helpTicketMenuAnchor({clientX:0,clientY:0,currentTarget:{getBoundingClientRect:()=>({left:72,top:300,bottom:376,width:320})}},true)).toEqual({x:104,y:368});
});

test('one-action menu and small viewports retain their margins',()=>{
 expect(helpTicketMenuFrame({x:-10,y:999},{width:240,height:180},1)).toEqual({left:8,top:114,width:224});
});
