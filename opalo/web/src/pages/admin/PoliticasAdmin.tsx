// /admin/politicas: versión vigente e historial de cada política; publicar versiones nuevas (R13).
import { useState } from 'react';
import { api, POLITICAS_GENERALES, type Servicio, type TipoPolitica } from '../../lib/api';
import { ETIQUETA_POLITICA, fechaCorta } from '../../lib/format';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { EncabezadoAdmin, Exito } from '../../components/admin/Piezas';
import { PoliticasVer, type PoliticaAdmin } from '../../components/admin/PoliticasVer';
import { PoliticasPublicar } from '../../components/admin/PoliticasPublicar';
import { hashCorto } from '../../components/admin/util';
import './PoliticasAdmin.css';

const TIPOS = Object.keys(ETIQUETA_POLITICA) as TipoPolitica[];
const CONSENTIMIENTOS = TIPOS.filter((t) => !POLITICAS_GENERALES.includes(t));

interface Grupo {
  tipo: TipoPolitica;
  activa: PoliticaAdmin | null;
  anteriores: PoliticaAdmin[];
  siguiente: number;
}

/** Fecha en que una versión dejó de estar vigente: cuando entró la siguiente. */
function hastaDe(p: PoliticaAdmin, versiones: PoliticaAdmin[]): string | null {
  const siguiente = versiones.filter((x) => x.version > p.version).sort((a, b) => a.version - b.version)[0];
  return siguiente?.vigente_desde ?? null;
}

function periodo(p: PoliticaAdmin, versiones: PoliticaAdmin[]): string {
  if (!p.vigente_desde) return 'Sin fecha';
  const hasta = hastaDe(p, versiones);
  return hasta ? `Del ${fechaCorta(p.vigente_desde)} al ${fechaCorta(hasta)}` : `Desde ${fechaCorta(p.vigente_desde)}`;
}

export default function PoliticasAdmin() {
  const politicas = useAsync(() => api.admin.getPoliticasTodas(), []);
  const catalogo = useAsync(() => api.getCatalogo({ incluirInactivos: true }).catch(() => null), []);
  const [viendo, setViendo] = useState<{ p: PoliticaAdmin; hasta: string | null } | null>(null);
  const [publicando, setPublicando] = useState<TipoPolitica | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const todas = politicas.datos ?? [];
  const extras = [...new Set(todas.map((p) => p.tipo))].filter((t) => !TIPOS.includes(t));
  const grupos: Grupo[] = [...TIPOS, ...extras].map((tipo) => {
    const versiones = todas.filter((p) => p.tipo === tipo).sort((a, b) => b.version - a.version);
    const activa = versiones.find((p) => p.activa) ?? null;
    return {
      tipo,
      activa,
      anteriores: versiones.filter((p) => p !== activa),
      siguiente: versiones.reduce((m, p) => Math.max(m, p.version), 0) + 1,
    };
  });
  const porTipo = new Map(grupos.map((g) => [g.tipo, g]));
  const versionesDe = (t: TipoPolitica) => todas.filter((p) => p.tipo === t);

  const serviciosCon = (t: TipoPolitica): Servicio[] =>
    (catalogo.datos?.servicios ?? []).filter((s) => s.activo && s.tipo_consentimiento === t).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  const grupoPublicando = publicando ? porTipo.get(publicando) : undefined;
  const sinVigente = grupos.filter((g) => !g.activa && TIPOS.includes(g.tipo));

  const tarjeta = (g: Grupo) => (
    <TarjetaPolitica
      key={g.tipo}
      grupo={g}
      servicios={POLITICAS_GENERALES.includes(g.tipo) ? null : serviciosCon(g.tipo)}
      onVer={(p) => setViendo({ p, hasta: p.activa ? null : hastaDe(p, versionesDe(g.tipo)) })}
      onPublicar={() => setPublicando(g.tipo)}
    />
  );

  return (
    <div className="adm-pagina pola-pagina">
      <EncabezadoAdmin
        titulo="Políticas"
        descripcion="Términos, aviso de privacidad, cancelación y consentimientos informados. Cada cambio se publica como una versión nueva y las anteriores quedan en el historial."
      />

      {politicas.cargando && !politicas.datos && <Cargando texto="Cargando las políticas…" />}
      <MensajeError error={politicas.error} onReintentar={politicas.recargar} />
      <Exito texto={aviso} onCerrar={() => setAviso(null)} />

      {politicas.datos && (
        <div className={politicas.cargando ? 'pola-recargando' : ''}>
          {sinVigente.length > 0 && (
            <div className="aviso aviso-error" role="note">
              <span>
                Falta publicar: <strong>{sinVigente.map((g) => ETIQUETA_POLITICA[g.tipo]).join(', ')}</strong>.
                {sinVigente.some((g) => POLITICAS_GENERALES.includes(g.tipo)) && ' Sin términos, privacidad y cancelación vigentes, las clientas no pueden reservar en línea.'}
                {sinVigente.some((g) => !POLITICAS_GENERALES.includes(g.tipo)) && ' Sin consentimiento vigente, no se puede firmar para esos servicios.'}
              </span>
            </div>
          )}

          <section className="pola-seccion" aria-labelledby="pola-generales">
            <h2 className="pola-seccion-titulo" id="pola-generales">
              Las acepta toda clienta
            </h2>
            <p className="pola-seccion-texto">Se muestran antes de la primera reserva y cada vez que publicas una versión nueva.</p>
            <div className="pola-rejilla">{POLITICAS_GENERALES.map((t) => porTipo.get(t)).filter((g): g is Grupo => !!g).map(tarjeta)}</div>
          </section>

          <section className="pola-seccion" aria-labelledby="pola-consentimientos">
            <h2 className="pola-seccion-titulo" id="pola-consentimientos">
              Consentimientos informados
            </h2>
            <p className="pola-seccion-texto">La clienta firma el que corresponde a sus servicios en la tablet de la cabina, antes del servicio (no se le pide en línea). Sin consentimiento firmado, la cita no puede iniciar.</p>
            <div className="pola-rejilla">
              {[...CONSENTIMIENTOS, ...extras]
                .map((t) => porTipo.get(t))
                .filter((g): g is Grupo => !!g)
                .map(tarjeta)}
            </div>
          </section>
        </div>
      )}

      {viendo && (
        <PoliticasVer
          politica={viendo.p}
          hasta={viendo.hasta}
          onCerrar={() => setViendo(null)}
          onNuevaVersion={
            viendo.p.activa
              ? () => {
                  const t = viendo.p.tipo;
                  setViendo(null);
                  setPublicando(t);
                }
              : undefined
          }
        />
      )}
      {publicando && grupoPublicando && (
        <PoliticasPublicar
          tipo={publicando}
          base={grupoPublicando.activa}
          siguienteVersion={grupoPublicando.siguiente}
          onCerrar={() => setPublicando(null)}
          onPublicada={(v) => {
            setAviso(`Listo: publicamos la versión ${v} de ${ETIQUETA_POLITICA[publicando] ?? publicando}. Las clientas la verán en su próxima reserva.`);
            setPublicando(null);
            politicas.recargar();
          }}
        />
      )}
    </div>
  );
}

function TarjetaPolitica({
  grupo: g,
  servicios,
  onVer,
  onPublicar,
}: {
  grupo: Grupo;
  servicios: Servicio[] | null;
  onVer: (p: PoliticaAdmin) => void;
  onPublicar: () => void;
}) {
  const a = g.activa;
  const id = `pola-${g.tipo}`;
  const versiones = a ? [a, ...g.anteriores] : g.anteriores;
  return (
    <article className="tarjeta-plana pola-tarjeta" aria-labelledby={id}>
      <p className="eyebrow pola-tipo">{ETIQUETA_POLITICA[g.tipo] ?? g.tipo}</p>
      {a ? (
        <>
          <div className="pola-cabeza">
            <h3 className="pola-titulo" id={id}>
              {a.titulo}
            </h3>
            <span className="pill pill-exito">Versión {a.version} vigente</span>
          </div>
          <dl className="pola-meta">
            <div>
              <dt>Vigente desde</dt>
              <dd>{a.vigente_desde ? fechaCorta(a.vigente_desde) : '—'}</dd>
            </div>
            <div>
              <dt>Huella</dt>
              <dd>
                <code className="pola-hash" title={a.hash_sha256 ?? undefined}>
                  {hashCorto(a.hash_sha256)}
                </code>
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <>
          <div className="pola-cabeza">
            <h3 className="pola-titulo" id={id}>
              Sin versión vigente
            </h3>
            <span className="pill pill-error">Falta publicar</span>
          </div>
          <p className="pola-meta adm-sin-margen texto-2">Aún no se ha publicado. Escríbela y publícala para que las clientas puedan verla.</p>
        </>
      )}

      {servicios && (
        <p className="pola-servicios pequeno">
          {servicios.length === 0 ? (
            <span className="texto-3">Ningún servicio activo lo pide por ahora.</span>
          ) : (
            <>
              <span className="texto-2">
                Lo firman quienes reservan {servicios.length === 1 ? 'este servicio' : `estos ${servicios.length} servicios`}:
              </span>{' '}
              {servicios.slice(0, 6).map((s) => s.nombre).join(', ')}
              {servicios.length > 6 ? ` y ${servicios.length - 6} más.` : '.'}
            </>
          )}
        </p>
      )}

      <div className="pola-acciones">
        {a && (
          <button type="button" className="btn btn-secundario btn-sm" onClick={() => onVer(a)}>
            Ver texto
          </button>
        )}
        <button type="button" className={`btn btn-sm ${a ? 'btn-texto' : 'btn-primario'}`} onClick={onPublicar}>
          {a ? 'Publicar nueva versión' : 'Publicar primera versión'}
        </button>
      </div>

      {g.anteriores.length > 0 && (
        <details className="pola-historial">
          <summary>
            Versiones anteriores <span className="num">({g.anteriores.length})</span>
          </summary>
          <ol className="pola-versiones">
            {g.anteriores.map((p) => (
              <li key={p.id} className="pola-version">
                <div className="pola-version-texto">
                  <strong>
                    Versión {p.version} · {p.titulo}
                  </strong>
                  <span className="adm-sub">
                    {periodo(p, versiones)} ·{' '}
                    <code className="pola-hash" title={p.hash_sha256 ?? undefined}>
                      {hashCorto(p.hash_sha256)}
                    </code>
                  </span>
                </div>
                <button type="button" className="btn btn-texto btn-sm" onClick={() => onVer(p)} aria-label={`Ver texto de la versión ${p.version}`}>
                  Ver texto
                </button>
              </li>
            ))}
          </ol>
        </details>
      )}
    </article>
  );
}
