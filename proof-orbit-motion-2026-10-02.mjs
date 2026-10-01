export const clamp = n => Math.min(1, Math.max(0, n));
export const mix = (a, b, t) => a + (b - a) * t;
export const ramp = (p, a, b) => clamp((p - a) / (b - a));
export const smooth = t => t * t * (3 - 2 * t);
export const rad = a => a * Math.PI / 180;
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
