// Original background track for reels, synthesised by ffmpeg (aevalsrc), so there is
// nothing to license. 120 bpm: a soft four-chord pad (Am F C G, 2s each), a low pulse
// on every beat and a quiet off-beat tick. Loudness is normalised after generation.
export function audioExpr() {
  const m = 'mod(t,8)';
  const pick = (a, b, c, d) => `if(lt(${m},2),${a},if(lt(${m},4),${b},if(lt(${m},6),${c},${d})))`;
  const r = pick(220, 174.61, 261.63, 196), th = pick(261.63, 220, 329.63, 246.94), fi = pick(329.63, 261.63, 392, 293.66);
  const env = `min(1,mod(t,2)*3)*(1-0.25*mod(t,2)/2)`; // soft attack on each chord change
  const pad = `0.055*${env}*(sin(2*PI*${r}*t)+0.8*sin(2*PI*${th}*t)+0.7*sin(2*PI*${fi}*t)+0.35*sin(2*PI*${r}*0.5*t))`;
  const pulse = `0.22*sin(2*PI*52*t)*exp(-9*mod(t,0.5))`;
  const tick = `0.025*(2*random(0)-1)*exp(-70*mod(t+0.25,0.5))`;
  return `${pad}+${pulse}+${tick}`;
}
