// "Firmar en cabina": el personal prepara el consentimiento que aplica a la cita y entrega la
// tablet en modo cabina (ModoCabina.tsx): la clienta sólo ve el consentimiento y el recuadro de
// firma, y para volver al panel hace falta la contraseña de quien la entregó.
import { useEffect, useMemo, useState } from 'react';
import { api, type CitaDetalle, type TipoPolitica } from '../../lib/api';
import { edad, enlaceWhatsApp, ETIQUETA_POLITICA, fechaHora } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../ui/Estado';
import { cierreCabina, entrarCabina, useCabina } from './cabina';
import { Modal } from './Modal';

interface Props {
  cita: CitaDetalle;
  onCerrar: () => void;
  onListo: () => void;
  /** Texto adicional arriba (p. ej. "Para iniciar la cita primero hace falta la firma"). */
  aviso?: string;
}

/** Enlace a /cuenta/firmar/:citaId para que la clienta firme desde su teléfono (con su cuenta). */
function enlaceFirmaEnLinea(citaId: string): string | null {
  if (typeof window === 'undefined') return null;
  const ruta = `/cuenta/firmar/${citaId}`;
  const modo = import.meta.env.VITE_ROUTER;
  if (modo === 'memory') return null;
  const { origin, pathname } = window.location;
  return modo === 'hash' ? `${origin}${pathname}#${ruta}` : `${origin}${ruta}`;
}

function pantallaCompleta() {
  try {
    const raiz = document.documentElement;
    if (!document.fullscreenElement && raiz.requestFullscreen) void raiz.requestFullscreen().catch(() => undefined);
  } catch {
    // El navegador no lo permite: la pantalla de cabina igual cubre todo el panel.
  }
}

export function FirmarCabina({ cita, onCerrar, onListo, aviso }: Props) {
  const { sesion } = useSesion();
  const cabina = useCabina();
  const [entregada, setEntregada] = useState(false);
  const datos = useAsync(
    () =>
      Promise.all([
        api.getPoliticasVigentes(),
        api.getCatalogo({ incluirInactivos: true }),
        api.getConfiguracion(),
        api.admin.getExpediente(cita.cliente_id),
      ]),
    [cita.id],
  );

  const calculo = useMemo(() => {
    if (!datos.datos) return null;
    const [politicas, catalogo, config, expediente] = datos.datos;
    const servicios = new Map(catalogo.servicios.map((s) => [s.id, s]));
    const paquetes = new Map(catalogo.paquetes.map((p) => [p.id, p]));
    const tipos = new Set<TipoPolitica>();
    for (const it of cita.items) {
      const ids = it.servicio_id ? [it.servicio_id] : it.paquete_id ? (paquetes.get(it.paquete_id)?.items ?? []).map((x) => x.servicio_id) : [];
      for (const id of ids) {
        const t = servicios.get(id)?.tipo_consentimiento;
        if (t) tipos.add(t);
      }
    }
    const aplican = politicas.filter((p) => tipos.has(p.tipo));
    const c = expediente.cliente;
    const anios = c.fecha_nacimiento ? edad(c.fecha_nacimiento) : null;
    const menor = anios !== null && anios < config.edad_mayoria;
    const nombre = [c.nombre, c.apellidos].filter(Boolean).join(' ');
    return { aplican, menor, anios, nombre, sinFicha: !expediente.ficha, tieneCuenta: c.tiene_cuenta, telefono: c.telefono };
  }, [datos.datos, cita.items]);

  // Cuando el equipo desbloquea la tablet, se avisa si la clienta firmó o no.
  const enCabina = entregada && cabina?.cita_id === cita.id;
  useEffect(() => {
    if (!entregada || enCabina) return;
    setEntregada(false);
    if (cierreCabina(cita.id)?.firmada) onListo();
    else onCerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entregada, enCabina]);

  if (enCabina) return null;

  const entregar = () => {
    if (!calculo || !sesion) return;
    pantallaCompleta();
    entrarCabina({
      user_id: sesion.user_id,
      email: sesion.email,
      cita_id: cita.id,
      cuando: fechaHora(cita.inicio),
      servicios: cita.items.map((i) => i.nombre).join(', '),
      nombre: calculo.nombre || cita.cliente_nombre,
      menor: calculo.menor,
      anios: calculo.anios,
      consentimientos: calculo.aplican.map((p) => ({
        id: p.id,
        titulo: ETIQUETA_POLITICA[p.tipo] ?? p.titulo,
        version: p.version,
        contenido_md: p.contenido_md,
      })),
    });
    setEntregada(true);
  };

  const enlace = calculo?.tieneCuenta && calculo.telefono ? enlaceFirmaEnLinea(cita.id) : null;
  const mensaje = enlace
    ? `Hola, ${cita.cliente_nombre.split(' ')[0]}. Para tu cita en Ópalo del ${fechaHora(cita.inicio)} necesitamos tu firma en el consentimiento informado. Puedes leerlo y firmarlo aquí, con tu cuenta: ${enlace}`
    : '';

  return (
    <Modal
      titulo="Firmar en cabina"
      onCerrar={onCerrar}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primario" disabled={!calculo || !sesion} onClick={entregar} data-autofoco>
            Entregar la tablet a la clienta
          </button>
        </>
      }
    >
      {aviso && <p className="aviso aviso-alerta">{aviso}</p>}
      <p className="texto-2">
        Cita de <strong>{cita.cliente_nombre}</strong> · {fechaHora(cita.inicio)} · {cita.items.map((i) => i.nombre).join(', ')}
      </p>
      {datos.cargando && <Cargando texto="Preparando el consentimiento…" />}
      <MensajeError error={datos.error} onReintentar={datos.recargar} />
      {calculo && (
        <div className="pila">
          {calculo.sinFicha && (
            <p className="aviso aviso-alerta adm-sin-margen">
              Esta clienta aún no tiene ficha de salud. Pídele que la llene desde su cuenta o repasa las preguntas con ella antes del servicio.
            </p>
          )}
          {calculo.aplican.length === 0 ? (
            <p className="aviso aviso-info adm-sin-margen">No encontramos un consentimiento específico para estos servicios; la firma quedará ligada a la cita.</p>
          ) : (
            <div>
              <p className="etiqueta adm-sin-margen">Va a leer y firmar:</p>
              <ul className="adm-lista-alertas">
                {calculo.aplican.map((p) => (
                  <li key={p.id}>
                    {ETIQUETA_POLITICA[p.tipo] ?? p.titulo} · versión {p.version}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {calculo.menor && <p className="ayuda adm-sin-margen">La clienta tiene {calculo.anios} años: también firma quien la acompaña.</p>}
          <div className="aviso aviso-info adm-sin-margen">
            <p className="adm-sin-margen">
              La tablet queda en <strong>modo cabina</strong>: tu clienta sólo verá su consentimiento y el recuadro de firma. Para volver al panel tendrás
              que escribir tu contraseña (no la guardes en el navegador de la tablet).
            </p>
          </div>
          {enlace && (
            <p className="ayuda adm-sin-margen">
              ¿Prefiere firmar en su teléfono?{' '}
              <a href={enlaceWhatsApp(calculo.telefono ?? '', mensaje)} target="_blank" rel="noreferrer">
                Mándale el enlace por WhatsApp
              </a>{' '}
              y firma con su cuenta.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
