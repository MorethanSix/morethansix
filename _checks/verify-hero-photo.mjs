import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium,webkit}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:8777/';
if(!['http://127.0.0.1:8777/','https://morethansix.jp/'].includes(base))throw new Error('検証先が対象外です');
const out=process.argv[3];
if(!out)throw new Error('証跡保存先を指定してください');
await fs.mkdir(out,{recursive:true});
const report=[];
for(const [name,engine,opts] of [['chrome',chromium,{channel:'chrome'}],['webkit',webkit,{}]]){
 const browser=await engine.launch({headless:true,...opts});
 try{for(const viewport of [{width:1280,height:850},{width:390,height:844}]){
  const page=await browser.newPage({viewport,deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForSelector('html.photo-ready');await page.evaluate(()=>document.fonts.ready);
  let previous=0;const states=[];
  for(const p of [0,.25,.4,.55,.7,.85,.94,1]){
   await page.evaluate(p=>scrollTo({top:innerHeight*2.4*p,behavior:'instant'}),p);
   await page.waitForFunction(p=>Math.abs(Number(document.querySelector('.opening').dataset.photoProgress)-p)<.0006,p,{timeout:5000}).catch(async e=>{console.log(JSON.stringify({name,viewport,p,actual:await page.evaluate(()=>({y:scrollY,top:document.querySelector('.opening').offsetTop,head:document.querySelector('.header').getBoundingClientRect().height,p:document.querySelector('.opening').dataset.photoProgress,classes:document.documentElement.className}))}));throw e;});
   const state=await page.evaluate(()=>{
    const front=document.querySelector('.photo-front'),room=document.querySelector('.opening-room').getBoundingClientRect(),portal=document.querySelector('.opening-preview').getBoundingClientRect();
    const m=new DOMMatrix(getComputedStyle(front).transform),opening=document.querySelector('.opening');
    const x=room.left+m.e+1240*m.a,y=room.top+m.f+661*m.d;
    const errors=[['.opening-preview strong','.consult-heading h2'],['.screen-detail','.consult-heading > p'],['.screen-photo','.consult-photo img']].flatMap(([s,t])=>{const a=document.querySelector(s).getBoundingClientRect(),b=document.querySelector(t).getBoundingClientRect();return ['x','y','width','height'].map(k=>Math.abs(a[k]-b[k]));});
    return {p:+opening.dataset.photoProgress,scale:+opening.dataset.photoScale,drift:Math.max(Math.abs(portal.x-x),Math.abs(portal.y-y),Math.abs(portal.right-(x+277*m.a)),Math.abs(portal.bottom-(y+157*m.d))),overflow:document.documentElement.scrollWidth-innerWidth,endpoint:Math.max(...errors),videos:document.querySelectorAll('.opening video,.opening canvas').length,roomOpacity:+getComputedStyle(document.querySelector('.opening-room')).opacity};
   });states.push(state);
   if(state.drift>1||state.overflow>1||state.videos||state.scale+0.001<previous)throw new Error(JSON.stringify({name,viewport,state,previous}));previous=state.scale;
   if(p===1&&(state.endpoint>2||state.roomOpacity>.001)){console.log(JSON.stringify(await page.evaluate(()=>[['.opening-preview strong','.consult-heading h2'],['.screen-detail','.consult-heading > p'],['.screen-photo','.consult-photo img']].map(([s,t])=>({s,a:document.querySelector(s).getBoundingClientRect().toJSON(),b:document.querySelector(t).getBoundingClientRect().toJSON()})))));throw new Error('次章の受け渡し不一致 '+JSON.stringify(state));}
   if([.25,.55,.85,1].includes(p))await page.screenshot({path:path.join(out,`${name}-${viewport.width}-${p}.png`)});
  }
  await page.evaluate(()=>scrollTo({top:innerHeight*2.4*.55,behavior:'instant'}));await page.waitForTimeout(650);
  await page.locator('.motion').click();if(!(await page.locator('html').getAttribute('class')).includes('motion-paused'))throw new Error('停止失敗');
  await page.locator('.motion').click();await page.waitForTimeout(200);
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForSelector('.motion',{state:'hidden'});
  if(errors.length)throw new Error(errors.join('\n'));
  report.push({name,viewport,states,errors});await page.close();
 }}finally{await browser.close();}
}
await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({engines:2,viewports:2,states:32,maxDrift:Math.max(...report.flatMap(x=>x.states.map(s=>s.drift))),maxEndpoint:Math.max(...report.flatMap(x=>x.states.filter(s=>s.p>.999).map(s=>s.endpoint)))}));
