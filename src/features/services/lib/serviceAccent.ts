function luminance(color:string){
  if(!/^#[\da-f]{6}$/i.test(color))return 1;
  const value=Number.parseInt(color.slice(1),16);
  return (0.2126*((value>>16)&255)+0.7152*((value>>8)&255)+0.0722*(value&255))/255;
}

/** Catalog rows and navigation use one readable category color in either theme. */
export function serviceAccent(gradient:readonly string[]|undefined,dark:boolean){
  const colors=gradient?.length?gradient:['#2563EB'];
  const selected=colors.reduce((best,color)=>(dark?luminance(color)>luminance(best):luminance(color)<luminance(best))?color:best);
  if(!dark||luminance(selected)>=.45||!/^#[\da-f]{6}$/i.test(selected))return selected;
  const value=Number.parseInt(selected.slice(1),16);
  const channels=[(value>>16)&255,(value>>8)&255,value&255].map(channel=>Math.round(channel+(255-channel)*.28));
  return `#${channels.map(channel=>channel.toString(16).padStart(2,'0')).join('')}`;
}
