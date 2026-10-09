// ローカル動画表示の復帰契約。ブラウザの描画確認は別途実画面で行う。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../consultation-integration-2026-10-04.js'), 'utf8');
function element() {
  const classes = new Set(), props = new Map(), events = new Map();
  return {
    classList: { add: (...xs) => xs.forEach(x => classes.add(x)), remove: (...xs) => xs.forEach(x => classes.delete(x)), contains: x => classes.has(x) },
    style: { setProperty: (k,v) => props.set(k,v), removeProperty: k => props.delete(k), getPropertyValue: k => props.get(k) },
    addEventListener: (k,fn) => events.set(k,fn),
    emit: k => events.get(k)?.(), setAttribute() {},
  };
}
const root = element(), section = element(), chapter = element(), video = element(), canvas = element(), win = element(), doc = element(), reduced = element();
let draws = 0, broken = false;
Object.assign(video, {readyState:4,seeking:false,videoWidth:1280,videoHeight:720,duration:11.125,currentTime:0,dataset:{src:'local.mp4'},after(){},pause(){},load(){}});
canvas.getContext = () => ({drawImage(){ if (broken) throw Error('描画失敗'); draws++; }});
chapter.offsetTop=1000; chapter.offsetHeight=3000;
section.offsetHeight=700; section.previousElementSibling={}; section.closest=()=>chapter;
section.querySelector=s=>s==='img'?{}:video;
doc.documentElement=root; doc.hidden=false; doc.createElement=()=>canvas;
doc.querySelector=s=>s==='[data-consultation-film]'?section:{offsetHeight:80};
win.scrollY=1000; win.innerHeight=800; reduced.matches=false;
vm.runInNewContext(source, {document:doc,window:win,matchMedia:()=>reduced,requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
const shown=()=>section.classList.contains('has-painted-frame');
assert.equal(shown(),false,'初期は写真を保つ');
video.emit('loadeddata'); assert.equal(shown(),true); assert.equal(draws,1);
video.seeking=true; video.emit('seeked'); assert.equal(draws,1,'seek中は前のコマを維持');
video.seeking=false; video.currentTime=4; video.emit('seeked'); assert.equal(draws,2);
broken=true; video.emit('seeked'); assert.equal(shown(),false,'描画失敗なら写真へ戻る');
broken=false; win.emit('pageshow'); assert.equal(shown(),true,'復帰時に描画し直す');
section.style.setProperty('--consult-ecru','1');
section.style.setProperty('--consult-bridge','1');
canvas.emit('contextlost'); assert.equal(shown(),false,'描画面喪失時に写真へ戻る');
assert.equal(section.style.getPropertyValue('--consult-ecru'),undefined,'終端の色面も直ちに解除する');
assert.equal(section.style.getPropertyValue('--consult-bridge'),undefined);
canvas.emit('contextrestored'); assert.equal(shown(),true);
video.emit('error'); assert.equal(shown(),false); assert.equal(root.classList.contains('consultation-motion-ready'),false);
video.emit('loadeddata'); assert.equal(shown(),true,'再読込イベントも処理する');
reduced.matches=true; reduced.emit('change'); assert.equal(root.classList.contains('consultation-motion-ready'),false);
console.log('PASS: 初期・seek・描画失敗・ページ復帰・描画面喪失/復旧・動画再読込・省動作');
