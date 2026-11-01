import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {Text} from 'react-native';
jest.mock('@expo/vector-icons',()=>({Ionicons:'Ionicons'}));
jest.mock('../src/features/help/helpTheme',()=>({useHelpTheme:()=>({text:'#18212D',muted:'#627185',panel:'#EEF2F7'})}));
import {HelpTicketReference,type HelpTicketReferenceData} from '../src/features/help/components/HelpTicketReference';

test.each([
  [{id:3,number:3,title:'Исходная проблема'} as HelpTicketReferenceData,'Исходное обращение · #3'],
  [{id:3,number:3,title:'Исходная проблема',status:'CLOSED'} as HelpTicketReferenceData,'Закрыто · #3'],
])('source link uses available metadata and opens the source: %j',async(ticket,meta)=>{
  const onPress=jest.fn();let view!:TestRenderer.ReactTestRenderer;
  await act(async()=>{view=TestRenderer.create(React.createElement(HelpTicketReference,{ticket,onPress}));});
  try{
    const button=view.root.findAllByProps({testID:'help-ticket-reference'})[0];
    expect(button.props.accessibilityLabel).toBe('Открыть исходное обращение №3: Исходная проблема');
    expect(view.root.findAllByType(Text).some(node=>node.props.children===meta)).toBe(true);
    expect(view.root.findAllByType(Text).some(node=>node.props.children===ticket.title)).toBe(true);
    await act(async()=>button.props.onPress());expect(onPress).toHaveBeenCalledTimes(1);
  }finally{await act(async()=>view.unmount());}
});
