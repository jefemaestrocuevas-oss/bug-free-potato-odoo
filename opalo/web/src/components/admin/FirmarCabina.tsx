// "Firmar en cabina": la clienta lee el consentimiento que aplica a su cita y firma en la tablet.
import { useMemo, useState } from 'react';
import { api, type CitaDetalle, type DatosFirma, type TipoPolitica } from '../../lib/api';
import { edad, ETIQUETA_POLITICA, fechaHora } from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../ui/Estado';
import { Markdown } from '../ui/Markdown';
import { PanelFirma } from '../ui/PanelFirma';
import { Modal } from './Modal';

interface Props {
  cita: CitaDetalle;
  onCerrar: () => void;
  onListo: () => void;
  /** Texto adicional arriba (p. ej. "Para iniciar la cita primero hace falta la firma"). */
  aviso?: string;
}

export function FirmarCabina({ cita, onCerrar, onListo, aviso }: Props) {
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
  const [firma, setFirma] = useState<DatosFirma | null>(null);
  const { ejecutar, enviando, error } = useAccion(async () => {
    if (!firma) throw new Error('Falta tu firma o tu nombre completo.');
    await api.firmarConsentimientoCita(cita.id, firma);
    return true;
  });

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
    const nac = expediente.cliente.fecha_nacimiento;
    const anios = nac ? edad(nac) : null;
    const menor = anios !== null && anios < config.edad_mayoria;
    const nombre = [expediente.cliente.nombre, expediente.cliente.apellidos].filter(Boolean).join(' ');
    return { aplican, menor, anios, nombre, sinFicha: !expediente.ficha };
  }, [datos.datos, cita.items]);

  return (
    <Modal
      titulo="Firmar en cabina"
      ancho="amplio"
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primario"
            disabled={enviando || !firma || !calculo}
            onClick={async () => {
              if (await ejecutar()) onListo();
            }}
          >
            {enviando ? 'Guardando firma…' : 'Guardar firma'}
          </button>
        </>
      }
    >
      {aviso && <p className="aviso aviso-alerta">{aviso}</p>}
      <p className="texto-2">
        Cita de <strong>{cita.cliente_nombre}</strong> · {fechaHora(cita.inicio)} · {cita.items.map((i) => i.nombre).join(', ')}
      </p>
      <p className="ayuda">Entrega la tablet a la clienta para que lea el consentimiento y firme con su dedo.</p>
      {datos.cargando && <Cargando texto="Cargando el consentimiento…" />}
      <MensajeError error={datos.error} onReintentar={datos.recargar} />
      {calculo && (
        <>
          {calculo.sinFicha && (
            <p className="aviso aviso-alerta">
              Esta clienta aún no tiene ficha de salud. Pídele que la llene desde su cuenta o repasa las preguntas con ella antes del servicio.
            </p>
          )}
          {calculo.aplican.length === 0 ? (
            <p className="aviso aviso-info">No encontramos un consentimiento específico para estos servicios; la firma quedará ligada a la cita.</p>
          ) : (
            calculo.aplican.map((p) => (
              <details key={p.id} className="adm-consentimiento" open={calculo.aplican.length === 1}>
                <summary>
                  {ETIQUETA_POLITICA[p.tipo] ?? p.titulo} · versión {p.version}
                </summary>
                <div className="adm-consentimiento-texto">
                  <Markdown texto={p.contenido_md} />
                </div>
              </details>
            ))
          )}
          <PanelFirma
            onCambio={setFirma}
            requiereTutor={calculo.menor}
            nombreSugerido={calculo.nombre}
            leyenda="Firma con tu dedo dentro del recuadro. Al firmar confirmas que leíste el consentimiento y que la información de tu ficha de salud es correcta."
          />
          {calculo.menor && <p className="ayuda">La clienta tiene {calculo.anios} años: también firma quien la acompaña.</p>}
        </>
      )}
      <MensajeError error={error} />
    </Modal>
  );
}
