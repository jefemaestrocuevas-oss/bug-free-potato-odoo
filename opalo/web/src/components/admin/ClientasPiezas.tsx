// Piezas del área de clientas: enlace de WhatsApp, cuenta en línea, notas internas y créditos.
import { useState } from 'react';
import { api, type Credito } from '../../lib/api';
import { enlaceWhatsApp, fechaCorta, telefonoBonito } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError, Vacio } from '../ui/Estado';
import { IconoMensaje } from './Iconos';
import { copiarAlPortapapeles } from './util';
import './ClientasPiezas.css';

/** Teléfono con enlace a WhatsApp (abre en otra pestaña). */
export function ClientasWhatsApp({ telefono, mensaje, compacto = false }: { telefono: string | null; mensaje?: string; compacto?: boolean }) {
  if (!telefono) return <span className="texto-3">Sin teléfono</span>;
  return (
    <a
      className={`adm-clientas-wa ${compacto ? 'adm-clientas-wa-compacto' : ''}`}
      href={enlaceWhatsApp(telefono, mensaje)}
      target="_blank"
      rel="noreferrer"
      aria-label={`Escribir por WhatsApp al ${telefonoBonito(telefono)} (se abre en otra pestaña)`}
    >
      <IconoMensaje tam={16} />
      <span className="num">{telefonoBonito(telefono)}</span>
    </a>
  );
}

/** ¿Tiene cuenta en línea? */
export function ClientasPillCuenta({ tiene, largo = false }: { tiene: boolean; largo?: boolean }) {
  return tiene ? (
    <span className="pill pill-verde">{largo ? 'Tiene cuenta en línea' : 'Sí'}</span>
  ) : (
    <span className="pill pill-gris">{largo ? 'Sin cuenta en línea' : 'No'}</span>
  );
}

/** Notas internas editables (sólo el equipo las ve). */
export function ClientasNotas({ clienteId, inicial }: { clienteId: string; inicial: string | null }) {
  const [texto, setTexto] = useState(inicial ?? '');
  const [guardado, setGuardado] = useState((inicial ?? '').trim());
  const [listo, setListo] = useState(false);
  const { ejecutar, enviando, error } = useAccion(async () => {
    const limpio = texto.trim();
    await api.admin.guardarNotasCliente(clienteId, limpio);
    return limpio;
  });
  const cambio = texto.trim() !== guardado;

  const guardar = async () => {
    const r = await ejecutar();
    if (r === undefined) return;
    setGuardado(r);
    setTexto(r);
    setListo(true);
  };

  return (
    <div className="adm-clientas-notas">
      <p className="ayuda adm-sin-margen">
        <strong>Sólo las ve el equipo.</strong> La clienta no las ve en su cuenta.
      </p>
      <label className="sr-only" htmlFor={`notas-${clienteId}`}>
        Notas internas
      </label>
      <textarea
        id={`notas-${clienteId}`}
        className="input"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setListo(false);
        }}
        placeholder="Preferencias, cómo prefiere que la contacten, lo que conviene recordar para su próxima visita…"
        rows={4}
      />
      <MensajeError error={error} />
      <div className="entre">
        <span className="ayuda" role="status">
          {cambio ? 'Tienes cambios sin guardar.' : listo ? 'Notas guardadas.' : ''}
        </span>
        <div className="fila adm-gap-notas">
          {cambio && (
            <button type="button" className="btn btn-texto btn-sm" onClick={() => setTexto(guardado)} disabled={enviando}>
              Descartar
            </button>
          )}
          <button type="button" className="btn btn-secundario btn-sm" onClick={guardar} disabled={!cambio || enviando}>
            {enviando ? 'Guardando…' : 'Guardar notas'}
          </button>
        </div>
      </div>
    </div>
  );
}

function estadoCredito(c: Credito): { clase: string; texto: string } {
  if (c.restantes <= 0) return { clase: 'pill-gris', texto: 'Agotado' };
  if (!c.vigente) return { clase: 'pill-error', texto: 'Vencido' };
  return { clase: 'pill-exito', texto: 'Vigente' };
}

/** Servicios prepagados (créditos) de una clienta, con códigos de regalo. */
export function ClientasCreditos({ creditos }: { creditos: Credito[] }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  if (creditos.length === 0)
    return <Vacio titulo="Sin servicios prepagados">Cuando pague un pedido con servicios o paquetes, aparecerán aquí para usarlos al agendar.</Vacio>;

  const ordenados = [...creditos].sort((a, b) => Number(b.vigente && b.restantes > 0) - Number(a.vigente && a.restantes > 0));

  const copiar = async (codigo: string) => {
    if (await copiarAlPortapapeles(codigo)) {
      setCopiado(codigo);
      window.setTimeout(() => setCopiado((x) => (x === codigo ? null : x)), 2500);
    }
  };

  return (
    <ul className="adm-lista adm-clientas-creditos">
      {ordenados.map((c) => {
        const e = estadoCredito(c);
        return (
          <li key={c.id} className="adm-lista-item adm-clientas-credito">
            <div className="adm-clientas-credito-texto">
              <strong>{c.nombre || 'Servicio'}</strong>
              <span className="adm-sub num">
                {c.restantes > 0 ? `Le ${c.restantes === 1 ? 'queda' : 'quedan'} ${c.restantes} de ${c.cantidad}` : `Usó ${c.usados} de ${c.cantidad}`}
                {' · '}
                {c.vence_en ? `${c.vigente || c.restantes <= 0 ? 'Vence' : 'Venció'} el ${fechaCorta(c.vence_en)}` : 'Sin vencimiento'}
              </span>
              {c.codigo_regalo && (
                <span className="adm-clientas-regalo">
                  Regalo para <strong>{c.regalo_para ?? 'alguien especial'}</strong> · código{' '}
                  <code className="adm-clientas-codigo">{c.codigo_regalo}</code>
                  <button type="button" className="btn btn-texto btn-sm" onClick={() => copiar(c.codigo_regalo!)}>
                    {copiado === c.codigo_regalo ? 'Copiado' : 'Copiar'}
                  </button>
                </span>
              )}
              {!c.codigo_regalo && c.regalo_para && <span className="adm-sub">Regalo para {c.regalo_para} (código ya canjeado)</span>}
            </div>
            <span className={`pill ${e.clase}`}>{e.texto}</span>
          </li>
        );
      })}
    </ul>
  );
}
