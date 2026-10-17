/**
 * Virtual-card artwork (Figma "Debit Cards", ADR-012): a dark glowing card with a 3D
 * wireframe currency symbol — a low-poly mesh of triangles with bright nodes — floating
 * over a light beam, with sparkles and a glossy edge. Original vector drawing (the Figma
 * artwork is not exportable). Colours are illustration colours, not UI tokens.
 */

import { useMemo, type ReactElement } from 'react';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

export interface CardPalette {
  /** Card base (centre-right, where the glow is). */
  readonly base: string;
  /** Card edge (near black). */
  readonly edge: string;
  /** Glow / mesh colour. */
  readonly glow: string;
  /** Brightest highlight for nodes and the beam core. */
  readonly hot: string;
}

type Pt = readonly [number, number];

/* ---------------------------------------------------------------- symbol skeletons */
// Centre-lines in a 100×100 box; the mesh is built as a ribbon around each line.

function arc(cx: number, cy: number, r: number, fromDeg: number, toDeg: number, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = ((fromDeg + ((toDeg - fromDeg) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  });
}

function line(a: Pt, b: Pt, n: number): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n] as const);
}

/** Catmull-Rom through control points, `per` samples per segment. */
function spline(ctrl: Pt[], per: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

const SKELETONS: Record<string, { strokes: Pt[][]; width: number }> = {
  '€': {
    width: 12,
    strokes: [arc(56, 50, 30, 48, 312, 16), line([14, 42], [60, 42], 5), line([14, 58], [56, 58], 5)],
  },
  $: {
    width: 11,
    strokes: [
      spline(
        [
          [70, 28],
          [56, 18],
          [38, 22],
          [32, 36],
          [44, 47],
          [60, 53],
          [70, 66],
          [62, 80],
          [44, 82],
          [30, 72],
        ],
        3,
      ),
      line([51, 8], [51, 92], 9),
    ],
  },
  '₦': {
    width: 10,
    strokes: [
      line([30, 14], [30, 86], 8),
      line([70, 14], [70, 86], 8),
      line([30, 14], [70, 86], 9),
      line([16, 42], [84, 42], 7),
      line([16, 56], [84, 56], 7),
    ],
  },
};

interface Mesh {
  readonly edges: string;
  readonly nodes: Pt[];
  readonly faces: string;
}

/** Ribbon mesh: left/right offsets of each centre-line, joined into triangles. */
function buildMesh(symbol: string, x: number, y: number, size: number): Mesh {
  const sk = SKELETONS[symbol] ?? SKELETONS['€'];
  const s = size / 100;
  const P = (p: Pt): Pt => [x + p[0] * s, y + p[1] * s];
  let edges = '';
  let faces = '';
  const nodes: Pt[] = [];
  for (const stroke of sk.strokes) {
    const L: Pt[] = [];
    const R: Pt[] = [];
    stroke.forEach((p, i) => {
      const a = stroke[Math.max(0, i - 1)];
      const b = stroke[Math.min(stroke.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      // Slight wobble so it reads as a hand-made low-poly mesh, not a clean outline.
      const w = (sk.width / 2) * (0.85 + 0.3 * Math.abs(Math.sin(i * 1.7)));
      L.push(P([p[0] - (dy / len) * w, p[1] + (dx / len) * w]));
      R.push(P([p[0] + (dy / len) * w, p[1] - (dx / len) * w]));
    });
    const seg = (a: Pt, b: Pt): string => `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`;
    for (let i = 0; i < L.length; i++) {
      edges += seg(L[i], R[i]);
      if (i + 1 < L.length) {
        edges += seg(L[i], L[i + 1]) + seg(R[i], R[i + 1]) + seg(i % 2 ? L[i] : R[i], i % 2 ? R[i + 1] : L[i + 1]);
        if (i % 3 === 0) {
          const t = [L[i], R[i], i % 2 ? R[i + 1] : L[i + 1]];
          faces += `M${r1(t[0][0])} ${r1(t[0][1])}L${r1(t[1][0])} ${r1(t[1][1])}L${r1(t[2][0])} ${r1(t[2][1])}Z`;
        }
      }
    }
    nodes.push(...L, ...R);
  }
  return { edges, nodes, faces };
}

/** One decimal place for SVG path coordinates. */
const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Deterministic pseudo-random so the art is stable between renders. */
function rand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function CardArt({
  symbol,
  palette,
  width,
  height,
  id,
}: {
  symbol: string;
  palette: CardPalette;
  width: number;
  height: number;
  /** Unique per card on screen (gradient/filter ids). */
  id: string;
}): ReactElement {
  // Art is laid out in a 340×214 box (card ratio 1.59, as in Figma).
  const mesh = useMemo(() => buildMesh(symbol, 166, 16, 152), [symbol]);
  const sparkles = useMemo(() => {
    const r = rand(symbol.charCodeAt(0));
    return Array.from({ length: 46 }, () => {
      const ang = r() * Math.PI * 2;
      const dist = 40 + r() * 95;
      return { x: 242 + Math.cos(ang) * dist * 1.1, y: 92 + Math.sin(ang) * dist * 0.75, r: 0.4 + r() * 1.1, o: 0.25 + r() * 0.7 };
    });
  }, [symbol]);

  return (
    <Svg width={width} height={height} viewBox="0 0 340 214" preserveAspectRatio="xMidYMid slice">
      <Defs>
        <RadialGradient id={`${id}-bg`} cx="0.72" cy="0.42" r="0.85">
          <Stop offset="0" stopColor={palette.base} />
          <Stop offset="0.55" stopColor={palette.edge} stopOpacity="0.96" />
          <Stop offset="1" stopColor="#020403" />
        </RadialGradient>
        <RadialGradient id={`${id}-halo`} cx="0.71" cy="0.45" r="0.38">
          <Stop offset="0" stopColor={palette.glow} stopOpacity="0.38" />
          <Stop offset="1" stopColor={palette.glow} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`${id}-sheen`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.10" />
          <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id={`${id}-beam`} cx="0.5" cy="0.5" r="0.5">
          <Stop offset="0" stopColor={palette.hot} stopOpacity="0.95" />
          <Stop offset="0.35" stopColor={palette.glow} stopOpacity="0.55" />
          <Stop offset="1" stopColor={palette.glow} stopOpacity="0" />
        </RadialGradient>
        <LinearGradient id={`${id}-rise`} x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor={palette.glow} stopOpacity="0.45" />
          <Stop offset="1" stopColor={palette.glow} stopOpacity="0" />
        </LinearGradient>
        <Filter id={`${id}-blur`} x="-20%" y="-20%" width="140%" height="140%">
          <FeGaussianBlur stdDeviation="3.2" />
        </Filter>
        <Filter id={`${id}-soft`} x="-50%" y="-50%" width="200%" height="200%">
          <FeGaussianBlur stdDeviation="8" />
        </Filter>
      </Defs>

      {/* Card body, halo, glossy top-left sheen */}
      <Rect width={340} height={214} fill={`url(#${id}-bg)`} />
      <Rect width={340} height={214} fill={`url(#${id}-halo)`} />
      <Rect width={340} height={214} fill={`url(#${id}-sheen)`} />

      {/* Light beam under the symbol, with a soft rising glow */}
      <Ellipse cx={244} cy={138} rx={46} ry={38} fill={`url(#${id}-rise)`} opacity={0.55} filter={`url(#${id}-soft)`} />
      <Ellipse cx={244} cy={170} rx={72} ry={9} fill={`url(#${id}-beam)`} filter={`url(#${id}-soft)`} />
      <Ellipse cx={244} cy={170} rx={50} ry={2.2} fill={palette.hot} opacity={0.9} />

      {/* Sparkles */}
      {sparkles.map((p, i) => (
        <Circle key={i} cx={p.x} cy={p.y} r={p.r} fill={palette.hot} opacity={p.o} />
      ))}

      {/* Symbol: blurred glow pass, translucent faces, crisp wireframe, bright nodes */}
      <G filter={`url(#${id}-blur)`} opacity={0.9}>
        <Path d={mesh.edges} stroke={palette.glow} strokeWidth={2.4} fill="none" />
      </G>
      <Path d={mesh.faces} fill={palette.glow} opacity={0.16} />
      <Path d={mesh.edges} stroke={palette.glow} strokeWidth={0.6} fill="none" opacity={0.95} />
      {mesh.nodes.map((n, i) =>
        i % 2 === 0 ? <Circle key={i} cx={n[0]} cy={n[1]} r={i % 6 === 0 ? 1.4 : 0.9} fill={palette.hot} /> : null,
      )}

      {/* Glossy edge */}
      <Rect x={0.5} y={0.5} width={339} height={213} rx={14} fill="none" stroke="#FFFFFF" strokeOpacity={0.14} />
    </Svg>
  );
}
