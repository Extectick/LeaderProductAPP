import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
let mockParams:Record<string,string>={};const mockSetParams=jest.fn();
jest.mock('expo-router',()=>({useLocalSearchParams:()=>mockParams,useRouter:()=>({setParams:mockSetParams})}));
jest.mock('../src/features/help/components/HelpHtmlMessage',()=>({HelpHtmlMessage:'HtmlMessage'}));
import {HelpHtmlMessageRoute} from '../src/features/help/components/HelpHtmlMessageRoute';
const id='8cb01504-f89b-4e55-ad30-f8f6eb686547';
test.each([{ticketId:'50',messageId:'1075',htmlId:id},{ticketId:'51',messageId:'1075',htmlId:id},{ticketId:'50',messageId:'1076',htmlId:id},{ticketId:'50',messageId:'1075',htmlId:'bad'}])('scopes external intent to the accessible original message: %j',async params=>{
 mockParams=params;let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(React.createElement(HelpHtmlMessageRoute,{ticketId:50,messageId:1075,attachments:[],children:null}));});
 try{
  const props=view.root.findAll(node=>node.type==='HtmlMessage')[0].props;
  expect(props.requestedId).toBe(params.ticketId==='50'&&params.messageId==='1075'&&params.htmlId===id?id:undefined);
  props.onRequestConsumed();expect(mockSetParams).toHaveBeenLastCalledWith({htmlId:undefined});
 }finally{await act(async()=>view.unmount());}
});
