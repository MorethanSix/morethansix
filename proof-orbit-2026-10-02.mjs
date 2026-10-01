import { mix, ramp, smooth, rad, phases, elevation, rotation, angleAt, faceShading, rowAnchor } from './proof-orbit-motion-2026-10-02.mjs';
const proof = document.querySelector('.proof-orbit');
const journey = proof.querySelector('.orbit-journey');
const stage = proof.querySelector('.orbit-stage');
const strip = proof.querySelector('.orbit-strip');
const cards = [...proof.querySelectorAll('.orbit-card')];
const hint = proof.querySelector('[data-orbit-hint]');
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let enabled = false, frame = 0, current = 0, target = 0, lastTime = 0;
let forming = false, rowScroll = 0, geometry;
let readingPosition;
for (const card of cards) {
  const back = card.querySelector('.orbit-front').cloneNode(true);
  back.className = 'orbit-face orbit-back';
  back.setAttribute('aria-hidden','true');
  back.querySelector('img').alt = '';
  card.insertBefore(back,card.querySelector('figcaption'));
}
function measure() {
  const head = document.querySelector('.header').offsetHeight;
  proof.style.setProperty('--orbit-head',`${head}px`);
  const w = stage.clientWidth, h = stage.clientHeight;
  // 横列の見える枚数は保ち、輪だけ利用可能な高さへ収める。
  const mobile = w <= 760, sceneW = Math.min(w,(h - 90) / .45);
  const cardW = sceneW * (mobile ? .25 : .215);
  const radius = sceneW * (mobile ? .435 : .34), tilt = mobile ? 30 : 20;
  const peak = Math.min(80,h * .12), originY = h * .52;
  const travel = h * (mobile ? 3.4 : 3.6);
  geometry = {w,h,head,cardW,cardH:cardW / 1.5,radius,tilt,peak,originY,
    rowW:w * .4,gap:w * .024,gutter:w * .055,travel,end:1 + h / travel,
    halfSpan:Math.atan(cardW / 2 / radius) * 180 / Math.PI};
  journey.style.setProperty('--travel',`${geometry.travel}px`);
  for (const [key,value] of Object.entries({'card-width':cardW,'card-height':cardW / 1.5,perspective:w * 2,'origin-x':w / 2,'origin-y':originY,'copy-y':originY - peak * .65 - 12,'row-width':geometry.gutter * 2 + 10 * geometry.rowW + 9 * geometry.gap})) stage.style.setProperty(`--${key}`,`${value}px`);
  readScroll();
}

function readScroll() {
  if (!enabled) return;
  target = Math.min(geometry.end,Math.max(0,(geometry.head - journey.getBoundingClientRect().top) / geometry.travel));
  schedule();
}
function render(p) {
  const g = geometry, {form,dark,leave,title} = phases(p);
  const nextForming = p > .035;
  if (nextForming !== forming) {
    if (nextForming) rowScroll = strip.scrollLeft;
    forming = nextForming;
    proof.classList.toggle('forming',forming);
    strip.scrollLeft = forming ? 0 : rowScroll;
    strip.tabIndex = forming ? -1 : 0;
    strip.setAttribute('aria-label',forming ? '輪になった10業種の写真' : '10業種の写真。横にスクロールできます');
  }
  const ivory = [251,247,237], navy = [9,43,79];
  stage.style.backgroundColor = `rgb(${ivory.map((v,i) => Math.round(mix(v,navy[i],dark))).join(',')})`;
  stage.style.setProperty('--stage-ink',dark > .5 ? '#fbf7ed' : '#092b4f');
  stage.style.setProperty('--heading',String(1 - smooth(ramp(p,.035,.11))));
  stage.style.setProperty('--title',String(title));
  stage.style.setProperty('--floor',String(form * (1 - leave * .6)));
  stage.style.setProperty('--floor-y',`${g.originY + g.radius * Math.sin(rad(g.tilt)) + g.cardH * .65 - leave * g.h * .18}px`);
  stage.style.setProperty('--card-shadow',String(.30 * smooth(ramp(p,.02,.12))));
  stage.style.setProperty('--edge',String(form * .28));
  stage.style.setProperty('--copy-y',`${g.originY - g.peak * .65 - 12 - leave * g.h * .18}px`);
  journey.dataset.progress = p.toFixed(4);
  journey.dataset.rotation = rotation(p).toFixed(2);
  const lift = elevation(p) * g.peak;
  cards.forEach((card,i) => {
    const anchor = rowAnchor(rowScroll,g.rowW,g.gap,g.gutter,g.w);
    const angle = angleAt(i,p,anchor), theta = rad(angle);
    const ringX = Math.sin(theta) * g.radius;
    const ringY = Math.cos(theta) * g.radius * Math.sin(rad(g.tilt));
    const ringZ = Math.cos(theta) * g.radius * Math.cos(rad(g.tilt));
    const rowX = g.gutter + i * (g.rowW + g.gap) + g.rowW / 2 - g.w / 2 - (forming ? rowScroll : 0);
    // 画面外の写真は透明な間に輪へ配置。中央を横切る移動を見せない。
    const offscreen = rowX - g.rowW / 2 > g.w / 2 || rowX + g.rowW / 2 < -g.w / 2;
    const placed = offscreen && form > 0, blend = placed ? 1 : form;
    const x = mix(rowX,ringX,blend);
    const y = mix(-g.h * .04,ringY,blend) + lift - leave * g.h * .18;
    const z = ringZ * blend, scale = mix(g.rowW / g.cardW,1,blend);
    const alpha = placed ? smooth(ramp(form,.42,.94)) : 1;
    const shade = faceShading(angle,g.halfSpan);
    card.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateX(${-g.tilt * blend}deg) rotateY(${angle * blend}deg) scale(${scale})`;
    card.style.setProperty('--card-alpha',String(alpha));
    // 横列の写真拡大率は業態名へ掛けない。低めの画面でも案内との間隔を保つ。
    card.style.setProperty('--caption-scale',String(1 / scale));
    card.style.setProperty('--shade-left',String(shade.front[0] * form));
    card.style.setProperty('--shade-right',String(shade.front[1] * form));
    card.style.setProperty('--shade-b-left',String(shade.back[0] * form));
    card.style.setProperty('--shade-b-right',String(shade.back[1] * form));
  });
  hint.textContent = p < .04 ? '写真は横に送れます →　スクロールで先へ ↓' : p < .24 ? 'ふわっと、ひとつの輪へ。' : p < .88 ? 'スクロールで、めぐる ↓' : 'そのまま、次の項目へ ↓';
}

function tick(time) {
  frame = 0;
  if (!enabled || document.hidden) return;
  const dt = Math.min(64,lastTime ? time - lastTime : 16);
  lastTime = time;
  current += (target - current) * (1 - Math.exp(-dt / 90));
  if (Math.abs(target - current) < .00003) current = target;
  render(current);
  if (current !== target) schedule();
}
function schedule() { if (enabled && !frame && !document.hidden) frame = requestAnimationFrame(tick); }
function syncMode() {
  // 輪は高さに応じて縮める。最初の横列さえ収まらない低い画面だけ静止列へ。
  const availableHeight = innerHeight - document.querySelector('.header').offsetHeight;
  const fits = availableHeight >= Math.max(420,proof.clientWidth * .32 + 140);
  const next = !root.classList.contains('motion-user-paused') && !reduced.matches && fits;
  if (next === enabled) { if (enabled) measure(); return; }
  if (!forming) rowScroll = strip.scrollLeft;
  if (frame) cancelAnimationFrame(frame);
  frame = 0; current = target = 0; lastTime = 0; forming = false;
  enabled = next;
  proof.classList.toggle('is-orbit-moving',enabled);
  proof.classList.remove('forming');
  strip.tabIndex = 0;
  strip.setAttribute('aria-label','支援してきた10業種。写真を横にスクロールできます');
  if (enabled) measure();
  else {
    stage.removeAttribute('style'); journey.removeAttribute('style');
    cards.forEach(card => card.removeAttribute('style'));
    strip.scrollLeft = rowScroll;
    hint.textContent = '写真は横に送れます →';
  }
}
strip.addEventListener('scroll',() => { if (!forming) rowScroll = strip.scrollLeft; },{passive:true});
document.addEventListener('mts:motionchange',syncMode);
window.addEventListener('scroll',() => {
  // リサイズ直後の再配置を読書位置として記録する前に、旧位置を補正へ渡す。
  if (readingPosition?.width === innerWidth && readingPosition?.height === innerHeight) readingPosition = captureReadingPosition();
  readScroll();
},{passive:true});
window.addEventListener('resize',() => syncModeKeepingPlace(readingPosition));
window.addEventListener('load',() => syncModeKeepingPlace(readingPosition));
window.addEventListener('pageshow',() => syncModeKeepingPlace());
reduced.addEventListener('change',syncMode);
document.addEventListener('visibilitychange',() => {
  if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; }
  else { lastTime = 0; readScroll(); }
});
// ヒーローの読込と競合しないよう、実績欄へ近づいたら裏面も含め準備する。
if ('IntersectionObserver' in window) {
  const images = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    proof.querySelectorAll('img').forEach(img => { img.loading = 'eager'; });
    images.disconnect();
  },{rootMargin:'100% 0px'});
  images.observe(journey);
}
function captureReadingPosition() {
  const head = document.querySelector('.header').offsetHeight;
  let anchor = [...document.querySelectorAll('main > section')].find(section => section.getBoundingClientRect().bottom > head + 32);
  // 本文が画面内に現れた段階から、実際に読める段落を基準にする。
  if (anchor === proof) anchor = [...proof.querySelectorAll('.orbit-intro,.proof-fact,.proof__note')].find(element => {
    const box = element.getBoundingClientRect();
    return box.top < innerHeight && box.bottom > head + 32;
  }) || proof;
  return {anchor,top:anchor?.getBoundingClientRect().top,width:innerWidth,height:innerHeight};
}
function syncModeKeepingPlace(position = captureReadingPosition()) {
  const {anchor,top} = position;
  const wasEnabled = enabled;
  syncMode();
  if (wasEnabled && !enabled && anchor === proof) {
    // 輪の途中で短い列へ戻るときは、消える演出距離を残さず列の入口へ。
    scrollBy({top:journey.getBoundingClientRect().top - document.querySelector('.header').offsetHeight,behavior:'instant'});
  } else if (anchor && anchor.id !== 'home') {
    scrollBy({top:anchor.getBoundingClientRect().top - top,behavior:'instant'});
    readScroll();
  }
  readingPosition = captureReadingPosition();
}
syncModeKeepingPlace();
