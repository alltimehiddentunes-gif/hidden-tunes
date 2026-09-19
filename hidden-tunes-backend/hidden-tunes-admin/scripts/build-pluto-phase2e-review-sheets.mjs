import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const root=path.resolve(import.meta.dirname,'..')
const phase2d=JSON.parse(fs.readFileSync(path.join(root,'data/pluto-phase2d/technical-validation-50.json'),'utf8'))
const known=new Set(['62b976b93279cb000772c6f9','5a6b92f6e22a617379789618','5dc9b875e280c80009a8a44a','60fb299b79498900070b29e0','60cb6df2b2ad610008cd5bea','60492e6d7f3f560007ab0f62','61de8e502c8e9400077e5de7','61de90a47365340007f77c27'])
const rows=phase2d.results.filter(x=>x.decoded&&!known.has(x.providerChannelId)).slice(0,31)
const outDir=path.join(root,'data/pluto-phase2e/review-sheets');fs.mkdirSync(outDir,{recursive:true})
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))
for(let page=0;page<Math.ceil(rows.length/8);page++){
  const batch=rows.slice(page*8,page*8+8);const composites=[]
  for(let i=0;i<batch.length;i++){
    const row=batch[i],y=i*230
    composites.push({input:Buffer.from(`<svg width="320" height="230"><rect width="320" height="230" fill="#111"/><text x="12" y="36" fill="white" font-size="19" font-family="Arial">${esc(`${page*8+i+1}. ${row.canonicalName}`)}</text><text x="12" y="68" fill="#bbb" font-size="14" font-family="Arial">${esc(row.sourceHost)}</text><text x="12" y="96" fill="#aaa" font-size="12" font-family="Arial">${esc(row.providerChannelId)}</text></svg>`),left:0,top:y})
    for(let j=0;j<3;j++){const frame=row.samples[j]?.path;if(frame&&fs.existsSync(frame)){const image=await sharp(frame).resize(320,180,{fit:'cover'}).jpeg().toBuffer();composites.push({input:image,left:320+j*320,top:y+20})}}
  }
  await sharp({create:{width:1280,height:batch.length*230,channels:3,background:'#090909'}}).composite(composites).png().toFile(path.join(outDir,`identity-review-${page+1}.png`))
}
fs.writeFileSync(path.join(root,'data/pluto-phase2e/identity-review-index.json'),JSON.stringify(rows.map((x,index)=>({index:index+1,providerChannelId:x.providerChannelId,canonicalName:x.canonicalName,sourceHost:x.sourceHost,provenance:x.provenance})),null,2))
console.log(JSON.stringify({rows:rows.length,sheets:Math.ceil(rows.length/8),outDir},null,2))
