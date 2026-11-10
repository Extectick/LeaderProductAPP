/** Opt-in QA memory only. Reloading the page starts a genuinely cold account. */
const values = new Map<string,string>();
const storage = {
  getItem: async (key:string) => values.get(key) ?? null,
  setItem: async (key:string,value:string) => { values.set(key,value); },
  removeItem: async (key:string) => { values.delete(key); },
  getAllKeys: async () => [...values.keys()],
  multiGet: async (keys:readonly string[]) => keys.map(key=>[key,values.get(key)??null] as [string,string|null]),
  multiSet: async (entries:readonly (readonly [string,string])[]) => { entries.forEach(([key,value])=>values.set(key,value)); },
  multiRemove: async (keys:readonly string[]) => { keys.forEach(key=>values.delete(key)); },
  clear: async () => { values.clear(); },
  mergeItem: async (key:string,value:string) => { values.set(key,JSON.stringify({...JSON.parse(values.get(key)||'{}'),...JSON.parse(value)})); },
};
export default storage;
export const realServiceStorageSize=()=>values.size;
