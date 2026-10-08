// Ficha de salud vigente de una clienta, vista por el equipo (sólo lectura).
import type { AccionContraindicacion, Categoria, Contraindicacion, FichaSalud } from '../../lib/api';
import { fechaCorta } from '../../lib/format';
import { Vacio } from '../ui/Estado';
import { IconoAlerta } from './Iconos';
import './ClientasPiezas.css';

const ACCION: Record<AccionContraindicacion, { clase: string; texto: string }> = {
  no_se_realiza: { clase: 'pill-error', texto: 'No se realiza el servicio' },
  revisar: { clase: 'pill-alerta', texto: 'Revisar con ella antes de confirmar' },
  precaucion: { clase: 'pill-info', texto: 'Atender con precaución' },
};

interface Props {
  ficha: FichaSalud | null;
  preguntas: Contraindicacion[];
  categorias?: Categoria[];
}

function aplicaA(c: Contraindicacion, categorias: Categoria[] | undefined): string {
  if (!c.categorias || c.categorias.length === 0) return 'todos los servicios';
  return c.categorias.map((slug) => categorias?.find((k) => k.slug === slug)?.nombre ?? slug).join(', ');
}

function DatoLibre({ titulo, texto, vacio }: { titulo: string; texto: string | null; vacio: string }) {
  const t = texto?.trim();
  return (
    <div className="adm-clientas-dato">
      <dt>{titulo}</dt>
      <dd className={t ? '' : 'texto-3'}>{t || vacio}</dd>
    </div>
  );
}

export function ClientasFicha({ ficha, preguntas, categorias }: Props) {
  if (!ficha)
    return (
      <Vacio titulo="Aún no tiene ficha de salud">
        La clienta la llena desde su cuenta en línea al reservar. Si agenda por WhatsApp o en mostrador, repasen juntas las preguntas antes del servicio.
      </Vacio>
    );

  const ordenadas = [...preguntas].sort((a, b) => a.orden - b.orden);
  const conSi = ordenadas.filter((p) => ficha.respuestas[p.clave] === true);
  const resto = ordenadas.filter((p) => ficha.respuestas[p.clave] !== true);
  const conocidas = new Set(preguntas.map((p) => p.clave));
  // Respuestas "sí" a preguntas que ya no están activas: también se muestran.
  const otras = Object.entries(ficha.respuestas).filter(([clave, v]) => v === true && !conocidas.has(clave));
  const totalSi = conSi.length + otras.length;

  return (
    <div className="adm-clientas-ficha">
      <div className="fila adm-clientas-ficha-meta">
        {ficha.creado_en && <span className="texto-2 pequeno">Llenada el {fechaCorta(ficha.creado_en)}</span>}
        {ficha.acepta_datos_sensibles ? (
          <span className="pill pill-exito">Autorizó el uso de sus datos de salud</span>
        ) : (
          <span className="pill pill-error">No autorizó el uso de sus datos de salud</span>
        )}
      </div>

      {totalSi > 0 ? (
        <div className="aviso aviso-alerta adm-clientas-ficha-aviso">
          <strong className="fila adm-clientas-gap">
            <IconoAlerta tam={18} /> Respondió que sí a {totalSi} {totalSi === 1 ? 'pregunta' : 'preguntas'}
          </strong>
          <span>Revísalo con ella antes del servicio.</span>
        </div>
      ) : (
        <p className="aviso aviso-exito adm-clientas-ficha-aviso">Respondió que no a todas las preguntas.</p>
      )}

      <ul className="adm-clientas-preguntas" aria-label="Respuestas de la ficha de salud">
        {conSi.map((p) => {
          const detalle = ficha.detalles[p.clave]?.trim();
          const a = ACCION[p.accion];
          return (
            <li key={p.id} className="adm-clientas-pregunta adm-clientas-pregunta-si">
              <div className="adm-clientas-pregunta-fila">
                <span className="adm-clientas-pregunta-texto">{p.pregunta}</span>
                <span className="pill pill-alerta">Sí</span>
              </div>
              <p className="adm-clientas-detalle">{detalle ? `“${detalle}”` : <span className="texto-3">No agregó detalle.</span>}</p>
              <div className="fila adm-clientas-gap">
                <span className={`pill ${a.clase}`}>{a.texto}</span>
                <span className="ayuda">Aplica a {aplicaA(p, categorias)}</span>
              </div>
            </li>
          );
        })}
        {otras.map(([clave]) => (
          <li key={clave} className="adm-clientas-pregunta adm-clientas-pregunta-si">
            <div className="adm-clientas-pregunta-fila">
              <span className="adm-clientas-pregunta-texto">
                Pregunta que ya no está activa <code>{clave}</code>
              </span>
              <span className="pill pill-alerta">Sí</span>
            </div>
            {ficha.detalles[clave]?.trim() && <p className="adm-clientas-detalle">“{ficha.detalles[clave].trim()}”</p>}
          </li>
        ))}
        {resto.map((p) => {
          const r = ficha.respuestas[p.clave];
          return (
            <li key={p.id} className="adm-clientas-pregunta">
              <div className="adm-clientas-pregunta-fila">
                <span className="adm-clientas-pregunta-texto texto-2">{p.pregunta}</span>
                {r === false ? <span className="pill pill-gris">No</span> : <span className="pill pill-info">Sin respuesta</span>}
              </div>
            </li>
          );
        })}
      </ul>

      <dl className="adm-clientas-datos">
        <DatoLibre titulo="Alergias" texto={ficha.alergias} vacio="Ninguna registrada" />
        <DatoLibre titulo="Medicamentos" texto={ficha.medicamentos} vacio="Ninguno registrado" />
        <DatoLibre titulo="Observaciones" texto={ficha.observaciones} vacio="Sin observaciones" />
      </dl>
    </div>
  );
}
