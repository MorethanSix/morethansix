import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const engine=process.argv[2]||'chromium',label=process.argv[3]||'baseline';
if(!['chromium','webkit'].includes(engine)||!['baseline','candidate'].includes(label))throw new Error('対象外');
const out=`/Users/ym./outputs/mts-homepage-20260919/proof-orbit-preview-2026-10-02-v1/evidence/hero-smoothness/${engine}-${label}/`;
await mkdir(out,{recursive:true});
const browser=await require('playwright')[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
const results=[];
for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:900},deviceScaleFactor:width===390?3:2,isMobile:width===390,hasTouch:width===390}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  const audit=window.__smooth={seeks:[],paints:[],source:null};
  const time=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
  Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...time,set(value){if(this.classList.contains('opening-film'))audit.seeks.push({at:performance.now(),value,busy:this.seeking});time.set.call(this,value);}});
  const callback=HTMLVideoElement.prototype.requestVideoFrameCallback;
  if(callback)HTMLVideoElement.prototype.requestVideoFrameCallback=function(fn){return callback.call(this,(now,meta)=>{audit.source=meta.mediaTime;try{fn(now,meta);}finally{audit.source=null;}});};
  const draw=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(...args){const value=draw.apply(this,args);if((this.canvas.classList.contains('opening-film-surface')||this.canvas.classList.contains('opening-film-source'))&&args[0] instanceof HTMLVideoElement&&args.length===5)audit.paints.push({at:performance.now(),current:args[0].currentTime,media:audit.source});return value;};
 });
 const item={width,checks:[],metrics:{}};
 const check=(name,fn)=>{try{fn();item.checks.push({name,pass:true});}catch(e){item.checks.push({name,pass:false,error:e.message});}};
 try{
  await page.goto('http://127.0.0.1:8768/');
  await page.waitForFunction(()=>document.documentElement.classList.contains('cinematic')&&!document.documentElement.classList.contains('motion-paused'));
  const motion=await page.evaluate(async()=>{
   await document.fonts.ready;
   const v=document.querySelector('.opening-film'),preview=document.querySelector('.opening-preview'),text=preview.querySelector('strong'),opening=document.querySelector('.opening'),header=document.querySelector('.header');
   const start=scrollY+opening.getBoundingClientRect().top-header.offsetHeight,span=opening.offsetHeight-innerHeight+header.offsetHeight;
   scrollTo({top:start+span*.42,behavior:'instant'});
   await new Promise(resolve=>setTimeout(resolve,500));
   const a=window.__smooth;a.seeks=[];a.paints=[];
   const phases=[];
   for(const [name,from,to] of [['forward',.42,.83],['backward',.83,.42]]){
    const samples=[];let t0;
    await new Promise(resolve=>{function step(now){t0??=now;const p=Math.min(1,(now-t0)/5000);scrollTo({top:start+span*(from+(to-from)*p),behavior:'instant'});const m=new DOMMatrixReadOnly(getComputedStyle(preview).transform),surface=document.querySelector('.opening-film-surface'),b=surface.getBoundingClientRect(),r=document.querySelector('.opening-room').getBoundingClientRect();samples.push({at:now,y:scrollY,x:text.getBoundingClientRect().left,scale:m.a,tx:m.m41,video:v.currentTime,seeking:v.seeking,edgeGap:Math.max(0,b.left-r.left,b.top-r.top,r.right-b.right,r.bottom-b.bottom)});if(p<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
    await new Promise(resolve=>setTimeout(resolve,300));phases.push({name,samples});
   }
   const surface=document.querySelector('.opening-film-surface'),pad=+(surface.dataset.framePadding||0);
   return {phases,seeks:a.seeks,paints:a.paints,size:[surface.width-pad*2,surface.height-pad*2]};
  });
  const forward=motion.phases[0].samples,backward=motion.phases[1].samples;
  const reversal=(samples,key,sign,epsilon)=>samples.slice(2,-2).filter((s,i)=>sign*(s[key]-samples[i+1][key]) < -epsilon);
  const samples=[...forward,...backward],moving=motion.phases.flatMap(p=>p.samples.slice(3,-3).map((s,i)=>Math.abs(s.scale-p.samples[i+2].scale)>1e-6));
  const edgeGaps=samples.map(s=>s.edgeGap);
  const sourceFrame=p=>Math.floor((p.media??p.current)*24+.0001);
  item.metrics={scaleReversals:reversal(forward,'scale',1,.0002).length+reversal(backward,'scale',-1,.0002).length,textReversals:reversal(forward,'x',-1,.35).length+reversal(backward,'x',1,.35).length,seekCount:motion.seeks.length,overlapSeeks:motion.seeks.filter(s=>s.busy).length,paintCount:motion.paints.length,fallbackPaints:motion.paints.filter(p=>p.media===null).length,duplicatePaints:motion.paints.slice(1).filter((p,i)=>sourceFrame(p)===sourceFrame(motion.paints[i])).length,movingRatio:moving.filter(Boolean).length/moving.length,maxEdgeGap:Math.max(...edgeGaps)};
  check('4Kの描画を維持',()=>assert.deepEqual(motion.size,[3840,2160]));
  check('一方向のスクロール中に拡大率が逆戻りしない',()=>assert.equal(item.metrics.scaleReversals,0));
  check('文字が左右に行き戻りしない',()=>assert.equal(item.metrics.textReversals,0));
  check('デコード中のシークを上書きしない',()=>assert.equal(item.metrics.overlapSeeks,0));
  check('通知欠落の救済を含め同じコマを連続で重複描画しない',()=>assert.equal(item.metrics.duplicatePaints,0));
  check('拡大が表示更新の75%以上で連続する',()=>assert.ok(item.metrics.movingRatio>.75,String(item.metrics.movingRatio)));
  check('補間中に画面端が露出しない',()=>assert.ok(item.metrics.maxEdgeGap<1,String(item.metrics.maxEdgeGap)));
  check('ブラウザ例外なし',()=>assert.deepEqual(errors,[]));
  await writeFile(out+width+'-samples.json',JSON.stringify(motion));
  await page.screenshot({path:out+width+'.png'});
 }catch(e){item.checks.push({name:'実行',pass:false,error:e.message});}
 results.push(item);console.log(JSON.stringify(item));await context.close();
}
await browser.close();await writeFile(out+'results.json',JSON.stringify(results,null,2));
const checks=results.flatMap(x=>x.checks);console.log(JSON.stringify({passed:checks.filter(x=>x.pass).length,total:checks.length,out}));process.exitCode=checks.some(x=>!x.pass)?1:0;
