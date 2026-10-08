// Piezas del catálogo en el panel (/admin/catalogo): reglas R1/R8 vistas desde la UI,
// textos de duración y una entrada numérica con prefijo/sufijo. Estilos en pages/admin/Catalogo.css.
import type { EtapaServicio, Paquete, PaqueteItem, Servicio, TipoPolitica } from '../../lib/api';
import { duracion } from '../../lib/format';
import { ETIQUETA_ETAPA } from './util';

export const ETAPAS = Object.keys(ETIQUETA_ETAPA) as EtapaServicio[];

const CLASE_ETAPA: Record<EtapaServicio, string> = {
  disponible: 'pill-exito',
  segunda_etapa: 'pill-info',
  requiere_curso: 'pill-alerta',
};

export const AYUDA_ETAPA: Record<EtapaServicio, string> = {
  disponible: 'Se ofrece y se puede reservar.',
  segunda_etapa: 'Se abrirá más adelante. En el sitio aparece como «Próximamente» y no se puede reservar.',
  requiere_curso: 'Falta que el equipo tome el curso. En el sitio aparece como «Próximamente» y no se puede reservar.',
};

export const CONSENTIMIENTOS: TipoPolitica[] = ['consentimiento_depilacion', 'consentimiento_facial', 'consentimiento_corporal'];

export function PillEtapa({ etapa }: { etapa: EtapaServicio }) {
  return <span className={`pill ${CLASE_ETAPA[etapa] ?? 'pill-gris'}`}>{ETIQUETA_ETAPA[etapa] ?? etapa}</span>;
}

export function PillActivo({ activo, femenino = false }: { activo: boolean; femenino?: boolean }) {
  return activo ? <span className="pill pill-verde">{femenino ? 'Activa' : 'Activo'}</span> : <span className="pill pill-gris">{femenino ? 'Inactiva' : 'Inactivo'}</span>;
}

/** Igual que el servidor: minúsculas, sin acentos, guiones. */
export function slugDe(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Duración de un servicio para mostrar: null = sesión estándar. */
export function textoDuracionServicio(min: number | null): string {
  if (min === null) return '1 h (estándar)';
  if (min === 0) return 'No suma tiempo';
  return duracion(min);
}

export interface EstadoEnLinea {
  si: boolean;
  motivo: string;
}

/** R1: ¿se puede reservar en línea? (con el motivo cuando no). */
export function reservaEnLinea(s: Pick<Servicio, 'activo' | 'etapa' | 'reservable_en_linea' | 'es_complemento'>): EstadoEnLinea {
  if (!s.activo) return { si: false, motivo: 'Está inactivo' };
  if (s.etapa !== 'disponible') return { si: false, motivo: `Etapa: ${ETIQUETA_ETAPA[s.etapa].toLowerCase()}` };
  if (!s.reservable_en_linea) return { si: false, motivo: 'Sólo por WhatsApp o mostrador' };
  return { si: true, motivo: s.es_complemento ? 'Sólo junto con otro servicio' : 'Se reserva en línea' };
}

/** R8: ¿se puede comprar en la tienda en línea? */
export function ventaEnLinea(s: Pick<Servicio, 'activo' | 'etapa' | 'vendible_en_linea' | 'precio'>): EstadoEnLinea {
  if (!s.activo) return { si: false, motivo: 'Está inactivo' };
  if (s.etapa !== 'disponible') return { si: false, motivo: `Etapa: ${ETIQUETA_ETAPA[s.etapa].toLowerCase()}` };
  if (!s.vendible_en_linea) return { si: false, motivo: 'No está a la venta en línea' };
  if (s.precio === null) return { si: false, motivo: 'Falta el precio' };
  return { si: true, motivo: 'Se vende en línea' };
}

/** Suma de los servicios sueltos de un paquete; null si falta algún precio o no tiene servicios. */
export function sumaPorSeparado(items: PaqueteItem[], porId: Map<string, Servicio>): number | null {
  if (items.length === 0) return null;
  let suma = 0;
  for (const it of items) {
    const s = porId.get(it.servicio_id);
    if (!s || s.precio === null) return null;
    suma += s.precio * it.cantidad;
  }
  return Math.round(suma * 100) / 100;
}

/** Texto de la vigencia de un paquete (null = la estándar de los créditos). */
export function textoVigencia(p: Pick<Paquete, 'vigencia_dias'>, estandar: number | null): string {
  if (p.vigencia_dias !== null) return `${p.vigencia_dias} ${p.vigencia_dias === 1 ? 'día' : 'días'}`;
  return estandar ? `${estandar} días (estándar)` : 'La estándar';
}

/** Entrada numérica con prefijo ($) o sufijo (min, días). */
export function CatalogoEntrada({
  id,
  valor,
  onCambio,
  prefijo,
  sufijo,
  placeholder,
  invalido,
  describe,
  decimal = false,
}: {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  prefijo?: string;
  sufijo?: string;
  placeholder?: string;
  invalido?: boolean;
  describe?: string;
  decimal?: boolean;
}) {
  return (
    <div className={`cat-entrada ${prefijo ? 'cat-entrada-con-pre' : ''} ${sufijo ? 'cat-entrada-con-post' : ''}`}>
      {prefijo && (
        <span className="cat-entrada-pre" aria-hidden="true">
          {prefijo}
        </span>
      )}
      <input
        id={id}
        className="input num"
        inputMode={decimal ? 'decimal' : 'numeric'}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalido ? true : undefined}
        aria-describedby={describe}
        autoComplete="off"
      />
      {sufijo && (
        <span className="cat-entrada-post" aria-hidden="true">
          {sufijo}
        </span>
      )}
    </div>
  );
}

/** Número entero ≥ mínimo a partir del texto de un input; '' → null; inválido → NaN. */
export function enteroDe(t: string, minimo = 0): number | null {
  const s = t.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return NaN;
  const n = Number(s);
  return n >= minimo ? n : NaN;
}
