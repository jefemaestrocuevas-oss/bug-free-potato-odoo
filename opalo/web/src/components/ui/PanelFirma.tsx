import { useEffect, useRef, useState, type PointerEvent as PE } from 'react';
import type { DatosFirma } from '../../lib/api/tipos';

type Punto = [number, number];
const ANCHO = 600;
const ALTO = 200;

function trazosASvg(trazos: Punto[][]): string {
  const d = trazos
    .filter((t) => t.length > 0)
    .map((t) => (t.length === 1 ? `M${t[0][0]} ${t[0][1]} l0.1 0` : `M${t[0][0]} ${t[0][1]} ` + t.slice(1).map((p) => `L${p[0]} ${p[1]}`).join(' ')))
    .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO} ${ALTO}" width="${ANCHO}" height="${ALTO}"><path d="${d}" fill="none" stroke="#1d2016" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

interface Props {
  /** Se llama con los datos completos, o null si falta nombre/firma/tutor. */
  onCambio: (firma: DatosFirma | null) => void;
  /** Clienta menor de edad: pide nombre de mamá, papá o tutor. */
  requiereTutor?: boolean;
  nombreSugerido?: string;
  /** Texto encima del recuadro. */
  leyenda?: string;
}

/** Recuadro para firmar con dedo, pluma o mouse. Entrega la firma como SVG. */
export function PanelFirma({ onCambio, requiereTutor = false, nombreSugerido = '', leyenda = 'Firma con tu dedo o con el mouse dentro del recuadro.' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [trazos, setTrazos] = useState<Punto[][]>([]);
  const dibujando = useRef(false);
  const [nombre, setNombre] = useState(nombreSugerido);
  const [tutor, setTutor] = useState('');

  // Redibuja el canvas con los trazos (en coordenadas del viewBox).
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, ANCHO, ALTO);
    ctx.strokeStyle = getComputedStyle(c).color || '#1d2016';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const t of trazos) {
      if (!t.length) continue;
      ctx.beginPath();
      ctx.moveTo(t[0][0], t[0][1]);
      if (t.length === 1) ctx.lineTo(t[0][0] + 0.1, t[0][1]);
      for (const p of t.slice(1)) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
  }, [trazos]);

  useEffect(() => {
    const listo = trazos.some((t) => t.length > 0) && nombre.trim().length >= 3 && (!requiereTutor || tutor.trim().length >= 3);
    onCambio(listo ? { nombre_firmante: nombre.trim(), firma_svg: trazosASvg(trazos), tutor_nombre: requiereTutor ? tutor.trim() : null } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trazos, nombre, tutor, requiereTutor]);

  const punto = (e: PE<HTMLCanvasElement>): Punto => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * ANCHO * 10) / 10, Math.round(((e.clientY - r.top) / r.height) * ALTO * 10) / 10];
  };

  return (
    <div className="panel-firma">
      <div className="campo">
        <label className="etiqueta" htmlFor="firma-nombre">Nombre completo de quien firma</label>
        <input id="firma-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" />
      </div>
      {requiereTutor && (
        <div className="campo">
          <label className="etiqueta" htmlFor="firma-tutor">Nombre de mamá, papá o tutor (presente en la cita)</label>
          <input id="firma-tutor" className="input" value={tutor} onChange={(e) => setTutor(e.target.value)} />
          <span className="ayuda">Por ser menor de edad, quien la acompaña también acepta este consentimiento.</span>
        </div>
      )}
      <p className="ayuda">{leyenda}</p>
      <canvas
        ref={canvasRef}
        width={ANCHO}
        height={ALTO}
        className="panel-firma-lienzo"
        aria-label="Recuadro de firma"
        role="img"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dibujando.current = true;
          setTrazos((t) => [...t, [punto(e)]]);
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          const p = punto(e);
          setTrazos((t) => {
            const copia = t.slice();
            copia[copia.length - 1] = [...copia[copia.length - 1], p];
            return copia;
          });
        }}
        onPointerUp={() => (dibujando.current = false)}
        onPointerCancel={() => (dibujando.current = false)}
      />
      <div className="entre">
        <span className="ayuda">{trazos.length ? 'Firma capturada' : 'Aún no hay firma'}</span>
        <button type="button" className="btn btn-texto btn-sm" onClick={() => setTrazos([])} disabled={!trazos.length}>
          Borrar y volver a firmar
        </button>
      </div>
    </div>
  );
}

/** Muestra una firma guardada (SVG) como imagen. */
export function VerFirma({ svg, alto = 70 }: { svg: string; alto?: number }) {
  return <img className="ver-firma" alt="Firma" style={{ height: alto }} src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} />;
}
