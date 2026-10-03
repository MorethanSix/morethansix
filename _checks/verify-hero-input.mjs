import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const engine=process.argv[2]||'chromium';
const label=process.argv[3]||'baseline';
const fast=process.argv[4]==='fast';
const baseline=process.argv[5]==='baseline';
const width=Number(process.argv[6]||1440);
assert.ok([1440,390].includes(width));
const height=width===390?844:900;
assert.ok(['chromium','webkit'].includes(engine));
assert.match(label,/^[a-z0-9-]+$/);
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const out=`/Users/ym./outputs/mts-homepage-20260919/proof-orbit-preview-2026-10-02-v1/evidence/hero-jitter-20261003/${label}-${engine}${fast?'-fast':''}${width===390?'-390':''}`;
await mkdir(out,{recursive:true});
const browser=await require('playwright')[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:width===390?3:2,isMobile:width===390,hasTouch:width===390,recordVideo:{dir:out,size:{width,height}}});
const page=await context.newPage();
const source=baseline?execFileSync('git',['show','1fce4cf:site.js'],{cwd:new URL('..',import.meta.url)}):await readFile(new URL('../site.js',import.meta.url));
if(baseline)await page.route('**/site.js?*',route=>route.fulfill({body:source,contentType:'text/javascript'}));
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
  window.__inputFrames=[];window.__inputDisplay=[];window.__inputActive=false;
  document.addEventListener('DOMContentLoaded',()=>{
    const preview=document.querySelector('.opening-preview');
    let previous=preview.style.transform;
    new MutationObserver(()=>{
      if(preview.style.transform===previous)return;
      previous=preview.style.transform;
      if(window.__inputActive)window.__inputDisplay.push({at:performance.now(),scale:new DOMMatrixReadOnly(previous).a});
    }).observe(preview,{attributes:true,attributeFilter:['style']});
  });
  function sample(at){
    if(window.__inputActive){
      const preview=document.querySelector('.opening-preview'),v=document.querySelector('.opening-film');
      const m=new DOMMatrixReadOnly(preview.style.transform);
      window.__inputFrames.push({at,y:scrollY,scale:m.a,x:m.e,video:v.currentTime,seeking:v.seeking});
    }
    requestAnimationFrame(sample);
  }
  requestAnimationFrame(sample);
});
try{
  await page.goto('http://127.0.0.1:8768/');
  const sha=value=>createHash('sha256').update(value).digest('hex');
  const loaded=await page.evaluate(async()=>{
    const src=document.querySelector('script[src^="site.js?"]').getAttribute('src');
    return {src,source:await (await fetch(src,{cache:'no-store'})).text()};
  });
  assert.equal(sha(loaded.source),sha(source),'配信JSと検査対象の作業ツリーが一致する');
  if(baseline)assert.equal(sha(source),'38868241fd9a54ea6d0ca61ba58215b9895a6c9853b57077be04e2267384e8a7');
  await page.waitForFunction(()=>document.documentElement.classList.contains('cinematic')&&!document.documentElement.classList.contains('motion-paused'));
  const start=await page.evaluate(async()=>{
    await document.fonts.ready;
    const o=document.querySelector('.opening'),h=document.querySelector('.header').offsetHeight;
    const span=o.offsetHeight-innerHeight+h;
    const y=scrollY+o.getBoundingClientRect().top-h+span*.25;
    scrollTo({top:y,behavior:'instant'});
    return {y,span};
  });
  await page.waitForTimeout(700);
  await page.mouse.move(width*.75,height*.6);
  await page.evaluate(()=>{window.__inputActive=true;});
  const inputs=[];
  const gestures=fast?[[1200,400],[-1200,400],[1200,700],[-1200,700]]:[[240,110],[160,130],[85,160],[35,250],[0,400],[400,120],[180,130],[90,160],[40,250],[0,450],[-260,140],[-130,170],[-50,250],[0,400],[300,130],[160,160],[80,250]];
  for(const [delta,delay] of gestures){
    inputs.push({delta,at:await page.evaluate(()=>performance.now())});
    if(delta)await page.mouse.wheel(0,delta);
    await page.waitForTimeout(delay);
  }
  await page.waitForTimeout(600);
  const {frames,display}=await page.evaluate(()=>{window.__inputActive=false;return {frames:window.__inputFrames,display:window.__inputDisplay};});
  const moving=frames.slice(1).map((b,i)=>({dt:b.at-frames[i].at}));
  const steps=display.slice(1).map((b,i)=>({dt:b.at-display[i].at,logStep:Math.abs(Math.log(b.scale/display[i].scale))}));
  // WebKitの1msに丸められた通知同士を割ると、見えていない速度の山を作る。
  // 全更新を40ms以上の窓に積算し、1更新の飛びは別のraw step検査で捕まえる。
  const rates=steps.map((_,end)=>{
    let elapsed=0,distance=0;
    for(let i=end;i>=0;i--){
      elapsed+=steps[i].dt;distance+=steps[i].logStep;
      if(elapsed>=40)return distance*16.667/elapsed;
    }
    return 0;
  });
  const metrics={maxScaleStep:Math.max(...steps.map(s=>s.logStep)),maxStepAt60Hz:Math.max(...rates),rafP95:[...moving.map(s=>s.dt)].sort((a,b)=>a-b)[Math.floor(moving.length*.95)],frames:frames.length,updates:display.length};
  await page.screenshot({path:out+'/end.png'});
  await page.evaluate(()=>{location.hash='#home';});
  await page.waitForFunction(()=>{const v=document.querySelector('.opening-film');return scrollY===0&&v.currentTime<.01&&!v.seeking;},null,{timeout:5000});
  metrics.hashReturn=true;
  await writeFile(out+'/samples.json',JSON.stringify({start,inputs,frames,display,metrics,errors,baseline,script:loaded.src,sha256:sha(source)},null,2));
  console.log(JSON.stringify({out,metrics,errors}));
  assert.deepEqual(errors,[]);
  assert.ok(display.length>50&&frames.length>100,'連続した描画サンプルを取得');
  assert.ok(Math.max(...frames.map(f=>f.y))-Math.min(...frames.map(f=>f.y))>1000,'実際に縦スクロールした');
  assert.ok(Math.max(...display.map(f=>f.scale))/Math.min(...display.map(f=>f.scale))>2,'PC画面が2倍以上拡大した');
  // 描画時刻の前後関係をrAFと混同しない。更新間隔の遅延と拡大速度を別に評価する。
  assert.ok(metrics.maxStepAt60Hz<Math.log(fast?1.12:1.05),'ホイール操作の拡大速度が急に跳ねた');
  assert.ok(metrics.maxScaleStep<Math.log(fast?1.15:1.08),'遅延を含む実表示の最大ステップ');
  assert.ok(metrics.rafP95<35,'更新の95%が35ms未満');
}finally{await context.close();await browser.close();}
