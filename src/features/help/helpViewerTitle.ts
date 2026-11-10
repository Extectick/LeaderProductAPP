/** Bound the header itself; the full verified name remains in the page body. */
export function helpViewerTitle(value:string|undefined,fallback='Карточка'){
 const title=(value||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim()||fallback;
 const letters=Array.from(title);
 if(letters.length<=44)return title;
 const prefix=letters.slice(0,43).join('');
 const space=prefix.lastIndexOf(' ');
 return (space>=24?prefix.slice(0,space):prefix).trimEnd()+'…';
}
