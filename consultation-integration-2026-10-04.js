(() => {
  'use strict';
  const root = document.documentElement;
  const section = document.querySelector('[data-consultation-film]');
  if (!section) return;
  const chapter = section.closest('.consultation');
  const heading = section.previousElementSibling;
  if (!chapter || !heading) return;
  const video = section.querySelector('.consultation-film__video');
  const still = section.querySelector('img');
  still.src = 'assets/mts-scene-concept-a-2026-09-20-v14.png';
  // 動画専用の合成レイヤーに表示を任せず、デコード済みのコマを通常の描画面へ転写する。
  // 下の高解像度写真は消さない。描画前・失敗時も空白を作らない。
  const canvas = document.createElement('canvas');
  canvas.className = 'consultation-film__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  video.after(canvas);
  const context = canvas.getContext('2d');
  let paintedTime = -1;
  const paintFrame = () => {
    if (!context || video.readyState < 2 || video.seeking || !video.videoWidth) return;
    try {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
      // 採用した通し動画をそのまま描画。旧組立版の接続点補正は適用しない。
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      paintedTime = video.currentTime;
      section.classList.add('has-painted-frame');
    } catch {
      restoreStill();
    }
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let ready = false;
  let frame = 0;
  let lastTime = 0;
  let targetProgress = 0;
  let renderedProgress = 0;
  let overlayProgress = 0;
  let overlayTargetProgress = 0;
  let lastFrameAt = 0;

  const restoreStill = () => {
    paintedTime = -1;
    section.classList.remove('has-painted-frame');
    section.style.removeProperty('--consult-ecru');
    section.style.removeProperty('--consult-bridge');
    overlayProgress = overlayTargetProgress = 0;
  };

  const moving = () => !reduced.matches && !root.classList.contains('motion-user-paused');
  const deactivate = () => {
    root.classList.remove('consultation-motion-ready');
    section.style.removeProperty('--consult-ecru');
    section.style.removeProperty('--consult-bridge');
    section.style.removeProperty('--consult-video-opacity');
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    lastFrameAt = 0;
    overlayProgress = 0;
    overlayTargetProgress = 0;
    video.pause();
  };
  const failVideo = () => {
    // 通常の一時停止では現在の映像を保てるが、失敗時は次の再開も避けて静止画へ戻す。
    ready = false;
    lastTime = 0;
    section.classList.remove('is-ready');
    section.classList.remove('has-painted-frame');
    deactivate();
  };
  const readProgress = () => {
    const header = document.querySelector('.header')?.offsetHeight || 0;
    const stickyHeight = Math.max(1, section.offsetHeight);
    // 文字+写真の保持に続き、元画像を65vh分見せてから滑らかに動き出す。
    // 同量を章の高さにも足し、既存の動画の緩急は変えない。
    const start = chapter.offsetTop - header + introHold();
    const end = chapter.offsetTop + chapter.offsetHeight - stickyHeight - header;
    return Math.min(1, Math.max(0, (window.scrollY - start) / Math.max(1, end - start)));
  };
  // [スクロール配分, 旧版の基準秒]。durationで正規化し採用動画全編へ配分する。
  // 6秒まで表情を見せ、9.75秒の光へ向かうズーム区間だけ短縮する。
  const cadence = [[0,0],[.305618,3.4],[.345169,4.5],[1.154158,6.3],[1.230062,8.833333],[1.350065,9.666667],[1.364065333,11.125]];
  const sourceCadenceLength=cadence[cadence.length-1][0];
  const introHold = () => window.innerHeight * .65;
  const measureCadence=()=>{
    chapter.style.setProperty('--consult-slow-extra','0px');
    if(!ready||!moving())return;
    const travel=Math.max(1,chapter.offsetHeight-section.offsetHeight);
    chapter.style.setProperty('--consult-slow-extra',`${travel*(cadenceLength-1)+introHold()}px`);
  };
  const slopes = cadence.slice(1).map((point,i)=>(point[1]-cadence[i][1])/(point[0]-cadence[i][0]));
  const tangents = cadence.map((_,i)=>i===0?slopes[0]:i===cadence.length-1?slopes[i-1]:2/(1/slopes[i-1]+1/slopes[i]));
  const sourceTimeAt = x => {
    const i = Math.min(cadence.length-2,cadence.findIndex((point,j)=>j>0&&x<=point[0])-1);
    const [a,ta] = cadence[Math.max(0,i)], [b,tb] = cadence[Math.max(0,i)+1];
    const u=(x-a)/(b-a), u2=u*u, u3=u2*u;
    // 単調Hermite補間で速度の切替角を丸める。逆スクロールでも同じ道を戻る。
    return ((2*u3-3*u2+1)*ta+(u3-2*u2+u)*(b-a)*tangents[Math.max(0,i)]
      +(-2*u3+3*u2)*tb+(u3-u2)*(b-a)*tangents[Math.max(0,i)+1])/11.125;
  };
  const sourcePositionAt = seconds => {
    const goal = seconds / 12.041667;
    let low = 0, high = sourceCadenceLength;
    for (let i = 0; i < 48; i++) {
      const mid = (low + high) / 2;
      if (sourceTimeAt(mid) < goal) low = mid;
      else high = mid;
    }
    return (low + high) / 2;
  };
  const zoomStart = sourcePositionAt(6);
  const zoomEnd = sourcePositionAt(9.75);
  const zoomRatio = .2;
  const zoomTravel = (zoomEnd - zoomStart) * zoomRatio;
  const removedTravel = (zoomEnd - zoomStart) - zoomTravel;
  const cadenceLength = sourceCadenceLength - removedTravel;
  const retime = progress => {
    const x = Math.min(1, Math.max(0, progress)) * cadenceLength;
    let sourceX = x;
    if (x > zoomStart && x < zoomStart + zoomTravel) {
      const u = (x - zoomStart) / zoomTravel;
      // 両端の傾きを1に保ち、区間内だけ一気に加速。逆スクロールも同じ道を戻る。
      const eased = zoomRatio * u + (1 - zoomRatio) * u * u * (3 - 2 * u);
      sourceX = zoomStart + (zoomEnd - zoomStart) * eased;
    } else if (x >= zoomStart + zoomTravel) sourceX += removedTravel;
    return sourceTimeAt(Math.min(sourceCadenceLength, sourceX));
  };
  const render = (progress, elapsed) => {
    // ごく短い立ち上がりで動画を見せ、静止画だけの停止区間を作らない。
    const blend = Math.min(1, progress / .008);
    section.style.setProperty('--consult-video-opacity', (blend * blend * (3 - 2 * blend)).toFixed(4));
    const linear = Math.min(1, progress / .9);
    // 立ち上がりは短く丸める。全旅程の16%に渡る減速は停止感を生むため使わない。
    const u = Math.min(1, linear / .025);
    const videoProgress = linear < .025 ? .025 * u * u * (2 - u) : linear;
    // 時間の速度上限は設けない。スクロール位置へ既存の180ms補間で追随させる。
    // 別の速度制限を重ねると、映像が追いつく前に章を通過してしまう。
    const nextTime = video.duration * retime(videoProgress);
    // 約1フレーム未満の更新はまとめ、シーク中はseeked後に最新目標へ追随する。
    // decodeが返す端点の微小誤差は許容し、目に見える差だけを再シークする。
    const endpointEpsilon = 1 / 120;
    const needsEndpointSeek = (nextTime <= endpointEpsilon && video.currentTime > endpointEpsilon)
      || (video.duration - nextTime <= endpointEpsilon && video.duration - video.currentTime > endpointEpsilon);
    if ((Math.abs(nextTime - lastTime) > 1 / 30 || needsEndpointSeek) && !video.seeking) {
      lastTime = nextTime;
      try { video.currentTime = nextTime; } catch { failVideo(); return false; }
    }
    // 通し映像の終端は生成りで完結させ、CSSの色保持と橋渡しは最後だけに限定する。
    overlayTargetProgress = progress > .90 && (video.seeking || paintedTime < video.duration - 1 / 24) ? .90 : progress;
    // 終端のseekedと逆スクロールのどちらでも色面が跳ねないよう、表示は同じ減衰で追随する。
    overlayProgress += (overlayTargetProgress - overlayProgress) * (1 - Math.exp(-elapsed / 180));
    if (Math.abs(overlayTargetProgress - overlayProgress) < .0005) overlayProgress = overlayTargetProgress;
    // 薄い光から無地へは、素材側・色面側とも待ちを約1/3に短縮。
    const ecru = Math.min(1, Math.max(0, (overlayProgress - .90) / (.04 / 3)));
    // bridgeは最後に十分な静止時間を残し、ホイール一回で読み飛ばされないようにする。
    const bridge = Math.min(1, Math.max(0, (overlayProgress - .94) / .02));
    section.style.setProperty('--consult-ecru', ecru.toFixed(3));
    section.style.setProperty('--consult-bridge', bridge.toFixed(3));
    return true;
  };
  const update = now => {
    frame = 0;
    if (!ready || !moving() || document.hidden) return;
    targetProgress = readProgress();
    const elapsed = Math.min(64, lastFrameAt ? now - lastFrameAt : 16);
    lastFrameAt = now;
    renderedProgress += (targetProgress - renderedProgress) * (1 - Math.exp(-elapsed / 180));
    if (Math.abs(targetProgress - renderedProgress) < .0005) renderedProgress = targetProgress;
    if (!render(renderedProgress, elapsed)) return;
    if (renderedProgress !== targetProgress || overlayProgress !== overlayTargetProgress) schedule();
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  const activate = () => {
    if (!ready || !moving()) { deactivate(); return; }
    root.classList.add('consultation-motion-ready');
    paintFrame();
    measureCadence();
    targetProgress = renderedProgress = readProgress();
    lastTime = video.currentTime;
    overlayTargetProgress = overlayProgress = targetProgress > .90 && (video.seeking || video.currentTime < video.duration - 1 / 24) ? .90 : targetProgress;
    lastFrameAt = 0;
    schedule();
  };
  video.addEventListener('loadeddata', () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    ready = true;
    section.classList.add('is-ready');
    activate();
  });
  // 高速スクロール中はシークを重ねず、完了通知で最後に来たスクロール位置を反映する。
  video.addEventListener('seeked', () => { lastTime = video.currentTime; paintFrame(); schedule(); });
  video.addEventListener('error', failVideo);
  video.src = video.dataset.src;
  video.load();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', ()=>{measureCadence();schedule();});
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; lastFrameAt = 0; }
    else activate();
  });
  document.addEventListener('mts:motionchange', activate);
  window.addEventListener('pageshow', activate);
  canvas.addEventListener('contextlost', restoreStill);
  canvas.addEventListener('contextrestored', () => { paintFrame(); schedule(); });
  reduced.addEventListener('change', activate);
})();
