// Clientas (/admin/clientes): búsqueda, lista con su historial y alta de clientas nuevas.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type ClienteResumen } from '../../lib/api';
import { dinero, fechaCorta, fechaLocal, hora } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../../components/ui/Estado';
import { EncabezadoAdmin } from '../../components/admin/Piezas';
import { FormCliente } from '../../components/admin/FormCliente';
import { Modal } from '../../components/admin/Modal';
import { ClientasPillCuenta, ClientasWhatsApp } from '../../components/admin/ClientasPiezas';
import { nombreCompleto, porTexto } from '../../components/admin/util';
import './Clientes.css';

type Orden = 'nombre' | 'ultima' | 'proxima' | 'pagado' | 'recientes';

const ORDENES: { valor: Orden; texto: string }[] = [
  { valor: 'nombre', texto: 'Nombre (A–Z)' },
  { valor: 'ultima', texto: 'Última visita' },
  { valor: 'proxima', texto: 'Próxima cita' },
  { valor: 'pagado', texto: 'Total pagado' },
  { valor: 'recientes', texto: 'Registradas recientemente' },
];

/** Las que no tienen fecha van al final en cualquier orden. */
function porFecha(clave: (c: ClienteResumen) => string | null, asc: boolean) {
  return (a: ClienteResumen, b: ClienteResumen) => {
    const x = clave(a);
    const y = clave(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : 1) * (asc ? 1 : -1);
  };
}

const ORDENAR: Record<Orden, (a: ClienteResumen, b: ClienteResumen) => number> = {
  nombre: porTexto(nombreCompleto),
  ultima: porFecha((c) => c.ultima_visita, false),
  proxima: porFecha((c) => c.proxima_cita, true),
  pagado: (a, b) => b.total_pagado - a.total_pagado,
  recientes: porFecha((c) => c.creado_en, false),
};

export default function Clientes() {
  const [params, setParams] = useSearchParams();
  const navegar = useNavigate();
  const q = params.get('q') ?? '';
  const op = params.get('orden') as Orden | null;
  const orden: Orden = op && op in ORDENAR ? op : 'nombre';
  const [texto, setTexto] = useState(q);
  const [nueva, setNueva] = useState(false);

  // Espera breve al teclear antes de buscar; la búsqueda queda en la dirección (?q=).
  useEffect(() => {
    const t = texto.trim();
    if (t === q) return;
    const id = window.setTimeout(() => {
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (t) n.set('q', t);
          else n.delete('q');
          return n;
        },
        { replace: true },
      );
    }, 300);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  // Si la dirección cambia por fuera (atrás/adelante), el campo la sigue.
  useEffect(() => {
    setTexto((t) => (t.trim() === q ? t : q));
  }, [q]);

  const clientes = useAsync(() => api.admin.getClientes(q || undefined), [q]);
  const lista = useMemo(() => [...(clientes.datos ?? [])].sort(ORDENAR[orden]), [clientes.datos, orden]);
  const escribiendo = texto.trim() !== q;

  const cambiarOrden = (v: Orden) =>
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        if (v === 'nombre') n.delete('orden');
        else n.set('orden', v);
        return n;
      },
      { replace: true },
    );

  return (
    <div className="adm-pagina adm-cl">
      <EncabezadoAdmin titulo="Clientas" descripcion="Busca a una clienta y abre su expediente: ficha de salud, citas, pedidos, servicios prepagados y consentimientos.">
        <button type="button" className="btn btn-primario" onClick={() => setNueva(true)}>
          + Nueva clienta
        </button>
      </EncabezadoAdmin>

      <div className="adm-filtros adm-cl-filtros">
        <div className="campo adm-busqueda">
          <label className="etiqueta" htmlFor="cl-buscar">
            Buscar
          </label>
          <div className="adm-cl-buscar">
            <input
              id="cl-buscar"
              className="input"
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Nombre, teléfono o correo"
              autoComplete="off"
              enterKeyHint="search"
            />
            {(escribiendo || (clientes.cargando && !!clientes.datos)) && <span className="spinner adm-cl-spinner" aria-hidden="true" />}
          </div>
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="cl-orden">
            Ordenar por
          </label>
          <select id="cl-orden" className="input" value={orden} onChange={(e) => cambiarOrden(e.target.value as Orden)}>
            {ORDENES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.texto}
              </option>
            ))}
          </select>
        </div>
      </div>

      <MensajeError error={clientes.error} onReintentar={clientes.recargar} />
      {clientes.cargando && !clientes.datos && <Cargando texto="Cargando clientas…" />}

      {clientes.datos &&
        (lista.length === 0 ? (
          q ? (
            <Vacio titulo={`No encontramos a nadie con “${q}”`}>
              <p className="adm-sin-margen">Revisa cómo lo escribiste o regístrala como clienta nueva.</p>
              <button type="button" className="btn btn-secundario btn-sm adm-cl-vacio-boton" onClick={() => setNueva(true)}>
                + Registrar a “{q}”
              </button>
            </Vacio>
          ) : (
            <Vacio titulo="Aún no hay clientas">Las clientas que crean su cuenta o que registras aquí aparecerán en esta lista.</Vacio>
          )
        ) : (
          <div className={clientes.cargando || escribiendo ? 'adm-cl-recargando' : ''}>
            <p className="ayuda adm-cl-conteo" aria-live="polite">
              {lista.length} {lista.length === 1 ? 'clienta' : 'clientas'}
              {q ? ` para “${q}”` : ''}
            </p>
            <div className="tabla-envoltura adm-clientas-envoltura">
              <table className="tabla adm-cl-tabla adm-clientas-adaptable">
                <thead>
                  <tr>
                    <th>Clienta</th>
                    <th>WhatsApp</th>
                    <th>Cuenta en línea</th>
                    <th className="num">Citas completadas</th>
                    <th>Última visita</th>
                    <th>Próxima cita</th>
                    <th className="num">Total pagado</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id}>
                      <td className="adm-cl-col-nombre adm-clientas-celda-titulo">
                        <Link to={`/admin/clientes/${c.id}`} className="adm-cl-nombre">
                          {nombreCompleto(c)}
                        </Link>
                        <span className="adm-sub adm-cl-correo">{c.email ?? 'Sin correo'}</span>
                      </td>
                      <td data-etiqueta="WhatsApp">
                        <ClientasWhatsApp telefono={c.telefono} mensaje={`Hola, ${c.nombre.split(' ')[0]}. Te escribimos de Ópalo.`} compacto />
                      </td>
                      <td data-etiqueta="Cuenta en línea">
                        <ClientasPillCuenta tiene={c.tiene_cuenta} />
                      </td>
                      <td className="num" data-etiqueta="Citas completadas">
                        {c.citas_completadas}
                      </td>
                      <td className="adm-nowrap" data-etiqueta="Última visita">{c.ultima_visita ? <span className="num">{fechaCorta(c.ultima_visita)}</span> : <span className="texto-3">Sin visitas</span>}</td>
                      <td className="adm-nowrap" data-etiqueta="Próxima cita">
                        {c.proxima_cita ? (
                          <Link to={`/admin/agenda?fecha=${fechaLocal(new Date(c.proxima_cita))}`} className="num">
                            {fechaCorta(c.proxima_cita)} · {hora(c.proxima_cita)}
                          </Link>
                        ) : (
                          <span className="texto-3">—</span>
                        )}
                      </td>
                      <td className="num adm-nowrap" data-etiqueta="Total pagado">
                        {dinero(c.total_pagado)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {nueva && (
        <Modal titulo="Nueva clienta" ancho="amplio" onCerrar={() => setNueva(false)}>
          <p className="ayuda adm-cl-ayuda-modal">
            Para clientas que agendan por WhatsApp, teléfono o en mostrador: no necesitan cuenta en línea. Al guardar, abrimos su expediente.
          </p>
          <FormCliente
            inicial={q}
            formId="cl-nueva"
            onCancelar={() => setNueva(false)}
            onCreada={(id) => {
              setNueva(false);
              navegar(`/admin/clientes/${id}`, { state: { creada: true } });
            }}
          />
        </Modal>
      )}
    </div>
  );
}
