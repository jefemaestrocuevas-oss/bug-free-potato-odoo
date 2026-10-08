// /entrar — Entrar / Crear cuenta / Olvidé mi contraseña. Respeta ?volver= (sólo rutas internas).
// En modo demostración ofrece entrar con las cuentas de ejemplo.
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { CUENTAS_DEMO } from '../../lib/api/cuentasDemo';
import type { Rol, Sesion } from '../../lib/api/tipos';
import { edad, fechaLocal, mensajeError } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { useAsync } from '../../lib/useAsync';
import { Cargando } from '../../components/ui/Estado';
import { emailValido, errorFechaNacimiento, normalizarTelefono, telefonoValido, volverSeguro } from '../../components/reserva/utilidades';
import '../../components/reserva/reserva.css';
import './cuenta.css';

type Modo = 'entrar' | 'registro' | 'recuperar';

// "Olvidé mi contraseña" no es pestaña (no cabía en el celular): se abre con el enlace bajo el formulario.
const PESTANAS: { modo: Modo; texto: string }[] = [
  { modo: 'entrar', texto: 'Entrar' },
  { modo: 'registro', texto: 'Crear cuenta' },
];

const PASSWORD_MIN = 8;

const DESCRIPCION_DEMO: Record<Rol, string> = {
  cliente: 'Prueba el sitio como clienta: haz una reserva completa y revisa tus citas, pedidos, servicios prepagados y documentos firmados.',
  personal: 'Entra al panel interno como especialista: agenda, clientas y sus fichas, pedidos y pagos, inventario y costos.',
  admin: 'Todo lo del personal, más gastos, resultados del mes, catálogo y precios, equipo y políticas.',
};

function destinoPorRol(s: Pick<Sesion, 'rol'> | null): string {
  return s && (s.rol === 'personal' || s.rol === 'admin') ? '/admin' : '/cuenta';
}

export default function Entrar() {
  const { sesion, cargando } = useSesion();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const volver = volverSeguro(params.get('volver'));
  const modoParam = params.get('modo');
  const modo: Modo = modoParam === 'registro' || modoParam === 'recuperar' ? modoParam : 'entrar';
  const [correoPendiente, setCorreoPendiente] = useState<string | null>(null);
  const [emailInicial, setEmailInicial] = useState('');
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.title;
    document.title = 'Entrar · Ópalo Spa';
    return () => {
      document.title = anterior;
    };
  }, []);

  function cambiarModo(m: Modo, enfocar = false) {
    const p = new URLSearchParams(params);
    if (m === 'entrar') p.delete('modo');
    else p.set('modo', m);
    setParams(p, { replace: true });
    if (enfocar) requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLButtonElement>(`#tab-${m}`)?.focus());
  }

  function alTeclearTabs(e: KeyboardEvent<HTMLDivElement>) {
    const i = PESTANAS.findIndex((t) => t.modo === modo);
    let j: number | null = null;
    if (e.key === 'ArrowRight') j = (i + 1) % PESTANAS.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + PESTANAS.length) % PESTANAS.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = PESTANAS.length - 1;
    if (j === null) return;
    e.preventDefault();
    cambiarModo(PESTANAS[j].modo, true);
  }

  const irDespues = (s: Sesion | null) => navigate(volver ?? destinoPorRol(s), { replace: true });

  if (cargando) return <Cargando />;
  if (sesion && !correoPendiente) return <Navigate to={volver ?? destinoPorRol(sesion)} replace />;

  const vieneDeReserva = volver?.startsWith('/reservar');

  return (
    <div className="cu">
      <header className="cu-cabeza">
        <div className="contenedor">
          <p className="eyebrow">Tu cuenta Ópalo</p>
          <h1 className="cu-titulo">{modo === 'registro' ? 'Crea tu cuenta' : modo === 'recuperar' ? 'Recupera tu acceso' : 'Qué gusto verte'}</h1>
          <p className="texto-2 cu-intro">
            {vieneDeReserva
              ? 'Entra o crea tu cuenta para terminar tu reserva. Lo que ya elegiste se queda guardado.'
              : 'Con tu cuenta reservas en línea, ves tus citas y guardas tu ficha de salud de forma segura.'}
          </p>
        </div>
      </header>

      <div className="contenedor cu-contenido cu-entrar">
        <div className="cu-entrar-caja">
          {correoPendiente ? (
            <ConfirmaCorreo
              correo={correoPendiente}
              onEntrar={() => {
                setEmailInicial(correoPendiente);
                setCorreoPendiente(null);
                cambiarModo('entrar');
              }}
            />
          ) : modo === 'recuperar' ? (
            <div className="cu-entrar-panel">
              <FormRecuperar onVolver={() => cambiarModo('entrar', true)} />
            </div>
          ) : (
            <>
              <div className="pestanas cu-entrar-pestanas" role="tablist" aria-label="Opciones de acceso" ref={tabsRef} onKeyDown={alTeclearTabs}>
                {PESTANAS.map((t) => (
                  <button
                    key={t.modo}
                    id={`tab-${t.modo}`}
                    type="button"
                    role="tab"
                    className="pestana"
                    aria-selected={modo === t.modo}
                    aria-controls={`panel-${t.modo}`}
                    tabIndex={modo === t.modo ? 0 : -1}
                    onClick={() => cambiarModo(t.modo)}
                  >
                    {t.texto}
                  </button>
                ))}
              </div>
              <div role="tabpanel" id={`panel-${modo}`} aria-labelledby={`tab-${modo}`} className="cu-entrar-panel">
                {modo === 'entrar' && (
                  <FormEntrar
                    key={emailInicial}
                    emailInicial={emailInicial}
                    onListo={irDespues}
                    onOlvide={() => {
                      cambiarModo('recuperar');
                      requestAnimationFrame(() => document.getElementById('rc-email')?.focus());
                    }}
                  />
                )}
                {modo === 'registro' && (
                  <FormRegistro
                    onListo={irDespues}
                    onConfirmarCorreo={(c) => setCorreoPendiente(c)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {api.modo === 'demo' && !correoPendiente && <CuentasDemo onListo={irDespues} />}
      </div>
    </div>
  );
}

// ---------------- Piezas de formulario ----------------

function CampoTexto({
  id,
  etiqueta,
  error,
  ayuda,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="campo">
      <label className="etiqueta" htmlFor={id}>
        {etiqueta}
      </label>
      {children}
      {error ? (
        <span className="rv-campo-error" id={`${id}-error`}>
          {error}
        </span>
      ) : ayuda ? (
        <span className="ayuda" id={`${id}-ayuda`}>
          {ayuda}
        </span>
      ) : null}
    </div>
  );
}

function aria(id: string, error?: string, conAyuda = false) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : conAyuda ? `${id}-ayuda` : undefined,
  };
}

function InputPassword({
  id,
  valor,
  onCambio,
  autoComplete,
  error,
  conAyuda = false,
}: {
  id: string;
  valor: string;
  onCambio: (v: string) => void;
  autoComplete: string;
  error?: string;
  conAyuda?: boolean;
}) {
  const [ver, setVer] = useState(false);
  return (
    <div className="cu-password">
      <input
        className="input"
        {...aria(id, error, conAyuda)}
        type={ver ? 'text' : 'password'}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        autoComplete={autoComplete}
      />
      <button type="button" className="btn btn-texto btn-sm cu-password-ver" onClick={() => setVer((v) => !v)} aria-pressed={ver} aria-controls={id}>
        {ver ? 'Ocultar' : 'Mostrar'}
        <span className="sr-only"> contraseña</span>
      </button>
    </div>
  );
}

function enfocarPrimerError(form: HTMLFormElement | null, errores: Record<string, string | undefined>, prefijo: string) {
  const primero = Object.keys(errores).find((k) => errores[k]);
  if (primero) form?.querySelector<HTMLElement>(`#${prefijo}-${primero}`)?.focus();
}

// ---------------- Entrar ----------------

function FormEntrar({ emailInicial, onListo, onOlvide }: { emailInicial: string; onListo: (s: Sesion) => void; onOlvide: () => void }) {
  const [email, setEmail] = useState(emailInicial);
  const [password, setPassword] = useState('');
  const [errores, setErrores] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs = {
      email: emailValido(email) ? undefined : 'Escribe un correo electrónico válido.',
      password: password ? undefined : 'Escribe tu contraseña.',
    };
    setErrores(errs);
    if (errs.email || errs.password) {
      enfocarPrimerError(formRef.current, errs, 'en');
      return;
    }
    setEnviando(true);
    try {
      const s = await api.iniciarSesion(email.trim(), password);
      onListo(s);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={enviar} noValidate className="cu-form-acceso">
      <CampoTexto id="en-email" etiqueta="Correo electrónico" error={errores.email}>
        <input
          className="input"
          {...aria('en-email', errores.email)}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </CampoTexto>
      <CampoTexto id="en-password" etiqueta="Contraseña" error={errores.password}>
        <InputPassword id="en-password" valor={password} onCambio={setPassword} autoComplete="current-password" error={errores.password} />
      </CampoTexto>
      {error && (
        <p className="aviso aviso-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
        {enviando ? 'Entrando…' : 'Entrar'}
      </button>
      <button type="button" className="btn btn-texto btn-bloque cu-olvide" onClick={onOlvide}>
        Olvidé mi contraseña
      </button>
    </form>
  );
}

// ---------------- Crear cuenta ----------------

type CampoRegistro = 'nombre' | 'apellidos' | 'telefono' | 'nacimiento' | 'email' | 'password' | 'aviso';

function FormRegistro({ onListo, onConfirmarCorreo }: { onListo: (s: Sesion) => void; onConfirmarCorreo: (correo: string) => void }) {
  const config = useAsync(() => api.getConfiguracion(), []);
  const edadMinima = config.datos?.edad_minima ?? 15;
  const edadMayoria = config.datos?.edad_mayoria ?? 18;
  const [d, setD] = useState({ nombre: '', apellidos: '', telefono: '', nacimiento: '', email: '', password: '' });
  const [aviso, setAviso] = useState(false);
  const [errores, setErrores] = useState<Partial<Record<CampoRegistro, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const hoy = fechaLocal();

  const set = (k: keyof typeof d) => (v: string) => setD((x) => ({ ...x, [k]: v }));
  const fechaOk = !errorFechaNacimiento(d.nacimiento, hoy);
  const anios = fechaOk ? edad(d.nacimiento, hoy) : null;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs: Partial<Record<CampoRegistro, string>> = {};
    if (!d.nombre.trim()) errs.nombre = 'Escribe tu nombre.';
    if (!d.apellidos.trim()) errs.apellidos = 'Escribe tus apellidos.';
    if (!telefonoValido(d.telefono)) errs.telefono = 'Escribe tu celular a 10 dígitos, por ejemplo 442 123 4567.';
    const ef = errorFechaNacimiento(d.nacimiento, hoy);
    if (ef) errs.nacimiento = ef;
    else if (anios !== null && anios < edadMinima) errs.nacimiento = `Atendemos a partir de los ${edadMinima} años.`;
    if (!emailValido(d.email)) errs.email = 'Escribe un correo electrónico válido.';
    if (d.password.length < PASSWORD_MIN) errs.password = `Tu contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    if (!aviso) errs.aviso = 'Para crear tu cuenta necesitamos que leas y aceptes el aviso de privacidad.';
    setErrores(errs);
    if (Object.keys(errs).length) {
      enfocarPrimerError(formRef.current, errs, 'rg');
      return;
    }
    setEnviando(true);
    try {
      const s = await api.registrarse({
        email: d.email.trim(),
        password: d.password,
        nombre: d.nombre.trim(),
        apellidos: d.apellidos.trim(),
        telefono: normalizarTelefono(d.telefono),
        fecha_nacimiento: d.nacimiento,
      });
      if (s) onListo(s);
      else onConfirmarCorreo(d.email.trim());
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={enviar} noValidate className="cu-form-acceso">
      <div className="rv-campos-2">
        <CampoTexto id="rg-nombre" etiqueta="Nombre" error={errores.nombre}>
          <input className="input" {...aria('rg-nombre', errores.nombre)} value={d.nombre} onChange={(e) => set('nombre')(e.target.value)} autoComplete="given-name" />
        </CampoTexto>
        <CampoTexto id="rg-apellidos" etiqueta="Apellidos" error={errores.apellidos}>
          <input
            className="input"
            {...aria('rg-apellidos', errores.apellidos)}
            value={d.apellidos}
            onChange={(e) => set('apellidos')(e.target.value)}
            autoComplete="family-name"
          />
        </CampoTexto>
        <CampoTexto id="rg-telefono" etiqueta="Celular (WhatsApp)" error={errores.telefono} ayuda="10 dígitos. Ahí te confirmamos tus citas.">
          <input
            className="input"
            {...aria('rg-telefono', errores.telefono, true)}
            type="tel"
            inputMode="tel"
            value={d.telefono}
            onChange={(e) => set('telefono')(e.target.value)}
            autoComplete="tel-national"
            placeholder="442 123 4567"
          />
        </CampoTexto>
        <CampoTexto id="rg-nacimiento" etiqueta="Fecha de nacimiento" error={errores.nacimiento} ayuda={`Atendemos a partir de los ${edadMinima} años.`}>
          <input
            className="input"
            {...aria('rg-nacimiento', errores.nacimiento, true)}
            type="date"
            max={hoy}
            value={d.nacimiento}
            onChange={(e) => set('nacimiento')(e.target.value)}
            autoComplete="bday"
          />
        </CampoTexto>
      </div>
      {anios !== null && anios >= edadMinima && anios < edadMayoria && (
        <p className="aviso aviso-info">
          Como tienes menos de {edadMayoria} años, a tus citas debe acompañarte tu mamá, papá o tutor, y escribir su nombre cuando firmes el
          consentimiento.
        </p>
      )}
      <CampoTexto id="rg-email" etiqueta="Correo electrónico" error={errores.email}>
        <input
          className="input"
          {...aria('rg-email', errores.email)}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={d.email}
          onChange={(e) => set('email')(e.target.value)}
        />
      </CampoTexto>
      <CampoTexto id="rg-password" etiqueta="Contraseña" error={errores.password} ayuda={`Al menos ${PASSWORD_MIN} caracteres.`}>
        <InputPassword id="rg-password" valor={d.password} onCambio={set('password')} autoComplete="new-password" error={errores.password} conAyuda />
      </CampoTexto>
      <div className="campo">
        <label className="check">
          <input
            id="rg-aviso"
            type="checkbox"
            checked={aviso}
            onChange={(e) => setAviso(e.target.checked)}
            aria-invalid={errores.aviso ? true : undefined}
            aria-describedby={errores.aviso ? 'rg-aviso-error' : undefined}
          />
          <span>
            Leí y acepto el{' '}
            <Link to="/politicas/privacidad" target="_blank" rel="noopener">
              aviso de privacidad
            </Link>{' '}
            (se abre en otra pestaña).
          </span>
        </label>
        {errores.aviso && (
          <span className="rv-campo-error" id="rg-aviso-error">
            {errores.aviso}
          </span>
        )}
      </div>
      {error && (
        <p className="aviso aviso-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
        {enviando ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
      </button>
    </form>
  );
}

function ConfirmaCorreo({ correo, onEntrar }: { correo: string; onEntrar: () => void }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div className="cu-confirma-correo" role="status">
      <h2 className="cu-h2" tabIndex={-1} ref={ref}>
        Confirma tu correo
      </h2>
      <p>
        Te enviamos un correo a <strong>{correo}</strong> con un enlace para confirmar tu cuenta. Ábrelo y después inicia sesión aquí.
      </p>
      <p className="texto-2">
        Si no lo ves en unos minutos, revisa tu carpeta de spam o promociones. Si estabas reservando, tu selección se queda guardada en este
        navegador.
      </p>
      <button type="button" className="btn btn-primario" onClick={onEntrar}>
        Ya lo confirmé, iniciar sesión
      </button>
    </div>
  );
}

// ---------------- Recuperar ----------------

function FormRecuperar({ onVolver }: { onVolver: () => void }) {
  const [email, setEmail] = useState('');
  const [errorCampo, setErrorCampo] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!emailValido(email)) {
      setErrorCampo('Escribe un correo electrónico válido.');
      inputRef.current?.focus();
      return;
    }
    setErrorCampo(undefined);
    setEnviando(true);
    try {
      await api.recuperarPassword(email.trim());
      setEnviado(true);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  if (enviado)
    return (
      <div className="cu-form-acceso" role="status">
        <p className="aviso aviso-exito">
          Si hay una cuenta con {email.trim()}, te enviamos un enlace para crear una contraseña nueva. Revisa también tu carpeta de spam.
        </p>
        {api.modo === 'demo' && (
          <p className="ayuda">En el modo demostración no se envían correos; usa una de las cuentas de ejemplo.</p>
        )}
        <button type="button" className="btn btn-secundario btn-bloque" onClick={onVolver}>
          Volver a iniciar sesión
        </button>
      </div>
    );

  return (
    <form onSubmit={enviar} noValidate className="cu-form-acceso">
      <p className="texto-2">Escribe el correo de tu cuenta y te mandamos un enlace para crear una contraseña nueva.</p>
      <CampoTexto id="rc-email" etiqueta="Correo electrónico" error={errorCampo}>
        <input
          ref={inputRef}
          className="input"
          {...aria('rc-email', errorCampo)}
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </CampoTexto>
      {error && (
        <p className="aviso aviso-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primario btn-bloque" disabled={enviando}>
        {enviando ? 'Enviando…' : 'Enviarme el enlace'}
      </button>
      <button type="button" className="btn btn-texto btn-bloque cu-olvide" onClick={onVolver}>
        Volver a iniciar sesión
      </button>
    </form>
  );
}

// ---------------- Cuentas de demostración ----------------

function CuentasDemo({ onListo }: { onListo: (s: Sesion) => void }) {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function entrar(email: string, password: string) {
    setEnviando(email);
    setError(null);
    try {
      onListo(await api.iniciarSesion(email, password));
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setEnviando(null);
    }
  }

  return (
    <section className="cu-demo" aria-labelledby="cu-demo-titulo">
      <h2 className="cu-h2" id="cu-demo-titulo">
        Cuentas de demostración
      </h2>
      <p className="texto-2 cu-sin-margen">
        Estás en el modo demostración: los datos se guardan sólo en este navegador. Entra con un clic para conocer cada perfil.
      </p>
      <ul className="cu-demo-lista">
        {CUENTAS_DEMO.map((c) => (
          <li key={c.email} className="cu-tarjeta cu-demo-cuenta">
            <h3 className="cu-cita-titulo">{c.etiqueta}</h3>
            <p className="pequeno texto-2 cu-sin-margen">{DESCRIPCION_DEMO[c.rol]}</p>
            <p className="ayuda cu-sin-margen">
              {c.email} · contraseña {c.password}
            </p>
            <button type="button" className="btn btn-secundario btn-sm" onClick={() => void entrar(c.email, c.password)} disabled={enviando !== null}>
              {enviando === c.email ? 'Entrando…' : `Entrar como ${c.etiqueta.toLowerCase()}`}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="aviso aviso-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
