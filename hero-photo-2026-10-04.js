(() => {
 'use strict';
 const root=document.documentElement, opening=document.querySelector('.opening'), stage=opening.querySelector('.opening-stage');
 const room=opening.querySelector('.opening-room'), back=room.querySelector('.opening-poster'), front=room.querySelector('.photo-front');
 const preview=opening.querySelector('.opening-preview'), consultation=document.querySelector('.consultation');
 const button=document.querySelector('.motion'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const photo=consultation.querySelector('.consult-photo img').cloneNode(true);
 // 静止区間は動画の720pフレームではなく、元の高解像度PNGを保持する。
 photo.src='assets/mts-scene-concept-a-2026-09-20-v14.png';
 photo.className='screen-photo';photo.alt='';photo.loading='eager';preview.append(photo);
 const text=[['.screen-kicker','.section-top .eyebrow'],['.screen-with','.section-top > span'],['strong','.consult-heading h2'],['.screen-detail','.consult-heading > p']].map(([a,b])=>({screen:preview.querySelector(a),real:consultation.querySelector(b)}));
 const clamp=x=>Math.max(0,Math.min(1,x)), ramp=(x,a,b)=>clamp((x-a)/(b-a)), smooth=x=>x*x*(3-2*x), mix=(a,b,t)=>a+(b-a)*t;
 const screen={x:1240,y:661,w:277,h:157}, center={x:1378.5,y:739.5};
 let paused=false, ready=false, failed=false, frame=0, displayed=0, last=0, metrics=null;
 const moving=()=>ready&&!failed&&!paused&&!reduced.matches;
 const progress=()=>{
  // ロゴ保持は1.20→.60へ半減。文字と写真が揃うp=.94で70svhを保持。
  const readingHold=70/240, distance=clamp((scrollY-metrics.start)/metrics.travel)*(1.52+readingHold);
  if(distance<=.28)return distance;
  if(distance<=.80)return .28;
  if(distance<=1.46)return distance-.52;
  if(distance<=1.46+readingHold)return .94;
  return clamp(distance-.52-readingHold);
 };
 function measure(){
  const box=stage.getBoundingClientRect(), head=document.querySelector('.header').getBoundingClientRect().height;
  const w=box.width,h=box.height;
  const endScale=Math.max(w/screen.w,h/screen.h)*1.035;
  const endX=(w-screen.w*endScale)/2,endY=(h-screen.h*endScale)/2;
  const portalScale=screen.w*endScale/1000;
  const top=consultation.getBoundingClientRect().top;
  // svh と可変ブラウザバーの innerHeight を混ぜず、実際の sticky 区間を測る。
  metrics={w,h,head,start:opening.getBoundingClientRect().top+scrollY-head,travel:Math.max(1,opening.getBoundingClientRect().height-h),endScale,endX,endY,portalScale};
  const place=(el,rect)=>{el.style.left=`${(rect.left-box.left-endX)/portalScale}px`;el.style.top=`${(rect.top-top-endY)/portalScale}px`;el.style.width=`${rect.width/portalScale}px`;};
  for(const {screen:el,real} of text){const rect=real.getBoundingClientRect(),style=getComputedStyle(real);place(el,rect);el.style.boxSizing='border-box';el.style.height=`${rect.height/portalScale}px`;el.style.width=`${rect.width/portalScale+0.2}px`;el.style.fontSize=`${parseFloat(style.fontSize)/portalScale}px`;el.style.lineHeight=`${parseFloat(style.lineHeight)/portalScale}px`;el.style.letterSpacing=`${(parseFloat(style.letterSpacing)||0)/portalScale}px`;el.style.fontWeight=style.fontWeight;for(const side of ['Top','Right','Bottom','Left'])el.style[`padding${side}`]=`${parseFloat(style[`padding${side}`])/portalScale}px`;}
  const realPhoto=consultation.querySelector('.consult-photo img'), figure=realPhoto.parentElement;
  // sticky中の現在位置ではなく、見出し直下の通常フロー位置をPC内にも使う。
  const heading=consultation.querySelector('.consult-heading'), photoRect=realPhoto.getBoundingClientRect();
  const photoTop=heading.getBoundingClientRect().bottom+(parseFloat(getComputedStyle(heading).marginBottom)||0);
  place(photo,{left:photoRect.left,top:photoTop,width:photoRect.width});photo.style.height=`${figure.getBoundingClientRect().height/portalScale}px`;
  photo.style.objectFit=getComputedStyle(consultation.querySelector('video')||realPhoto).objectFit;
  photo.style.objectPosition=getComputedStyle(realPhoto).objectPosition;
  photo.style.borderRadius=getComputedStyle(realPhoto.parentElement).borderRadius.split(' ').map(v=>`${parseFloat(v)/portalScale}px`).join(' ');
 }
 function paint(p){
  const {w,h,endScale,endX,endY}=metrics, narrow=w<=760;
  // ロゴ完成後に短いためを足す。約240svhの旅程中、追加6%（標準画面で約100px）。
  const expansion=smooth(ramp(p,.015,.25)), z=ramp(p,.36,.94);
  const rw=w*mix(narrow?.76:.43,1,expansion),rh=h*mix(narrow?.39:.77,1,expansion);
  const left=w*(narrow?.24:.54)*(1-expansion),top=h*(narrow?.47:.08)*(1-expansion);
  const fit=Math.max(rw/1586,rh/992),bx=(rw-1586*fit)*(narrow?.94:.8),by=(rh-992*fit)*.68;
  // 対数倍率で見かけの拡大率を一定に。開始/終了だけ短く丸める。
  const edge=.09;
  const integral=u=>u<edge?u*u/(2*edge):u>1-edge?1-edge-(1-u)*(1-u)/(2*edge):u-edge/2;
  const t=integral(z)/(1-edge);
  const fg=fit*Math.exp(Math.log(endScale/fit)*t), ratio=fg/fit;
  // 後景は手前より少し遠い。極端な遠近差は机から浮いて見えるため抑える。
  const bg=fit*1.10/(1.10-(1-1/ratio));
  const startCx=bx+center.x*fit,startCy=by+center.y*fit;
  const goalCx=endX+(center.x-screen.x)*endScale,goalCy=endY+(center.y-screen.y)*endScale;
  const pan=(ratio-1)/(endScale/fit-1||1);
  const cx=mix(startCx,goalCx,pan),cy=mix(startCy,goalCy,pan);
  room.style.left=`${left}px`;room.style.top=`${top}px`;room.style.width=`${rw}px`;room.style.height=`${rh}px`;
  back.style.width='1586px';back.style.height='992px';
  back.style.transform=`translate3d(${cx-center.x*bg}px,${cy-center.y*bg}px,0) scale(${bg})`;
  front.style.transform=`translate3d(${cx-center.x*fg}px,${cy-center.y*fg}px,0) scale(${fg})`;
  const px=left+cx+(screen.x-center.x)*fg,py=top+cy+(screen.y-center.y)*fg;
  preview.style.transform=`translate3d(${px}px,${py}px,0) scale(${screen.w*fg/1000})`;
  preview.style.height=`${screen.h/screen.w*1000}px`;preview.style.visibility='visible';
  const paper=smooth(ramp(z,.77,1)), start=smooth(ramp(p,.19,.30));
  opening.style.setProperty('--handoff',smooth(ramp(p,.94,1)));
  const handoff=smooth(ramp(p,.98,1));
  const values={'--open':expansion,'--next':smooth(ramp(p,.19,.28)),'--logo-fade':smooth(ramp(z,.10,.29)),'--zoom-hide':smooth(ramp(z,0,.25)),'--screen-ink':start*mix(.10,1,smooth(ramp(z,0,.72))),'--screen-photo-ink':start*mix(mix(.04,.5,smooth(ramp(z,.45,.8))),1,paper),'--screen-photo-contrast':mix(.4,1,paper),'--screen-photo-saturation':mix(.2,1,paper),'--portal-white':paper,'--preview-fade':handoff};
  for(const [key,value] of Object.entries(values)) opening.style.setProperty(key,value);
  root.style.setProperty('--text-reveal',handoff);root.style.setProperty('--bottom-reveal',handoff);
  stage.style.pointerEvents=p>=.9999?'none':'';
  opening.querySelector('.opening-copy').inert=expansion>.55;
  opening.querySelector('.opening-services').inert=expansion>.5;
  opening.querySelector('.scroll-hint').inert=z>.25;
  // ローカル検証用。DOM属性のみで外部送信はしない。
  opening.dataset.photoProgress=p.toFixed(6);opening.dataset.photoScale=fg.toFixed(6);
 }
 function draw(now){frame=0;if(!moving())return;const target=progress(),dt=Math.min(48,Math.max(1,now-(last||now-16)));last=now;
  // 入力イベントの段差を短くならす。停止後に長く漂わない70msの追従。
  // sticky終端を越えた後に旧画面だけ追従し続けると二重像になるため、端点は即時一致。
  if(target===0||target===1)displayed=target;
  else displayed+= (target-displayed)*(1-Math.exp(-dt/70));
  if(Math.abs(target-displayed)<.00004)displayed=target;
  paint(displayed);if(displayed!==target)frame=requestAnimationFrame(draw);
 }
 function schedule(){if(moving()&&!frame&&!document.hidden){last=0;frame=requestAnimationFrame(draw);}}
 function sync(){
  const head=document.querySelector('.header').getBoundingClientRect().height;
  let anchor=[...document.querySelectorAll('main > section')].find(el=>el.getBoundingClientRect().bottom>head+32);
  let inJourney=false;
  if(anchor?.id==='proof'){
   const journey=anchor.querySelector('.orbit-journey');
   const journeyBox=journey?.getBoundingClientRect(), beforeBody=!!journeyBox&&journeyBox.bottom>head+32;
   inJourney=beforeBody&&journeyBox.top<=head+32;
   anchor=beforeBody?journey:[...anchor.querySelectorAll('.orbit-intro,.proof-fact,.proof__note')].find(el=>el.getBoundingClientRect().bottom>head+32)||anchor;
  }
  const oldTop=anchor?.getBoundingClientRect().top;
  const active=moving();root.classList.toggle('cinematic',ready);root.classList.toggle('photo-ready',ready);root.classList.toggle('motion-paused',!active);root.classList.toggle('motion-user-paused',paused||reduced.matches);
  if(frame)cancelAnimationFrame(frame);frame=0;
  if(!active){room.removeAttribute('style');opening.querySelector('.opening-copy').inert=false;opening.querySelector('.opening-services').inert=false;opening.querySelector('.scroll-hint').inert=false;stage.style.pointerEvents='';}
  // 実績の輪も高さを変更するため、全章のモード変更後に読書位置を戻す。
  document.dispatchEvent(new Event('mts:motionchange'));
  measure();
  if(inJourney)scrollBy({top:anchor.getBoundingClientRect().top-metrics.head,behavior:'instant'});
  else if(anchor&&anchor!==opening)scrollBy({top:anchor.getBoundingClientRect().top-oldTop,behavior:'instant'});
  else if(!active&&displayed>.3)scrollTo({top:consultation.offsetTop-metrics.head,behavior:'instant'});
  button.hidden=failed||reduced.matches;button.setAttribute('aria-pressed',String(paused));button.querySelector('[data-motion-label]').textContent=active?'動きを止める':'動きを再開';
  if(active){displayed=progress();paint(displayed);schedule();}
 }
 button.addEventListener('click',()=>{paused=!paused;sync();});reduced.addEventListener('change',sync);
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',()=>{measure();schedule();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
 addEventListener('pageshow',()=>{measure();schedule();});
 document.fonts.ready.then(()=>{measure();schedule();});
 // 動画読込で相談章がstickyレイアウトになった後の寸法へ更新する。
 consultation.querySelector('video')?.addEventListener('loadeddata',()=>requestAnimationFrame(()=>{measure();schedule();}));
 measure();
 const reveals=document.querySelectorAll('.poss-stage,.proof-reveal');
 if('IntersectionObserver' in window){
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-in');observer.unobserve(entry.target);}}),{rootMargin:'0px 0px -12% 0px',threshold:.2});
  reveals.forEach(element=>observer.observe(element));
 }else reveals.forEach(element=>element.classList.add('is-in'));
 Promise.all([back.decode(),front.querySelector('img').decode(),photo.decode()]).then(()=>{ready=true;sync();}).catch(()=>{failed=true;root.classList.add('photo-unavailable');sync();});
})();
