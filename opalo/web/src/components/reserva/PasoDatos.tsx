// Paso 3: sesión y datos de la clienta (nombre, teléfono, fecha de nacimiento) + validación de edad.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Configuracion, Sesion } from '../../lib/api/tipos';
import { edad, enlaceWhatsApp, fechaLocal, mensajeError, telefonoBonito } from '../../lib/format';
import { Aviso } from '../ui/Estado';
import { FechaNacimientoFija, PieAsistente } from './Piezas';
import { errorFechaNacimiento, normalizarTelefono, telefonoValido } from './utilidades';

interface Props {
  config: Configuracion;
  sesion: Sesion | null;
  refrescar: () => Promise<void>;
  onAtras: () => void;
  onListo: () => void;
}

type Campo = 'nombre' | 'telefono' | 'fecha_nacimiento';

/** Límite de la base (ESPEC §5.1): citas próximas activas (pendiente o confirmada) por clienta. */
const MAX_CITAS_PROXIMAS = 3;

/** Cuántas citas próximas activas tiene la clienta (null mientras carga o si no se pudo saber). */
function useCitasProximas(usuario: string): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let vivo = true;
    api
      .getMisCitas()
      .then((citas) => {
        const ahora = Date.now();
        if (vivo) setN(citas.filter((c) => (c.estado === 'pendiente' || c.estado === 'confirmada') && new Date(c.inicio).getTime() > ahora).length);
      })
      .catch(() => vivo && setN(null)); // El servidor vuelve a revisar al reservar.
    return () => {
      vivo = false;
    };
  }, [usuario]);
  return n;
}

export function PasoDatos({ config, sesion, refrescar, onAtras, onListo }: Props) {
  const volver = `/entrar?volver=${encodeURIComponent('/reservar')}`;

  if (!sesion) {
    return (
      <div className="rv-paso-cuerpo">
        <div className="tarjeta-plana rv-acceso">
          <h3 className="rv-subtitulo">Para reservar necesitas tu cuenta</h3>
          <p className="texto-2">
            {config.firma_en_linea
              ? 'Con tu cuenta guardamos tu ficha de salud y tus firmas de forma segura, y puedes ver o cancelar tus citas cuando quieras.'
              : 'Con tu cuenta guardamos tu ficha de salud de forma segura, y puedes ver o cancelar tus citas cuando quieras.'}{' '}
            Lo que ya elegiste se queda guardado: al terminar regresas justo aquí.
          </p>
          <div className="fila">
            <Link className="btn btn-primario" to={volver}>
              Iniciar sesión
            </Link>
            <Link className="btn btn-secundario" to={`${volver}&modo=registro`}>
              Crear mi cuenta
            </Link>
          </div>
        </div>
        <PieAsistente onAtras={onAtras} />
      </div>
    );
  }

  if (!sesion.cliente) {
    return (
      <div className="rv-paso-cuerpo">
        <Aviso tipo="alerta">
          <span>
            Esta cuenta es del equipo de Ópalo y no tiene expediente de clienta. Para agendar a una clienta usa la agenda del{' '}
            <Link to="/admin/agenda">panel interno</Link>, o entra con la cuenta de la clienta.
          </span>
        </Aviso>
        <PieAsistente onAtras={onAtras} />
      </div>
    );
  }

  return <FormularioDatos key={sesion.user_id} config={config} sesion={sesion} refrescar={refrescar} onAtras={onAtras} onListo={onListo} />;
}

function FormularioDatos({ config, sesion, refrescar, onAtras, onListo }: Props & { sesion: Sesion }) {
  const c = sesion.cliente!;
  // Ya registrada: no se cambia desde aquí (la corrige el equipo; la base la rechaza).
  const fechaFija = c.fecha_nacimiento;
  const [nombre, setNombre] = useState(c.nombre ?? '');
  const [apellidos, setApellidos] = useState(c.apellidos ?? '');
  const [telefono, setTelefono] = useState(c.telefono ? telefonoBonito(c.telefono) : '');
  const [nacimiento, setNacimiento] = useState(c.fecha_nacimiento ?? '');
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const proximas = useCitasProximas(sesion.user_id);
  const sinLugar = proximas !== null && proximas >= MAX_CITAS_PROXIMAS;

  const hoy = fechaLocal();
  const fechaUsada = fechaFija ?? nacimiento;
  const fechaOk = !errorFechaNacimiento(fechaUsada, hoy);
  const anios = fechaOk ? edad(fechaUsada, hoy) : null;
  const muyJoven = anios !== null && anios < config.edad_minima;
  const menor = anios !== null && !muyJoven && anios < config.edad_mayoria;

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    const errs: Partial<Record<Campo, string>> = {};
    if (!nombre.trim()) errs.nombre = 'Escribe tu nombre.';
    if (!telefonoValido(telefono)) errs.telefono = 'Escribe tu celular a 10 dígitos, por ejemplo 442 123 4567.';
    if (!fechaFija) {
      const ef = errorFechaNacimiento(nacimiento, hoy);
      if (ef) errs.fecha_nacimiento = ef;
    }
    setErrores(errs);
    const primero = (Object.keys(errs) as Campo[])[0];
    if (primero) {
      formRef.current?.querySelector<HTMLInputElement>(`#rv-dato-${primero}`)?.focus();
      return;
    }
    if (sinLugar) {
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    if (muyJoven) {
      setError(`Atendemos a partir de los ${config.edad_minima} años.`);
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const tel = normalizarTelefono(telefono);
    const cambio =
      nombre.trim() !== (c.nombre ?? '') ||
      (apellidos.trim() || null) !== (c.apellidos || null) ||
      tel !== normalizarTelefono(c.telefono ?? '') ||
      (!fechaFija && nacimiento !== '');
    setEnviando(true);
    try {
      if (cambio) {
        await api.actualizarMisDatos({
          nombre: nombre.trim(),
          apellidos: apellidos.trim() || null,
          telefono: tel,
          // Si ya estaba registrada se manda la misma (nunca otra).
          fecha_nacimiento: fechaFija ?? nacimiento,
          acepta_promociones: c.acepta_promociones,
        });
        await refrescar();
      }
      onListo();
    } catch (err) {
      const msg = mensajeError(err);
      setError(msg);
      // Alguien del equipo ya la registró: recargamos la sesión para mostrarla como dato fijo.
      if (msg.startsWith('Tu fecha de nacimiento ya está registrada')) await refrescar().catch(() => {});
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setEnviando(false);
    }
  }

  const props = (campo: Campo) => ({
    id: `rv-dato-${campo}`,
    'aria-invalid': errores[campo] ? true : undefined,
    'aria-describedby':
      campo === 'fecha_nacimiento'
        ? [errores[campo] ? `rv-dato-${campo}-error` : null, 'rv-dato-fecha-ayuda'].filter(Boolean).join(' ')
        : errores[campo]
          ? `rv-dato-${campo}-error`
          : undefined,
  });
  const errorDe = (campo: Campo) =>
    errores[campo] ? (
      <span className="rv-campo-error" id={`rv-dato-${campo}-error`}>
        {errores[campo]}
      </span>
    ) : null;

  return (
    <div className="rv-paso-cuerpo">
      <p className="texto-2">
        Reservas como <strong>{sesion.email}</strong>. Revisa que tus datos estén bien: así te confirmamos por WhatsApp.
      </p>
      <form ref={formRef} onSubmit={enviar} noValidate className="rv-form-datos">
        <div className="rv-campos-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="rv-dato-nombre">
              Nombre
            </label>
            <input className="input" {...props('nombre')} value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="given-name" required />
            {errorDe('nombre')}
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="rv-dato-apellidos">
              Apellidos
            </label>
            <input id="rv-dato-apellidos" className="input" value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="family-name" />
          </div>
        </div>
        <div className="rv-campos-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="rv-dato-telefono">
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
              required
            />
            {errorDe('telefono')}
          </div>
          {fechaFija ? (
            <FechaNacimientoFija id="rv-dato-fecha_nacimiento" fecha={fechaFija} telefono={config.telefono_whatsapp} />
          ) : (
            <div className="campo">
              <label className="etiqueta" htmlFor="rv-dato-fecha_nacimiento">
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
                required
              />
              {errorDe('fecha_nacimiento')}
              <span className="ayuda" id="rv-dato-fecha-ayuda">
                Es obligatoria para reservar: atendemos a partir de los {config.edad_minima} años y, si eres menor de {config.edad_mayoria}, tu
                mamá, papá o tutor {config.firma_en_linea ? 'firma contigo' : 'te acompaña a tu cita'}. Revísala bien: una vez guardada, sólo el
                equipo puede corregirla.
              </span>
            </div>
          )}
        </div>

        {muyJoven && (
          <Aviso tipo="alerta">
            <span>
              Atendemos a partir de los {config.edad_minima} años, así que no podemos agendar esta cita en línea. Si tienes dudas,{' '}
              <a href={enlaceWhatsApp(config.telefono_whatsapp, 'Hola, Ópalo. Tengo una duda sobre la edad para agendar.')} target="_blank" rel="noopener noreferrer">
                escríbenos por WhatsApp
              </a>
              .
            </span>
          </Aviso>
        )}
        {menor && (
          <Aviso tipo="info">
            <span>
              Como tienes menos de {config.edad_mayoria} años, tu mamá, papá o tutor debe acompañarte a la cita
              {config.firma_en_linea
                ? ' y escribir su nombre cuando firmes el consentimiento.'
                : '. Antes de confirmar te pedimos su nombre.'}
            </span>
          </Aviso>
        )}
        {/* Enviar con Enter */}
        <button type="submit" hidden tabIndex={-1} aria-hidden="true" />
      </form>

      {sinLugar ? (
        <div className="aviso aviso-alerta rv-error" role="alert" tabIndex={-1} ref={errorRef}>
          <span>
            Ya tienes {proximas} citas próximas; para agendar otra escríbenos por WhatsApp al {telefonoBonito(config.telefono_whatsapp)}.{' '}
            <a href={enlaceWhatsApp(config.telefono_whatsapp, 'Hola, Ópalo. Quiero agendar otra cita.')} target="_blank" rel="noopener noreferrer">
              Escribir por WhatsApp<span className="sr-only"> (se abre en otra pestaña)</span>
            </a>{' '}
            · <Link to="/cuenta/citas">Ver mis citas</Link>
          </span>
        </div>
      ) : (
        error && (
          <div className="aviso aviso-error rv-error" role="alert" tabIndex={-1} ref={errorRef}>
            {error}
          </div>
        )
      )}

      <PieAsistente onAtras={onAtras} onContinuar={() => void enviar()} enviando={enviando} deshabilitado={muyJoven || sinLugar} />
    </div>
  );
}
