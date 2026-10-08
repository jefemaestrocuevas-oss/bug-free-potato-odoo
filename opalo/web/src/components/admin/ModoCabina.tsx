// Pantalla de cabina: la clienta lee su consentimiento y firma en la tablet sin acceso al panel.
// Cubre toda la pantalla, deja inerte lo de abajo, no se cierra con Escape, clic afuera ni «Atrás»,
// y sólo se sale con la contraseña de quien entregó la tablet (o cerrando la sesión).
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, ErrorOpalo, type DatosFirma } from '../../lib/api';
import { useSesion } from '../../lib/sesion';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Marca } from '../ui/Gema';
import { Markdown } from '../ui/Markdown';
import { PanelFirma } from '../ui/PanelFirma';
import { marcarFirmada, marcarSesionCerrada, salirCabina, useCabina, type DatosCabina } from './cabina';
import './ModoCabina.css';

/** Se monta en LayoutAdmin: si hay una firma en cabina en curso, tapa todo el panel. */
export function ModoCabina() {
  const datos = useCabina();
  const { sesion } = useSesion();
  // Un bloqueo que dejó otra cuenta en esta pestaña, o del que se salió cerrando la sesión,
  // no aplica a quien acaba de entrar (se revisa sólo al montar el panel).
  const [vieja, setVieja] = useState(() => datos?.sesion_cerrada === true);
  const ajena = !!datos && !!sesion && datos.user_id !== sesion.user_id;

  useEffect(() => {
    if (!ajena && !vieja) return;
    salirCabina();
    setVieja(false);
  }, [ajena, vieja]);

  if (!datos || !sesion || ajena || vieja) return null;
  return <PantallaCabina datos={datos} />;
}

function salirDePantallaCompleta() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  } catch {
    // Sin API de pantalla completa: no pasa nada.
  }
}

function PantallaCabina({ datos }: { datos: DatosCabina }) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const location = useLocation();
  const navegar = useNavigate();
  const [firma, setFirma] = useState<DatosFirma | null>(null);
  const [desbloqueo, setDesbloqueo] = useState(false);
  const primerNombre = datos.nombre.split(' ')[0] || datos.nombre;

  const guardarFirma = useAccion(async () => {
    if (!firma) throw new Error('Falta tu firma o tu nombre completo.');
    await api.firmarConsentimientoCita(datos.cita_id, firma);
    return true;
  });

  // Todo lo demás de la página queda inerte (ni clic, ni foco, ni lector de pantalla) y sin scroll.
  useEffect(() => {
    const propio = ref.current;
    if (!propio) return;
    const marcados = new Set<Element>();
    const inertar = (n: Element) => {
      if (n === propio || n.hasAttribute('inert') || n.tagName === 'SCRIPT') return;
      n.setAttribute('inert', '');
      marcados.add(n);
    };
    Array.from(document.body.children).forEach(inertar);
    // Lo que se agregue después (p. ej. otra ventana) también queda inerte.
    const observador = new MutationObserver((cambios) => cambios.forEach((c) => c.addedNodes.forEach((n) => n instanceof Element && inertar(n))));
    observador.observe(document.body, { childList: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    titulo.current?.focus({ preventScroll: true });
    return () => {
      observador.disconnect();
      marcados.forEach((n) => n.removeAttribute('inert'));
      document.body.style.overflow = overflow;
    };
  }, []);

  // «Atrás» del navegador o del sistema: se vuelve a poner esta misma dirección.
  useEffect(() => {
    if ((location.state as { cabina?: boolean } | null)?.cabina) return;
    navegar({ pathname: location.pathname, search: location.search, hash: location.hash }, { state: { cabina: true } });
  }, [location, navegar]);

  // Al pasar de la firma a «Gracias», el foco va al nuevo título.
  useEffect(() => {
    titulo.current?.focus({ preventScroll: true });
    ref.current?.scrollTo?.({ top: 0 });
  }, [datos.firmada]);

  const firmar = async () => {
    if (await guardarFirma.ejecutar()) marcarFirmada();
  };

  return createPortal(
    <div ref={ref} className="adm-cabina" role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
      <div className="adm-cabina-hoja">
        <header className="adm-cabina-cabeza">
          <Marca tam={22} />
          <span className="eyebrow adm-sin-margen">Consentimiento informado</span>
        </header>

        {datos.firmada ? (
          <section className="adm-cabina-listo">
            <h1 id={`${id}-titulo`} ref={titulo} tabIndex={-1} className="adm-cabina-titulo">
              ¡Gracias, {primerNombre}!
            </h1>
            <p className="texto-2">Tu firma quedó guardada. Ya puedes devolver la tablet a tu especialista.</p>
          </section>
        ) : (
          <>
            <h1 id={`${id}-titulo`} ref={titulo} tabIndex={-1} className="adm-cabina-titulo">
              Hola, {primerNombre}
            </h1>
            <p className="texto-2">
              Antes de tu cita del <strong>{datos.cuando}</strong>
              {datos.servicios ? ` (${datos.servicios})` : ''}, lee con calma este consentimiento y firma al final. Si tienes alguna duda, pregúntale a tu
              especialista antes de firmar.
            </p>

            {datos.consentimientos.length === 0 ? (
              <p className="aviso aviso-info">Tu firma quedará ligada a esta cita.</p>
            ) : (
              datos.consentimientos.map((p) => (
                <section key={p.id} className="adm-cabina-documento" aria-labelledby={`${id}-${p.id}`}>
                  <h2 id={`${id}-${p.id}`} className="adm-cabina-documento-titulo">
                    {p.titulo} <span className="texto-3 pequeno">· versión {p.version}</span>
                  </h2>
                  <div className="adm-cabina-texto">
                    <Markdown texto={p.contenido_md} />
                  </div>
                </section>
              ))
            )}

            <section className="adm-cabina-firma" aria-label="Tu firma">
              <PanelFirma
                onCambio={setFirma}
                requiereTutor={datos.menor}
                nombreSugerido={datos.nombre}
                leyenda="Firma con tu dedo dentro del recuadro. Al firmar confirmas que leíste el consentimiento y que la información de tu ficha de salud es correcta."
              />
              {datos.menor && (
                <p className="ayuda">
                  {datos.anios !== null ? `Como tienes ${datos.anios} años, ` : 'Como eres menor de edad, '}
                  también firma quien te acompaña.
                </p>
              )}
              <MensajeError error={guardarFirma.error} />
              <button type="button" className="btn btn-primario btn-bloque adm-cabina-guardar" disabled={guardarFirma.enviando || !firma} onClick={() => void firmar()}>
                {guardarFirma.enviando ? 'Guardando tu firma…' : 'Guardar mi firma'}
              </button>
            </section>
          </>
        )}

        <footer className="adm-cabina-pie">
          {desbloqueo ? (
            <Desbloquear email={datos.email} onRegresar={() => setDesbloqueo(false)} />
          ) : (
            <button type="button" className={`btn ${datos.firmada ? 'btn-secundario' : 'btn-texto btn-sm'}`} onClick={() => setDesbloqueo(true)}>
              Soy del equipo: volver al panel
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function Desbloquear({ email, onRegresar }: { email: string | null; onRegresar: () => void }) {
  const [clave, setClave] = useState('');
  const entrada = useRef<HTMLInputElement>(null);
  const verificar = useAccion(async () => {
    if (!email) throw new Error('Esta cuenta no tiene correo para verificar la contraseña. Cierra la sesión para salir.');
    if (!clave) throw new Error('Escribe tu contraseña.');
    try {
      await api.iniciarSesion(email, clave);
    } catch (e) {
      if (e instanceof ErrorOpalo && (e.codigo === 'credenciales' || e.codigo === 'invalid_credentials')) throw new Error('La contraseña no es correcta. Inténtalo de nuevo.');
      throw e;
    }
    return true;
  });
  // Al cerrar la sesión, RutaProtegida lleva a /entrar; la pantalla de cabina sigue puesta hasta entonces.
  const cerrar = useAccion(async () => {
    marcarSesionCerrada(true);
    try {
      await api.cerrarSesion();
    } catch (e) {
      marcarSesionCerrada(false);
      throw e;
    }
    salirDePantallaCompleta();
    return true;
  });

  useEffect(() => {
    entrada.current?.focus();
  }, []);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (await verificar.ejecutar()) {
      setClave('');
      salirDePantallaCompleta();
      salirCabina();
    }
  };


  const ocupado = verificar.enviando || cerrar.enviando;

  return (
    <form className="adm-cabina-desbloqueo" onSubmit={enviar}>
      <div className="campo adm-sin-margen">
        <label className="etiqueta" htmlFor="cabina-clave">
          Contraseña de quien entregó la tablet
        </label>
        {/* Sin autocompletar: que el navegador de la tablet no la ofrezca a la clienta. */}
        <input
          ref={entrada}
          id="cabina-clave"
          name="cabina-clave"
          className="input"
          type="password"
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
        />
      </div>
      <MensajeError error={verificar.error ?? cerrar.error} />
      <div className="adm-cabina-desbloqueo-botones">
        <button type="button" className="btn btn-texto" onClick={onRegresar} disabled={ocupado}>
          Regresar
        </button>
        <button type="submit" className="btn btn-primario" disabled={ocupado}>
          {verificar.enviando ? 'Verificando…' : 'Volver al panel'}
        </button>
      </div>
      <p className="ayuda adm-sin-margen">
        ¿No recuerdas tu contraseña?{' '}
        <button type="button" className="btn btn-texto btn-sm adm-cabina-salir" onClick={() => void cerrar.ejecutar()} disabled={ocupado}>
          {cerrar.enviando ? 'Cerrando sesión…' : 'Cerrar la sesión del panel'}
        </button>
      </p>
    </form>
  );
}
