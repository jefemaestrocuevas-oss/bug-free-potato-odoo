// Mis servicios: créditos (servicios prepagados) vigentes, regalos para compartir y canje de códigos.
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Configuracion, Credito } from '../../lib/api/tipos';
import { enlaceWhatsApp, fechaCorta } from '../../lib/format';
import { useAccion, useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError, Vacio } from '../ui/Estado';

function sitio(): string {
  try {
    return window.location.origin;
  } catch {
    return '';
  }
}

export function SeccionServicios({ config }: { config: Configuracion }) {
  const creditos = useAsync(() => api.getMisCreditos(), []);
  const [codigo, setCodigo] = useState('');
  const [exito, setExito] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const canjear = useAccion(async (c: string) => {
    await api.canjearRegalo(c);
    return true;
  });

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setExito(null);
    const limpio = codigo.replace(/[\s-]/g, '').toUpperCase();
    if (!limpio) {
      setErrorCampo('Escribe el código de tu regalo.');
      inputRef.current?.focus();
      return;
    }
    setErrorCampo(null);
    if (await canjear.ejecutar(limpio)) {
      setCodigo('');
      setExito('¡Listo! Tu regalo ya está en tus servicios. Ya puedes reservarlo.');
      creditos.recargar();
    } else {
      inputRef.current?.focus();
    }
  }

  const lista = creditos.datos ?? [];
  const vigentes = lista.filter((c) => c.vigente && c.restantes > 0);
  const anteriores = lista.filter((c) => !(c.vigente && c.restantes > 0));
  const mensajeError = errorCampo ?? canjear.error;

  return (
    <div className="cu-seccion">
      <div className="entre cu-seccion-cabeza">
        <h2 className="cu-h2">Mis servicios prepagados</h2>
        <Link className="btn btn-secundario btn-sm" to="/tienda">
          Comprar o regalar
        </Link>
      </div>
      <p className="texto-2 cu-sin-margen">Lo que compraste o te regalaron, listo para reservar. Al usarlo no pagas ese servicio en tu cita.</p>

      {creditos.cargando && !creditos.datos && <Cargando texto="Cargando tus servicios…" />}
      <MensajeError error={creditos.error} onReintentar={creditos.recargar} />

      {creditos.datos &&
        (vigentes.length === 0 ? (
          <Vacio titulo="No tienes servicios prepagados">
            <p>
              Cuando compres un servicio o paquete en la <Link to="/tienda">tienda</Link> (y lo paguemos), aparecerá aquí.
            </p>
          </Vacio>
        ) : (
          <ul className="cu-lista cu-creditos">
            {vigentes.map((c) => (
              <li key={c.id}>
                <TarjetaCredito credito={c} config={config} />
              </li>
            ))}
          </ul>
        ))}

      <section className="cu-tarjeta cu-canjear" aria-labelledby="cu-canjear-titulo">
        <h3 className="cu-cita-titulo" id="cu-canjear-titulo">
          Canjear un código de regalo
        </h3>
        <p className="ayuda cu-sin-margen">¿Te regalaron un servicio de Ópalo? Escribe el código de 8 letras y números.</p>
        <form className="cu-canjear-form" onSubmit={enviar} noValidate>
          <div className="campo cu-sin-margen">
            <label className="etiqueta" htmlFor="cu-codigo">
              Código de regalo
            </label>
            <input
              ref={inputRef}
              id="cu-codigo"
              className="input cu-codigo-input"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              placeholder="ABCD2345"
              aria-invalid={mensajeError ? true : undefined}
              aria-describedby={mensajeError ? 'cu-codigo-error' : undefined}
            />
          </div>
          <button type="submit" className="btn btn-primario" disabled={canjear.enviando}>
            {canjear.enviando ? 'Canjeando…' : 'Canjear'}
          </button>
        </form>
        {mensajeError && (
          <p className="rv-campo-error cu-sin-margen" id="cu-codigo-error" role="alert">
            {mensajeError}
          </p>
        )}
        {exito && (
          <p className="aviso aviso-exito cu-sin-margen" role="status">
            {exito}
          </p>
        )}
      </section>

      {anteriores.length > 0 && (
        <details className="cu-anteriores">
          <summary>Servicios usados o vencidos ({anteriores.length})</summary>
          <ul className="cu-lista-simple">
            {anteriores.map((c) => (
              <li key={c.id}>
                <span>{c.nombre}</span>
                <span className="texto-3 pequeno">
                  {c.restantes <= 0 ? `Usado (${c.usados} de ${c.cantidad})` : `Venció el ${c.vence_en ? fechaCorta(c.vence_en) : '—'}`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function TarjetaCredito({ credito: c, config }: { credito: Credito; config: Configuracion }) {
  const [copiado, setCopiado] = useState(false);
  const esRegalo = !!c.codigo_regalo;
  const mensajeRegalo = c.codigo_regalo
    ? `¡Te regalo ${c.nombre} en ${config.nombre_negocio}! Crea tu cuenta en ${sitio()}/entrar y canjea el código ${c.codigo_regalo} en "Mis servicios".`
    : '';

  async function copiar() {
    if (!c.codigo_regalo) return;
    try {
      await navigator.clipboard.writeText(c.codigo_regalo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <article className="cu-tarjeta cu-credito" aria-labelledby={`credito-${c.id}`}>
      <div className="entre cu-cita-cabeza">
        <h3 className="cu-cita-titulo" id={`credito-${c.id}`}>
          {c.nombre}
        </h3>
        {esRegalo && <span className="pill pill-oro">Regalo</span>}
      </div>
      <p className="cu-sin-margen">
        <strong className="num">
          {c.restantes} de {c.cantidad}
        </strong>{' '}
        {c.restantes === 1 ? 'disponible' : 'disponibles'}
        {c.vence_en ? <span className="texto-3"> · vence el {fechaCorta(c.vence_en)}</span> : null}
      </p>

      {esRegalo ? (
        <div className="cu-regalo">
          <p className="cu-sin-margen">
            {c.regalo_para ? (
              <>
                Para <strong>{c.regalo_para}</strong>. Compártele este código para que lo canjee en su cuenta:
              </>
            ) : (
              'Compártelo con quien quieras; lo canjea en su cuenta con este código:'
            )}
          </p>
          <div className="cu-codigo">
            <span className="cu-codigo-texto num" aria-label={`Código ${c.codigo_regalo!.split('').join(' ')}`}>
              {c.codigo_regalo}
            </span>
            <button type="button" className="btn btn-secundario btn-sm" onClick={() => void copiar()}>
              {copiado ? 'Copiado' : 'Copiar código'}
            </button>
          </div>
          <span className="sr-only" role="status">
            {copiado ? 'Código copiado' : ''}
          </span>
          <div className="cu-acciones">
            <a className="btn btn-primario btn-sm" href={enlaceWhatsApp('', mensajeRegalo)} target="_blank" rel="noopener noreferrer">
              Compartir por WhatsApp
            </a>
            <Link className="btn btn-texto btn-sm" to={`/reservar?credito=${encodeURIComponent(c.id)}`}>
              Mejor lo uso yo
            </Link>
          </div>
        </div>
      ) : (
        <div className="cu-acciones">
          <Link className="btn btn-primario btn-sm" to={`/reservar?credito=${encodeURIComponent(c.id)}`}>
            Reservar con este crédito
          </Link>
        </div>
      )}
    </article>
  );
}
