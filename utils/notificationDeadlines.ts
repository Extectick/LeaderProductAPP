/** Per-card deadlines survive presses, replacements and unrelated renders. */
export class NotificationDeadlines {
  private entries=new Map<string,{remaining:number;deadline:number;timer?:ReturnType<typeof setTimeout>}>();
  constructor(private expire:(id:string)=>void){}
  start(id:string,duration:number){this.cancel(id);if(duration<0)return;this.entries.set(id,{remaining:duration||5200,deadline:0});this.resume(id);}
  pause(id:string){const item=this.entries.get(id);if(!item?.timer)return;clearTimeout(item.timer);item.timer=undefined;item.remaining=Math.max(0,item.deadline-Date.now());}
  resume(id:string){const item=this.entries.get(id);if(!item||item.timer)return;item.deadline=Date.now()+item.remaining;item.timer=setTimeout(()=>{this.entries.delete(id);this.expire(id);},item.remaining);}
  cancel(id:string){const item=this.entries.get(id);if(item?.timer)clearTimeout(item.timer);this.entries.delete(id);}
  clear(){for(const id of this.entries.keys())this.cancel(id);}
}
