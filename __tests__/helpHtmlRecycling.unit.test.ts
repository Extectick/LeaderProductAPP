import {helpTimelineRowType,type HelpTimelineRow} from '../src/features/help/helpTimelineModel';
import {HELP_HTML_MIME} from '../src/features/help/helpHtml';
const file={kind:'FILE',mimeType:HELP_HTML_MIME,name:'8cb01504-f89b-4e55-ad30-f8f6eb686547.help-html.json'};
const row=(attachments:unknown[],kind='message')=>({kind,message:{attachments}} as HelpTimelineRow);
test('HTML rows keep their own shared recycle pool instead of destroying WebViews in text cells',()=>{
 const type=helpTimelineRowType(row([file]));
 expect(type).not.toBe(helpTimelineRowType(row([])));
 expect(helpTimelineRowType(row([{...file,name:'9423fa98-0671-4ec5-936e-c905502e4ba0.help-html.json'}]))).toBe(type);
 expect(helpTimelineRowType(row([{...file,mimeType:'application/json'}]))).toBe(helpTimelineRowType(row([])));
 expect(helpTimelineRowType(row([],'pending'))).toBe(helpTimelineRowType(row([])));
});
