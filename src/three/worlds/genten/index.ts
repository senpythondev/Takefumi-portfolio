/**
 * Act 3-2 — Genten (証, STORYBOARD v2.1 §4): a clash, then a race through 25 gates.
 *
 * 1. The two quoted amounts meet in the middle (HTML, `--clash`); the wrong one breaks into
 *    particles (its glyphs, sampled from a canvas) and falls away.
 * 2. Three lanes of light run into the distance through 25 gates (model only / keyword search /
 *    Genten). Three motes run with the scroll; at a question a configuration got wrong, that
 *    lane's gate flashes red and its mote bursts and stops for a moment. The answers are read from
 *    the act's gate buttons (`data-r`, from docs/facts/genten-eval.json). Genten never stops.
 * 3. The 35 verified rules join into one seamless band of light.
 * The gate buttons are the keyboard and screen-reader side; pointing near a 3D gate shows its row.
 */
import { Group, Vector3 } from 'three';
import { COLORS, FLUCT_GLSL, disposeGroup, geometry, glowLines, glowPoints, mix, motes, rng, seg, setPose, storyOf, textPoints, type Pose, type World, type WorldContext, type WorldInput } from '../kit';

const GATES = 25;
const PITCH = 2.4;
const LANE_X = [-1.7, 0, 1.7];
const STALL = 0.55; // gate-units a wrong answer holds a mote back

/** Race progress in gate units for each lane at race time `t` (0…GATES+1). */
function lanePos(t: number, wrong: number[][]): number[] {
  return wrong.map((gates) => {
    let pos = t;
    for (const g of gates) pos -= Math.min(STALL, Math.max(0, t - g));
    return pos;
  });
}

export default function createGenten(ctx: WorldContext): World {
  const group = new Group();
  const r = rng(202);
  const buttons = [...ctx.section.querySelectorAll<HTMLElement>('.gate[data-r]')];
  // wrong[lane] = question numbers the configuration answered wrongly
  const wrong: number[][] = [[], [], []];
  for (const b of buttons) {
    const n = Number(b.dataset.gate);
    const bits = b.dataset.r ?? '111';
    for (let l = 0; l < 3; l += 1) if (bits[l] === '0') (wrong[l] as number[]).push(n);
  }

  // ── Lanes and gates ──
  const segs: number[] = [];
  const attrGate: number[] = [];
  const attrLane: number[] = [];
  const attrWrong: number[] = [];
  const push = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, g: number, l: number, w: number) => {
    segs.push(x1, y1, z1, x2, y2, z2);
    attrGate.push(g, g);
    attrLane.push(l, l);
    attrWrong.push(w, w);
  };
  for (let l = 0; l < 3; l += 1) {
    const x = LANE_X[l] as number;
    for (let k = 0; k < 40; k += 1) push(x, 0, -k * 1.6, x, 0, -(k + 1) * 1.6, -1, l, 0);
    for (let g = 1; g <= GATES; g += 1) {
      const z = -g * PITCH;
      const w = (wrong[l] as number[]).includes(g) ? 1 : 0;
      push(x - 0.55, 0, z, x - 0.55, 1.3, z, g, l, w);
      push(x - 0.55, 1.3, z, x + 0.55, 1.3, z, g, l, w);
      push(x + 0.55, 1.3, z, x + 0.55, 0, z, g, l, w);
    }
  }
  const lanes = glowLines(
    geometry({
      position: { array: new Float32Array(segs), size: 3 },
      aGate: { array: new Float32Array(attrGate), size: 1 },
      aLane: { array: new Float32Array(attrLane), size: 1 },
      aWrong: { array: new Float32Array(attrWrong), size: 1 },
    }),
    COLORS.evidence.clone(),
    {
      uniforms: { uPos: { value: new Vector3() }, uHover: { value: -10 }, uCrisis: { value: COLORS.crisis.clone() }, uRace: { value: 0 } },
      vertex: /* glsl */ `
        attribute float aGate;
        attribute float aLane;
        attribute float aWrong;
        uniform vec3 uPos;
        uniform float uHover;
        uniform float uRace;
        varying float vA;
        varying float vRed;
        void main() {
          float pos = aLane < 0.5 ? uPos.x : (aLane < 1.5 ? uPos.y : uPos.z);
          float near = aGate < 0.0 ? 0.0 : smoothstep(1.2, 0.0, abs(pos - aGate));
          vRed = aWrong * smoothstep(-0.2, 0.05, pos - aGate) * smoothstep(${(STALL + 0.6).toFixed(2)}, ${STALL.toFixed(2)}, pos - aGate);
          float passed = aGate < 0.0 ? 1.0 : step(aGate, pos + 0.01);
          vA = (aGate < 0.0 ? 0.35 : 0.22 + 0.5 * passed) + 0.9 * near + 1.4 * step(abs(aGate - uHover), 0.1);
          vA *= uRace;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragment: /* glsl */ `
        uniform vec3 uColor;
        uniform vec3 uCrisis;
        uniform float uFade;
        varying float vA;
        varying float vRed;
        void main() { gl_FragColor = vec4(mix(uColor, uCrisis * 1.6, vRed) * (vA + vRed) * uFade, 1.0); }`,
    },
  );
  group.add(lanes.lines);

  // ── The three motes ──
  const motePos = new Float32Array(9);
  const runners = glowPoints(geometry({ position: { array: motePos, size: 3 }, seed: { array: new Float32Array([0.3, 0.6, 0.95]), size: 1 }, aLane: { array: new Float32Array([0, 1, 2]), size: 1 } }), {
    size: 10,
    uniforms: { uRed: { value: new Vector3() }, uCrisis: { value: COLORS.crisis.clone() }, uInk: { value: COLORS.ink.clone() } },
    vertex: /* glsl */ `
      attribute float seed;
      attribute float aLane;
      uniform float uPx;
      uniform float uSize;
      uniform vec3 uRed;
      varying float vRed;
      void main() {
        vRed = aLane < 0.5 ? uRed.x : (aLane < 1.5 ? uRed.y : uRed.z);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uSize * (1.0 + 1.6 * vRed) * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragment: /* glsl */ `
      uniform vec3 uInk;
      uniform vec3 uCrisis;
      uniform float uFade;
      varying float vRed;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        float ring = smoothstep(0.08, 0.0, abs(d - 0.38)) * vRed;
        gl_FragColor = vec4((mix(uInk, uCrisis * 1.5, vRed) * a + uCrisis * ring) * uFade, 1.0);
      }`,
  });
  group.add(runners.points);

  // ── The 35 verified rules: one band of light, no gap, no overlap ──
  const RULES = 35;
  const per = 14;
  const rulePos = new Float32Array(RULES * per * 3);
  const ruleSeed = new Float32Array(RULES * per);
  const ruleIdx = new Float32Array(RULES * per);
  const endZ = -(GATES + 1.2) * PITCH;
  for (let i = 0; i < RULES; i += 1)
    for (let j = 0; j < per; j += 1) {
      const k = i * per + j;
      const x = -3.2 + ((i + j / per) / RULES) * 6.4;
      rulePos[k * 3] = x;
      rulePos[k * 3 + 1] = 0.25 + (i % 2) * 0.02;
      rulePos[k * 3 + 2] = endZ - 1.2;
      ruleSeed[k] = r();
      ruleIdx[k] = i;
    }
  const rules = glowPoints(geometry({ position: { array: rulePos, size: 3 }, seed: { array: ruleSeed, size: 1 }, aRule: { array: ruleIdx, size: 1 } }), {
    size: 2.2,
    uniforms: { uShow: { value: 0 } },
    vertex: /* glsl */ `
      ${FLUCT_GLSL}
      attribute float seed;
      attribute float aRule;
      uniform float uTime;
      uniform float uPx;
      uniform float uSize;
      uniform float uShow;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vA = step(aRule, uShow * 35.0 - 0.5) * (0.65 + 0.35 * mod(aRule, 2.0)) * (0.7 + 0.3 * fluct(uTime, seed));
        gl_PointSize = uSize * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
  });
  group.add(rules.points);

  // ── The wrong amount breaks into particles ──
  const amountText = ctx.section.querySelector('.clash-side[data-side="left"] .clash-amount')?.textContent?.trim() ?? '';
  const crumbleN = ctx.count(1600);
  const crumbleFrom = textPoints(amountText || '—', crumbleN, 0.55, '600 120px ui-monospace, monospace', 9);
  const crumbleSeed = new Float32Array(crumbleN).map(() => r());
  const crumble = glowPoints(geometry({ position: { array: crumbleFrom, size: 3 }, seed: { array: crumbleSeed, size: 1 } }), {
    size: 1.6,
    color: COLORS.ink.clone(),
    uniforms: { uBreak: { value: 0 } },
    vertex: /* glsl */ `
      attribute float seed;
      uniform float uPx;
      uniform float uSize;
      uniform float uBreak;
      varying float vA;
      void main() {
        vec3 p = position;
        float b = uBreak;
        p.x += (seed - 0.5) * 2.4 * b;
        p.y += -2.2 * b * b * (0.5 + seed) + sin(seed * 40.0) * 0.3 * b;
        p.z += (fract(seed * 7.0) - 0.5) * 1.6 * b;
        vA = 1.0 - smoothstep(0.55, 1.0, b);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * (0.7 + seed) * uPx * (10.0 / max(0.5, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
  });
  crumble.points.position.set(-0.55, 2.0, 2.2);
  group.add(crumble.points);

  const air = motes(ctx.count(600), [12, 6, 70], [0, 2, -30], COLORS.evidence.clone(), 1.1, 13);
  group.add(air.points);

  const raceT = (q: number) => seg(q, 0.24, 0.82, (x) => x) * (GATES + 1);
  const pose = (p: number, wide: boolean, out: Pose) => {
    const q = storyOf(p, ctx.result);
    const lead = Math.min(...lanePos(raceT(q), wrong));
    const back = wide ? 0 : 3.5;
    const zRace = -lead * PITCH + 7 + back;
    const start: [number, number, number] = [0, 2.2, 6.5 + back];
    const race: [number, number, number] = [0, 2.6 + back * 0.3, zRace];
    const k = seg(q, 0.16, 0.3);
    const end = seg(q, 0.82, 1.0);
    const pos: [number, number, number] = [0, mix(mix(start[1], race[1], k), 5.5, end), mix(mix(start[2], race[2], k), endZ + 9 + back, end)];
    const look: [number, number, number] = [0, mix(mix(1.8, 0.8, k), 0.3, end), mix(mix(0, zRace - 9, k), endZ - 1, end)];
    setPose(out, pos, look, wide ? 42 : 52);
  };

  const proj = new Vector3();
  let hoverGate = -10;
  const onEnter = (e: Event) => {
    hoverGate = Number((e.currentTarget as HTMLElement).dataset.gate);
  };
  const onLeave = () => {
    hoverGate = -10;
  };
  const onPin = (e: Event) => {
    const b = e.currentTarget as HTMLElement;
    b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
  };
  for (const b of buttons) {
    b.addEventListener('pointerenter', onEnter);
    b.addEventListener('focus', onEnter);
    b.addEventListener('pointerleave', onLeave);
    b.addEventListener('blur', onLeave);
    b.addEventListener('click', onPin);
  }
  let pointedGate = -1;

  return {
    group,
    shape: (n) => {
      const out = new Float32Array(n * 3);
      for (let i = 0; i < n; i += 1) {
        const l = i % 3;
        const z = -(i / n) * 30;
        out[i * 3] = (LANE_X[l] as number) + (r() - 0.5) * 0.3;
        out[i * 3 + 1] = r() * 1.3;
        out[i * 3 + 2] = z;
      }
      return out;
    },
    pose,
    update(input: WorldInput) {
      const q = storyOf(input.p, ctx.result);
      const { time, camera } = input;
      // 1. The clash (HTML amounts travel; the wrong one breaks into particles).
      input.cssVar('--clash', seg(q, 0.0, 0.16).toFixed(3));
      input.flag('data-clashed', q > 0.16);
      input.flag('data-raced', q > 0.3);
      crumble.material.uniforms.uBreak!.value = seg(q, 0.16, 0.32, (x) => x);
      crumble.material.uniforms.uFade!.value = input.fade * (q > 0.155 && q < 0.33 ? 1 : 0);

      // 2. The race.
      const pos = lanePos(raceT(q), wrong);
      const red = runners.material.uniforms.uRed!.value as Vector3;
      for (let l = 0; l < 3; l += 1) {
        const pl = pos[l] as number;
        motePos[l * 3] = LANE_X[l] as number;
        motePos[l * 3 + 1] = 0.65;
        motePos[l * 3 + 2] = -pl * PITCH;
        const t = raceT(q);
        const stalled = (wrong[l] as number[]).some((g) => t >= g && t <= g + STALL);
        red.setComponent(l, stalled ? 1 : 0);
      }
      runners.points.geometry.getAttribute('position').needsUpdate = true;
      (lanes.material.uniforms.uPos!.value as Vector3).set(pos[0] as number, pos[1] as number, pos[2] as number);
      lanes.material.uniforms.uRace!.value = seg(q, 0.18, 0.3);
      runners.material.uniforms.uFade!.value = input.fade * seg(q, 0.2, 0.28);

      // Pointing near a 3D gate shows its answers (the HTML button's tooltip).
      let near = -1;
      if (input.pointerOn && q > 0.25) {
        let best = 0.05;
        for (let g = 1; g <= GATES; g += 1) {
          proj.set(0, 1.3, -g * PITCH).project(camera);
          const d = Math.hypot(proj.x - input.pointer.x, (proj.y - input.pointer.y) / input.aspect);
          if (proj.z < 1 && d < best) {
            best = d;
            near = g;
          }
        }
      }
      if (near !== pointedGate) {
        buttons[pointedGate - 1]?.removeAttribute('data-hover');
        if (near > 0) buttons[near - 1]?.setAttribute('data-hover', '');
        pointedGate = near;
      }
      lanes.material.uniforms.uHover!.value = hoverGate > 0 ? hoverGate : near;

      // 3. The 35 rules, and the switch of the result to "answered with an official source".
      rules.material.uniforms.uShow!.value = seg(q, 0.82, 0.98, (x) => x);
      input.flag('data-then', input.p > ctx.result - 0.03 && input.p < 0.9);

      for (const m of [lanes.material, runners.material, rules.material, crumble.material, air.material]) {
        m.uniforms.uTime!.value = time;
        if (m.uniforms.uPx) m.uniforms.uPx.value = input.px;
      }
      lanes.material.uniforms.uFade!.value = input.fade;
      rules.material.uniforms.uFade!.value = input.fade;
      air.material.uniforms.uFade!.value = input.fade * 0.8;
    },
    dispose() {
      for (const b of buttons) {
        b.removeEventListener('pointerenter', onEnter);
        b.removeEventListener('focus', onEnter);
        b.removeEventListener('pointerleave', onLeave);
        b.removeEventListener('blur', onLeave);
        b.removeEventListener('click', onPin);
        b.removeAttribute('data-hover');
      }
      disposeGroup(group);
    },
  };
}
