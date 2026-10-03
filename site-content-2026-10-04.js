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

(() => {
  'use strict';
  // 2026-09-30: 「相談を申し込む」を押すとメールアドレスの札が開く。JSなしでは札は最初から見えている。
  const box = document.getElementById('contact-mail');
  const cta = document.querySelector('.contact-cta');
  if (!box || !cta) return;
  const addr = box.querySelector('.contact-mail__addr');
  const copy = box.querySelector('.contact-mail__copy');
  const done = box.querySelector('.contact-mail__done');
  box.classList.add('is-folded');
  cta.setAttribute('aria-expanded', 'false');
  cta.addEventListener('click', e => {
    e.preventDefault();
    box.classList.remove('is-folded');
    box.classList.add('is-open');
    cta.setAttribute('aria-expanded', 'true');
    box.focus({ preventScroll: true });
    box.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('motion-paused') ? 'auto' : 'smooth', block: 'center' });
  });
  if (copy && addr && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener('click', () => {
      navigator.clipboard.writeText(addr.textContent.trim())
        .then(() => { done.textContent = 'コピーしました'; })
        .catch(() => { done.textContent = 'コピーできませんでした。アドレスを選んでコピーしてください'; });
    });
  }
})();
