(() => {
 'use strict';
 const root=document.documentElement, opening=document.querySelector('.opening'), stage=opening.querySelector('.opening-stage');
 const room=opening.querySelector('.opening-room'), back=room.querySelector('.opening-poster'), front=room.querySelector('.photo-front');
 const preview=opening.querySelector('.opening-preview'), consultation=document.querySelector('.consultation');
 const button=document.querySelector('.motion'), reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const photo=consultation.querySelector('.consult-photo img').cloneNode(true);
 photo.className='screen-photo';photo.alt='';photo.loading='eager';preview.append(photo);
 const text=[['.screen-kicker','.section-top .eyebrow'],['.screen-with','.section-top > span'],['strong','.consult-heading h2'],['.screen-detail','.consult-heading > p']].map(([a,b])=>({screen:preview.querySelector(a),real:consultation.querySelector(b)}));
 const clamp=x=>Math.max(0,Math.min(1,x)), ramp=(x,a,b)=>clamp((x-a)/(b-a)), smooth=x=>x*x*(3-2*x), mix=(a,b,t)=>a+(b-a)*t;
 const screen={x:1240,y:661,w:277,h:157}, center={x:1378.5,y:739.5};
 let paused=false, ready=false, failed=false, frame=0, displayed=0, last=0, metrics=null;
 const moving=()=>ready&&!failed&&!paused&&!reduced.matches;
 const progress=()=>clamp((scrollY-opening.offsetTop+metrics.head)/metrics.travel);
 function measure(){
  const box=stage.getBoundingClientRect(), head=document.querySelector('.header').getBoundingClientRect().height;
  const w=box.width,h=innerHeight-head;
  const endScale=Math.max(w/screen.w,h/screen.h)*1.035;
  const endX=(w-screen.w*endScale)/2,endY=(h-screen.h*endScale)/2;
  const portalScale=screen.w*endScale/1000;
  const top=consultation.getBoundingClientRect().top;
  metrics={w,h,head,travel:innerHeight*2.4,endScale,endX,endY,portalScale};
  const place=(el,rect)=>{el.style.left=`${(rect.left-box.left-endX)/portalScale}px`;el.style.top=`${(rect.top-top-endY)/portalScale}px`;el.style.width=`${rect.width/portalScale}px`;};
  for(const {screen:el,real} of text){const rect=real.getBoundingClientRect(),style=getComputedStyle(real);place(el,rect);el.style.boxSizing='border-box';el.style.height=`${rect.height/portalScale}px`;el.style.width=`${rect.width/portalScale+0.2}px`;el.style.fontSize=`${parseFloat(style.fontSize)/portalScale}px`;el.style.lineHeight=`${parseFloat(style.lineHeight)/portalScale}px`;el.style.letterSpacing=`${(parseFloat(style.letterSpacing)||0)/portalScale}px`;el.style.fontWeight=style.fontWeight;for(const side of ['Top','Right','Bottom','Left'])el.style[`padding${side}`]=`${parseFloat(style[`padding${side}`])/portalScale}px`;}
  const realPhoto=consultation.querySelector('.consult-photo img');place(photo,realPhoto.getBoundingClientRect());photo.style.height=`${realPhoto.getBoundingClientRect().height/portalScale}px`;
  photo.style.borderRadius=getComputedStyle(realPhoto.parentElement).borderRadius.split(' ').map(v=>`${parseFloat(v)/portalScale}px`).join(' ');
 }
 function paint(p){
  const {w,h,endScale,endX,endY}=metrics, narrow=w<=760;
  const expansion=smooth(ramp(p,.015,.25)), z=ramp(p,.30,.94);
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
  const values={'--open':expansion,'--next':smooth(ramp(p,.19,.28)),'--logo-fade':smooth(ramp(z,.10,.29)),'--zoom-hide':smooth(ramp(z,0,.25)),'--screen-ink':start*mix(.10,1,smooth(ramp(z,0,.72))),'--screen-photo-ink':start*mix(mix(.04,.5,smooth(ramp(z,.45,.8))),1,paper),'--screen-photo-contrast':mix(.4,1,paper),'--screen-photo-saturation':mix(.2,1,paper),'--portal-white':paper,'--preview-fade':Number(p>=.9999)};
  for(const [key,value] of Object.entries(values)) opening.style.setProperty(key,value);
  root.style.setProperty('--text-reveal',Number(p>=.9999));root.style.setProperty('--bottom-reveal',Number(p>=.9999));
  stage.style.pointerEvents=p>=.9999?'none':'';
  opening.querySelector('.opening-copy').inert=expansion>.55;
  opening.querySelector('.opening-services').inert=expansion>.5;
  opening.querySelector('.scroll-hint').inert=z>.25;
  // ローカル検証用。DOM属性のみで外部送信はしない。
  opening.dataset.photoProgress=p.toFixed(6);opening.dataset.photoScale=fg.toFixed(6);
 }
 function draw(now){frame=0;if(!moving())return;const target=progress(),dt=Math.min(48,Math.max(1,now-(last||now-16)));last=now;
  // 入力イベントの段差を短くならす。停止後に長く漂わない70msの追従。
  displayed+= (target-displayed)*(1-Math.exp(-dt/70));
  if(Math.abs(target-displayed)<.00004)displayed=target;
  paint(displayed);if(displayed!==target)frame=requestAnimationFrame(draw);
 }
 function schedule(){if(moving()&&!frame&&!document.hidden){last=0;frame=requestAnimationFrame(draw);}}
 function sync(){
  const anchor=[...document.querySelectorAll('main > section')].find(el=>el.getBoundingClientRect().bottom>document.querySelector('.header').getBoundingClientRect().height+32);
  const oldTop=anchor?.getBoundingClientRect().top;
  const active=moving();root.classList.toggle('cinematic',ready);root.classList.toggle('photo-ready',ready);root.classList.toggle('motion-paused',!active);root.classList.toggle('motion-user-paused',paused||reduced.matches);
  if(frame)cancelAnimationFrame(frame);frame=0;
  if(!active){room.removeAttribute('style');opening.querySelector('.opening-copy').inert=false;opening.querySelector('.opening-services').inert=false;opening.querySelector('.scroll-hint').inert=false;stage.style.pointerEvents='';}
  measure();
  if(anchor&&anchor!==opening)scrollBy({top:anchor.getBoundingClientRect().top-oldTop,behavior:'instant'});
  else if(!active&&displayed>.3)scrollTo({top:consultation.offsetTop-metrics.head,behavior:'instant'});
  button.hidden=failed||reduced.matches;button.setAttribute('aria-pressed',String(paused));button.querySelector('[data-motion-label]').textContent=active?'動きを止める':'動きを再開';
  document.dispatchEvent(new Event('mts:motionchange'));
  if(active){displayed=progress();paint(displayed);schedule();}
 }
 button.addEventListener('click',()=>{paused=!paused;sync();});reduced.addEventListener('change',sync);
 addEventListener('scroll',schedule,{passive:true});addEventListener('resize',()=>{measure();schedule();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;}else schedule();});
 addEventListener('pageshow',()=>{measure();schedule();});
 document.fonts.ready.then(()=>{measure();schedule();});
 measure();
 Promise.all([back.decode(),front.querySelector('img').decode()]).then(()=>{ready=true;sync();}).catch(()=>{failed=true;root.classList.add('photo-unavailable');sync();});
})();
