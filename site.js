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
  const consultPhoto = consultation.querySelector('.consult-photo img');
  const screenPhoto = consultPhoto.cloneNode(false);
  screenPhoto.className = 'screen-photo';
  screenPhoto.alt = '';
  screenPhoto.loading = 'eager';
  preview.appendChild(screenPhoto);
  const header = document.querySelector('.header');
  const button = document.querySelector('.motion');
  const label = document.querySelector('[data-motion-label]');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = value => Math.min(1, Math.max(0, value));
  const ramp = (value, start, end) => clamp((value - start) / (end - start));
  const ease = value => value * value * (3 - 2 * value);
  const lerp = (from, to, amount) => from + (to - from) * amount;
  // 接近全体に十分なスクロール距離を取り、後半だけ加速させない。
  const introShare = .36;
  const cameraSpeed = .25;
  const cameraStart = .08;
  const cameraEnd = .82;
  const logoFadeEnd = 2.8;
  const travelShare = introShare + (1 - introShare) / cameraSpeed;
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
    ['.screen-kicker', '.section-top .eyebrow'],
    ['.screen-with', '.section-top > span'],
    ['strong', '.consult-heading h2'],
    ['.screen-detail', '.consult-heading > p'],
  ].map(([screenSelector, realSelector]) => ({
    screen: preview.querySelector(screenSelector),
    real: consultation.querySelector(realSelector),
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
  let filmPriming = false;
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
    if (distance >= travelShare) return 1;
    return clamp(introShare + (distance - introShare) * cameraSpeed);
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
    // 元動画の時間を均等に進める。スクロール量が同じなら接近する秒数も同じ。
    const targetTime = 4 * ramp(zoomProgress, cameraStart, cameraEnd);
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
    const textTargets = portalText.map(({ real }) => {
      const style = getComputedStyle(real);
      return {box:real.getBoundingClientRect(),size:parseFloat(style.fontSize),line:parseFloat(style.lineHeight),spacing:parseFloat(style.letterSpacing)||0};
    });
    const photoBox = consultPhoto.getBoundingClientRect();
    const photoCorners = getComputedStyle(consultPhoto.parentElement).borderRadius.split(' ').map(parseFloat);
    const narrow = window.matchMedia('(max-width: 760px)').matches;
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
    // 終点の組版を最初からPC内に固定する。動くのは画面全体だけ。
    const endScreen = screenAt(4), endVideoScale = Math.max(width / 1280, height / 720);
    const endVideoLeft = -(1280 * endVideoScale - width) * filmX;
    const endVideoTop = (height - 720 * endVideoScale) / 2;
    const endX = width + (endVideoLeft + endScreen.x * endVideoScale - width) * 1.11;
    const endY = height / 2 + (endVideoTop + endScreen.y * endVideoScale - height / 2) * 1.11;
    const endScale = endScreen.width * endVideoScale * 1.11 / portalSize.width;
    // 最終コマが1コマ手前で止まるブラウザでも、枠が消えた後の受け渡し位置を一致させる。
    const settle = ease(ramp(zoomProgress, .88, .94)) * filmFinished;
    const x = lerp(roomLeft + roomWidth + (videoLeft + screen.x * videoScale - roomWidth) * finalZoom,endX,settle);
    const y = lerp(roomTop + roomHeight / 2 + (videoTop + screen.y * videoScale - roomHeight / 2) * finalZoom,endY,settle);
    const portalScale = lerp(screen.width * videoScale * finalZoom / portalSize.width,endScale,settle);
    // 文字は等倍比を保ち、表示面の高さだけ実写へ合わせる。横幅だけで高さを決めるとベゼルにはみ出す。
    const portalHeight = screen.height / screen.width * portalSize.width;

    opening.style.setProperty('--open', roomExpansion.toFixed(4));
    openingCopy.inert = roomExpansion >= 1 / 1.8;
    openingServices.inert = roomExpansion >= .5;
    scrollHint.inert = zoomProgress >= .30;
    opening.style.setProperty('--next', ease(ramp(position, .20, .32)).toFixed(4));
    opening.style.setProperty('--zoom-hide', ease(ramp(zoomProgress, .08, .30)).toFixed(4));
    // 窓やPCの枠が見えているうちにロゴから文字へ交代する。
    opening.style.setProperty('--logo-fade', ease(ramp(filmTime, 2.4, logoFadeEnd)).toFixed(4));
    const contentStart = ease(ramp(position, .20, .32));
    const contentInk = ease(ramp(filmTime, 0, 3.4));
    const paperReveal = ease(ramp(zoomProgress, .77, .95)) * filmFinished;
    // 写真は青い画面の間は淡い面として残し、きなりの背景と一緒に鮮明にする。
    const photoApproach = ease(ramp(filmTime, 2.7, 3.5));
    const photoInk = lerp(lerp(.04,.50,photoApproach),1,paperReveal);
    opening.style.setProperty('--screen-ink', (contentStart * lerp(.10,1,contentInk)).toFixed(4));
    opening.style.setProperty('--screen-photo-ink', (contentStart * photoInk).toFixed(4));
    opening.style.setProperty('--screen-photo-contrast', lerp(.40,1,paperReveal).toFixed(4));
    opening.style.setProperty('--screen-photo-saturation', lerp(.20,1,paperReveal).toFixed(4));
    const reveal = ease(ramp(zoomProgress, .94, .995)) * filmFinished;
    opening.style.setProperty('--handoff', reveal.toFixed(4));
    opening.style.setProperty('--portal-white', paperReveal.toFixed(4));
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
    const placeContent = (element,box) => {
      element.style.left = `${((box.left - stageBox.left - endX) / endScale).toFixed(2)}px`;
      element.style.top = `${((box.top - remainingTravel - stageBox.top - endY) / endScale).toFixed(2)}px`;
      element.style.width = `${(box.width / endScale).toFixed(2)}px`;
    };
    portalText.forEach(({ screen }, index) => {
      const target = textTargets[index];
      placeContent(screen,target.box);
      // 小さい表示面の端数丸めで、短い札や本文末尾が意図せず折り返されるのを防ぐ。
      screen.style.width = `${(target.box.width / endScale + 1).toFixed(4)}px`;
      screen.style.fontSize = `${(target.size / endScale).toFixed(4)}px`;
      screen.style.lineHeight = `${(target.line / endScale).toFixed(4)}px`;
      screen.style.letterSpacing = `${(target.spacing / endScale).toFixed(4)}px`;
    });
    placeContent(screenPhoto,photoBox);
    screenPhoto.style.height = `${(photoBox.height / endScale).toFixed(2)}px`;
    screenPhoto.style.borderRadius = photoCorners.map(value=>`${(value / endScale).toFixed(2)}px`).join(' ');
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
      // 表示位置の基準は1280×720のまま、描画面だけを動画の原寸へ合わせる。
      // 高解像度の動画を差し替えても、ここで720pへ落とさない。
      if (filmSurface.width !== video.videoWidth || filmSurface.height !== video.videoHeight) {
        filmSurface.width = video.videoWidth;
        filmSurface.height = video.videoHeight;
      }
      filmContext.drawImage(video, 0, 0, filmSurface.width, filmSurface.height);
      renderedTime = time;
      room.classList.add('frame-painted');
    } catch {
      failFilm();
    }
  }
  const readyFilm = () => {
    if (disposed || filmReady || filmError || video.readyState < 2) return;
    // 最初のコマだけを準備し、以降はスクロールによるシークで進める。
    filmPriming = false;
    video.pause();
    filmLoading = false;
    filmReady = true;
    paintFilm(video.currentTime);
    if (filmError) return;
    room.classList.add('film-ready');
    document.removeEventListener('touchend', primeFilm);
    document.removeEventListener('click', primeFilm);
    // 読み込み中に本文へ進んだ人の現在位置を、後から長い演出へ変えない。
    if (!cinematic && opening.getBoundingClientRect().bottom <= headerHeight() + 32) heroDeferred = true;
    syncMotion();
  };
  video.addEventListener('loadeddata', () => {
    // playの準備中にpauseすると、Safariで最初の描画前に中断される場合がある。
    if (!filmPriming) readyFilm();
  });
  video.addEventListener('seeked', () => {
    paintFilm(video.currentTime);
    schedule();
  });
  video.addEventListener('timeupdate', () => {
    if (filmPriming && video.currentTime > 0) readyFilm();
  });
  const failFilm = () => {
    if (filmError || disposed) return;
    filmLoading = false;
    filmError = true;
    syncMotion();
  };
  video.addEventListener('error', failFilm);
  // iOSではpreloadだけで最初のコマまで準備されない場合がある。
  // 無音・インラインでデコードを開始し、拒否されたら次の利用者操作で再試行する。
  function primeFilm() {
    if (disposed || filmReady || filmError || filmPriming || paused || reduced.matches || !filmUrl) return;
    filmPriming = true;
    video.play().then(() => {
      // Safariはplayの解決直後もデコードの準備中の場合がある。
      // コマが進んだ通知を受けてからreadyFilmで止める。
      if (disposed || paused || reduced.matches) {
        filmPriming = false;
        video.pause();
      }
    }).catch(error => {
      filmPriming = false;
      // 自動再生の拒否や初回コマでのpauseは、動画ファイルの失敗ではない。
      if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') failFilm();
    });
  }
  document.addEventListener('touchend', primeFilm, { passive: true });
  document.addEventListener('click', primeFilm);
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
        video.muted = true;
        video.playsInline = true;
        video.src = filmUrl;
        video.load();
        primeFilm();
      })
      .catch(error => { if (!disposed && error.name !== 'AbortError') failFilm(); });
  };
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true;
    video.pause();
    document.removeEventListener('touchend', primeFilm);
    document.removeEventListener('click', primeFilm);
    filmAbort?.abort();
    if (filmUrl) URL.revokeObjectURL(filmUrl);
  });
  function onScroll() {
    // 本文を読んだ後、先頭へ戻った場合は保留していたヒーローを開始する。
    if (heroDeferred && filmReady && !filmError && !paused && !reduced.matches && window.scrollY <= headerHeight()) {
      heroDeferred = false;
      syncMotion();
    }
    schedule();
  }
  window.addEventListener('pageshow', event => { if (event.persisted) onScroll(); });
  if (video.requestVideoFrameCallback) {
    const onFilmFrame = (_, metadata) => {
      if (disposed) return;
      paintFilm(metadata.mediaTime);
      if (filmPriming && metadata.mediaTime > 0) readyFilm();
      schedule();
      video.requestVideoFrameCallback(onFilmFrame);
    };
    video.requestVideoFrameCallback(onFilmFrame);
  }
  button.hidden = false;
  button.addEventListener('click', () => {
    paused = !paused;
    if (!paused) heroDeferred = false;
    if (paused) { filmPriming = false; video.pause(); } else primeFilm();
    offset = 0;
    syncMotion();
    draw();
  });
  reduced.addEventListener('change', () => {
    if (reduced.matches) { filmPriming = false; video.pause(); }
    else { loadFilm(); primeFilm(); }
    offset = 0;
    syncMotion();
    draw();
  });
  loadFilm();
  window.addEventListener('scroll', onScroll, { passive: true });
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
