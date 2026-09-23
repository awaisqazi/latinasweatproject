// src/lib/galaLive/scene/shaders.js
//
// GLSL for the "Constelacion" hero, ported from the approved prototype
// (docs/gala-2026/prototypes/live-3d-proto.html). The maths is unchanged; the
// only production difference is the two-clock split from 05 section 5.5:
//
//   uTime  never rebased. Slow periodic motion only (twinkle, sway, nebula,
//          molten flow), where a 1 ms float32 step after two hours is invisible.
//   uNow   rebased when the show is idle. Every age-based effect reads this
//          (comets, sparks, confetti, rings, star birth), so a four hour run
//          never loses the precision that keeps a fast comet smooth.

import { XA, XHW } from "./xMask.js";

export const GLSL_HASH = /* glsl */ `
  float h11(float p){ p = fract(p*0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p=p*2.03+17.; a*=.5; } return s; }
`;

export const GLSL_SDX = /* glsl */ `
  float sdBox2(vec2 p, vec2 b){ vec2 d = abs(p)-b; return min(max(d.x,d.y),0.) + length(max(d,0.)); }
  float sdX(vec2 p){
    float c = cos(${XA.toFixed(4)}), s = sin(${XA.toFixed(4)});
    float d = min(sdBox2(vec2(c*p.x+s*p.y, -s*p.x+c*p.y), vec2(${XHW.toFixed(3)},1.5)),
                  sdBox2(vec2(c*p.x-s*p.y,  s*p.x+c*p.y), vec2(${XHW.toFixed(3)},1.5)));
    d = max(d, abs(p.y)-0.86); d = max(d, abs(p.x)-1.0);
    d = min(d, length(vec2(abs(p.x)-0.40, p.y)) - 0.21);
    d = max(d, -(length(p)-0.25));
    return d;
  }
`;

/* -- L0 background: navy gradient + warm halo + nebula + dither.
      Carries NO information: the projector is allowed to crush it to black. */
export const BG_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }`;

export const BG_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime, uAspect, uLift, uProgress, uFlash, uHaloR;
  uniform vec2 uHalo; uniform vec4 uHaloBox; uniform vec3 uTop, uMid, uBot, uGold;
  ${GLSL_HASH}
  void main(){
    vec3 col = vUv.y > 0.45 ? mix(uMid, uTop, (vUv.y-0.45)/0.55) : mix(uBot, uMid, vUv.y/0.45);
    vec2 q = (vUv - uHalo) * vec2(uAspect, 1.0);
    float halo = exp(-dot(q,q)*uHaloR);
    // The halo is clipped to a box around the X. Screenshot review: it must
    // never wash across the total panel, however bright the moment gets.
    float bx = smoothstep(uHaloBox.x-0.09, uHaloBox.x+0.09, vUv.x) * (1.0 - smoothstep(uHaloBox.z-0.09, uHaloBox.z+0.09, vUv.x));
    float by = smoothstep(uHaloBox.y-0.09, uHaloBox.y+0.09, vUv.y) * (1.0 - smoothstep(uHaloBox.w-0.09, uHaloBox.w+0.09, vUv.y));
    halo *= bx * by;
    col += uGold * halo * (0.035 + 0.09*uProgress + 0.10*uFlash);
    float neb = fbm(vUv*vec2(uAspect,1.)*2.4 + vec2(uTime*0.006, -uTime*0.004));
    col += vec3(0.010,0.016,0.034) * smoothstep(0.35,0.8,neb);
    col += uLift;                                                   // projector luminance floor
    col += (h21(gl_FragCoord.xy + fract(uTime)*91.7) - 0.5) * 0.004; // dither: kills 8-bit banding
    gl_FragColor = vec4(max(col,0.), 1.0);
  }
`;

/* -- L2 the X glow plane: ghost outline always visible, molten fill rising. */
export const XG_VERT = /* glsl */ `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const XG_FRAG = /* glsl */ `
  varying vec2 vP;
  uniform float uTime, uFillY, uGoal, uFlash, uGhost;
  uniform vec3 uGold, uDeep, uCream;
  ${GLSL_HASH}
  ${GLSL_SDX}
  void main(){
    vec2 p = vP * 1.55;                       // the plane spans +-1.55 so the outer glow has room
    float d = sdX(p);
    float inside = smoothstep(0.015, -0.015, d);
    float front = uFillY + 0.035*sin(p.x*9.0 + uTime*1.3) + 0.02*sin(p.x*23.0 - uTime*2.1);
    float filled = inside * smoothstep(front+0.05, front-0.05, p.y);
    float flow = fbm(p*3.0 + vec2(0., -uTime*0.25));
    vec3 molten = mix(uDeep, uGold, 0.35 + 0.65*flow);
    float edge = smoothstep(0.05, 0.0, abs(p.y-front)) * inside;   // cream meniscus at the fill front
    float outline = smoothstep(0.03, 0.0, abs(d));
    float outer = exp(-max(d,0.)*7.0) * (1.0-inside);
    vec3 col = molten * filled * (0.22 + 0.22*uGoal + 0.30*uFlash)
             + uCream * edge * 0.32
             + uGold * outline * (uGhost + 0.35*filled + 0.35*uFlash)
             + uGold * outer * (0.03 + 0.10*filled + 0.10*uGoal);
    float core = smoothstep(0.125, 0.10, length(p));               // the core lights only with the WHOLE X
    col += mix(uGold, uCream, 0.4) * core * uGoal * 1.1;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/* -- L3 stars: one Points draw for body + core + halo slots. */
export const STAR_VERT = /* glsl */ `
  attribute float aLitAt; attribute float aSeed; attribute float aKind;
  uniform float uTime, uNow, uPx, uGhost, uFlashAll;
  varying float vLum; varying float vLit; varying float vSeed;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float lit = step(aLitAt, uNow);
    float age = max(uNow - aLitAt, 0.0);
    float birth = lit * exp(-age*2.4);
    float tw = 0.72 + 0.28*sin(uTime*(1.2 + aSeed*2.6) + aSeed*41.0);
    float ghost = aKind < 0.5 ? uGhost : 0.0;                     // core and halo are invisible until lit
    vLum = mix(ghost, tw*1.15 + birth*3.0 + uFlashAll*1.0, lit);
    vLit = lit; vSeed = aSeed;
    float size = mix(2.2, 4.2 + birth*9.0 + uFlashAll*2.0, lit) * (0.7 + 0.7*aSeed);
    gl_PointSize = size * uPx * (36.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

export const STAR_FRAG = /* glsl */ `
  uniform vec3 uGold, uCream;
  varying float vLum; varying float vLit; varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord*2.0 - 1.0; float d = length(c);
    float soft = pow(smoothstep(1.0, 0.0, d), 2.2);
    float glint = (max(0.,1.-abs(c.x)*7.)*max(0.,1.-abs(c.y)) + max(0.,1.-abs(c.y)*7.)*max(0.,1.-abs(c.x))) * vLit * step(0.6, vSeed);
    float a = soft + glint*0.6;
    if (a < 0.003) discard;
    vec3 col = mix(uGold, uCream, soft*soft*0.8) * vLum;
    gl_FragColor = vec4(col, a);
  }
`;

/* -- L1 ambient gold dust: closed-form wrapped volume, rising like champagne. */
export const DUST_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime, uDrift, uPx, uDuck, uImpulse, uScale;
  uniform vec3 uVol; uniform vec2 uAnchor; uniform vec2 uRes; uniform vec4 uQuiet[4];
  varying float vA; varying float vSeed;
  float inRect(vec2 f, vec4 r){ vec2 s = smoothstep(r.xy-60., r.xy, f) * (1.0 - smoothstep(r.zw, r.zw+60., f)); return s.x*s.y; }
  void main(){
    vec3 p = position * uVol;
    float sp = 0.25 + aSeed*0.6;
    p.y += uDrift * sp;
    p.x += sin(uTime*0.31*(0.5+aSeed) + aSeed*50.0) * 0.7;
    p = mod(p, uVol) - 0.5*uVol;
    p.z += -9.0;
    vec2 away = p.xy - uAnchor; float dl = max(length(away), 0.001);
    p.xy += (away/dl) * uImpulse * 3.5 * exp(-dl*0.08);            // milestone breath: push out, settle back
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float bokeh = step(0.985, aSeed);
    float size = mix(1.6 + 2.6*fract(aSeed*7.13), 22.0, bokeh);
    gl_PointSize = size * uPx * (36.0 / -mv.z);
    vec2 f = (gl_Position.xy/gl_Position.w*0.5+0.5) * uRes;         // keep the text zones calm
    float quiet = max(max(inRect(f,uQuiet[0]), inRect(f,uQuiet[1])), max(inRect(f,uQuiet[2]), inRect(f,uQuiet[3])));
    float tw = 0.55 + 0.45*sin(uTime*(0.8+aSeed*2.0) + aSeed*90.0);
    vA = mix(0.55*tw, 0.10, bokeh) * (1.0 - 0.75*quiet) * (1.0 - 0.6*uDuck) * uScale;
    vSeed = aSeed;
  }
`;

export const DUST_FRAG = /* glsl */ `
  uniform vec3 uGold, uCream; varying float vA; varying float vSeed;
  void main(){
    float d = length(gl_PointCoord*2.0-1.0);
    float a = pow(smoothstep(1.0, 0.0, d), 1.6) * vA;
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uGold, uCream, step(0.8, fract(vSeed*3.7))*0.6) * 1.3, a);
  }
`;

/* -- L5 comets: head and trail are the SAME points; each trail point replays
      the bezier with a time lag, so the tail pours into the X after the head. */
export const COMET_VERT = /* glsl */ `
  attribute vec3 aP1; attribute vec3 aP2; attribute vec4 aT;      // aT = start, duration, lag01, headSize
  uniform float uNow, uPx;
  varying float vLum; varying float vLag;
  ${GLSL_HASH}
  void main(){
    float tt = (uNow - aT.x - aT.z*0.42) / aT.y;
    if (tt < 0.0 || tt > 1.0) { gl_Position = vec4(2.,2.,2.,1.); gl_PointSize = 0.0; return; }
    float e = tt<0.5 ? 4.*tt*tt*tt : 1.-pow(-2.*tt+2.,3.)/2.;       // easeInOutCubic
    vec3 p = mix(mix(position, aP1, e), mix(aP1, aP2, e), e);
    float n = h11(aT.z*91.0 + aT.x);
    p.xy += (vec2(h11(n*7.1), h11(n*13.7)) - 0.5) * aT.z * 1.1;      // the tail frays
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float head = 1.0 - aT.z;
    gl_PointSize = (2.5 + 9.0*head*head) * aT.w * uPx * (36.0 / -mv.z);
    vLum = (0.5 + 3.2*pow(head, 3.0)) * smoothstep(0.0, 0.08, tt);
    vLag = aT.z;
  }
`;

export const COMET_FRAG = /* glsl */ `
  uniform vec3 uGold, uCream; varying float vLum; varying float vLag;
  void main(){
    float d = length(gl_PointCoord*2.0-1.0);
    float a = pow(smoothstep(1.0, 0.0, d), 2.0);
    if (a < 0.004) discard;
    gl_FragColor = vec4(mix(uCream, uGold, smoothstep(0.0, 0.35, vLag)) * vLum, a);
  }
`;

/* -- L6 sparks: analytic drag burst, ring buffer. */
export const SPARK_VERT = /* glsl */ `
  attribute vec3 aVel; attribute vec3 aMisc;                        // spawn, life, seed
  uniform float uNow, uPx; varying float vT; varying float vSeed;
  void main(){
    float age = uNow - aMisc.x; float t = age / aMisc.y;
    if (age < 0.0 || t > 1.0) { gl_Position = vec4(2.,2.,2.,1.); gl_PointSize = 0.0; return; }
    float k = 2.2; float travel = (1.0 - exp(-k*age))/k;
    vec3 p = position + aVel*travel + vec3(0., -1.4, 0.)*age*age*0.5;
    p.xy += vec2(sin(age*5.0 + aMisc.z*40.0), cos(age*4.0 + aMisc.z*17.0)) * 0.12 * age;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (2.0 + 5.0*aMisc.z) * (1.0 - t*0.7) * uPx * (36.0 / -mv.z);
    vT = t; vSeed = aMisc.z;
  }
`;

export const SPARK_FRAG = /* glsl */ `
  uniform vec3 uGold, uCream, uDeep; varying float vT; varying float vSeed;
  void main(){
    float d = length(gl_PointCoord*2.0-1.0);
    float a = pow(smoothstep(1.0, 0.0, d), 1.8) * (1.0 - smoothstep(0.55, 1.0, vT));
    if (a < 0.004) discard;
    vec3 col = vT < 0.25 ? mix(uCream, uGold, vT/0.25) : mix(uGold, uDeep, (vT-0.25)/0.75);
    float flick = 0.7 + 0.3*sin(vT*60.0 + vSeed*30.0);
    gl_FragColor = vec4(col * (2.4*(1.0-vT) + 0.4) * flick, a);
  }
`;

/* -- L7 foil confetti: instanced tumbling quads with a specular foil flash. */
export const CONF_VERT = /* glsl */ `
  attribute vec3 iStart; attribute vec3 iVel; attribute vec4 iMisc; attribute vec3 iCol;   // iMisc = spawn, life, seed, size
  uniform float uNow; varying vec3 vCol; varying float vA;
  mat2 r2(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
  void main(){
    float age = uNow - iMisc.x; float t = age / iMisc.y;
    if (age < 0.0 || t > 1.0) { gl_Position = vec4(2.,2.,2.,1.); return; }
    float k = 1.6; float travel = (1.0 - exp(-k*age))/k;
    vec3 c = iStart + iVel*travel;
    c.y -= 2.6 * (age - travel);                                      // terminal velocity fall, closed form
    c.x += sin(age*2.1 + iMisc.z*30.0) * 0.7 * min(age, 1.0);
    float a = age*(3.0 + iMisc.z*5.0) + iMisc.z*6.28; float b = age*(1.5 + fract(iMisc.z*7.0)*3.0);
    vec2 l = position.xy * iMisc.w * vec2(1.0, 0.62);
    vec3 q = vec3(l.x, l.y*cos(a), l.y*sin(a)); vec3 n = vec3(0.0, -sin(a), cos(a));
    q.xy = r2(b)*q.xy; n.xy = r2(b)*n.xy;
    float glint = pow(abs(dot(n, normalize(vec3(0.3,0.5,0.8)))), 14.0);
    vCol = iCol * (0.30 + 0.70*abs(n.z)) + vec3(1.0,0.95,0.85) * glint * 5.0;
    vA = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.82, 1.0, t));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(c + q, 1.0);
  }
`;

export const CONF_FRAG = /* glsl */ `varying vec3 vCol; varying float vA; void main(){ if (vA < 0.01) discard; gl_FragColor = vec4(vCol, vA); }`;

/* -- L4 shockwave ring. Thin: the wide soft skirt is only 8% of the peak. */
export const RING_VERT = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const RING_FRAG = /* glsl */ `
  varying vec2 vUv; uniform float uNow, uStart, uLife, uPower; uniform vec3 uGold, uCream;
  void main(){
    float t = (uNow - uStart)/uLife; if (t < 0.0 || t > 1.0) discard;
    float r = 1.0 - pow(1.0 - t, 3.0);                               // easeOutCubic
    float d = length(vUv - 0.5)*2.0;
    float ring = smoothstep(0.035, 0.0, abs(d - r*0.96)) + 0.08*smoothstep(0.16, 0.0, abs(d - r*0.96));
    float a = ring * (1.0-t)*(1.0-t);
    gl_FragColor = vec4(mix(uGold, uCream, 0.5) * uPower * a, a);
  }
`;
