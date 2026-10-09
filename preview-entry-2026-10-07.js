(() => {
  'use strict';
  if (location.hash !== '#approach') return;
  let interacted = false;
  const stop = () => { interacted = true; };
  const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
  events.forEach(name => window.addEventListener(name, stop, { passive: true, once: true }));
  const loaded = document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  const images = [...document.querySelectorAll('.opening-room img')];
  Promise.all([loaded, document.fonts.ready, ...images.map(img => img.decode().catch(() => {}))])
    .then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      events.forEach(name => window.removeEventListener(name, stop));
      if (interacted || location.hash !== '#approach') return;
      const chapter = document.getElementById('approach');
      if (!chapter) return;
      // scroll-margin分だけ手前に止まるとヒーローの複製見出しが残る。
      // 入口では実ヘッダーの直下へ合わせ、前章の切替を完了する。
      const header = document.querySelector('.header')?.getBoundingClientRect().height || 0;
      window.scrollTo({ top: chapter.getBoundingClientRect().top + window.scrollY - header, behavior: 'instant' });
    })));
})();
