// Mis datos: nombre, apellidos, teléfono, fecha de nacimiento, promociones; cerrar sesión.
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Cliente } from '../../lib/api/tipos';
import { fechaLocal, mensajeError, telefonoBonito } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { errorFechaNacimiento, normalizarTelefono, telefonoValido } from '../reserva/utilidades';

type Campo = 'nombre' | 'telefono' | 'fecha_nacimiento';

export function SeccionDatos() {
  const { sesion, refrescar } = useSesion();
  const navigate = useNavigate();
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    try {
      await api.cerrarSesion();
    } finally {
      setSaliendo(false);
      navigate('/', { replace: true });
    }
  }

  return (
    <div className="cu-seccion">
      <h2 className="cu-h2">Mis datos</h2>
      {sesion?.cliente ? (
        <FormularioDatos key={sesion.cliente.id} cliente={sesion.cliente} email={sesion.email} refrescar={refrescar} />
      ) : (
        <p className="aviso aviso-info">Esta cuenta no tiene datos de clienta. Si eres parte del equipo, tus datos se editan en el panel interno.</p>
      )}

      <section className="cu-tarjeta cu-salir" aria-labelledby="cu-salir-titulo">
        <h3 className="cu-cita-titulo" id="cu-salir-titulo">
          Cerrar sesión
        </h3>
        <p className="ayuda cu-sin-margen">
          {sesion?.email ? <>Entraste como <strong>{sesion.email}</strong>. </> : null}
          Si usas una computadora compartida, cierra tu sesión al terminar.
        </p>
        <div className="cu-acciones">
          <button type="button" className="btn btn-secundario" onClick={() => void salir()} disabled={saliendo}>
            {saliendo ? 'Cerrando sesión…' : 'Cerrar sesión'}
          </button>
        </div>
      </section>
    </div>
  );
}

function FormularioDatos({ cliente: c, email, refrescar }: { cliente: Cliente; email: string | null; refrescar: () => Promise<void> }) {
  const [nombre, setNombre] = useState(c.nombre ?? '');
  const [apellidos, setApellidos] = useState(c.apellidos ?? '');
  const [telefono, setTelefono] = useState(c.telefono ? telefonoBonito(c.telefono) : '');
  const [nacimiento, setNacimiento] = useState(c.fecha_nacimiento ?? '');
  const [promos, setPromos] = useState(c.acepta_promociones);
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hoy = fechaLocal();

  async function guardar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const errs: Partial<Record<Campo, string>> = {};
    if (!nombre.trim()) errs.nombre = 'Escribe tu nombre.';
    if (telefono.trim() && !telefonoValido(telefono)) errs.telefono = 'Escribe tu celular a 10 dígitos, por ejemplo 442 123 4567.';
    if (nacimiento) {
      const ef = errorFechaNacimiento(nacimiento, hoy);
      if (ef) errs.fecha_nacimiento = ef;
    }
    setErrores(errs);
    const primero = (Object.keys(errs) as Campo[])[0];
    if (primero) {
      formRef.current?.querySelector<HTMLInputElement>(`#cu-dato-${primero}`)?.focus();
      return;
    }
    setEnviando(true);
    try {
      await api.actualizarMisDatos({
        nombre: nombre.trim(),
        apellidos: apellidos.trim() || null,
        telefono: telefono.trim() ? normalizarTelefono(telefono) : null,
        fecha_nacimiento: nacimiento || null,
        acepta_promociones: promos,
      });
      await refrescar();
      setExito('Guardamos tus datos.');
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  const props = (campo: Campo) => ({
    id: `cu-dato-${campo}`,
    'aria-invalid': errores[campo] ? true : undefined,
    'aria-describedby': errores[campo] ? `cu-dato-${campo}-error` : undefined,
  });
  const errorDe = (campo: Campo) =>
    errores[campo] ? (
      <span className="rv-campo-error" id={`cu-dato-${campo}-error`}>
        {errores[campo]}
      </span>
    ) : null;

  return (
    <form ref={formRef} className="cu-tarjeta cu-form" onSubmit={guardar} noValidate>
      <div className="rv-campos-2">
        <div className="campo">
          <label className="etiqueta" htmlFor="cu-dato-nombre">
            Nombre
          </label>
          <input className="input" {...props('nombre')} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" />
          {errorDe('nombre')}
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="cu-dato-apellidos">
            Apellidos
          </label>
          <input id="cu-dato-apellidos" className="input" value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="family-name" />
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="cu-dato-telefono">
            Celular (WhatsApp)
          </label>
          <input
            className="input"
            {...props('telefono')}
            type="tel"
            inputMode="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            autoComplete="tel-national"
            placeholder="442 123 4567"
          />
          {errorDe('telefono')}
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="cu-dato-fecha_nacimiento">
            Fecha de nacimiento
          </label>
          <input
            className="input"
            {...props('fecha_nacimiento')}
            type="date"
            max={hoy}
            value={nacimiento}
            onChange={(e) => setNacimiento(e.target.value)}
            autoComplete="bday"
          />
          {errorDe('fecha_nacimiento')}
        </div>
      </div>
      <div className="campo">
        <span className="etiqueta">Correo</span>
        <span className="cu-dato-fijo">{email ?? c.email ?? '—'}</span>
        <span className="ayuda">Es el correo con el que entras; no se puede cambiar desde aquí.</span>
      </div>
      <label className="check cu-promos">
        <input type="checkbox" checked={promos} onChange={(e) => setPromos(e.target.checked)} />
        <span>Quiero recibir promociones y novedades de Ópalo (puedes darte de baja cuando quieras).</span>
      </label>

      {error && (
        <p className="aviso aviso-error" role="alert">
          {error}
        </p>
      )}
      {exito && (
        <p className="aviso aviso-exito" role="status">
          {exito}
        </p>
      )}
      <div className="cu-acciones">
        <button type="submit" className="btn btn-primario" disabled={enviando}>
          {enviando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}
