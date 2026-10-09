import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import vm from 'node:vm';

const base = resolve(import.meta.dirname, '..');
const adoptedAsset = 'assets/consultation-adopted-web-20261009-v1.mp4';
const [html, source] = await Promise.all([
  readFile(resolve(base, 'index.html'), 'utf8'),
  readFile(resolve(base, 'consultation-integration-2026-10-04.js'), 'utf8'),
]);
assert.match(html, new RegExp(`data-src="${adoptedAsset}"`), '採用動画が相談導線の video に指定されている');
assert.match(html, new RegExp(`href="${adoptedAsset}"`), '採用動画への直接リンクがある');
assert.ok((await stat(resolve(base, adoptedAsset))).size > 0, '採用動画アセットが空ではない');

class FakeClassList {
  #values = new Set();
  add(...values) { values.forEach(value => this.#values.add(value)); }
  remove(...values) { values.forEach(value => this.#values.delete(value)); }
  contains(value) { return this.#values.has(value); }
}
class FakeStyle {
  #values = new Map();
  setProperty(name, value) { this.#values.set(name, value); }
  removeProperty(name) { this.#values.delete(name); }
  getPropertyValue(name) { return this.#values.get(name); }
}
class FakeTarget {
  #listeners = new Map();
  addEventListener(type, listener, options = {}) {
    const listeners = this.#listeners.get(type) || [];
    listeners.push({ listener, once: options.once });
    this.#listeners.set(type, listeners);
  }
  dispatch(type) {
    for (const entry of [...(this.#listeners.get(type) || [])]) {
      entry.listener({ type });
      if (entry.once) this.#listeners.set(type, (this.#listeners.get(type) || []).filter(item => item !== entry));
    }
  }
}
class FakeVideo extends FakeTarget {
  constructor() {
    super();
    this.dataset = { src: adoptedAsset };
    this.duration = 12.041667;
    this.readyState = 4;
    this.videoWidth = 1920;
    this.videoHeight = 1080;
    this.seeking = false;
    this._currentTime = 0;
    this.seekWrites = 0;
    this.paused = false;
  }
  get currentTime() { return this._currentTime; }
  set currentTime(value) { this._currentTime = value; this.seekWrites += 1; }
  load() {}
  pause() { this.paused = true; }
}

const createRuntime = () => {
  const root = { classList: new FakeClassList() };
  const header = { offsetHeight: 80 };
  const chapter = { offsetTop: 1000, offsetHeight: 3000, style: new FakeStyle() };
  const still = { src: '' };
  const video = new FakeVideo();
  const canvas = new FakeTarget();
  canvas.width = 0; canvas.height = 0; canvas.className = ''; canvas.setAttribute = () => {};
  let failDraw = false;
  let draws = 0;
  let scrollY = 0;
  canvas.getContext = () => ({ drawImage(...args) {
    if (failDraw) throw new Error('synthetic canvas failure');
    assert.equal(args[0], video, '採用動画を描画する');
    assert.deepEqual(args.slice(1), [0, 0, 1920, 1080], '旧組立版の拡大・座標補正を適用しない');
    draws += 1;
  } });
  const section = {
    classList: new FakeClassList(), style: new FakeStyle(), offsetHeight: 720, previousElementSibling: {},
    closest: selector => selector === '.consultation' ? chapter : null,
    querySelector: selector => selector === '.consultation-film__video' ? video : selector === 'img' ? still : null,
  };
  video.after = inserted => assert.equal(inserted, canvas, '動画の直後に canvas を挿入する');
  const documentTarget = new FakeTarget();
  documentTarget.documentElement = root; documentTarget.hidden = false;
  documentTarget.createElement = tag => { assert.equal(tag, 'canvas'); return canvas; };
  documentTarget.querySelector = selector => ({ '[data-consultation-film]': section, '.header': header }[selector] || null);
  const windowTarget = new FakeTarget();
  Object.defineProperty(windowTarget, 'scrollY', { get: () => scrollY, set: value => { scrollY = value; } });
  windowTarget.innerHeight = 800;
  const reduced = new FakeTarget(); reduced.matches = false;
  let clock = 0;
  let nextFrame = 0;
  const frames = new Map();
  vm.runInContext(source, vm.createContext({
    document: documentTarget, window: windowTarget, matchMedia: () => reduced,
    requestAnimationFrame: callback => { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id), Math, Number,
  }));
  const step = (elapsed = 16) => {
    clock += elapsed;
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback(clock));
  };
  const settle = (limit = 300) => {
    let count = 0;
    while (frames.size && count < limit) { step(); count += 1; }
    assert.ok(count < limit, 'アニメーションは目標位置へ収束する');
  };
  return { root, section, video, canvas, documentTarget, windowTarget, start: 1440, end: 3200,
    setDrawFailure: value => { failDraw = value; }, draws: () => draws, step, settle };
};

const runtime = createRuntime();
runtime.windowTarget.scrollY = runtime.start;
runtime.video.dispatch('loadeddata'); runtime.step();
assert.ok(runtime.section.classList.contains('is-ready'), '初期ロードで動画経路を準備する');
assert.ok(runtime.section.classList.contains('has-painted-frame'), '初期ロードで先頭フレームを描画する');
assert.equal(runtime.canvas.width, 1920, 'canvas 幅を採用動画の実ピクセル幅へ同期する');
assert.equal(runtime.canvas.height, 1080, 'canvas 高さを採用動画の実ピクセル高へ同期する');
assert.equal(runtime.video.currentTime, 0, '導線開始時は動画の先頭を保つ');
runtime.windowTarget.scrollY = (runtime.start + runtime.end) / 2;
runtime.windowTarget.dispatch('scroll'); runtime.settle();
assert.ok(runtime.video.currentTime > 0 && runtime.video.currentTime < runtime.video.duration, '中間スクロールは動画の中間へ移動する');
assert.equal(runtime.section.style.getPropertyValue('--consult-ecru'), '0.000', '中間では終端の色面を出さない');
runtime.windowTarget.scrollY = runtime.end;
runtime.windowTarget.dispatch('scroll'); runtime.settle();
runtime.video.dispatch('seeked'); runtime.settle();
assert.ok(Math.abs(runtime.video.currentTime - runtime.video.duration) <= 1 / 120, '終端スクロールは動画終端へ収束する');
assert.equal(runtime.section.style.getPropertyValue('--consult-ecru'), '1.000', '終端で生成りへの移行を完了する');
assert.equal(runtime.section.style.getPropertyValue('--consult-bridge'), '1.000', '終端で橋渡しテキストを完了する');
runtime.windowTarget.scrollY = runtime.start;
runtime.windowTarget.dispatch('scroll'); runtime.settle();
assert.ok(runtime.video.currentTime <= 1 / 120, '逆スクロールは動画の開始へ戻る');
assert.equal(runtime.section.style.getPropertyValue('--consult-bridge'), '0.000', '逆スクロールで橋渡しテキストを戻す');
runtime.windowTarget.scrollY = (runtime.start + runtime.end) / 2;
runtime.windowTarget.dispatch('scroll'); runtime.settle();
const drawsBeforePause = runtime.draws();
runtime.root.classList.add('motion-user-paused'); runtime.documentTarget.dispatch('mts:motionchange');
assert.equal(runtime.root.classList.contains('consultation-motion-ready'), true, '停止時も章の寸法を保持する');
assert.equal(runtime.video.paused, true, '停止時は動画を停止する');
const seeksDuringPause = runtime.video.seekWrites;
runtime.windowTarget.dispatch('scroll'); runtime.settle();
assert.equal(runtime.video.seekWrites, seeksDuringPause, '停止中のスクロールは動画を進めない');
assert.equal(runtime.draws(), drawsBeforePause, '停止中にフレームを更新しない');
runtime.root.classList.remove('motion-user-paused'); runtime.documentTarget.dispatch('mts:motionchange'); runtime.settle();
assert.equal(runtime.root.classList.contains('consultation-motion-ready'), true, '再開時は動画スクロールを有効化する');
assert.ok(runtime.draws() > drawsBeforePause, '再開時に現在フレームを再描画する');
runtime.setDrawFailure(true); runtime.video.dispatch('seeked');
assert.equal(runtime.section.classList.contains('has-painted-frame'), false, 'canvas 描画失敗時は静止画へ戻す');
runtime.setDrawFailure(false); runtime.windowTarget.dispatch('pageshow');
assert.ok(runtime.section.classList.contains('has-painted-frame'), 'ページ復帰時に描画を回復する');
runtime.video.dispatch('error');
assert.equal(runtime.section.classList.contains('is-ready'), false, '動画エラー時は動画経路を解除する');
assert.equal(runtime.root.classList.contains('consultation-motion-ready'), false, '動画エラー後はスクロール駆動を停止する');
const seeksAfterError = runtime.video.seekWrites;
runtime.windowTarget.scrollY = runtime.end; runtime.windowTarget.dispatch('scroll'); runtime.settle();
assert.equal(runtime.video.seekWrites, seeksAfterError, '動画エラー後に追加シークしない');
runtime.video.dispatch('loadeddata'); runtime.settle();
assert.ok(runtime.section.classList.contains('is-ready'), '再ロード成功時に動画経路を復帰する');
assert.ok(runtime.section.classList.contains('has-painted-frame'), '再ロード成功時に静止画からフレーム表示へ復帰する');

console.log('PASS: 採用動画の存在・参照・実寸canvas・VM上の初期/中間/終端/逆/停止再開/失敗復帰を検証');
