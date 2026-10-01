(() => {
  'use strict';
  const root = document.documentElement;
  const opening = document.querySelector('.opening');
  const stage = document.querySelector('.opening-stage');
  const room = document.querySelector('.opening-room');
  const openingCopy = document.querySelector('.opening-copy');
  const openingServices = document.querySelector('.opening-services');
  const scrollHint = document.querySelector('.scroll-hint');
  const video = room.querySelector('.opening-film');
  // 埋め込みブラウザでも確実に合成される通常の描画面へ、表示済みの動画コマを写す。
  const filmSurface = document.createElement('canvas');
  filmSurface.className = 'opening-film-surface';
  filmSurface.width = 1280;
  filmSurface.height = 720;
  filmSurface.setAttribute('aria-hidden', 'true');
  room.appendChild(filmSurface);
  const filmContext = filmSurface.getContext('2d', { alpha: false });
  const preview = document.querySelector('.opening-preview');
  const consultation = document.querySelector('main > .consultation');
  const header = document.querySelector('.header');
  const button = document.querySelector('.motion');
  const label = document.querySelector('[data-motion-label]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.min(1, Math.max(0, value));
  const ramp = (value, start, end) => clamp((value - start) / (end - start));
  const ease = value => value * value * (3 - 2 * value);
  const lerp = (from, to, amount) => from + (to - from) * amount;
  // ロゴが鮮明になってから消えるまでだけ0.5倍速。その後の本文への接近は1倍速。
  const introShare = .36;
  const logoSpeed = .5;
  const cameraStart = .08;
  const cameraEnd = .82;
  const logoFadeEnd = 2.8;
  // easeの逆関数で、ロゴが消える映像コマをスクロールの速度境界へ合わせる。
  const inverseEase = value => .5 - Math.sin(Math.asin(1 - 2 * clamp(value)) / 3);
  const logoEnd = introShare + (1 - introShare) * lerp(cameraStart, cameraEnd, inverseEase(logoFadeEnd / 4));
  const logoDistance = (logoEnd - introShare) / logoSpeed;
  const recoveryDistance = .08;
  const recoveryLoss = (1 - logoSpeed) * recoveryDistance / 2;
  const travelShare = introShare + logoDistance + (1 - logoEnd) + recoveryLoss;
  opening.style.setProperty('--travel-share', String(travelShare));
  // 24fpsの元動画から画面内側を9コマで計測。中間フレームは滑らかに補間する。
  const screenTrack = [
    { time: 0, x: 930, y: 480, width: 210, height: 121 },
    { time: 1, x: 880, y: 445, width: 264, height: 145 },
    { time: 2, x: 784, y: 377, width: 370, height: 207 },
    { time: 3, x: 592, y: 263, width: 601, height: 339 },
    { time: 3.5, x: 399, y: 167, width: 852, height: 473 },
    { time: 3.75, x: 263, y: 104, width: 985, height: 566 },
    { time: 3.791667, x: 240, y: 94, width: 1028, height: 590 },
    { time: 3.833333, x: 190, y: 72, width: 1075, height: 617 },
    { time: 4, x: 49, y: 9, width: 1328, height: 755 },
  ];
  const portalSize = { width: 1000 };
  const portalText = [
    ['.screen-kicker', '.section-top .eyebrow', 65, 78, 15],
    ['.screen-with', '.section-top > span', 865, 78, 11],
    ['strong', '.consult-heading h2', 65, 169, 58],
    ['.screen-detail', '.consult-heading > p', 65, 350, 19],
  ].map(([screenSelector, realSelector, x, y, size]) => ({
    screen: preview.querySelector(screenSelector),
    real: consultation.querySelector(realSelector),
    x, y, size,
  }));
  let paused = false;
  let heroDeferred = false;
  let frame = 0;
  let cinematic = false;
  let position = 0;
  let offset = 0;
  let lastY = window.scrollY;
  const refreshProof = () => document.dispatchEvent(new Event('mts:motionchange'));
  let renderedTime = 0;
  let filmReady = false;
  let filmLoading = false;
  let filmError = false;
  let filmUrl = null;
  let filmAbort = null;
  let disposed = false;
  const samples = { 'opening-start': 0, 'opening-middle': .43, 'opening-end': 1 };
  const query = new URLSearchParams(location.search);
  const sampleName = query.get('frame');
  const hasSample = false; // 公開版では撮影用の固定表示を使わない
  const stopped = () => paused || reduced.matches || heroDeferred || filmError || !filmReady;
  const headerHeight = () => header.getBoundingClientRect().height;
  const progress = () => {
    const box = opening.getBoundingClientRect();
    const distance = clamp((headerHeight() - box.top) / Math.max(1, box.height - window.innerHeight + headerHeight())) * travelShare;
    if (distance <= introShare) return distance;
    if (distance <= introShare + logoDistance) return introShare + (distance - introShare) * logoSpeed;
    const afterLogo = distance - introShare - logoDistance;
    if (afterLogo < recoveryDistance) {
      const u = afterLogo / recoveryDistance;
      // 速度のeaseを積分し、位置も速度も連続のまま0.5倍から1倍へ戻す。
      return logoEnd + logoSpeed * afterLogo
        + (1 - logoSpeed) * recoveryDistance * (u ** 3 - u ** 4 / 2);
    }
    return clamp(logoEnd + afterLogo - recoveryLoss);
  };
  const screenAt = time => {
    const index = Math.max(0, screenTrack.findIndex((point, i) => i === screenTrack.length - 1 || time <= screenTrack[i + 1].time));
    const a = screenTrack[index];
    const b = screenTrack[Math.min(index + 1, screenTrack.length - 1)];
    if (a === b) return a;
    const u = clamp((time - a.time) / (b.time - a.time));
    const before = screenTrack[Math.max(0, index - 1)];
    const after = screenTrack[Math.min(screenTrack.length - 1, index + 2)];
    const result = { time };
    for (const key of ['x', 'y', 'width', 'height']) {
      const slopeA = (b[key] - before[key]) / (b.time - before.time);
      const slopeB = (after[key] - a[key]) / (after.time - a.time);
      const duration = b.time - a.time;
      result[key] = (2 * u ** 3 - 3 * u ** 2 + 1) * a[key]
        + (u ** 3 - 2 * u ** 2 + u) * duration * slopeA
        + (-2 * u ** 3 + 3 * u ** 2) * b[key]
        + (u ** 3 - u ** 2) * duration * slopeB;
    }
    return result;
  };
  function draw() {
    frame = 0;
    if (!cinematic || stopped()) return;
    const travel = Math.abs(window.scrollY - lastY) / Math.max(1, window.innerHeight);
    offset *= Math.max(0, 1 - travel * 2);
    position = hasSample ? samples[sampleName] : clamp(progress() + offset);
    const roomExpansion = ease(ramp(position, .02, .25));
    const zoomProgress = ramp(position, introShare, 1);
    // ロゴの見せ場では表示面を無地に保ち、その後だけ実写のカメラ移動をスクロールへ同期する。
    const targetTime = 4 * ease(ramp(zoomProgress, cameraStart, cameraEnd));
    if (video.readyState >= 2 && Math.abs(video.currentTime - targetTime) > 1 / 60) {
      video.currentTime = targetTime;
    }
    const filmTime = clamp((video.requestVideoFrameCallback ? renderedTime : video.currentTime) / 4) * 4;
    // 4秒へのシークでも最終表示コマが3.958秒になるデコーダがあるため、1コマ分の余裕を持たせる。
    const filmFinished = ease(ramp(filmTime, 3.65, 3.94));
    const finalZoom = 1 + .11 * ease(ramp(zoomProgress, .82, .94)) * filmFinished;
    // 測定を先にまとめる。書き込み後のレイアウト再計算を毎フレーム発生させない。
    const stageBox = stage.getBoundingClientRect();
    const width = stageBox.width;
    const height = stageBox.height;
    // 固定演出中の次章はまだ画面下にあるため、受け渡し時の位置を基準にする。
    const remainingTravel = Math.max(0, consultation.getBoundingClientRect().top - stageBox.top);
    const textTargets = portalText.map(({ real }) => ({
      box: real.getBoundingClientRect(),
      size: Number.parseFloat(getComputedStyle(real).fontSize),
    }));
    const textLeft = textTargets[0].box.left;
    const textRight = textTargets[1].box.right;
    const narrow = window.matchMedia('(max-width: 760px)').matches;
    // 文字が過大になってから急に縮まないよう、接近の後半から実ページの組版へ連続的に寄せる。
    const textLayout = ease(ramp(zoomProgress, narrow ? .53 : .50, narrow ? .78 : .88));
    const roomLeft = width * (narrow ? .24 : .54) * (1 - roomExpansion);
    const roomTop = height * (narrow ? .47 : .08) * (1 - roomExpansion);
    const roomWidth = width * lerp(narrow ? .76 : .43, 1, roomExpansion);
    const roomHeight = height * lerp(narrow ? .39 : .77, 1, roomExpansion);
    const screen = screenAt(filmTime);
    const videoScale = Math.max(roomWidth / 1280, roomHeight / 720);
    const filmEndX = Number.parseFloat(getComputedStyle(room).getPropertyValue('--film-end-x')) || .8;
    const filmX = filmEndX;
    const videoLeft = -(1280 * videoScale - roomWidth) * filmX;
    const videoTop = (roomHeight - 720 * videoScale) / 2;
    // 映像の画面位置に実HTMLを貼る。最後の約11%だけ写真とHTMLを一緒に等比拡大する。
    const x = roomLeft + roomWidth + (videoLeft + screen.x * videoScale - roomWidth) * finalZoom;
    const y = roomTop + roomHeight / 2 + (videoTop + screen.y * videoScale - roomHeight / 2) * finalZoom;
    const portalScale = screen.width * videoScale * finalZoom / portalSize.width;
    // 文字は等倍比を保ち、表示面の高さだけ実写へ合わせる。横幅だけで高さを決めるとベゼルにはみ出す。
    const portalHeight = screen.height / screen.width * portalSize.width;
    const portalLeft = stageBox.left + x;
    const portalTop = stageBox.top + y;

    opening.style.setProperty('--open', roomExpansion.toFixed(4));
    openingCopy.inert = roomExpansion >= 1 / 1.8;
    openingServices.inert = roomExpansion >= .5;
    scrollHint.inert = zoomProgress >= .30;
    opening.style.setProperty('--next', ease(ramp(position, .20, .32)).toFixed(4));
    opening.style.setProperty('--zoom-hide', ease(ramp(zoomProgress, .08, .30)).toFixed(4));
    // 窓やPCの枠が見えているうちにロゴから文字へ交代する。
    opening.style.setProperty('--logo-fade', ease(ramp(filmTime, 2.4, logoFadeEnd)).toFixed(4));
    opening.style.setProperty('--screen-ink', ease(ramp(filmTime, logoFadeEnd, 3.4)).toFixed(4));
    const reveal = ease(ramp(zoomProgress, .94, .995)) * filmFinished;
    opening.style.setProperty('--handoff', reveal.toFixed(4));
    opening.style.setProperty('--portal-white', (ease(ramp(zoomProgress, .77, .95)) * filmFinished).toFixed(4));
    // 同位置の文字を半透明で二重に重ねると灰色に見えるため、画面が全面化してから入れ替える。
    const textReveal = Number(position >= 1 && filmFinished > .99);
    stage.style.pointerEvents = textReveal ? 'none' : '';
    opening.style.setProperty('--preview-fade', textReveal.toFixed(4));
    root.style.setProperty('--text-reveal', textReveal.toFixed(4));
    root.style.setProperty('--bottom-reveal', (ease(ramp(zoomProgress, .97, 1)) * filmFinished).toFixed(4));
    room.style.setProperty('--film-position', `${(filmX * 100).toFixed(2)}%`);
    room.style.transform = `scale(${finalZoom.toFixed(4)})`;
    preview.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${portalScale.toFixed(5)})`;
    preview.style.height = `${portalHeight.toFixed(2)}px`;
    preview.style.visibility = 'visible';
    // 全画面に近づいたら、実際の次章と同じ文字位置・サイズへ収束させる。
    portalText.forEach(({ screen, x: startX, y: startY, size }, index) => {
      const realBox = textTargets[index].box;
      const targetX = (realBox.left - portalLeft) / portalScale;
      const targetY = (realBox.top - remainingTravel - portalTop) / portalScale;
      const targetSize = textTargets[index].size / portalScale;
      // まだベゼルが見える大きさでは、説明文の最終行を表示面の内側に保つ。
      const innerGap = lerp(48, 12, clamp((portalScale - .25) / .4));
      const safeY = index === 3
        ? Math.min(targetY, portalHeight - realBox.height / portalScale - innerGap)
        : targetY;
      const startTop = startY;
      // PCの枠が見える間は内側余白を保ち、枠が画面外へ出たら実ページの余白へ合わせる。
      const layoutX = lerp(startX, targetX, textLayout);
      const screenInset = startX * ease(ramp(portalLeft - stageBox.left, 0, 64));
      const safeX = index === 1
        ? layoutX
        : Math.max(layoutX, screenInset, (textLeft - portalLeft) / portalScale);
      screen.style.left = `${safeX.toFixed(2)}px`;
      screen.style.top = `${lerp(startTop, safeY, textLayout).toFixed(2)}px`;
      screen.style.fontSize = `${lerp(size, targetSize, textLayout).toFixed(2)}px`;
      if (index === 3) {
        const detailWidth = Math.min(
          lerp(portalSize.width - startX * 2, realBox.width / portalScale, textLayout),
          portalSize.width - safeX - 24,
          (textRight - portalLeft) / portalScale - safeX,
        );
        screen.style.width = `${Math.max(1, detailWidth).toFixed(2)}px`;
      }
      if (index === 2) screen.style.lineHeight = lerp(1.2, 1.4, textLayout).toFixed(3);
    });
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
    cinematic = true;
    root.classList.add('cinematic');
  }
  function syncMotion() {
    const wasMoving = cinematic && !root.classList.contains('motion-paused');
    const willMove = !stopped();
    const wasUserPaused = root.classList.contains('motion-user-paused');
    const userPaused = paused || reduced.matches;
    // ページ内リンクの上余白に残る前章の端を、閲覧中の章と誤認しない。
    const inHero = !wasMoving || progress() < 1;
    let anchor = [...document.querySelectorAll('main > section')].find(section => (inHero || section !== opening) && section.getBoundingClientRect().bottom > headerHeight() + 32);
    let anchorTop = anchor?.getBoundingClientRect().top;
    if (anchor?.classList.contains('proof-orbit')) {
      const journey = anchor.querySelector('.orbit-journey');
      if (journey.getBoundingClientRect().bottom > headerHeight() + 32) {
        // 輪の途中で停止/再開したら、10枚を読める列の入口へ合わせる。
        anchor = journey;
        anchorTop = wasUserPaused !== userPaused ? headerHeight() : journey.getBoundingClientRect().top;
      } else {
        // 事実欄を読んでいる場合は、その文章の画面位置を保つ。
        anchor = anchor.querySelector('.orbit-intro');
        anchorTop = anchor.getBoundingClientRect().top;
      }
    }
    if (!stopped()) enableCinema();
    root.classList.toggle('motion-paused', stopped());
    // 利用者の停止設定だけを実績カードへ共有し、動画の可否とは分離する。
    root.classList.toggle('motion-user-paused', userPaused);
    // 映像の準備完了・停止・端末設定変更のすべてで、後続の帯も新しい寸法へ合わせる。
    refreshProof();
    if ((wasMoving !== willMove || wasUserPaused !== userPaused) && anchor) {
      if (wasMoving && anchor === opening) {
        window.scrollTo({ top: position < .5 ? 0 : Math.max(0, consultation.offsetTop - headerHeight()), behavior: 'instant' });
      } else {
        window.scrollBy({ top: anchor.getBoundingClientRect().top - anchorTop, behavior: 'instant' });
      }
      lastY = window.scrollY;
    }
    if (stopped()) {
      stage.style.pointerEvents = '';
      openingCopy.inert = false;
      openingServices.inert = false;
      scrollHint.inert = false;
    }
    button.setAttribute('aria-pressed', String(userPaused));
    button.disabled = reduced.matches;
    label.textContent = reduced.matches ? '動きを抑制中' : paused ? '動きを再開' : '動きを止める';
    button.title = reduced.matches ? '端末の「動きを減らす」設定を優先しています' : '';
    if (stopped()) cancelFrame(); else schedule();
  }
  function paintFilm(time) {
    if (disposed || !filmContext || video.readyState < 2) return;
    try {
      filmContext.drawImage(video, 0, 0, filmSurface.width, filmSurface.height);
      renderedTime = time;
      room.classList.add('frame-painted');
    } catch {
      failFilm();
    }
  }
  const readyFilm = () => {
    if (disposed) return;
    filmLoading = false;
    filmReady = true;
    paintFilm(video.currentTime);
    room.classList.add('film-ready');
    // 読み込み中に本文へ進んだ人の現在位置を、後から長い演出へ変えない。
    if (!cinematic && window.scrollY > headerHeight()) heroDeferred = true;
    syncMotion();
  };
  video.addEventListener('loadeddata', readyFilm);
  video.addEventListener('seeked', () => {
    paintFilm(video.currentTime);
    schedule();
  });
  const failFilm = () => {
    if (filmError || disposed) return;
    filmLoading = false;
    filmError = true;
    syncMotion();
  };
  video.addEventListener('error', failFilm);
  // Blob URLならRange非対応のローカルサーバーでも全コマへ正確にシークできる。
  const loadFilm = () => {
    if (filmLoading || filmReady || filmError || disposed || reduced.matches) return;
    if (!filmContext) { failFilm(); return; }
    filmLoading = true;
    filmAbort = new AbortController();
    fetch(video.dataset.src, { signal: filmAbort.signal })
      .then(response => {
        if (!response.ok) throw new Error('hero video unavailable');
        return response.blob();
      })
      .then(blob => {
        if (disposed) return;
        filmUrl = URL.createObjectURL(blob);
        video.src = filmUrl;
      })
      .catch(error => { if (!disposed && error.name !== 'AbortError') failFilm(); });
  };
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true;
    filmAbort?.abort();
    if (filmUrl) URL.revokeObjectURL(filmUrl);
  });
  window.addEventListener('pageshow', event => { if (event.persisted) schedule(); });
  if (video.requestVideoFrameCallback) {
    const onFilmFrame = (_, metadata) => {
      if (disposed) return;
      paintFilm(metadata.mediaTime);
      schedule();
      video.requestVideoFrameCallback(onFilmFrame);
    };
    video.requestVideoFrameCallback(onFilmFrame);
  }
  button.hidden = false;
  button.addEventListener('click', () => {
    paused = !paused;
    if (!paused) heroDeferred = false;
    offset = 0;
    syncMotion();
    draw();
  });
  reduced.addEventListener('change', () => {
    if (!reduced.matches) loadFilm();
    offset = 0;
    syncMotion();
    draw();
  });
  loadFilm();
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
