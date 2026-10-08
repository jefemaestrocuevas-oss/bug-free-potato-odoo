// Calendario mensual accesible (teclado: flechas, Inicio/Fin, RePág/AvPág, Enter/Espacio).
// Trabaja con fechas 'YYYY-MM-DD' en hora de Querétaro.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { fechaLarga, isoDesdeLocal, sumarDias, diaSemana } from '../../lib/format';

const DIAS_SEMANA = [
  { corto: 'Lun', largo: 'lunes' },
  { corto: 'Mar', largo: 'martes' },
  { corto: 'Mié', largo: 'miércoles' },
  { corto: 'Jue', largo: 'jueves' },
  { corto: 'Vie', largo: 'viernes' },
  { corto: 'Sáb', largo: 'sábado' },
  { corto: 'Dom', largo: 'domingo' },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function diasDelMes(ym: string): number {
  const [a, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

function sumarMeses(ym: string, n: number): string {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Misma fecha en otro mes (si no existe ese día, el último del mes). */
function mismaFechaEnMes(fecha: string, n: number): string {
  const ym = sumarMeses(fecha.slice(0, 7), n);
  const dia = Math.min(Number(fecha.slice(8, 10)), diasDelMes(ym));
  return `${ym}-${String(dia).padStart(2, '0')}`;
}

function nombreMes(ym: string): string {
  const [a, m] = ym.split('-').map(Number);
  return `${MESES[m - 1]} ${a}`;
}

/** 0 = lunes … 6 = domingo */
function columna(fecha: string): number {
  return (diaSemana(fecha) + 6) % 7;
}

interface Props {
  /** Primer día que se puede elegir. */
  min: string;
  /** Último día que se puede elegir. */
  max: string;
  hoy: string;
  seleccionada: string | null;
  /** Días ya revisados: true = hay lugar, false = sin horarios libres (se ven tachados y no se eligen). */
  disponibilidad?: Record<string, boolean>;
  /** Avisa qué mes ('YYYY-MM') se está mostrando. */
  onMes?: (mes: string) => void;
  onElegir: (fecha: string) => void;
  /** id del texto que describe el calendario. */
  describedBy?: string;
}

export function Calendario({ min, max, hoy, seleccionada, disponibilidad, onMes, onElegir, describedBy }: Props) {
  const inicial = seleccionada && seleccionada >= min && seleccionada <= max ? seleccionada : min;
  const [foco, setFoco] = useState(inicial);
  const [mes, setMes] = useState(inicial.slice(0, 7));
  const tablaRef = useRef<HTMLTableElement>(null);
  const moverFoco = useRef(false);

  const primerMes = min.slice(0, 7);
  const ultimoMes = max.slice(0, 7);

  // Al moverse con teclado, el foco sigue al día activo.
  useEffect(() => {
    if (!moverFoco.current) return;
    moverFoco.current = false;
    tablaRef.current?.querySelector<HTMLButtonElement>(`button[data-fecha="${foco}"]`)?.focus();
  }, [foco, mes]);

  // Si el día elegido cambia desde fuera (p. ej. "el primer día con lugar"), se muestra su mes.
  useEffect(() => {
    if (!seleccionada || seleccionada < min || seleccionada > max) return;
    setMes(seleccionada.slice(0, 7));
    setFoco(seleccionada);
  }, [seleccionada, min, max]);

  useEffect(() => {
    onMes?.(mes);
  }, [mes, onMes]);

  const enRango = (f: string) => f >= min && f <= max;
  const sinLugar = (f: string) => disponibilidad?.[f] === false;
  // El día ya elegido sigue activo aunque se haya llenado (abajo se explica que no hay horarios).
  const habilitado = (f: string) => enRango(f) && (!sinLugar(f) || f === seleccionada);

  function irA(f: string) {
    // No sale del rango de meses visibles.
    const limiteIni = `${primerMes}-01`;
    const limiteFin = `${ultimoMes}-${String(diasDelMes(ultimoMes)).padStart(2, '0')}`;
    const destino = f < limiteIni ? limiteIni : f > limiteFin ? limiteFin : f;
    moverFoco.current = true;
    setFoco(destino);
    setMes(destino.slice(0, 7));
  }

  function alTeclear(e: KeyboardEvent<HTMLTableElement>) {
    const t = e.target as HTMLElement;
    if (!t.dataset.fecha) return;
    const f = t.dataset.fecha;
    let destino: string | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        destino = sumarDias(f, -1);
        break;
      case 'ArrowRight':
        destino = sumarDias(f, 1);
        break;
      case 'ArrowUp':
        destino = sumarDias(f, -7);
        break;
      case 'ArrowDown':
        destino = sumarDias(f, 7);
        break;
      case 'Home':
        destino = sumarDias(f, -columna(f));
        break;
      case 'End':
        destino = sumarDias(f, 6 - columna(f));
        break;
      case 'PageUp':
        destino = mismaFechaEnMes(f, -1);
        break;
      case 'PageDown':
        destino = mismaFechaEnMes(f, 1);
        break;
      default:
        return;
    }
    e.preventDefault();
    irA(destino);
  }

  function cambiarMes(n: number) {
    const nuevo = sumarMeses(mes, n);
    setMes(nuevo);
    // El día activo pasa al primero elegible del nuevo mes.
    const primero = `${nuevo}-01`;
    setFoco(primero < min ? min : primero);
  }

  // Celdas del mes visible
  const total = diasDelMes(mes);
  const vacias = columna(`${mes}-01`);
  const celdas: (string | null)[] = [...Array(vacias).fill(null)];
  for (let d = 1; d <= total; d++) celdas.push(`${mes}-${String(d).padStart(2, '0')}`);
  while (celdas.length % 7) celdas.push(null);
  const semanas: (string | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));

  const focoVisible = foco.slice(0, 7) === mes ? foco : (celdas.find((c) => c && habilitado(c)) ?? celdas.find(Boolean) ?? foco);
  const idTitulo = `cal-mes-${mes}`;

  return (
    <div className="rv-cal">
      <div className="rv-cal-cabeza">
        <button
          type="button"
          className="btn btn-texto rv-cal-flecha"
          onClick={() => cambiarMes(-1)}
          disabled={mes <= primerMes}
          aria-label="Mes anterior"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <h3 className="rv-cal-mes" id={idTitulo} aria-live="polite">
          {nombreMes(mes)}
        </h3>
        <button
          type="button"
          className="btn btn-texto rv-cal-flecha"
          onClick={() => cambiarMes(1)}
          disabled={mes >= ultimoMes}
          aria-label="Mes siguiente"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <table className="rv-cal-tabla" ref={tablaRef} onKeyDown={alTeclear} aria-labelledby={idTitulo} aria-describedby={describedBy}>
        <thead>
          <tr>
            {DIAS_SEMANA.map((d) => (
              <th key={d.corto} scope="col" abbr={d.largo}>
                {d.corto}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((s, i) => (
            <tr key={i}>
              {s.map((f, j) => {
                if (!f) return <td key={j} />;
                const ok = habilitado(f);
                const lleno = enRango(f) && sinLugar(f);
                const elegido = f === seleccionada;
                const esHoy = f === hoy;
                const etiqueta = `${fechaLarga(isoDesdeLocal(f, '12:00'))}${esHoy ? ', hoy' : ''}${
                  lleno ? ', sin horarios libres' : ok ? '' : ', no disponible'
                }`;
                return (
                  <td key={j}>
                    <button
                      type="button"
                      data-fecha={f}
                      className={`rv-cal-dia${elegido ? ' rv-cal-dia-elegido' : ''}${esHoy ? ' rv-cal-dia-hoy' : ''}${lleno ? ' rv-cal-dia-sin-lugar' : ''}`}
                      tabIndex={f === focoVisible ? 0 : -1}
                      aria-disabled={!ok || undefined}
                      aria-pressed={elegido}
                      aria-label={etiqueta}
                      onClick={() => {
                        setFoco(f);
                        if (ok) onElegir(f);
                      }}
                    >
                      {Number(f.slice(8, 10))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
