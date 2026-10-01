export const clamp = n => Math.min(1, Math.max(0, n));
export const mix = (a, b, t) => a + (b - a) * t;
export const ramp = (p, a, b) => clamp((p - a) / (b - a));
export const smooth = t => t * t * (3 - 2 * t);
export const rad = a => a * Math.PI / 180;
// 回転中は左右が少し画面外へ出る大きさを保ち、退出するときだけ縮む。
export const ringScaleAt = p => mix(1, .72, smooth(ramp(p, .88, 1)));
export function ringLayout(width, height, footerTop, captionHeight, mobile) {
  const cardW = width * .29, cardH = cardW / 1.5, radius = width * .495;
  const peak = Math.min(80, height * .12), perspective = width * 4;
  const top = Math.min(56, height * .08), bottom = footerTop - 12;
  // 全回転の投影範囲で上下の余白を確保する。左右のクロップは意図した構図。
  const boundsAt = tilt => {
    const sine = Math.sin(rad(tilt)), cosine = Math.cos(rad(tilt));
    let min = Infinity, max = -Infinity;
    for (let angle = 0; angle < 360; angle += 3) {
      const a = rad(angle);
      for (const x of [-cardW / 2, cardW / 2]) {
        for (const y of [-cardH / 2, cardH / 2 + captionHeight]) {
          const dy = radius * Math.cos(a) * sine + y * cosine - x * Math.sin(a) * sine - peak * .65;
          const z = radius * Math.cos(a) * cosine - y * sine - x * Math.sin(a) * cosine;
          const projected = dy * perspective / (perspective - z);
          min = Math.min(min, projected); max = Math.max(max, projected);
        }
      }
    }
    return {min, max};
  };
  let low = 0, high = mobile ? 30 : 20;
  for (let i = 0; i < 10; i++) {
    const tilt = (low + high) / 2, bounds = boundsAt(tilt);
    if (bounds.max - bounds.min <= bottom - top) low = tilt; else high = tilt;
  }
  const tilt = low, bounds = boundsAt(tilt);
  const originY = (top + bottom - bounds.min - bounds.max) / 2;
  const frontY = radius * Math.sin(rad(tilt)) - cardH / 2 * Math.cos(rad(tilt)) - peak * .65;
  const frontZ = radius * Math.cos(rad(tilt)) + cardH / 2 * Math.sin(rad(tilt));
  return {cardW, cardH, radius, tilt, peak, perspective, originY, frontTop:originY + frontY * perspective / (perspective - frontZ)};
}
export function phases(p) {
  return {
    form: smooth(ramp(p, .055, .19)),
    dark: smooth(ramp(p, .055, .19)) * (1 - smooth(ramp(p, .88, 1))),
    leave: smooth(ramp(p, .88, 1)),
    title: smooth(ramp(p, .13, .21)) * (1 - smooth(ramp(p, .90, .99))),
  };
}
// 上昇量の35%だけ下がり、残る65%の高さを保持する。
export const elevation = p => -smooth(ramp(p,.035,.14)) + .35 * smooth(ramp(p,.14,.24));
// 約210度を出口の目安にし、上へ抜ける間も同じ速度で回す。
export const rotation = p => 210 * Math.max(0,(p - .20) / (.86 - .20));
export const angleAt = (index, p, anchor = 0) => (index - anchor) * 36 - 18 + rotation(p);
export const rowAnchor = (scroll, width, gap, gutter, viewport) => Math.floor((viewport / 2 + scroll - gutter - width / 2) / (width + gap));
// 6時=0度。奥も42%の明るさを残す。
export const lightAt = angle => .42 + .58 * (Math.cos(rad(angle)) + 1) / 2;
export function faceShading(angle, halfSpan) {
  const front = [1 - lightAt(angle - halfSpan), 1 - lightAt(angle + halfSpan)];
  return {front, back: [...front].reverse()};
}
