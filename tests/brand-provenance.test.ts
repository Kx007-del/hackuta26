import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join, resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const walk=(dir:string):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(join(dir,entry.name)):[join(dir,entry.name)]);
test('all served brand files are byte-identical to the supplied FaZe toolkit',()=>{
  const manifest=JSON.parse(readFileSync(join(root,'docs/team/brand-provenance.json'),'utf8')) as {evidence:Array<{asset:string;source:string;sha256:string}>};
  const sha=(file:string)=>createHash('sha256').update(readFileSync(join(root,file))).digest('hex');
  assert.equal(manifest.evidence.length,walk(join(root,'public/brand')).length);
  for(const item of manifest.evidence){assert.equal(sha(item.asset),item.sha256,item.asset);assert.equal(sha(item.source),item.sha256,item.source);}
});
test('authored UI avoids system font substitutions and remote font imports',()=>{
  for(const file of [...walk(join(root,'src')),...walk(join(root,'packages'))].filter(f=>/\.(css|tsx)$/.test(f))){
    const source=readFileSync(file,'utf8');
    const fonts=file.endsWith('.css')?source:[...source.matchAll(/fontFamily\s*[:=]\s*["']([^"']+)["']/g)].map(m=>m[1]).join('\n');
    assert.doesNotMatch(fonts,/\b(?:monospace|Arial|Impact|system-ui|sans-serif)\b/i,file);
    assert.doesNotMatch(source,/(?:fonts\.googleapis|fonts\.gstatic|use\.typekit|@import\s+url)/i,file);
  }
});
