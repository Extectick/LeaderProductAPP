import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Image } from 'react-native';
import { createFixtureAlbum } from '../qa/help-preview/albumFixture';
test('synthetic albums contain only local, ordered PNG assets with matching dimensions and valid tiny PNG previews',()=>{
  jest.spyOn(Image,'resolveAssetSource').mockReturnValue({uri:'asset://qa-album.png',width:100,height:100,scale:1});
  for(const count of [2,3,4,5,6,7,8,9,10]){
    const items=createFixtureAlbum(1042,9,count);expect(items).toHaveLength(count);
    for(const [index,item] of items.entries()){
      expect(item.position).toBe(index);
      expect(item.url).toBe('asset://qa-album.png');expect(item.mimeType).toBe('image/png');
      const full=readFileSync(path.resolve(__dirname,`../qa/help-preview/assets/albums/room-${String(index+1).padStart(2,'0')}.png`));
      expect(full.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(full.readUInt32BE(16)).toBe(item.width);expect(full.readUInt32BE(20)).toBe(item.height);
      const png=Buffer.from(item.thumbnailDataUri!.split(',')[1],'base64');
      expect(png.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');expect(png.readUInt32BE(16)).toBe(8);expect(png.readUInt32BE(20)).toBe(8);
      let offset=8;const chunks:Buffer[]=[];
      while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')chunks.push(png.subarray(offset+8,offset+8+length));offset+=12+length;}
      expect(inflateSync(Buffer.concat(chunks))).toHaveLength(8*25);
    }
  }
});
