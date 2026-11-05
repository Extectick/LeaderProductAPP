test('Metro module re-evaluation keeps the same entity context identity',()=>{
 let first:any,second:any;
 jest.isolateModules(()=>{first=require('../src/features/entityCards/EntityCardContext').EntityCardContext;});
 jest.isolateModules(()=>{second=require('../src/features/entityCards/EntityCardContext').EntityCardContext;});
 expect(second).toBe(first);
});
