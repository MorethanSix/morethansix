import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire('/Users/ym./.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json');
const engine=process.argv[2]||'chromium',label=process.argv[3]||'local';
if(!['chromium','webkit'].includes(engine)||!['baseline','local','photo'].includes(label))throw new Error('対象外');
const base=process.argv[4]||'http://127.0.0.1:8768/';
if(!['http://127.0.0.1:8768/','https://morethansix.jp/'].includes(base))throw new Error('対象外のURL');
if(base.startsWith('https:')&&label==='baseline')throw new Error('公開検査はhero10を確認するlocal/photoのみ');
const browser=await require('playwright')[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
const out='/Users/ym./outputs/mts-homepage-20260919/proof-orbit-preview-2026-10-02-v1/evidence/hero-reveal-'+label+'-'+engine+(base.startsWith('https:')?'-production':'')+'/';
await mkdir(out,{recursive:true});const results=[];
for(const [width,height] of (label==='baseline'?[[1065,708]]:[[1065,708],[1440,900],[390,844],[320,640]])){
 const context=await browser.newContext({viewport:{width,height},isMobile:width<760,hasTouch:width<760}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const check=(name,fn)=>{try{fn();results.push({width,name,pass:true});}catch(e){results.push({width,name,pass:false,error:e.message});}};
 try{
  await page.goto(base);
  const revision='20261003-hero10';
  if(label!=='baseline')assert.equal(await page.locator(`script[src="site.js?v=${revision}"]`).count(),1);
  await page.waitForFunction(()=>document.documentElement.classList.contains('cinematic')&&!document.documentElement.classList.contains('motion-paused'));
  await page.evaluate(()=>document.fonts.ready);
  async function at(fraction){
   await page.evaluate(f=>{const s=document.querySelector('.opening'),h=document.querySelector('.header').offsetHeight;scrollTo({top:scrollY+s.getBoundingClientRect().top-h+(s.offsetHeight-innerHeight+h)*f+(f===1?2:0),behavior:'instant'});},fraction);
   // 動画のコマが止まった後も表示位置は補間するため、両方の収束を待つ。
   await page.evaluate(async()=>{let last='',same=0;for(let i=0;i<180;i++){await new Promise(requestAnimationFrame);const v=document.querySelector('.opening-film'),p=document.querySelector('.opening-preview'),state=`${v.currentTime}:${p.style.transform}`;same=!v.seeking&&state===last?same+1:0;last=state;if(same>=5)return;}throw new Error('映像と表示位置が安定しない');});
   return page.evaluate(()=>{
    const v=document.querySelector('.opening-film'),s=document.querySelector('.opening'),h=document.querySelector('.header').offsetHeight,p=document.querySelector('.opening-preview'),b=p.getBoundingClientRect(),photo=p.querySelector('img'),r=photo?.getBoundingClientRect();
    const travel=s.offsetHeight-innerHeight+h,travelUnit=1.5*innerHeight+h,previewScale=new DOMMatrixReadOnly(getComputedStyle(p).transform).a;
    return {time:v.currentTime,scrollY,travel,travelUnit,travelShare:+s.style.getPropertyValue('--travel-share'),previewScale,ink:+getComputedStyle(document.querySelector('.opening-screen-card')).opacity,logo:+document.querySelector('.opening').style.getPropertyValue('--next'),paper:+document.querySelector('.opening').style.getPropertyValue('--portal-white'),photo:!!photo&&photo.complete&&photo.naturalWidth>0,photoInk:photo?+getComputedStyle(photo).opacity:0,photoFilter:photo?getComputedStyle(photo).filter:'',photoBox:photo?[photo.offsetLeft,photo.offsetTop,photo.offsetWidth,photo.offsetHeight]:[],photoClipped:r?r.bottom>b.bottom:false,photoPeek:r?Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top):0,text:[...p.querySelectorAll('.screen-kicker,.screen-with,strong,.screen-detail')].map(e=>({x:e.offsetLeft,y:e.offsetTop,size:parseFloat(getComputedStyle(e).fontSize)}))};
   });
  }
  async function time(t){let lo=0,hi=1,state;for(let n=0;n<11;n++){const mid=(lo+hi)/2;state=await at(mid);if(state.time<t)lo=mid;else hi=mid;}return at((lo+hi)/2);}
  const early=await time(.02);await page.screenshot({path:out+width+'-early.png'});
  const middle=await time(2);await page.screenshot({path:out+width+'-middle.png'});
  if(label!=='baseline'){
   const pixels=await page.evaluate(()=>{const v=document.querySelector('.opening-film'),c=document.querySelector('.opening-film-surface'),p=document.querySelector('.opening-poster'),pad=+(c.dataset.framePadding||0);return {video:[v.videoWidth,v.videoHeight],canvas:[c.width-pad*2,c.height-pad*2],poster:[p.naturalWidth,p.naturalHeight],duration:v.duration};});
   check('4Kの動画と静止画を縮小せず描画する',()=>{for(const key of ['video','canvas','poster'])assert.deepEqual(pixels[key],[3840,2160]);assert.ok(Math.abs(pixels.duration-97/24)<.001);});
  }
  const late=await time(3.4);await page.screenshot({path:out+width+'-late.png'});
  check('ロゴ場面から薄い本文と写真が見える',()=>{assert.equal(early.logo,1);assert.ok(early.ink>=.04&&early.ink<.3);assert.ok(early.photo&&early.photoPeek>1&&early.photoInk>.01&&early.photoInk<.1);
   // PCは下端から写真が見切れる。縦長端末では実本文と同じ固定配置で写真全体が収まる。
   assert.equal(early.photoClipped,width>=760);
  });
  check('接近に従って文字が濃くなる',()=>assert.ok(early.ink<middle.ink&&middle.ink<late.ink&&late.ink>.95));
  check('画面内の文字組版が動かない',()=>{for(let n=0;n<early.text.length;n++)for(const k of ['x','y','size'])assert.ok(Math.abs(early.text[n][k]-late.text[n][k])<1.1,`${n}:${k}`);});
  check('画面内の写真も位置と形を保つ',()=>{assert.equal(early.photoBox.length,4);early.photoBox.forEach((v,i)=>assert.ok(Math.abs(v-late.photoBox[i])<1.1));});
  // 新仕様は動画秒数でなく、見えているPC画面の倍率を等速に進める。
  // 24fpsのシーク時刻は変動しても、固定スクロール位置のpreview倍率は比較できる。
  const uniform=[];for(const fraction of [.40,.60,.80])uniform.push(await at(fraction));
  check('等距離スクロールでPC画面の対数倍率が一定',()=>{
   const a=Math.log(uniform[1].previewScale/uniform[0].previewScale),b=Math.log(uniform[2].previewScale/uniform[1].previewScale);
   const difference=Math.abs(a-b)/((Math.abs(a)+Math.abs(b))/2);
   assert.ok(a>0&&b>0&&difference<.03,JSON.stringify({a,b,difference,uniform:uniform.map(s=>[s.scrollY,s.previewScale])}));
  });
  check('接近に必要なスクロール距離が前仕様の約81%になる',()=>{
   const previous=.36+.64/.25,current=.36+.64/.32,ratio=current/previous;
   assert.ok(Math.abs(uniform[0].travelShare-current)<.0001,JSON.stringify(uniform[0]));
   assert.ok(Math.abs(ratio-.808219178)<.001,JSON.stringify({previous,current,ratio}));
   assert.ok(Math.abs(uniform[0].travel/uniform[0].travelUnit-current)<.02,JSON.stringify(uniform[0]));
  });
  if(label==='photo'){
   const faint=await time(2.65);await page.screenshot({path:out+width+'-photo-faint.png'});
   const half=await time(3.3);await page.screenshot({path:out+width+'-photo-half.png'});
   const paper=await at(.91);await page.screenshot({path:out+width+'-photo-paper.png'});
   const done=await at(1);
   check('PC枠が見える間の写真は薄い面から半分程度まで',()=>{assert.ok(faint.photoInk>.01&&faint.photoInk<.1);assert.ok(half.photoInk>.35&&half.photoInk<=.55);assert.ok(half.paper<.1);assert.match(half.photoFilter,/contrast\(0\.4\)/);});
   check('背景がきなりになると写真の濃さと階調も戻る',()=>{assert.ok(paper.paper>.5&&paper.paper<1);assert.ok(paper.photoInk>half.photoInk&&paper.photoInk<1);assert.equal(done.paper,1);assert.equal(done.photoInk,1);assert.equal(done.photoFilter,'saturate(1) contrast(1)');});
  }
  await at(1);await page.waitForFunction(()=>document.documentElement.style.getPropertyValue('--text-reveal')==='1.0000');
  const alignment=await page.evaluate(()=>[['.screen-kicker','.section-top .eyebrow'],['.screen-with','.section-top > span'],['strong','.consult-heading h2'],['.screen-detail','.consult-heading > p'],['.screen-photo','.consult-photo img']].map(([a,b])=>{const x=document.querySelector('.opening-preview').querySelector(a).getBoundingClientRect(),y=document.querySelector('.consultation').querySelector(b).getBoundingClientRect();return {x:Math.abs(x.left-y.left),y:Math.abs(x.top-y.top)};}));
  check('受け渡しで文字と写真が飛ばない',()=>alignment.forEach(p=>assert.ok(p.x<2&&p.y<2,JSON.stringify(p))));
  check('本文接続と例外なし',()=>assert.deepEqual(errors,[]));await page.screenshot({path:out+width+'-handoff.png'});
 }catch(e){results.push({width,name:'実行',pass:false,error:e.message});await page.screenshot({path:out+width+'-failure.png'});}
 await context.close();console.log(JSON.stringify(results.filter(r=>r.width===width)));
}
await browser.close();await writeFile(out+'results.json',JSON.stringify({engine,results},null,2));
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,total:results.length,out}));process.exitCode=results.some(r=>!r.pass)?1:0;
