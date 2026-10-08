import type { CategoriaProducto } from '../../lib/api/tipos';

// Ilustración de producto de la tienda (jabón, vela, set) para cuando todavía no hay foto.
// No pretende ser una foto: es un dibujo de la marca, con el color de cada producto.

const COLOR_BASE: Partial<Record<CategoriaProducto, string>> = {
  jabon: '#e8dcc4',
  vela: '#f3ead8',
  set: '#e6eadb',
};

function aRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mezcla dos colores: t = 0 → a, t = 1 → b. */
function mezclar(a: string, b: string, t: number): string {
  const [r1, g1, b1] = aRgb(a);
  const [r2, g2, b2] = aRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

/** Número estable a partir de un texto (para variar detalles sin azar). */
function semilla(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

function valido(hex: string | null | undefined): hex is string {
  return !!hex && /^#[0-9a-fA-F]{6}$/.test(hex);
}

interface Props {
  categoria: CategoriaProducto;
  color?: string | null;
  /** Para variar las motas del jabón de forma estable por producto. */
  nombre?: string;
  className?: string;
  /** Texto alternativo; si se omite, la imagen es decorativa. */
  titulo?: string;
  /** false: productos de otras marcas, la etiqueta va lisa (sin "ÓPALO"). */
  conMarca?: boolean;
}

export function IlustracionProducto({ categoria, color, nombre = '', className = '', titulo, conMarca = true }: Props) {
  // Sin color: tono de la marca (arena) en lugar de un gris de relleno.
  const base = valido(color) ? color : COLOR_BASE[categoria] ?? '#d9c193';
  const claro = mezclar(base, '#ffffff', 0.38);
  const oscuro = mezclar(base, '#1d2016', 0.22);
  const tinta = mezclar(base, '#1d2016', 0.55);
  const s = semilla(nombre || categoria);
  const a11y = titulo ? { role: 'img' as const, 'aria-label': titulo } : { 'aria-hidden': true as const };

  return (
    <svg className={`ilustracion-producto ${className}`} viewBox="0 0 200 160" {...a11y}>
      <ellipse cx="100" cy="142" rx="70" ry="7" fill="currentColor" opacity="0.08" />
      {categoria === 'vela' ? (
        <g>
          {/* vaso de vidrio ámbar */}
          <rect x="58" y="40" width="84" height="98" rx="12" fill="#b9813f" opacity="0.28" />
          <rect x="58" y="40" width="84" height="98" rx="12" fill="none" stroke="#8a5a26" strokeOpacity="0.55" strokeWidth="2" />
          {/* cera */}
          <rect x="63" y="58" width="74" height="75" rx="8" fill={base} />
          <ellipse cx="100" cy="58" rx="37" ry="5" fill={claro} />
          {/* etiqueta */}
          <rect x="70" y="84" width="60" height="30" rx="3" fill="#fffdf8" stroke={tinta} strokeOpacity="0.35" />
          {conMarca ? (
            <>
              <text x="100" y="98" textAnchor="middle" fontFamily="Cormorant Garamond, Georgia, serif" fontSize="11" fontWeight="600" letterSpacing="2" fill="#5c6b3f">
                ÓPALO
              </text>
              <line x1="80" y1="104" x2="120" y2="104" stroke="#b08a34" strokeWidth="1" />
            </>
          ) : (
            <line x1="80" y1="99" x2="120" y2="99" stroke={tinta} strokeOpacity="0.4" strokeWidth="1" />
          )}
          {/* mecha y flama */}
          <line x1="100" y1="58" x2="100" y2="47" stroke="#2a2e22" strokeWidth="2" strokeLinecap="round" />
          <g className="ilustracion-flama">
            <path d="M100 22 C108 33 109 40 100 46 C91 40 92 33 100 22 Z" fill="#f2b544" />
            <path d="M100 31 C104 37 104 41 100 44 C96 41 96 37 100 31 Z" fill="#fff3c4" />
          </g>
          {/* brillo del vidrio */}
          <rect x="65" y="46" width="5" height="80" rx="2.5" fill="#ffffff" opacity="0.35" />
        </g>
      ) : categoria === 'set' ? (
        <g>
          <rect x="40" y="56" width="120" height="78" rx="8" fill={base} />
          <rect x="34" y="44" width="132" height="20" rx="6" fill={claro} />
          <rect x="94" y="44" width="12" height="90" fill="#b08a34" />
          <rect x="40" y="88" width="120" height="10" fill="#b08a34" opacity="0.85" />
          <path d="M100 44 C86 26 70 30 78 40 C82 46 94 46 100 44 Z" fill="#b08a34" />
          <path d="M100 44 C114 26 130 30 122 40 C118 46 106 46 100 44 Z" fill="#b08a34" />
          <circle cx="100" cy="44" r="5" fill="#8c6a2d" />
          <rect x="40" y="56" width="120" height="78" rx="8" fill="none" stroke={oscuro} strokeOpacity="0.5" />
        </g>
      ) : categoria === 'jabon' ? (
        <g>
          {/* barra de jabón en 3/4 */}
          <path d="M34 78 Q34 64 48 62 L152 62 Q166 64 166 78 L166 112 Q166 126 152 126 L48 126 Q34 126 34 112 Z" fill={oscuro} />
          <path d="M34 74 Q34 58 50 56 L150 56 Q166 58 166 74 L166 100 Q166 114 150 114 L50 114 Q34 114 34 100 Z" fill={base} />
          <path d="M44 70 Q44 62 54 62 L146 62 Q156 62 156 70 L156 96 Q156 104 146 104 L54 104 Q44 104 44 96 Z" fill={claro} opacity="0.55" />
          {/* gema grabada (sólo jabones de Ópalo) */}
          <g opacity={conMarca ? 1 : 0} transform="translate(88 66) scale(0.6)" fill="none" stroke={tinta} strokeOpacity="0.6" strokeWidth="2" strokeLinejoin="round">
            <path d="M20 2 36 14v20L20 46 4 34V14Z" />
            <path d="M20 2 12 20h16Z" />
            <path d="M12 20 20 46 28 20" />
          </g>
          {/* motas (avena, semillas, carbón…) */}
          {Array.from({ length: 9 }, (_, i) => {
            const x = 52 + ((s >> (i * 3)) % 96);
            const y = 66 + ((s >> (i * 2 + 1)) % 40);
            const enGema = x > 82 && x < 118 && y > 62 && y < 98;
            return enGema ? null : <circle key={i} cx={x} cy={y} r={1.2 + ((s >> i) % 3) * 0.5} fill={tinta} opacity="0.28" />;
          })}
        </g>
      ) : (
        <g>
          {/* frasco genérico */}
          <rect x="78" y="30" width="44" height="16" rx="4" fill={oscuro} />
          <rect x="66" y="46" width="68" height="90" rx="14" fill={base} />
          <rect x="74" y="78" width="52" height="34" rx="3" fill="#fffdf8" stroke={tinta} strokeOpacity="0.35" />
          {conMarca ? (
            <text x="100" y="99" textAnchor="middle" fontFamily="Cormorant Garamond, Georgia, serif" fontSize="10" fontWeight="600" letterSpacing="2" fill="#5c6b3f">
              ÓPALO
            </text>
          ) : (
            <line x1="84" y1="95" x2="116" y2="95" stroke={tinta} strokeOpacity="0.4" strokeWidth="1" />
          )}
        </g>
      )}
    </svg>
  );
}
