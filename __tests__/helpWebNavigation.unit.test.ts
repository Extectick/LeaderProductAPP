import {helpWebSelectionUrl,readHelpWebLocation} from '../src/features/help/helpWebNavigation';

test('links identify a ticket without carrying previous message jumps or draft content',()=>{
  const url=helpWebSelectionUrl('https://app.test/services/help?ticketId=7&messageId=81&eventId=90&theme=dark',8,'CLOSED');
  expect(readHelpWebLocation(url)).toEqual({selection:8,messageId:undefined,filter:'CLOSED'});
  expect(new URL(url).searchParams.get('theme')).toBe('dark');
  expect(new URL(url).searchParams.has('eventId')).toBe(false);
});
test('list and new draft can be restored independently by browser navigation',()=>{
  const start='https://app.test/services/help?ticketId=7';
  expect(readHelpWebLocation(helpWebSelectionUrl(start,null,'OPEN')).selection).toBeNull();
  expect(readHelpWebLocation(helpWebSelectionUrl(start,'new','OPEN')).selection).toBe('new');
  expect(readHelpWebLocation('https://app.test/services/help?ticketId=-9&messageId=invalid')).toEqual({selection:null,messageId:undefined,filter:'OPEN'});
});
