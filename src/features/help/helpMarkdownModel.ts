import MarkdownIt from 'markdown-it';

export const helpMarkdownParser=new MarkdownIt({html:false,linkify:true,breaks:true,typographer:false});
export type HelpMarkdownBlock={start:number;text:string};
/** Full incoming snapshot is parsed once per network update, never per letter.
 * Lists/tables/fences stay whole; completed blocks retain memoized native trees. */
export function helpMarkdownBlocks(text:string):HelpMarkdownBlock[]{
 if(!text)return [];
 // Reference definitions can affect any earlier paragraph: keep their shared
 // parser context rather than breaking reference links across separate blocks.
 if(/(?:^|\n)[ \t]{0,3}\[[^\]\n]+\]:/u.test(text))return [{start:0,text}];
 const offsets=[0];for(let at=0;at<text.length;at++)if(text[at]==='\n')offsets.push(at+1);
 const starts=[0];
 for(const token of helpMarkdownParser.parse(text,{})){
  if(token.level!==0||!token.map)continue;
  const at=offsets[token.map[0]];
  if(at!==undefined&&at>starts.at(-1)!&&starts.length<64)starts.push(at);
 }
 return starts.map((start,index)=>({start,text:text.slice(start,starts[index+1]??text.length)}));
}
