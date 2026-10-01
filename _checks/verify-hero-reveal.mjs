import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const engine=process.argv[2]||'chromium',label=process.argv[3]||'local';
if(!['chromium','webkit'].includes(engine)||!['baseline','local'].includes(label))throw new Error('対象外');
const browser=await require('playwright')[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
const out='/Users/ym./outputs/mts-homepage-20260919/proof-orbit-preview-2026-10-02-v1/evidence/hero-reveal-'+label+'-'+engine+'/';
await mkdir(out,{recursive:true});const results=[];
for(const [width,height] of (label==='baseline'?[[1065,708]]:[[1065,708],[1440,900],[390,844],[320,640]])){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<760,hasTouch:width<760}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const check=(name,fn)=>{try{fn();results.push({width,name,pass:true});}catch(e){results.push({width,name,pass:false,error:e.message});}};
 try{
  await page.goto('http://127.0.0.1:8768/');await page.waitForFunction(()=>document.documentElement.classList.contains('cinematic')&&!document.documentElement.classList.contains('motion-paused'));
  await page.evaluate(()=>document.fonts.ready);
  async function at(fraction){
   await page.evaluate(f=>{const s=document.querySelector('.opening'),h=document.querySelector('.header').offsetHeight;scrollTo({top:scrollY+s.getBoundingClientRect().top-h+(s.offsetHeight-innerHeight+h)*f,behavior:'instant'});},fraction);
   await page.evaluate(async()=>{let last=-1,same=0;for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);const v=document.querySelector('.opening-film');same=!v.seeking&&v.currentTime===last?same+1:0;last=v.currentTime;if(same>=5)return;}throw new Error('映像が安定しない');});
   return page.evaluate(()=>{
    const v=document.querySelector('.opening-film'),p=document.querySelector('.opening-preview'),b=p.getBoundingClientRect(),photo=p.querySelector('img'),r=photo?.getBoundingClientRect();
    return {time:v.currentTime,scrollY,ink:+getComputedStyle(document.querySelector('.opening-screen-card')).opacity,logo:+document.querySelector('.opening').style.getPropertyValue('--next'),photo:!!photo&&photo.complete&&photo.naturalWidth>0,photoPeek:r?Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top):0,text:[...p.querySelectorAll('.screen-kicker,.screen-with,strong,.screen-detail')].map(e=>({x:e.offsetLeft,y:e.offsetTop,size:parseFloat(getComputedStyle(e).fontSize)}))};
   });
  }
  async function time(t){let lo=0,hi=1,state;for(let n=0;n<11;n++){const mid=(lo+hi)/2;state=await at(mid);if(state.time<t)lo=mid;else hi=mid;}return at((lo+hi)/2);}
  const early=await time(.02);await page.screenshot({path:out+width+'-early.png'});
  const middle=await time(2);await page.screenshot({path:out+width+'-middle.png'});
  const late=await time(3.4);await page.screenshot({path:out+width+'-late.png'});
  check('ロゴ場面から薄い本文と画像の端が見える',()=>{assert.equal(early.logo,1);assert.ok(early.ink>=.04&&early.ink<.3);assert.ok(early.photo&&early.photoPeek>1);});
  check('接近に従って文字が濃くなる',()=>assert.ok(early.ink<middle.ink&&middle.ink<late.ink&&late.ink>.95));
  check('画面内の文字組版が動かない',()=>{for(let n=0;n<early.text.length;n++)for(const k of ['x','y','size'])assert.ok(Math.abs(early.text[n][k]-late.text[n][k])<1.1,`${n}:${k}`);});
  check('動画の秒数とスクロールの進みが均等でゆっくり',()=>{const a=(middle.scrollY-early.scrollY)/(middle.time-early.time),b=(late.scrollY-middle.scrollY)/(late.time-middle.time);assert.ok(a>height*.7&&b>height*.7);assert.ok(Math.abs(a-b)/a<.03);});
  await at(1);await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--text-reveal')==='1.0000');
  check('本文接続と例外なし',()=>assert.deepEqual(errors,[]));await page.screenshot({path:out+width+'-handoff.png'});
 }catch(e){results.push({width,name:'実行',pass:false,error:e.message});await page.screenshot({path:out+width+'-failure.png'});}
 await context.close();console.log(JSON.stringify(results.filter(r=>r.width===width)));
}
await browser.close();await writeFile(out+'results.json',JSON.stringify({engine,results},null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,out}));process.exitCode=results.some(r=>!r.pass)?1:0;
