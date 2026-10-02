import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const engine=process.argv[2]||'chromium';
if(!['chromium','webkit'].includes(engine))throw new Error('対象外');
const out=`/Users/ym./outputs/mts-homepage-20260919/proof-orbit-preview-2026-10-02-v1/evidence/hero-smoothness/${engine}-recovery/`;
await mkdir(out,{recursive:true});
const browser=await require('playwright')[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true}),results=[];
for(const mode of ['normal','fallback','missing-callback']){
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const item={mode,checks:[]};
 const check=(name,fn)=>{try{fn();item.checks.push({name,pass:true});}catch(e){item.checks.push({name,pass:false,error:e.message});}};
 if(mode==='fallback')await page.addInitScript(()=>{Object.defineProperty(HTMLVideoElement.prototype,'requestVideoFrameCallback',{value:undefined,configurable:true});});
 if(mode==='missing-callback')await page.addInitScript(()=>{HTMLVideoElement.prototype.requestVideoFrameCallback=function(){return 0;};});
 const at=f=>page.evaluate(f=>{const s=document.querySelector('.opening'),h=document.querySelector('.header').offsetHeight;scrollTo({top:scrollY+s.getBoundingClientRect().top-h+(s.offsetHeight-innerHeight+h)*f+(f===1?2:0),behavior:'instant'});},f);
 try{
  await page.goto('http://127.0.0.1:8768/');
  await page.waitForFunction(()=>document.documentElement.classList.contains('cinematic')&&!document.documentElement.classList.contains('motion-paused'));
  await page.evaluate(()=>document.fonts.ready);
  const metrics=await page.evaluate(async()=>{
   const s=document.querySelector('.opening'),h=document.querySelector('.header').offsetHeight,start=scrollY+s.getBoundingClientRect().top-h,span=s.offsetHeight-innerHeight+h,v=document.querySelector('.opening-film'),canvas=document.querySelector('.opening-film-surface');
   const probe=document.createElement('canvas');probe.width=64;probe.height=36;
   const pixels=source=>{const ctx=probe.getContext('2d');if(source===canvas){const p=+canvas.dataset.framePadding;ctx.drawImage(canvas,p,p,canvas.width-p*2,canvas.height-p*2,0,0,64,36);}else ctx.drawImage(source,0,0,64,36);return ctx.getImageData(0,0,64,36).data;};
   const before=pixels(canvas);
   const sample=[];
   for(const f of [.78,.44,.81,.5]){
    scrollTo({top:start+span*f,behavior:'instant'});
    const end=performance.now()+650;
    while(performance.now()<end){await new Promise(requestAnimationFrame);const m=new DOMMatrixReadOnly(getComputedStyle(canvas).transform);sample.push({scaleX:m.a,scaleY:m.d,time:v.currentTime,seeking:v.seeking});}
   }
   const after=pixels(canvas),reference=pixels(v);
   return {min:Math.min(...sample.flatMap(s=>[s.scaleX,s.scaleY])),max:Math.max(...sample.flatMap(s=>[s.scaleX,s.scaleY])),last:sample.at(-1),canvasDiff:after.reduce((sum,value,i)=>sum+Math.abs(value-before[i]),0),sourceError:after.reduce((sum,value,i)=>sum+Math.abs(value-reference[i]),0)/after.length};
  });
  item.metrics=metrics;
  check('素早い往復でも映像の補間倍率が小さい範囲に収まる',()=>assert.ok(metrics.min>.85&&metrics.max<1.15,JSON.stringify(metrics)));
  check('往復後にシークが収束する',()=>assert.equal(metrics.last.seeking,false));
  check('初回のまま止まらずデコード済み映像へ更新する',()=>assert.ok(metrics.canvasDiff>1000&&metrics.sourceError<4,JSON.stringify(metrics)));
  await page.setViewportSize({width:844,height:390});await at(.7);await page.waitForTimeout(500);
  await at(1);await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--text-reveal')==='1.0000');
  const alignment=await page.evaluate(()=>[['strong','.consult-heading h2'],['.screen-photo','.consult-photo img']].map(([a,b])=>{const x=document.querySelector('.opening-preview').querySelector(a).getBoundingClientRect(),y=document.querySelector('.consultation').querySelector(b).getBoundingClientRect();return {x:Math.abs(x.left-y.left),y:Math.abs(x.top-y.top)};}));
  check('画面回転後も本文と写真の受け渡しが一致する',()=>alignment.forEach(p=>assert.ok(p.x<2&&p.y<2,JSON.stringify(p))));
  await page.setViewportSize({width:390,height:844});await at(.65);await page.waitForTimeout(500);
  await page.locator('.motion').click();
  await page.waitForFunction(()=>document.documentElement.classList.contains('motion-user-paused')&&getComputedStyle(document.querySelector('.opening-film-surface')).opacity==='0');
  const stopped=await page.locator('.opening-film').evaluate(v=>v.paused);
  check('停止すると動画も一時停止する',()=>assert.equal(stopped,true));
  await page.locator('.motion').click();await at(.7);
  await page.waitForFunction(()=>!document.documentElement.classList.contains('motion-paused')&&document.querySelector('.opening-film').currentTime>2&&!document.querySelector('.opening-film').seeking);
  const opacity=await page.locator('.opening-film-surface').evaluate(c=>getComputedStyle(c).opacity);
  check('再開後に映像の描画面が戻る',()=>assert.equal(opacity,'1'));
  if(mode==='missing-callback'){
   // 最終コマへのシーク直後に停止。再開後は新しいスクロールで救済しない。
   await at(1);
   await page.waitForFunction(()=>{const v=document.querySelector('.opening-film');return v.currentTime>=4-1/24-.001&&!v.seeking;},null,{timeout:5000});
   await page.evaluate(()=>document.querySelector('.motion').click());
   await page.waitForTimeout(250);await page.locator('.motion').click();
   await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--text-reveal')==='1.0000');
   const handoff=await page.locator('.opening').evaluate(s=>s.style.getPropertyValue('--handoff'));
   check('通知欠落と停止が重なっても同位置再開で本文につながる',()=>assert.equal(handoff,'1.0000'));
  }
  await page.screenshot({path:out+mode+'.png'});
  check('ブラウザ例外なし',()=>assert.deepEqual(errors,[]));
 }catch(e){item.checks.push({name:'実行',pass:false,error:e.message});await page.screenshot({path:out+mode+'-failure.png'});}
 results.push(item);console.log(JSON.stringify(item));await context.close();
}
await browser.close();await writeFile(out+'results.json',JSON.stringify(results,null,2));
const checks=results.flatMap(x=>x.checks);console.log(JSON.stringify({passed:checks.filter(x=>x.pass).length,total:checks.length,out}));process.exitCode=checks.some(x=>!x.pass)?1:0;
