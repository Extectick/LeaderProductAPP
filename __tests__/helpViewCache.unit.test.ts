import {shareHelpItems, helpViewCache, helpListCacheKey} from '../src/features/help/helpViewCache';

test('quiet replay retains cells and isolates server/account scopes',()=>{
  const a={id:7,title:'A',members:[{userId:5}]},b={id:8,title:'B',members:[]},before=[a,b];
  expect(shareHelpItems(before,[{...a,members:[{userId:5}]},{...b}])).toBe(before);
  const next=shareHelpItems(before,[{...a,title:'Changed'},{...b}]);
  expect(next[0]).not.toBe(a);expect(next[1]).toBe(b);
  const key=helpListCacheKey('OPEN','mine');helpViewCache('server:5').lists.set(key,before as any);
  expect(helpViewCache('server:6').lists.get(key)).toBeUndefined();
  expect(helpViewCache('other:5').lists.get(key)).toBeUndefined();
});

test('cache comparison avoids serializing thumbnails and detects nested reaction changes',()=>{
  const row={id:4,attachments:[{id:'image',thumbnailDataUri:'data:image/png;base64,'+'a'.repeat(50000)}],reactions:[{emoji:'👍',mine:false,count:1,userIds:[8]}]};
  const snapshot=JSON.parse(JSON.stringify(row));
  const stringify=jest.spyOn(JSON,'stringify');
  try{
    expect(shareHelpItems([row],[snapshot])[0]).toBe(row);
    snapshot.reactions[0].mine=true;snapshot.reactions[0].userIds.push(5);snapshot.reactions[0].count=2;
    expect(shareHelpItems([row],[snapshot])[0]).toBe(snapshot);
    expect(stringify).not.toHaveBeenCalled();
  }finally{stringify.mockRestore();}
});

test('different null, missing and nested fields invalidate old rows',()=>{
  const previous=[{id:1,optional:null,values:[1,2]}];
  expect(shareHelpItems(previous,[{id:1,values:[1,2]}] as any)).not.toBe(previous);
  expect(shareHelpItems(previous,[{id:1,optional:null,values:[2,1]}])).not.toBe(previous);
});
