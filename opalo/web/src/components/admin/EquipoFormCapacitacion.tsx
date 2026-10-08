// Alta y edición de una capacitación (curso, taller, diplomado…) de una persona del equipo.
import { useState, type FormEvent } from 'react';
import { api, type CapacitacionEditable, type PersonalInterno, type TipoCapacitacion } from '../../lib/api';
import { fechaLocal } from '../../lib/format';
import { useAccion } from '../../lib/useAsync';
import { MensajeError } from '../ui/Estado';
import { Modal } from './Modal';
import { Casilla } from './Piezas';
import { enlaceSeguro, type CapacitacionInterna } from './EquipoPiezas';
import { ETIQUETA_CAPACITACION, aNumero, aTexto, textoONulo } from './util';

const TIPOS = Object.keys(ETIQUETA_CAPACITACION) as TipoCapacitacion[];

interface Props {
  persona: PersonalInterno;
  /** null = capacitación nueva */
  capacitacion: CapacitacionInterna | null;
  onCerrar: () => void;
  onGuardado: (nombre: string, nueva: boolean) => void;
}

export function EquipoFormCapacitacion({ persona, capacitacion, onCerrar, onGuardado }: Props) {
  const c = capacitacion;
  const [nombre, setNombre] = useState(c?.nombre ?? '');
  const [tipo, setTipo] = useState<TipoCapacitacion>(c?.tipo ?? 'curso');
  const [institucion, setInstitucion] = useState(c?.institucion ?? '');
  const [fecha, setFecha] = useState(c?.fecha?.slice(0, 10) ?? '');
  const [horas, setHoras] = useState(aTexto(c?.horas));
  const [constancia, setConstancia] = useState(c?.constancia_url ?? '');
  const [enSitio, setEnSitio] = useState(c?.mostrar_en_sitio ?? true);
  const [notas, setNotas] = useState(c?.notas ?? '');
  const [intentado, setIntentado] = useState(false);

  const nHoras = aNumero(horas);
  const horasInvalidas = horas.trim() !== '' && (nHoras === null || nHoras < 0 || nHoras > 9999);
  const constanciaInvalida = constancia.trim() !== '' && !enlaceSeguro(constancia);
  const hoy = fechaLocal();
  const personaOculta = !persona.activo || !persona.mostrar_en_sitio;

  const errores = {
    nombre: !nombre.trim() ? 'Escribe el nombre del curso o taller.' : null,
    horas: horasInvalidas ? 'Las horas van como número (por ejemplo 12 o 7.5), o vacías.' : null,
    constancia: constanciaInvalida ? 'La constancia debe ser una dirección que empiece con https://.' : null,
  };
  const primerError = Object.values(errores).find(Boolean) ?? null;

  const { ejecutar, enviando, error, setError } = useAccion(async () => {
    if (primerError) throw new Error(primerError);
    const datos: CapacitacionEditable = {
      id: c?.id,
      personal_id: persona.id,
      nombre: nombre.trim(),
      institucion: textoONulo(institucion),
      tipo,
      fecha: fecha || null,
      horas: nHoras === null ? null : Math.round(nHoras * 10) / 10,
      constancia_url: textoONulo(constancia),
      mostrar_en_sitio: enSitio,
      notas: textoONulo(notas),
    };
    await api.admin.guardarCapacitacion(datos);
    return true;
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setIntentado(true);
    setError(null);
    if (await ejecutar()) onGuardado(nombre.trim(), !c);
  };

  const marca = (k: keyof typeof errores) => (intentado && errores[k] ? true : undefined);

  return (
    <Modal
      titulo={c ? 'Editar capacitación' : `Nueva capacitación de ${persona.nombre}`}
      onCerrar={onCerrar}
      bloqueado={enviando}
      ancho="amplio"
      pie={
        <>
          <button type="button" className="btn btn-texto" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </button>
          <button type="submit" form="eqa-form-cap" className="btn btn-primario" disabled={enviando}>
            {enviando ? 'Guardando…' : c ? 'Guardar cambios' : 'Agregar capacitación'}
          </button>
        </>
      }
    >
      <form id="eqa-form-cap" className="eqa-form" onSubmit={enviar} noValidate>
        <div className="campo">
          <label className="etiqueta" htmlFor="cap-nombre">
            Nombre del curso, taller o certificación
          </label>
          <input id="cap-nombre" className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={marca('nombre')} />
        </div>
        <div className="adm-form-2">
          <div className="campo">
            <label className="etiqueta" htmlFor="cap-tipo">
              Tipo
            </label>
            <select id="cap-tipo" className="input" value={tipo} onChange={(e) => setTipo(e.target.value as TipoCapacitacion)}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_CAPACITACION[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="cap-institucion">
              Institución (opcional)
            </label>
            <input id="cap-institucion" className="input" value={institucion} onChange={(e) => setInstitucion(e.target.value)} placeholder="Escuela, academia o marca que lo impartió" />
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="cap-fecha">
              Fecha (opcional)
            </label>
            <input id="cap-fecha" className="input" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} aria-describedby="cap-fecha-ayuda" />
            <span className="ayuda" id="cap-fecha-ayuda">
              Cuando terminó o recibió la constancia. En el sitio se ordenan de la más reciente a la más antigua.
            </span>
          </div>
          <div className="campo">
            <label className="etiqueta" htmlFor="cap-horas">
              Horas (opcional)
            </label>
            <input id="cap-horas" className="input num" inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} aria-invalid={marca('horas') || horasInvalidas ? true : undefined} placeholder="12" />
          </div>
        </div>
        <div className="campo">
          <label className="etiqueta" htmlFor="cap-constancia">
            Constancia (dirección del archivo, opcional)
          </label>
          <input
            id="cap-constancia"
            className="input"
            type="url"
            inputMode="url"
            value={constancia}
            onChange={(e) => setConstancia(e.target.value)}
            placeholder="https://…"
            aria-invalid={constanciaInvalida ? true : undefined}
            aria-describedby="cap-constancia-ayuda"
            autoCapitalize="none"
            spellCheck={false}
          />
          <span className="ayuda" id="cap-constancia-ayuda">
            {constanciaInvalida ? <span className="eqa-error-campo">{errores.constancia}</span> : 'Un enlace a la foto o PDF de la constancia. Sólo lo ve el equipo interno.'}
          </span>
        </div>

        <div className="aviso aviso-info eqa-aviso-compacto">
          <Casilla
            etiqueta={<strong>Mostrar en el sitio</strong>}
            checked={enSitio}
            onChange={setEnSitio}
            ayuda="Las capacitaciones visibles aparecen en la página Equipo como prueba de que nos capacitamos constantemente."
          />
        </div>
        {enSitio && personaOculta && (
          <p className="ayuda eqa-nota-alerta">
            Ojo: {persona.nombre} hoy no se muestra en el sitio{!persona.activo ? ' (está inactiva)' : ''}, así que esta capacitación tampoco aparecerá hasta que se muestre.
          </p>
        )}

        <div className="campo">
          <label className="etiqueta" htmlFor="cap-notas">
            Notas internas (opcional)
          </label>
          <textarea id="cap-notas" className="input" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Lo que aprendió, qué técnica se puede ofrecer ahora…" />
        </div>

        <MensajeError error={error} />
      </form>
    </Modal>
  );
}
