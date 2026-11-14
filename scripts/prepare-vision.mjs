import { cp, mkdir, rm } from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const target=new URL('public/vendor/wasm/',root);
const source=new URL('node_modules/@mediapipe/tasks-vision/wasm/',root);
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
for(const file of ['vision_wasm_internal.js','vision_wasm_internal.wasm']) {
  await cp(new URL(file,source),new URL(file,target));
}
console.log('Default MediaPipe WASM runtime prepared for same-origin inference.');
