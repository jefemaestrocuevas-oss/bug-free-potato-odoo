// Alta de clienta sin cuenta (las que agendan por WhatsApp, teléfono o mostrador).
import { useState, type FormEvent } from 'react';
import { api, type NuevoCliente } from '../../lib/api';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { textoONulo } from './util';

interface Props {
  /** Nombre o teléfono que ya se había escrito en la búsqueda. */
  inicial?: string;
  onCreada: (id: string, datos: NuevoCliente) => void;
  onCancelar?: () => void;
  /** id del formulario (para un botón de envío fuera, p. ej. en el pie de un modal). */
  formId?: string;
  /** Muestra sus propios botones. */
  conBotones?: boolean;
  /** Pide notas internas. */
  conNotas?: boolean;
}

export function FormCliente({ inicial = '', onCreada, onCancelar, formId = 'form-cliente', conBotones = true, conNotas = true }: Props) {
  const pareceTelefono = /^[\d\s()+-]{7,}$/.test(inicial.trim());
  const [nombre, setNombre] = useState(pareceTelefono ? '' : inicial.trim().split(' ')[0] ?? '');
  const [apellidos, setApellidos] = useState(pareceTelefono ? '' : inicial.trim().split(' ').slice(1).join(' '));
  const [telefono, setTelefono] = useState(pareceTelefono ? inicial.trim() : '');
  const [email, setEmail] = useState('');
  const [nacimiento, setNacimiento] = useState('');
  const [notas, setNotas] = useState('');
  const { ejecutar, enviando, error } = useAccion(async () => {
    const datos: NuevoCliente = {
      nombre: nombre.trim(),
      apellidos: textoONulo(apellidos),
      telefono: textoONulo(telefono),
      email: textoONulo(email)?.toLowerCase() ?? null,
      fecha_nacimiento: textoONulo(nacimiento),
      notas_internas: conNotas ? textoONulo(notas) : null,
    };
    const id = await api.admin.crearCliente(datos);
    return { id, datos };
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = await ejecutar();
    if (r) onCreada(r.id, r.datos);
  };

  return (
    <form id={formId} onSubmit={enviar} className="adm-form-cliente">
      <div className="adm-form-2">
        <div className="campo">
          <label className="etiqueta" htmlFor={`${formId}-nombre`}>
            Nombre
          </label>
          <input id={`${formId}-nombre`} className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="off" />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor={`${formId}-apellidos`}>
            Apellidos
          </label>
          <input id={`${formId}-apellidos`} className="input" value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="off" />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor={`${formId}-tel`}>
            Teléfono (WhatsApp)
          </label>
          <input id={`${formId}-tel`} className="input" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="442 000 0000" />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor={`${formId}-email`}>
            Correo (opcional)
          </label>
          <input id={`${formId}-email`} className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <span className="ayuda">Si después crea su cuenta con este correo, su historial se vincula solo.</span>
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor={`${formId}-nac`}>
            Fecha de nacimiento (opcional)
          </label>
          <input id={`${formId}-nac`} className="input" type="date" value={nacimiento} onChange={(e) => setNacimiento(e.target.value)} />
          <span className="ayuda">Atendemos a partir de los 15 años; las menores de 18 vienen con mamá, papá o tutor.</span>
        </div>
      </div>
      {conNotas && (
        <div className="campo">
          <label className="etiqueta" htmlFor={`${formId}-notas`}>
            Notas internas (opcional)
          </label>
          <textarea id={`${formId}-notas`} className="input" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Sólo las ve el equipo." />
        </div>
      )}
      <MensajeError error={error} />
      {conBotones && (
        <div className="fila adm-fila-fin">
          {onCancelar && (
            <button type="button" className="btn btn-texto" onClick={onCancelar} disabled={enviando}>
              Cancelar
            </button>
          )}
          <button type="submit" className="btn btn-primario" disabled={enviando || !nombre.trim()}>
            {enviando ? 'Guardando…' : 'Guardar clienta'}
          </button>
        </div>
      )}
    </form>
  );
}
