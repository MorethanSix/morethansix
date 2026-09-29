(() => {
  'use strict';
  const root = document.documentElement;
  const opening = document.querySelector('.opening');
  const header = document.querySelector('.header');
  const copy = document.querySelector('.opening-copy');
  const services = document.querySelector('.opening-services');
  const button = document.querySelector('.motion');
  const label = document.querySelector('[data-motion-label]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.min(1, Math.max(0, value));
  const ramp = (value, start, end) => clamp((value - start) / (end - start));
  const ease = value => value * value * (3 - 2 * value);
  let paused = false;
  let frame = 0;
  let cinematic = false;
  let position = 0;
  let offset = 0;
  let lastY = window.scrollY;
  const samples = { 'opening-start': 0, 'opening-middle': .43, 'opening-end': 1 };
  const query = new URLSearchParams(location.search);
  const sampleName = query.get('frame');
  const hasSample = Object.hasOwn(samples, sampleName);
  const stopped = () => paused || reduced.matches;
  const headerHeight = () => header.getBoundingClientRect().height;
  const progress = () => {
    const box = opening.getBoundingClientRect();
    return clamp((headerHeight() - box.top) / Math.max(1, box.height - window.innerHeight + headerHeight()));
  };
  function draw() {
    frame = 0;
    if (!cinematic || stopped()) return;
    const travel = Math.abs(window.scrollY - lastY) / Math.max(1, window.innerHeight);
    offset *= Math.max(0, 1 - travel * 2);
    position = hasSample ? samples[sampleName] : clamp(progress() + offset);
    // v11/v12のヒーローと同じスクロール曲線・終点を維持する。
    opening.style.setProperty('--open', ease(ramp(position, .1, .67)).toFixed(4));
    opening.style.setProperty('--push', ramp(position, .67, 1).toFixed(4));
    opening.style.setProperty('--next', ease(ramp(position, .47, .8)).toFixed(4));
    copy.inert = position > .38;
    services.inert = position > .38;
    lastY = window.scrollY;
  }
  function schedule() {
    if (!frame && !document.hidden && cinematic && !stopped()) frame = requestAnimationFrame(draw);
  }
  function cancelFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }
  function enableCinema() {
    if (cinematic) return;
    const anchor = [...document.querySelectorAll('main > section')].find(section => section.getBoundingClientRect().bottom > headerHeight());
    const top = anchor?.getBoundingClientRect().top;
    cinematic = true;
    root.classList.add('cinematic');
    if (anchor && typeof top === 'number') window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' });
    lastY = window.scrollY;
  }
  function syncMotion() {
    if (!stopped()) enableCinema();
    root.classList.toggle('motion-paused', stopped());
    button.setAttribute('aria-pressed', String(stopped()));
    button.disabled = reduced.matches;
    label.textContent = reduced.matches ? '動きを抑制中' : paused ? '動きを再開' : '動きを止める';
    button.title = reduced.matches ? '端末の「動きを減らす」設定を優先しています' : '';
    copy.inert = !stopped() && position > .38;
    services.inert = !stopped() && position > .38;
    if (stopped()) cancelFrame(); else schedule();
  }
  button.hidden = false;
  button.addEventListener('click', () => {
    paused = !paused;
    if (!paused) { offset = position - progress(); lastY = window.scrollY; }
    syncMotion();
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches && cinematic) { offset = position - progress(); lastY = window.scrollY; }
    syncMotion();
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', () => document.hidden ? cancelFrame() : schedule());
  syncMotion();
  if (hasSample && !stopped()) requestAnimationFrame(() => {
    window.scrollTo({ top: opening.offsetTop - headerHeight() + (opening.offsetHeight - window.innerHeight + headerHeight()) * samples[sampleName], behavior: 'instant' });
    draw();
  });
  // v14: 第3場面の3段階を順に出現させる（.cinematic 時のみ CSS が効く。停止中・reduced-motion・JSなしは常時表示）。
  const stages = document.querySelectorAll('.poss-stage, .proof-reveal');
  if ('IntersectionObserver' in window && stages.length) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-in');
      io.unobserve(entry.target);
    }), { rootMargin: '0px 0px -12% 0px', threshold: .2 });
    stages.forEach(stage => io.observe(stage));
  } else {
    stages.forEach(stage => stage.classList.add('is-in'));
  }

  // v16: 連作画の帯。縦スクロールの進み具合(0-1)を --reel に書き、CSS が横移動に変換する（.cinematic かつ停止中でない時だけ）。
  const reelWrap = document.querySelector('.proof__reel-wrap');
  const reel = reelWrap && reelWrap.querySelector('.proof__reel');
  const track = reel && reel.querySelector('.proof__track');
  if (reelWrap && reel && track) {
    const narrow = window.matchMedia('(max-width:760px)');
    let reelMax = 0;
    const measure = () => {
      reelMax = Math.max(0, track.scrollWidth - reel.clientWidth);
      reelWrap.style.setProperty('--reel-max', reelMax + 'px'); reelWrap.style.setProperty('--reel-h', reel.offsetHeight + 'px');
    };
    const tick = () => {
      if (!cinematic || stopped() || narrow.matches) return;
      if (reel.scrollLeft) reel.scrollLeft = 0; // 静的モードの横スクロール位置が残らないように
      const wrapRect = reelWrap.getBoundingClientRect(); const reelRect = reel.getBoundingClientRect();
      const total = reelWrap.offsetHeight - reel.offsetHeight; // 帯が固定されたまま進む縦の距離
      const p = total > 0 ? Math.min(1, Math.max(0, (reelRect.top - wrapRect.top) / total)) : 0;
      reelWrap.style.setProperty('--reel', p.toFixed(4));
    };
    measure(); tick();
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', () => { measure(); tick(); });
    window.addEventListener('load', () => { measure(); tick(); });
    document.addEventListener("click", e => { if (e.target.closest(".motion")) setTimeout(() => { measure(); tick(); }, 50); });
  }
})();

(() => {
  'use strict';
  // v17: v16 の動き（ヒーロー・連作画の帯）はそのまま。後半の章に「出現・マスク・カウントアップ・進捗バー」を足す。
  // 動くのは .cinematic かつ停止中でない時だけ（v16 の JS が html に付けるクラスで判定）。
  const root = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const moving = () => root.classList.contains('cinematic') && !root.classList.contains('motion-paused') && !reduced.matches;

  // 出現させる要素に印を付ける。[selector, 順番にずらすか]
  const groups = [
    ['.consultation .section-top, .consult-heading, .consult-bottom', false],
    ['.partner .section-top, .partner-copy h2, .partner-copy > p:not(.partner-promise), .partner-promise', false],
    ['.strengths p', true],
    ['.services .section-top, #services-title, .service-foot', false],
    ['.service-text, .service-art', false],
    ['.pricing .section-top, .pricing-grid > div, .pricing tbody tr, .price-note', true],
    ['.contact .section-top, .contact-grid > div > h2, .contact-grid > div > p, .contact-cta, .closing', false],
    ['.contact-steps li', true],
  ];
  const targets = [];
  groups.forEach(([selector, stagger]) => document.querySelectorAll(selector).forEach((el, i) => {
    el.classList.add('mv-up');
    if (stagger) el.style.setProperty('--i', i);
    targets.push(el);
  }));
  // サービスの絵は文章の少し後に出す
  document.querySelectorAll('.service-art').forEach(el => el.style.setProperty('--i', 2));
  document.querySelectorAll('.consult-photo, .partner-grid figure').forEach(el => { el.classList.add('mv-mask'); targets.push(el); });

  // #15 料金の数字を 0 から数え上げる（HTML には最終の金額が入っている。止まっている時は触らない）
  const prices = [...document.querySelectorAll('.pricing td strong')].map(el => ({ el, text: el.textContent, value: Number(el.textContent.replace(/[^\d.]/g, '')), digits: (el.textContent.split('.')[1] || '').length }))
    .filter(p => Number.isFinite(p.value) && p.value > 0);
  let counted = false;
  const countUp = () => {
    if (counted) return;
    counted = true;
    if (!moving()) return;
    const t0 = performance.now(); const dur = 1100;
    // 数え上げ中の途中の数字を読み上げさせない（終わったら戻す）
    prices.forEach(({ el }) => el.setAttribute('aria-hidden', 'true'));
    const step = now => {
      const p = Math.min(1, (now - t0) / dur); const e = 1 - Math.pow(1 - p, 3);
      prices.forEach(({ el, text, value, digits }) => { el.textContent = p < 1 ? (value * e).toFixed(digits) : text; });
      if (p < 1 && moving()) requestAnimationFrame(step); else prices.forEach(({ el, text }) => { el.textContent = text; el.removeAttribute('aria-hidden'); });
    };
    requestAnimationFrame(step);
  };
  const table = document.querySelector('.pricing table');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      (owners.get(entry.target) || [entry.target]).forEach(el => el.classList.add('is-in'));
      if (entry.target === table) countUp();
      io.unobserve(entry.target);
    }), { rootMargin: '0px 0px -10% 0px', threshold: .15 });
    // 高さを持たない要素（サービスの絵の一部）は、親の章の段が画面に入った時に出す
    const owners = new Map();
    targets.forEach(el => {
      const trigger = el.classList.contains('service-art') ? el.closest('.service-stage') : el;
      if (!owners.has(trigger)) owners.set(trigger, []);
      owners.get(trigger).push(el);
    });
    owners.forEach((_, trigger) => io.observe(trigger));
    if (table) io.observe(table);
  } else {
    targets.forEach(el => el.classList.add('is-in'));
  }

  // #25 スクロール進捗バー
  const bar = document.createElement('div');
  bar.className = 'read-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.appendChild(bar);
  let frame = 0;
  const drawBar = () => {
    frame = 0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.setProperty('--read', max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : '0');
  };
  const scheduleBar = () => { if (!frame) frame = requestAnimationFrame(drawBar); };
  window.addEventListener('scroll', scheduleBar, { passive: true });
  window.addEventListener('resize', scheduleBar);
  drawBar();
})();
