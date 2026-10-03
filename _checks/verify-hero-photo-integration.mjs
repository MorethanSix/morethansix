import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium,webkit}=require('playwright');
const base=process.argv[2],out=process.argv[3];
if(!['http://127.0.0.1:8777/','https://morethansix.jp/'].includes(base)||!out)throw new Error('検証先・保存先を指定してください');
await fs.mkdir(out,{recursive:true});
const results=[];
for(const [engineName,engine,options] of [['chrome',chromium,{channel:'chrome'}],['webkit',webkit,{}]]){
 const browser=await engine.launch({headless:true,...options});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(base))errors.push(`${r.status()} ${r.url()}`);});
  await page.goto(base);await page.waitForSelector('html.photo-ready');await page.waitForSelector('.proof-orbit.is-orbit-moving');
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{const j=document.querySelector('.orbit-journey');scrollTo({top:scrollY+j.getBoundingClientRect().top-document.querySelector('.header').offsetHeight-100,behavior:'instant'});});
  await page.waitForTimeout(400);
  for(const paused of [true,false]){
   const before=await page.locator('.orbit-journey').boundingBox();await page.locator('.motion').click();await page.waitForTimeout(250);const after=await page.locator('.orbit-journey').boundingBox();
   const delta=Math.abs(before.y-after.y);if(delta>2)throw new Error(`実績入口の停止位置差 ${delta}`);results.push({engineName,check:'proof-entry-position',paused,delta});
  }
  await page.locator('#partner').scrollIntoViewIfNeeded();await page.waitForTimeout(500);
  for(const paused of [true,false]){
   const before=await page.locator('#partner').boundingBox();await page.locator('.motion').click();await page.waitForTimeout(250);const after=await page.locator('#partner').boundingBox();
   const delta=Math.abs(before.y-after.y);if(delta>2)throw new Error(`後続章の停止位置差 ${delta}`);results.push({engineName,check:'partner-position',paused,delta});
  }
  for(const element of await page.locator('.proof-reveal').all()){
   await element.scrollIntoViewIfNeeded();await page.waitForTimeout(1100);
   const opacity=await element.evaluate(el=>Number(getComputedStyle(el).opacity));
   if(opacity<.99)throw new Error('実績本文が非表示');results.push({engineName,check:'proof-reveal',opacity});
  }
  const fact=page.locator('.proof-fact').first();await fact.scrollIntoViewIfNeeded();await page.waitForTimeout(400);
  for(const paused of [true,false]){
   const before=await fact.boundingBox();await page.locator('.motion').click();await page.waitForTimeout(250);const after=await fact.boundingBox();
   const delta=Math.abs(before.y-after.y);if(delta>2)throw new Error(`実績本文の停止位置差 ${delta}`);results.push({engineName,check:'proof-reading-position',paused,delta});
  }
  await page.evaluate(()=>{const j=document.querySelector('.orbit-journey'),head=document.querySelector('.header').offsetHeight;scrollTo({top:scrollY+j.getBoundingClientRect().top-head+parseFloat(j.style.getPropertyValue('--travel'))*.5,behavior:'instant'});});
  await page.waitForTimeout(700);
  if(await page.locator('.orbit-journey').getAttribute('data-progress')<.49)throw new Error('輪が回らない');
  for(const paused of [true,false]){
   await page.locator('.motion').click();await page.waitForTimeout(350);
   const delta=await page.evaluate(()=>Math.abs(document.querySelector('.orbit-journey').getBoundingClientRect().top-document.querySelector('.header').offsetHeight));
   if(delta>2)throw new Error(`実績横列への復帰差 ${delta}`);results.push({engineName,check:'proof-journey-position',paused,delta});
  }
  // モバイルのバー収納で innerHeight だけが増えた場合に相当する寸法差を作る。
  await page.setViewportSize({width:390,height:900});
  await page.addStyleTag({content:'.cinematic .opening{height:calc(2400px - var(--head))!important}.cinematic .opening-stage{height:calc(720px - var(--head))!important}'});
  await page.evaluate(()=>{dispatchEvent(new Event('resize'));const o=document.querySelector('.opening'),s=document.querySelector('.opening-stage');scrollTo({top:scrollY+o.getBoundingClientRect().top-document.querySelector('.header').offsetHeight+o.getBoundingClientRect().height-s.getBoundingClientRect().height,behavior:'instant'});});
  await page.waitForTimeout(1000);
  const handoff=await page.evaluate(()=>({p:+document.querySelector('.opening').dataset.photoProgress,reveal:+getComputedStyle(document.documentElement).getPropertyValue('--text-reveal'),opacity:+getComputedStyle(document.querySelector('.opening-room')).opacity}));
  if(handoff.p!==1||handoff.reveal!==1||handoff.opacity>0)throw new Error('可変画面高で終点未達 '+JSON.stringify(handoff));results.push({engineName,check:'viewport-height-handoff',...handoff});
  if(errors.length)throw new Error(errors.join('\n'));
  await page.screenshot({path:path.join(out,`${engineName}-viewport-handoff.png`)});
 }finally{await browser.close();}
}
await fs.writeFile(path.join(out,'integration-verification.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
