export type HelpTypingUser={userId:number;name:string;avatarUrl?:string|null};
export type HelpTypingEvent=HelpTypingUser&{ticketId:number;typing?:boolean;isTyping?:boolean;expiresAt?:number};
/** Keep other participants when one person starts, refreshes or stops typing. */
export function updateHelpTypingUsers(previous:HelpTypingUser[],event:HelpTypingEvent):HelpTypingUser[]{
  const index=previous.findIndex(user=>user.userId===event.userId);
  if(event.typing===false||event.isTyping===false)return index<0?previous:previous.filter(user=>user.userId!==event.userId);
  const next={userId:event.userId,name:event.name.trim()||'Участник',avatarUrl:event.avatarUrl??null};
  if(index<0)return [...previous,next].sort((a,b)=>a.userId-b.userId);
  const old=previous[index];if(old.name===next.name&&old.avatarUrl===next.avatarUrl)return previous;
  return previous.map((user,i)=>i===index?next:user);
}
const displayName=(user:HelpTypingUser)=>user.name.split('·')[0].trim()||'Участник';
export function helpTypingLabel(users:HelpTypingUser[],expanded=false){
  const names=users.map(displayName);
  if(!names.length)return '';
  if(names.length===1)return `${names[0]} печатает`;
  if(names.length===2)return `${names[0]} и ${names[1]} печатают`;
  return expanded?`${names.join(', ')} печатают`:`${names[0]}, ${names[1]} и ещё ${names.length-2} печатают`;
}
