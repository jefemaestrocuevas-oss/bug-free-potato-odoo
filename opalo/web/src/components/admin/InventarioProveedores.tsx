// Pestaña "Proveedores": directorio de a quién se le compra, con alta y edición.
import { useState, type FormEvent } from 'react';
import { api, type Producto, type Proveedor } from '../../lib/api';
import { enlaceWhatsApp, telefonoBonito } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError, Vacio } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { porTexto, textoONulo } from './util';

type ProveedorEditable = Omit<Proveedor, 'id'> & { id?: string };

function FormProveedor({ proveedor, onCerrar, onGuardado }: { proveedor: Proveedor | null; onCerrar: () => void; onGuardado: (p: Proveedor, nuevo: boolean) => void }) {
  const [nombre, setNombre] = useState(proveedor?.nombre ?? '');
  const [contacto, setContacto] = useState(proveedor?.contacto ?? '');
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '');
  const [email, setEmail] = useState(proveedor?.email ?? '');
  const [ciudad, setCiudad] = useState(proveedor?.ciudad ?? '');
  const [notas, setNotas] = useState(proveedor?.notas ?? '');
  const [activo, setActivo] = useState(proveedor?.activo ?? true);
  const [intentado, setIntentado] = useState(false);

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (!nombre.trim()) throw new Error('Escribe el nombre del proveedor.');
    const correo = textoONulo(email);
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new Error('Revisa el correo: parece incompleto.');
    const tel = textoONulo(telefono);
    if (tel && tel.replace(/\D/g, '').length < 10) throw new Error('El teléfono debe tener al menos 10 dígitos.');
    const datos: ProveedorEditable = {
      id: proveedor?.id,
      nombre: nombre.trim(),
      contacto: textoONulo(contacto),
      telefono: tel,
      email: correo,
      ciudad: textoONulo(ciudad),
      notas: textoONulo(notas),
      activo,
    };
    return api.admin.guardarProveedor(datos);
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    const r = await ejecutar();
    if (r) onGuardado(r, !proveedor);
  };

  return (
    <Modal
      titulo={proveedor ? `Editar ${proveedor.nombre}` : 'Nuevo proveedor'}
      onCerrar={onCerrar}
      bloqueado={enviando}
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="inv-form-proveedor" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : proveedor ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
        </>
      }
    >
      <form id="inv-form-proveedor" onSubmit={enviar} noValidate>
        <div className="campo">
          <label className="etiqueta" htmlFor="prov-nombre">
            Nombre
          </label>
          <input
            id="prov-nombre"
            className="input"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            aria-invalid={intentado && !nombre.trim() ? true : undefined}
            placeholder="Distribuidora, tienda o marca"
          />
        </div>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="prov-contacto">
              Persona de contacto (opcional)
            </label>
            <input id="prov-contacto" className="input" value={contacto} onChange={(e) => setContacto(e.target.value)} />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="prov-telefono">
              Teléfono o WhatsApp (opcional)
            </label>
            <input id="prov-telefono" className="input" type="tel" inputMode="tel" autoComplete="off" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="442 000 0000" />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="prov-email">
              Correo (opcional)
            </label>
            <input id="prov-email" className="input" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="prov-ciudad">
              Ciudad (opcional)
            </label>
            <input id="prov-ciudad" className="input" value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Querétaro" />
          </div>
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="prov-notas">
            Notas (opcional)
          </label>
          <textarea id="prov-notas" className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Días de entrega, pedido mínimo, cómo se le paga…" />
        </div>
        <Casilla etiqueta="Proveedor activo" checked={activo} onChange={setActivo} ayuda="Los inactivos no aparecen al registrar compras, pero se conserva su historial." />
        <MensajeError error={error} />
      </form>
    </Modal>
  );
}

export function InventarioProveedores({ proveedores, productos, onCambio }: { proveedores: Proveedor[]; productos: Producto[]; onCambio: (mensaje: string) => void }) {
  const [editando, setEditando] = useState<Proveedor | 'nuevo' | null>(null);
  const cuenta = new Map<string, number>();
  for (const p of productos) if (p.proveedor_id && p.activo) cuenta.set(p.proveedor_id, (cuenta.get(p.proveedor_id) ?? 0) + 1);
  const lista = [...proveedores].sort((a, b) => Number(b.activo) - Number(a.activo) || porTexto<Proveedor>((x) => x.nombre)(a, b));

  return (
    <>
      <div className="entre inv-barra">
        <p className="texto-2 adm-sin-margen">A quién le compras. Al asignar un proveedor a cada producto, la lista de reposición se agrupa por proveedor.</p>
        <button type="button" className="btn btn-primario" onClick={() => setEditando('nuevo')}>
          + Nuevo proveedor
        </button>
      </div>

      {lista.length === 0 ? (
        <Vacio titulo="Aún no hay proveedores">Da de alta a tus distribuidoras para agrupar la lista de compras y registrar compras más rápido.</Vacio>
      ) : (
        <div className="tabla-envoltura">
          <table className="tabla inv-tabla inv-tabla-tarjetas">
            <caption className="sr-only">Proveedores</caption>
            <thead>
              <tr>
                <th scope="col">Proveedor</th>
                <th scope="col">Contacto</th>
                <th scope="col">Teléfono</th>
                <th scope="col">Correo</th>
                <th scope="col">Ciudad</th>
                <th scope="col" className="num">
                  Productos
                </th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={p.activo ? '' : 'inv-inactivo'}>
                  <td className="inv-celda-titulo">
                    <span className="inv-nombre">{p.nombre}</span>
                    {!p.activo && (
                      <span className="inv-pills">
                        <span className="pill pill-gris">Inactivo</span>
                      </span>
                    )}
                    {p.notas && <span className="adm-sub">{p.notas}</span>}
                  </td>
                  <td data-etiqueta="Contacto">{p.contacto ?? <span className="texto-3">—</span>}</td>
                  <td data-etiqueta="Teléfono" className="adm-nowrap">
                    {p.telefono ? (
                      <a href={enlaceWhatsApp(p.telefono)} target="_blank" rel="noreferrer" title="Abrir WhatsApp">
                        {telefonoBonito(p.telefono)}
                      </a>
                    ) : (
                      <span className="texto-3">—</span>
                    )}
                  </td>
                  <td data-etiqueta="Correo" className="inv-celda-correo">
                    {p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : <span className="texto-3">—</span>}
                  </td>
                  <td data-etiqueta="Ciudad">{p.ciudad ?? <span className="texto-3">—</span>}</td>
                  <td data-etiqueta="Productos" className="num">
                    {cuenta.get(p.id) ?? 0}
                  </td>
                  <td className="adm-celda-acciones inv-celda-acciones">
                    <button type="button" className="btn btn-texto btn-sm" onClick={() => setEditando(p)} aria-label={`Editar ${p.nombre}`}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <FormProveedor
          proveedor={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(p, nuevo) => {
            setEditando(null);
            onCambio(nuevo ? `Proveedor “${p.nombre}” creado.` : `Cambios de “${p.nombre}” guardados.`);
          }}
        />
      )}
    </>
  );
}
