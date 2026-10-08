// Expediente de una clienta (/admin/clientes/:id): datos, notas internas, ficha de salud,
// citas, pedidos, servicios prepagados y consentimientos firmados.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, type CitaDetalle, type ConsentimientoFirmado } from '../../lib/api';
import { dinero, edad, enlaceWhatsApp, fechaCorta, fechaHora, fechaLocal, hora } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { VerFirma } from '../../components/ui/PanelFirma';
import { Bloque, EncabezadoAdmin, Exito, Kpi, PillEstadoCita, PillFirma } from '../../components/admin/Piezas';
import { IconoMensaje } from '../../components/admin/Iconos';
import { NuevaCita } from '../../components/admin/NuevaCita';
import { ClientasCreditos, ClientasNotas, ClientasPillCuenta, ClientasWhatsApp } from '../../components/admin/ClientasPiezas';
import { ClientasFicha } from '../../components/admin/ClientasFicha';
import { PedidosDetalleModal, PedidosTabla } from '../../components/admin/PedidosDetalle';
import { hashCorto, nombreCompleto } from '../../components/admin/util';
import './Expediente.css';

const ACTIVAS = new Set(['pendiente', 'confirmada', 'en_curso']);
const PASADAS_VISIBLES = 8;

function enlaceAgenda(iso: string) {
  return `/admin/agenda?fecha=${fechaLocal(new Date(iso))}`;
}

function TablaCitas({ citas, titulo }: { citas: CitaDetalle[]; titulo: string }) {
  return (
    <div className="tabla-envoltura adm-clientas-envoltura">
      <table className="tabla adm-ex-tabla-citas adm-clientas-adaptable">
        <caption className="sr-only">{titulo}</caption>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Servicios</th>
            <th>Atiende</th>
            <th>Estado</th>
            <th className="num">Total</th>
            <th className="num">Pagado</th>
            <th>Consentimiento</th>
          </tr>
        </thead>
        <tbody>
          {citas.map((c) => {
            const inactiva = c.estado === 'cancelada' || c.estado === 'no_asistio';
            const saldo = Math.round((c.total - c.pagado) * 100) / 100;
            return (
              <tr key={c.id}>
                <td className="adm-nowrap adm-ex-col-fecha adm-clientas-celda-titulo">
                  <Link to={enlaceAgenda(c.inicio)} className="num">
                    {fechaCorta(c.inicio)}
                  </Link>
                  <span className="adm-sub num">
                    {hora(c.inicio)}–{hora(c.fin)}
                  </span>
                </td>
                <td className="adm-ex-col-servicios adm-clientas-celda-ancha" data-etiqueta="Servicios">
                  {c.items.map((i) => i.nombre).join(', ') || 'Sin servicios'}
                  {c.primera_vez && <span className="pill pill-oro adm-ex-pill-junto">Primera vez</span>}
                </td>
                <td data-etiqueta="Atiende">{c.personal_nombre}</td>
                <td data-etiqueta="Estado">
                  <PillEstadoCita estado={c.estado} />
                </td>
                <td className="num adm-nowrap" data-etiqueta="Total">
                  {dinero(c.total, 'Por confirmar')}
                </td>
                <td className="num adm-nowrap" data-etiqueta="Pagado">
                  {dinero(c.pagado)}
                  {!inactiva && saldo > 0.005 && <span className="adm-sub adm-ex-saldo">Falta {dinero(saldo)}</span>}
                </td>
                <td data-etiqueta="Consentimiento">{inactiva ? <span className="texto-3">—</span> : <PillFirma firmados={c.consentimientos_firmados} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TarjetaConsentimiento({ k, cita }: { k: ConsentimientoFirmado; cita?: CitaDetalle }) {
  return (
    <li className="adm-ex-consentimiento">
      <div className="adm-ex-consentimiento-cabeza">
        <strong>{k.politica_titulo || 'Consentimiento'}</strong>
        <span className="pill pill-gris">Versión {k.politica_version}</span>
      </div>
      <dl className="adm-ex-consentimiento-datos">
        <div>
          <dt>Firmado</dt>
          <dd className="adm-ex-capital">{fechaHora(k.firmado_en)}</dd>
        </div>
        <div>
          <dt>Firmó</dt>
          <dd>{k.nombre_firmante}</dd>
        </div>
        {k.tutor_nombre && (
          <div>
            <dt>Mamá, papá o tutor</dt>
            <dd>{k.tutor_nombre}</dd>
          </div>
        )}
        <div>
          <dt>Cita</dt>
          <dd>
            {cita ? (
              <Link to={enlaceAgenda(cita.inicio)}>
                {fechaCorta(cita.inicio)} · {hora(cita.inicio)}
              </Link>
            ) : k.cita_id ? (
              <span className="texto-3">Cita no disponible</span>
            ) : (
              <span className="texto-3">Sin cita ligada</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Huella del documento</dt>
          <dd>
            <code className="adm-ex-huella" title={k.documento_hash ?? undefined}>
              {hashCorto(k.documento_hash)}
            </code>
          </dd>
        </div>
      </dl>
      <div className="adm-ex-firma">
        <span className="ayuda">Firma</span>
        <VerFirma svg={k.firma_svg} alto={60} />
      </div>
    </li>
  );
}

export default function Expediente() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navegar = useNavigate();
  const creada = !!(location.state as { creada?: boolean } | null)?.creada;

  const exp = useAsync(() => api.admin.getExpediente(id), [id]);
  const refs = useAsync(
    () =>
      Promise.all([
        api.getContraindicaciones(),
        api.getCatalogo({ incluirInactivos: true }).catch(() => null),
        api.getConfiguracion().catch(() => null),
      ]),
    [],
  );
  const [aviso, setAviso] = useState<string | null>(creada ? 'Clienta registrada. Ya puedes agendarle su primera cita.' : null);
  const [nuevaCita, setNuevaCita] = useState(false);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [todasPasadas, setTodasPasadas] = useState(false);

  // El aviso de "registrada" se muestra una vez; no vuelve al recargar la página.
  useEffect(() => {
    if (creada) navegar(location.pathname + location.search, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setTodasPasadas(false);
    setPedidoId(null);
  }, [id]);

  const d = exp.datos;
  const c = d?.cliente;
  const [contraindicaciones, catalogo, config] = refs.datos ?? [undefined, null, null];

  if (!d || !c) {
    return (
      <div className="adm-pagina adm-ex">
        <EncabezadoAdmin titulo="Expediente" volver={{ to: '/admin/clientes', texto: 'Clientas' }} />
        {exp.cargando && <Cargando texto="Abriendo el expediente…" />}
        <MensajeError error={exp.error} onReintentar={exp.recargar} />
      </div>
    );
  }

  const nombre = nombreCompleto(c);
  const ahora = Date.now();
  const proximas = d.citas
    .filter((x) => ACTIVAS.has(x.estado) && new Date(x.fin).getTime() >= ahora)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : 1));
  const idsProximas = new Set(proximas.map((x) => x.id));
  const pasadas = d.citas.filter((x) => !idsProximas.has(x.id)).sort((a, b) => (a.inicio < b.inicio ? 1 : -1));
  const pasadasVisibles = todasPasadas ? pasadas : pasadas.slice(0, PASADAS_VISIBLES);
  const anios = c.fecha_nacimiento ? edad(c.fecha_nacimiento) : null;
  const pedidoElegido = pedidoId ? d.pedidos.find((p) => p.id === pedidoId) : undefined;
  const creditosVigentes = d.creditos.filter((x) => x.vigente && x.restantes > 0).length;
  const citaPorId = new Map(d.citas.map((x) => [x.id, x]));
  const saludo = `Hola, ${c.nombre.split(' ')[0]}. Te escribimos de Ópalo.`;

  const secciones = [
    { id: 'ex-ficha', texto: 'Ficha de salud' },
    { id: 'ex-notas', texto: 'Notas' },
    { id: 'ex-creditos', texto: `Servicios prepagados${creditosVigentes ? ` (${creditosVigentes})` : ''}` },
    { id: 'ex-citas', texto: `Citas (${d.citas.length})` },
    { id: 'ex-pedidos', texto: `Pedidos (${d.pedidos.length})` },
    { id: 'ex-consentimientos', texto: `Consentimientos (${d.consentimientos.length})` },
  ];
  const irA = (seccion: string) => {
    const el = document.getElementById(seccion);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={`adm-pagina adm-ex ${exp.cargando ? 'adm-ex-recargando' : ''}`}>
      <EncabezadoAdmin
        titulo={nombre}
        volver={{ to: '/admin/clientes', texto: 'Clientas' }}
        descripcion={
          <span className="fila adm-ex-descripcion">
            <ClientasPillCuenta tiene={c.tiene_cuenta} largo />
            {c.es_personal && <span className="pill pill-info">Cuenta del equipo</span>}
            {anios !== null && config && anios < config.edad_mayoria && <span className="pill pill-alerta">Menor de edad</span>}
            {c.citas_completadas === 0 && <span className="pill pill-oro">Aún no nos visita</span>}
            <span className="texto-3 pequeno">Registrada el {fechaCorta(c.creado_en)}</span>
          </span>
        }
      >
        {c.telefono && (
          <a className="btn btn-secundario" href={enlaceWhatsApp(c.telefono, saludo)} target="_blank" rel="noreferrer">
            <IconoMensaje tam={18} /> WhatsApp
          </a>
        )}
        <button type="button" className="btn btn-primario" onClick={() => setNuevaCita(true)}>
          + Nueva cita
        </button>
      </EncabezadoAdmin>

      <Exito texto={aviso} onCerrar={() => setAviso(null)} />
      <MensajeError error={exp.error} onReintentar={exp.recargar} />

      <section className="tarjeta-plana adm-ex-perfil" aria-label="Datos de contacto">
        <dl className="adm-ex-contacto">
          <div>
            <dt>Teléfono</dt>
            <dd>
              <ClientasWhatsApp telefono={c.telefono} mensaje={saludo} />
            </dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd className="adm-ex-correo">{c.email ? <a href={`mailto:${c.email}`}>{c.email}</a> : <span className="texto-3">Sin correo</span>}</dd>
          </div>
          <div>
            <dt>Edad</dt>
            <dd>
              {anios !== null && c.fecha_nacimiento ? (
                <>
                  <span className="num">{anios} años</span>
                  <span className="adm-sub num">Nació el {fechaCorta(c.fecha_nacimiento)}</span>
                </>
              ) : (
                <span className="texto-3">Sin fecha de nacimiento</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Cuenta en línea</dt>
            <dd>{c.tiene_cuenta ? 'Sí: reserva, llena su ficha y firma desde su cuenta' : 'No: agenda por WhatsApp, teléfono o en mostrador'}</dd>
          </div>
        </dl>
        {anios !== null && config && anios < config.edad_minima && (
          <p className="aviso aviso-error adm-ex-aviso-edad">Tiene {anios} años: atendemos a partir de los {config.edad_minima}.</p>
        )}
        {anios !== null && config && anios >= config.edad_minima && anios < config.edad_mayoria && (
          <p className="aviso aviso-alerta adm-ex-aviso-edad">Es menor de edad: viene con mamá, papá o tutor, que también firma el consentimiento.</p>
        )}
      </section>

      <div className="adm-kpis adm-ex-kpis">
        <Kpi etiqueta="Citas completadas" valor={<span className="num">{c.citas_completadas}</span>} />
        <Kpi etiqueta="Última visita" valor={<span className="num adm-ex-kpi-fecha">{c.ultima_visita ? fechaCorta(c.ultima_visita) : '—'}</span>} detalle={c.ultima_visita ? undefined : 'Sin visitas todavía'} />
        <Kpi
          etiqueta="Próxima cita"
          valor={<span className="num adm-ex-kpi-fecha">{c.proxima_cita ? fechaCorta(c.proxima_cita) : '—'}</span>}
          detalle={c.proxima_cita ? `A las ${hora(c.proxima_cita)}` : 'Sin cita agendada'}
        />
        <Kpi etiqueta="Total pagado" valor={<span className="num">{dinero(c.total_pagado)}</span>} detalle="Citas y pedidos" />
      </div>

      <nav className="adm-ex-indice" aria-label="Secciones del expediente">
        {secciones.map((s) => (
          <button key={s.id} type="button" className="adm-ex-indice-boton" onClick={() => irA(s.id)}>
            {s.texto}
          </button>
        ))}
      </nav>

      <div className="adm-ex-rejilla">
        <div className="adm-ex-columna">
          <Bloque titulo="Ficha de salud" id="ex-ficha">
            {refs.cargando && !refs.datos && <Cargando texto="Cargando preguntas…" />}
            <MensajeError error={refs.error} onReintentar={refs.recargar} />
            {contraindicaciones && <ClientasFicha ficha={d.ficha} preguntas={contraindicaciones} categorias={catalogo?.categorias} />}
          </Bloque>
        </div>
        <div className="adm-ex-columna">
          <Bloque titulo="Notas internas" id="ex-notas">
            <ClientasNotas key={c.id} clienteId={c.id} inicial={c.notas_internas} />
          </Bloque>
          <Bloque titulo="Servicios prepagados" id="ex-creditos">
            <ClientasCreditos creditos={d.creditos} />
          </Bloque>
        </div>
      </div>

      <Bloque
        titulo="Citas"
        id="ex-citas"
        extra={
          <button type="button" className="btn btn-texto btn-sm" onClick={() => setNuevaCita(true)}>
            + Nueva cita
          </button>
        }
      >
        <h3 className="adm-ex-subtitulo">Próximas</h3>
        {proximas.length === 0 ? (
          <p className="texto-3 adm-ex-nada">No tiene citas próximas.</p>
        ) : (
          <TablaCitas citas={proximas} titulo="Citas próximas" />
        )}
        <h3 className="adm-ex-subtitulo">Anteriores</h3>
        {pasadas.length === 0 ? (
          <p className="texto-3 adm-ex-nada">Todavía no hay citas anteriores.</p>
        ) : (
          <>
            <TablaCitas citas={pasadasVisibles} titulo="Citas anteriores" />
            {pasadas.length > PASADAS_VISIBLES && (
              <button type="button" className="btn btn-texto btn-sm adm-ex-ver-mas" onClick={() => setTodasPasadas((v) => !v)}>
                {todasPasadas ? 'Ver menos' : `Ver las ${pasadas.length - PASADAS_VISIBLES} anteriores`}
              </button>
            )}
          </>
        )}
      </Bloque>

      <Bloque titulo="Pedidos" id="ex-pedidos" enlace={d.pedidos.length ? { to: '/admin/pedidos', texto: 'Todos los pedidos' } : undefined}>
        {d.pedidos.length === 0 ? (
          <Vacio titulo="Sin pedidos">Cuando compre en la tienda en línea, sus pedidos aparecerán aquí.</Vacio>
        ) : (
          <PedidosTabla pedidos={d.pedidos} conClienta={false} onVer={(p) => setPedidoId(p.id)} />
        )}
      </Bloque>

      <Bloque titulo="Consentimientos firmados" id="ex-consentimientos">
        {d.consentimientos.length === 0 ? (
          <Vacio titulo="Aún no ha firmado consentimientos">
            Se firman en la tablet de la cabina, antes del servicio (“Firmar en cabina” en la agenda). Sin consentimiento firmado no hay servicio.
          </Vacio>
        ) : (
          <ul className="adm-ex-consentimientos">
            {d.consentimientos.map((k) => (
              <TarjetaConsentimiento key={k.id} k={k} cita={k.cita_id ? citaPorId.get(k.cita_id) : undefined} />
            ))}
          </ul>
        )}
      </Bloque>

      {nuevaCita && (
        <NuevaCita
          inicial={{ cliente: { id: c.id, nombre, telefono: c.telefono } }}
          onCerrar={() => setNuevaCita(false)}
          onListo={(r, ini) => {
            setNuevaCita(false);
            setAviso(`Cita agendada para el ${fechaHora(ini)}${r.requiere_revision ? ' (por confirmar: revisa su ficha de salud)' : ''}.`);
            exp.recargar();
          }}
        />
      )}
      {pedidoElegido && (
        <PedidosDetalleModal
          pedido={pedidoElegido}
          sinEnlaceClienta
          onCerrar={() => setPedidoId(null)}
          onCambio={(m) => {
            setPedidoId(null);
            setAviso(m);
            exp.recargar();
          }}
        />
      )}
    </div>
  );
}
