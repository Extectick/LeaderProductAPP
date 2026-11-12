const fs=require('fs'),zlib=require('zlib'),path=require('path');
const crc=buffer=>{let c=0xffffffff;for(const b of buffer){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
const chunk=(type,data)=>{const kind=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,sum]);};
for(const[name,color]of[['v1',[24,135,100]],['v2',[44,105,205]],['v3',[139,64,174]]]){
 const scan=Buffer.alloc(128*(128*3+1));let offset=0;
 for(let y=0;y<128;y++){scan[offset++]=0;for(let x=0;x<128;x++){const person=(x-64)**2+(y-43)**2<22**2||((x-64)/39)**2+((y-111)/42)**2<1;for(const channel of person?[255,255,255]:color)scan[offset++]=channel;}}
 const header=Buffer.alloc(13);header.writeUInt32BE(128,0);header.writeUInt32BE(128,4);header[8]=8;header[9]=2;
 fs.writeFileSync(path.join(__dirname,'assets',name+'.png'),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]));
}
