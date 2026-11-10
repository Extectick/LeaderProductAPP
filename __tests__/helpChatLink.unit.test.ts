import {helpChatDestination,parseHelpChatLink} from '../src/features/help/helpChatLink';
test.each([1,52,2147483647])('parses and routes only canonical positive chat id %i',ticketId=>{
 expect(parseHelpChatLink('leaderproduct://services/help?ticketId='+ticketId)).toBe(ticketId);
 expect(helpChatDestination(ticketId)).toEqual({pathname:'/services/help',params:{ticketId:String(ticketId),messageId:undefined,eventId:undefined,htmlId:undefined}});
});
test.each([null,undefined,52,'leaderproduct://services/help?ticketId=0','leaderproduct://services/help?ticketId=-1','leaderproduct://services/help?ticketId=052','leaderproduct://services/help?ticketId=2147483648','leaderproduct://services/help?ticketId=52#part','leaderproduct://services/help?ticketId=52&ticketId=53','leaderproduct://services/help?ticketId=52&messageId=1','leaderproduct://services/help/?ticketId=52','leaderproduct://services/help/../profile?ticketId=52','leaderproduct://user:password@services/help?ticketId=52','https://services/help?ticketId=52','leaderproduct://services/help?ticketId=%35%32','leaderproduct://services/help?ticketId=52\n'])('rejects hostile or ambiguous destination %p',value=>expect(parseHelpChatLink(value)).toBeNull());
test.each([0,-1,NaN,Infinity,1.5,2147483648])('never builds an invalid chat destination %p',value=>expect(()=>helpChatDestination(value)).toThrow());

test('rejects actual trailing control characters and surrounding whitespace',()=>{for(const suffix of [String.fromCharCode(10),String.fromCharCode(13),String.fromCharCode(0),' '])expect(parseHelpChatLink('leaderproduct://services/help?ticketId=52'+suffix)).toBeNull();});
