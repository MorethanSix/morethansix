import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';

const repo='/Users/ym./.worktrees/morethansix-proof-orbit-20261002';
const base=process.argv[5]||'http://127.0.0.1:8768/';
if(!['http://127.0.0.1:8768/','https://morethansix.jp/'].includes(base))throw new Error('対象外のURL');
const production=base.startsWith('https:');
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const execFileAsync=promisify(execFile);
const engine=process.argv[2]||'chromium';
const label=process.argv[3]||'before';
const variant=process.argv[4]||'normal';
if(!['chromium','webkit'].includes(engine)||!['before','after'].includes(label)||!['normal','without-compose'].includes(variant))throw new Error('対象外');
if(label==='before'&&variant!=='normal')throw new Error('beforeはnormalのみ');
if(production&&(label!=='after'||variant!=='normal'))throw new Error('本番は公開済みのafter/normalのみ');

const sha256=value=>createHash('sha256').update(value).digest('hex');
const gitShow=async spec=>(await execFileAsync('git',['show','--format=',spec],{cwd:repo,maxBuffer:32*1024*1024})).stdout;
const scriptSourceByLabel={before:await gitShow('1fce4cf:site.js'),after:await readFile(`${repo}/site.js`,'utf8')};
const indexByLabel={before:await gitShow('1fce4cf:index.html'),after:await readFile(`${repo}/index.html`,'utf8')};
const expected={
  before:{commit:'1fce4cf',script:'site.js?v=20261003-hero9',sha256:'38868241fd9a54ea6d0ca61ba58215b9895a6c9853b57077be04e2267384e8a7'},
  after:{commit:'working-tree hero10',script:'site.js?v=20261003-hero10',sha256:'81b97b50a2fa556b91a479d98a245526b1050a2d1b6e1fa703de214bfbcb1c30'},
}[label];
const scriptSource=scriptSourceByLabel[label];
const indexSource=indexByLabel[label];
assert.equal(sha256(scriptSource),expected.sha256,`${label}のsite.jsが期待した版ではありません`);
assert.ok(indexSource.includes(`<script src="${expected.script}" defer></script>`),`${label}のindex.htmlが期待したhero版ではありません`);

const composeCall='draw(performance.now(), true);';
const composeCount=scriptSource.split(composeCall).length-1;
const servedScript=variant==='without-compose'
  ? (()=>{assert.equal(composeCount,1,'変異対象のcompose呼出しが一意ではありません');return scriptSource.replace(composeCall,'/* cadence mutation: compose omitted */');})()
  : scriptSource;
const out=`/Users/ym./outputs/mts-homepage-20260919/proof-orbit-preview-2026-10-02-v1/evidence/hero-cadence/v5/${engine}-${label}-${variant}${production?'-production':''}/`;
await mkdir(out,{recursive:true});

// 別工程で青い表示面を実画素から検出した88コマ。画面外の尾端は検証対象外。
const measurements=JSON.parse(await readFile(`${repo}/_checks/hero-screen-measurements.json`,'utf8'));
assert.equal(sha256(await readFile(`${repo}/assets/${measurements.video}`)),measurements.videoSha256,'測定に用いた動画のSHA');
const measuredScreens=measurements.frames;
assert.equal(measuredScreens.length,88);
measuredScreens.forEach((frame,index)=>assert.equal(frame.frame,index));
const geometryModel='blue-screen pixel measurements, frames 0-87; clipped tail excluded';
const percentile=(values,q)=>{const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];};
const median=values=>percentile(values,.5);
const relativeError=(frames,reference)=>{
  const paths=[['preview','x','width'],['preview','y','height'],['preview','width','width'],['preview','height','height'],['text','x','width'],['text','y','width'],['text','width','width'],['text','height','width']];
  const values=frames.map(frame=>Math.max(...paths.map(([group,key,axis])=>Math.abs(frame.relative[group][key]-reference.relative[group][key])*frame.screen[axis])));
  return {samples:values.length,p95:percentile(values,.95),max:Math.max(...values),values};
};

const browser=await require('playwright')[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
const results=[];
for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},deviceScaleFactor:width===390?3:2,isMobile:width===390,hasTouch:width===390});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  // 公開検査ではHTML/JSを差し替えず、実配信内容とSHAを照合する。
  if(!production)await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==new URL(base).origin)return route.continue();
    if(url.pathname==='/'||url.pathname==='/index.html')return route.fulfill({body:indexSource,contentType:'text/html'});
    if(url.pathname==='/site.js'){
      assert.equal(`${url.pathname}${url.search}`,`/${expected.script}`,`想定外のhero scriptを要求: ${url.pathname}${url.search}`);
      return route.fulfill({body:servedScript,contentType:'text/javascript'});
    }
    return route.continue();
  });
  await page.addInitScript(({measured,model})=>{
    window.__cadence={frames:[],paints:[],seeks:[],model};
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    const time=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
    const frameTimes=new WeakMap();
    Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{...time,set(value){if(this.classList.contains('opening-film'))window.__cadence.seeks.push({at:performance.now(),time:value});time.set.call(this,value);}});
    if(typeof HTMLVideoElement.prototype.requestVideoFrameCallback==='function'){
      const requestVideoFrameCallback=HTMLVideoElement.prototype.requestVideoFrameCallback;
      HTMLVideoElement.prototype.requestVideoFrameCallback=function(callback){
        return requestVideoFrameCallback.call(this,(now,metadata)=>{
          frameTimes.set(this,metadata.mediaTime);
          try{return callback.call(this,now,metadata);}finally{frameTimes.delete(this);}
        });
      };
    }
    const capture=(video,paintedTime=video.currentTime)=>{
      const surface=document.querySelector('.opening-film-surface'),preview=document.querySelector('.opening-preview'),text=preview?.querySelector('strong');
      if(!surface||!preview||!text||!video.videoWidth||!surface.width)return null;
      const transform=new DOMMatrixReadOnly(getComputedStyle(surface).transform);
      if(Math.abs(transform.b)>.0001||Math.abs(transform.c)>.0001)return {invalidTransform:true};
      // 実画素から別工程で測った表示面を使用。画面外で全幅を測れない尾端は除外する。
      const screen=measured[Math.floor(paintedTime*24+.0001)];
      if(!screen)return null;
      const box=surface.getBoundingClientRect(),pad=(surface.width-video.videoWidth)/2;
      const sourceX=pad+screen.x*video.videoWidth/1280,sourceY=pad+screen.y*video.videoHeight/720;
      const sourceWidth=screen.width*video.videoWidth/1280,sourceHeight=screen.height*video.videoHeight/720;
      const displayed={left:box.left+sourceX/surface.width*box.width,top:box.top+sourceY/surface.height*box.height,width:sourceWidth/surface.width*box.width,height:sourceHeight/surface.height*box.height};
      const previewBox=preview.getBoundingClientRect(),textBox=text.getBoundingClientRect();
      const relative=(element,verticalAxis=displayed.height)=>({x:(element.left-displayed.left)/displayed.width,y:(element.top-displayed.top)/verticalAxis,width:element.width/displayed.width,height:element.height/verticalAxis});
      // 文字は画面幅に合わせた等比拡大。高さ方向も幅で正規化し、
      // 元映像のPC画面の縦横比変化を、文字の位置ずれと混同しない。
      return {at:performance.now(),time:paintedTime,screen:displayed,relative:{preview:relative(previewBox),text:relative(textBox,displayed.width)}};
    };
    window.__cadence.capture=capture;
    CanvasRenderingContext2D.prototype.drawImage=function(...args){
      const start=performance.now(),video=args[0] instanceof HTMLVideoElement?args[0]:null;
      const rVfcTime=video&&frameTimes.get(video);
      const paintedTime=video?(rVfcTime??Math.floor(video.currentTime*24)/24):null;
      const value=draw.apply(this,args);
      if((this.canvas.classList.contains('opening-film-surface')||this.canvas.classList.contains('opening-film-source'))&&args[0] instanceof HTMLVideoElement&&args.length===5){
        window.__cadence.paints.push({at:start,duration:performance.now()-start,time:paintedTime});
        queueMicrotask(()=>{const frame=capture(args[0],paintedTime);if(frame)window.__cadence.frames.push(frame);});
      }
      return value;
    };
  },{measured:measuredScreens,model:geometryModel});
  const result={width,checks:[],metrics:{},version:{...expected,variant,servedSha256:sha256(servedScript),geometryModel}};
  const check=(name,fn)=>{try{fn();result.checks.push({name,pass:true});}catch(error){result.checks.push({name,pass:false,error:error.message});}};
  try{
    await page.goto(base);
    const loaded=await page.evaluate(async src=>{
      const response=await fetch(src,{cache:'no-store'});
      const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
      return {src:document.querySelector('script[src^="site.js?"]').getAttribute('src'),sha256:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')};
    },expected.script);
    check('配信indexのhero版が固定されている',()=>assert.equal(loaded.src,expected.script));
    check('配信site.jsのSHA256が固定されている',()=>assert.equal(loaded.sha256,sha256(servedScript)));
    await page.waitForFunction(()=>document.documentElement.classList.contains('cinematic')&&!document.documentElement.classList.contains('motion-paused'));
    const data=await page.evaluate(async()=>{
      await document.fonts.ready;
      const opening=document.querySelector('.opening'),header=document.querySelector('.header'),preview=document.querySelector('.opening-preview'),text=preview.querySelector('strong'),video=document.querySelector('.opening-film'),surface=document.querySelector('.opening-film-surface');
      const start=scrollY+opening.getBoundingClientRect().top-header.offsetHeight,span=opening.offsetHeight-innerHeight+header.offsetHeight;
      scrollTo({top:start+span*.44,behavior:'instant'});
      await new Promise(resolve=>setTimeout(resolve,650));
      const reference=window.__cadence.capture(video);
      window.__cadence.frames=[];window.__cadence.paints=[];window.__cadence.seeks=[];
      // 入力用rAFの前後で描画順が異なるため、位置を書き換えた実時刻で速度を測る。
      // 特にWebKitでは古い位置を次のrAF時刻で割ると、間隔の変動を1コマずらして評価してしまう。
      const display=[];let previous=preview.style.transform;
      const observer=new MutationObserver(()=>{
        const next=preview.style.transform;if(next===previous)return;previous=next;
        const at=performance.now(),x=text.getBoundingClientRect().left,scale=new DOMMatrixReadOnly(next).a;
        display.push({at,x,scale});
      });
      observer.observe(preview,{attributes:true,attributeFilter:['style']});
      const samples=[];let t0;
      await new Promise(resolve=>{function step(now){t0??=now;const progress=Math.min(1,(now-t0)/6000);scrollTo({top:start+span*(.44+.39*progress),behavior:'instant'});const transform=new DOMMatrixReadOnly(getComputedStyle(preview).transform),film=new DOMMatrixReadOnly(getComputedStyle(surface).transform);samples.push({at:now,x:text.getBoundingClientRect().left,scale:transform.a,video:video.currentTime,filmScale:film.a});if(progress<1)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
      await new Promise(resolve=>setTimeout(resolve,80));
      observer.disconnect();
      return {reference,samples,display,...window.__cadence};
    });
    const samples=data.samples.slice(10,-10),intervals=samples.slice(1).map((sample,index)=>sample.at-samples[index].at);
    const display=data.display.filter(sample=>sample.at>=samples[0].at&&sample.at<=samples.at(-1).at);
    const velocities=display.slice(1).map((sample,index)=>Math.log(sample.scale/display[index].scale)/Math.max(.1,sample.at-display[index].at));
    const variation=velocities.slice(4,-4).map((velocity,index)=>Math.abs(velocity-median(velocities.slice(index,index+9)))/Math.max(.000001,Math.abs(median(velocities.slice(index,index+9)))));
    const sync=relativeError(data.frames.filter(frame=>!frame.invalidTransform),data.reference);
    result.metrics={rafP95:percentile(intervals,.95),rafMax:Math.max(...intervals),velocityVariationP95:percentile(variation,.95),paints:data.paints.length,seeks:data.seeks.length,paintP95:percentile(data.paints.map(paint=>paint.duration),.95),sync};
    check('動画面の非回転行列で測定できた',()=>assert.ok(data.frames.every(frame=>!frame.invalidTransform),JSON.stringify(result.metrics)));
    check('映像面と文字面の連続サンプルを取得できた',()=>assert.ok(sync.samples>=6,JSON.stringify(result.metrics)));
    if(label==='after'&&variant==='normal'){
      check('一定スクロール中の拡大速度の急変が25%以内',()=>assert.ok(result.metrics.velocityVariationP95<.25,JSON.stringify(result.metrics)));
      check('描画直後も映像面と文字面の相対誤差が4px以内',()=>assert.ok(sync.max<=4,JSON.stringify(result.metrics)));
    }
    if(variant==='without-compose')check('compose省略変異で相対誤差が4pxを超える',()=>assert.ok(sync.max>4,JSON.stringify(result.metrics)));
    check('描画更新間隔の95%が35ms以内',()=>assert.ok(result.metrics.rafP95<35,JSON.stringify(result.metrics)));
    check('ブラウザ例外なし',()=>assert.deepEqual(errors,[]));
    await writeFile(out+width+'-samples.json',JSON.stringify(data));
    await page.screenshot({path:out+width+'.png'});
  }catch(error){result.checks.push({name:'実行',pass:false,error:error.message});}
  results.push(result);
  console.log(JSON.stringify(result));
  await context.close();
}
await browser.close();
await writeFile(out+'metadata.json',JSON.stringify({base,production,expected,variant,sourceSha256:sha256(scriptSource),servedSha256:sha256(servedScript),indexSha256:sha256(indexSource),geometryModel},null,2));
await writeFile(out+'results.json',JSON.stringify(results,null,2));
process.exitCode=results.some(result=>result.checks.some(check=>!check.pass))?1:0;
