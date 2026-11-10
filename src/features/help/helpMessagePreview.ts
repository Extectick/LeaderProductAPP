import {helpMarkdownParser} from './helpMarkdownModel';

/** Render Markdown as a single text line, retaining labels and code content. */
export function helpMessagePreview(text:string):string {
  const parts:string[]=[];
  const visit=(tokens:ReturnType<typeof helpMarkdownParser.parse>)=>{
    for(const token of tokens){
      if(token.type==='image')parts.push(token.content);
      else if(token.children)visit(token.children);
      else if(['text','code_inline','code_block','fence'].includes(token.type))parts.push(token.content);
      if(token.type==='softbreak'||token.type==='hardbreak'||token.block&&token.nesting!==1)parts.push(' ');
    }
  };
  visit(helpMarkdownParser.parse(text,{}));
  return parts.join('').replace(/\s+/g,' ').trim();
}
