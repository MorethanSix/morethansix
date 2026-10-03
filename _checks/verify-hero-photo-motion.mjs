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
const results=[];
for(const [name,engine,options] of [['chrome',chromium,{channel:'chrome'}],['webkit',webkit,{}]]){
 const browser=await engine.launch({headless:true,...options});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850},deviceScaleFactor:2});
  await page.goto(base);await page.waitForSelector('html.photo-ready');
  for(const [a,b] of [[.32,.9],[.9,.32]]){
   await page.evaluate(a=>scrollTo(0,innerHeight*2.4*a),a);await page.waitForTimeout(750);
   const samples=await page.evaluate(async([a,b])=>{
    const samples=[];let start=null;
    await new Promise(resolve=>{function tick(now){start??=now;const t=Math.min(1,(now-start)/2500);scrollTo({top:innerHeight*2.4*(a+(b-a)*t),behavior:'instant'});const o=document.querySelector('.opening');samples.push({time:now,scale:+o.dataset.photoScale,p:+o.dataset.photoProgress});if(t<1)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});return samples;
   },[a,b]);
   const intervals=samples.slice(1).map((s,i)=>s.time-samples[i].time),deltas=samples.slice(1).map((s,i)=>Math.sign(b-a)*(s.scale-samples[i].scale));
   const backwards=deltas.filter(x=>x<-.00001).length,stalls=deltas.slice(8,-2).filter(x=>x===0).length;
   const sorted=[...intervals].sort((a,b)=>a-b);
   results.push({engine:name,direction:b>a?'forward':'reverse',samples:samples.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...intervals),backwards,stalls});
   if(backwards||stalls)throw new Error(JSON.stringify(results.at(-1)));
  }
  await page.setViewportSize({width:844,height:390});await page.waitForTimeout(400);
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw new Error('横向きでoverflow');
  await page.goto(base+'#partner');await page.waitForTimeout(700);
  const before=await page.locator('#partner').boundingBox();await page.locator('.motion').click();const after=await page.locator('#partner').boundingBox();
  if(Math.abs(before.y-after.y)>2)throw new Error('後続章での停止位置が移動');
  await page.close();
  for(const mode of ['nojs','missing-cutout']){
   const context=await browser.newContext({javaScriptEnabled:mode!=='nojs',viewport:{width:390,height:844}}),p=await context.newPage();
   if(mode==='missing-cutout')await p.route('**/mts-office-laptop-layer-2026-10-04-v1.png',route=>route.abort());
   await p.goto(base);await p.waitForTimeout(300);
   if(!(await p.locator('#home-title').isVisible()))throw new Error(mode+' 見出し非表示');
   if(mode==='missing-cutout'&&!(await p.locator('html').getAttribute('class')).includes('photo-unavailable'))throw new Error('静止fallback不成立');
   if(mode==='missing-cutout'&&await p.locator('.motion').isVisible())throw new Error('画像失敗時の再開ボタンが表示');
   results.push({engine:name,mode,passed:true});await context.close();
  }
 }finally{await browser.close();}
}
await fs.writeFile(path.join(out,'motion-verification.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
