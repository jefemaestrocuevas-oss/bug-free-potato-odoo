// /reservar — asistente por pasos: servicios → día y hora → tus datos → ficha de salud →
// políticas → revisa y confirma → confirmación. El estado vive en sessionStorage (salvo la ficha y
// las notas) para sobrevivir al ir a /entrar y volver.
//
// ESPEC §9: con configuracion.firma_en_linea = false (decisión de Ópalo) la reserva no pide ni menciona
// la firma: el consentimiento se revisa y se firma en el spa, en la tablet de la cabina, y la cita se
// crea sin firma. Con true vuelve el flujo anterior: el paso 5 muestra el consentimiento y el 6 lo firma
// en pantalla (PasoFirma).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import type { Catalogo, Configuracion, Credito, DatosFirma, Slot, SolicitudReserva } from '../../lib/api/tipos';
import { edad, fechaLocal, mensajeError } from '../../lib/format';
import { useSesion } from '../../lib/sesion';
import { useAsync } from '../../lib/useAsync';
import { Cargando, MensajeError } from '../../components/ui/Estado';
import { Confirmacion } from '../../components/reserva/Confirmacion';
import {
  borrarEstado,
  cargarEstado,
  estadoInicial,
  fichaDesdeBorrador,
  guardarEstado,
  nombresPasos,
  titulosPasos,
  type Confirmacion as DatosConfirmacion,
  type EstadoReserva,
  type FichaBorrador,
  type Paso,
} from '../../components/reserva/estado';
import { PasoConfirmar } from '../../components/reserva/PasoConfirmar';
import { PasoDatos } from '../../components/reserva/PasoDatos';
import { PasoFicha } from '../../components/reserva/PasoFicha';
import { PasoFirma } from '../../components/reserva/PasoFirma';
import { PasoHorario, primerDiaReservable } from '../../components/reserva/PasoHorario';
import { PasoPoliticas } from '../../components/reserva/PasoPoliticas';
import { PasoServicios } from '../../components/reserva/PasoServicios';
import { Progreso, ResumenReserva, type LineaResumen } from '../../components/reserva/Piezas';
import {
  aItemsReserva,
  calcularTotal,
  categoriasDeItems,
  creditoAItem,
  creditoUsable,
  firmaItems,
  mapaPaquetes,
  notaPago,
  mapaServicios,
  nombreCompleto,
  paqueteReservable,
  servicioReservable,
  serviciosDeItems,
  tieneServicioBase,
  tiposConsentimiento,
  totalCita,
  type ItemElegido,
} from '../../components/reserva/utilidades';
import '../../components/reserva/reserva.css';

const MSG = {
  ocupado: 'Ese horario se acaba de ocupar, elige otro.',
  noDisponible: 'Ese horario no está disponible.',
};

/** A qué paso hay que regresar según el error del servidor. */
function pasoDelError(msg: string): Paso | null {
  if (msg === MSG.ocupado || msg === MSG.noDisponible) return 2;
  if (
    msg.startsWith('Inicia sesión') ||
    msg.startsWith('Atendemos a partir') ||
    msg.startsWith('Para reservar necesitamos tu fecha de nacimiento') ||
    msg.startsWith('Tu fecha de nacimiento ya está registrada')
  )
    return 3;
  if (msg.startsWith('Antes de reservar necesitas llenar') || msg.startsWith('Para guardar tu ficha')) return 4;
  if (msg.startsWith('Antes de reservar necesitas aceptar')) return 5;
  if (
    msg.startsWith('Uno de los servicios') ||
    msg.startsWith('Los complementos') ||
    msg.startsWith('Elige al menos') ||
    msg.startsWith('Ese crédito')
  )
    return 1;
  return null;
}

export default function Reservar() {
  const base = useAsync(() => Promise.all([api.getConfiguracion(), api.getCatalogo()]), []);
  // Con la cita ya creada, la invitación de arriba ("Elige tus servicios…") ya no aplica.
  const [reservada, setReservada] = useState(false);

  useEffect(() => {
    const anterior = document.title;
    document.title = 'Reservar · Ópalo Spa';
    return () => {
      document.title = anterior;
    };
  }, []);

  return (
    <div className="rv">
      <header className="rv-cabeza">
        <div className="contenedor">
          <p className="eyebrow">Reserva en línea</p>
          <h1 className="rv-titulo">Reserva tu cita</h1>
          {!reservada && (
            <p className="texto-2 rv-intro">Elige tus servicios, el día y la hora. Toma unos minutos y tu lugar queda apartado al terminar.</p>
          )}
        </div>
      </header>
      <div className="contenedor rv-contenido">
        {base.cargando && <Cargando texto="Preparando la reserva…" />}
        <MensajeError error={base.error} onReintentar={base.recargar} />
        {base.datos && <Asistente config={base.datos[0]} cat={base.datos[1]} onReservada={setReservada} />}
      </div>
    </div>
  );
}

function Asistente({ config, cat, onReservada }: { config: Configuracion; cat: Catalogo; onReservada?: (si: boolean) => void }) {
  const { sesion, cargando: cargandoSesion, refrescar } = useSesion();
  const [params, setParams] = useSearchParams();
  const [estado, setEstado] = useState<EstadoReserva>(cargarEstado);
  const [ficha, setFicha] = useState<FichaBorrador | null>(null);
  const [confirmacion, setConfirmacion] = useState<DatosConfirmacion | null>(null);
  const [aviso, setAviso] = useState<{ paso: Paso | 7; texto: string; tipo: 'info' | 'alerta' | 'error' } | null>(null);
  const [duracionMin, setDuracionMin] = useState<number | null>(null);
  const [cargandoDuracion, setCargandoDuracion] = useState(false);
  const [creditos, setCreditos] = useState<Credito[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [errorFinal, setErrorFinal] = useState<string | null>(null);
  const fichaGuardada = useRef<string | null>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const pasoPrevio = useRef<number | null>(null);

  const firmaEnLinea = config.firma_en_linea === true;
  const porId = useMemo(() => mapaServicios(cat), [cat]);
  const paquetesPorId = useMemo(() => mapaPaquetes(cat), [cat]);
  const usuario = sesion?.user_id ?? null;

  // Guarda el estado en cada cambio.
  useEffect(() => {
    guardarEstado(estado);
  }, [estado]);

  // Si cambia la persona que inició sesión (o se cerró la sesión), lo personal se descarta:
  // ficha, políticas, notas y los servicios prepagados de la otra cuenta.
  useEffect(() => {
    if (cargandoSesion || !estado.usuario || estado.usuario === usuario) return;
    setFicha(null);
    fichaGuardada.current = null;
    setEstado((e) => ({
      ...e,
      items: e.items.map((it) => (it.credito_id ? { ...it, credito_id: null } : it)),
      usuario: null,
      datosListos: false,
      fichaPara: null,
      politicasMarcadas: [],
      politicasPara: null,
      consentimientoLeido: false,
      notas: '',
      creditoPendiente: null,
    }));
  }, [usuario, estado.usuario, cargandoSesion]);

  // Ítems válidos (sólo lo que existe y se puede reservar).
  const items = useMemo(
    () =>
      estado.items.filter((it) => {
        if (it.tipo === 'servicio') {
          const s = porId.get(it.id);
          return !!s && servicioReservable(s);
        }
        const p = paquetesPorId.get(it.id);
        return !!p && (paqueteReservable(p, porId) || (!!it.credito_id && p.activo));
      }),
    [estado.items, porId, paquetesPorId],
  );
  const firmaSel = firmaItems(items);
  const slugsCategorias = useMemo(() => categoriasDeItems(items, cat), [items, cat]);
  const servicios = useMemo(() => serviciosDeItems(items, cat), [items, cat]);
  const tipos = useMemo(() => tiposConsentimiento(servicios), [servicios]);
  const firmaFicha = `${usuario}|${slugsCategorias.join(',')}`;
  // Sin firma en línea el paso de políticas no depende de los servicios (sólo términos, privacidad y cancelación).
  const firmaPoliticas = firmaEnLinea ? `${usuario}|${tipos.join(',')}` : `${usuario}|`;

  // Preselección desde ?servicio=, ?paquete= o ?credito=.
  useEffect(() => {
    const sSlug = params.get('servicio');
    const pSlug = params.get('paquete');
    const cId = params.get('credito');
    if (!sSlug && !pSlug && !cId) return;
    const nuevos: ItemElegido[] = [];
    let texto: string | null = null;
    let tipo: 'info' | 'alerta' = 'info';
    if (sSlug) {
      const s = cat.servicios.find((x) => x.slug === sSlug);
      if (s && servicioReservable(s)) {
        // Si es un complemento, el paso 1 ya avisa que falta el servicio principal.
        nuevos.push({ tipo: 'servicio', id: s.id, credito_id: null });
      } else {
        texto = s
          ? `${s.nombre} todavía no se puede reservar en línea. Escríbenos por WhatsApp y con gusto te orientamos.`
          : 'No encontramos ese servicio; elige uno de la lista.';
        tipo = 'alerta';
      }
    }
    if (pSlug) {
      const p = cat.paquetes.find((x) => x.slug === pSlug);
      if (p && paqueteReservable(p, porId)) nuevos.push({ tipo: 'paquete', id: p.id, credito_id: null });
      else if (p && p.tipo === 'bono') {
        texto = `${p.nombre} es un bono de varias sesiones: se compra en la tienda y luego reservas cada sesión con tu servicio prepagado.`;
      } else {
        texto = p ? `${p.nombre} todavía no se puede reservar en línea.` : 'No encontramos ese paquete; elige de la lista.';
        tipo = 'alerta';
      }
    }
    setEstado((e) => {
      const juntos = [...e.items];
      for (const n of nuevos) if (!juntos.some((x) => x.tipo === n.tipo && x.id === n.id)) juntos.push(n);
      return { ...e, items: juntos, paso: 1, creditoPendiente: cId ?? e.creditoPendiente };
    });
    setAviso(texto ? { paso: 1, texto, tipo } : null);
    setParams({}, { replace: true });
  }, [params, setParams, cat, porId]);

  // Créditos de la clienta (para "Tus servicios prepagados" y ?credito=).
  useEffect(() => {
    if (!sesion?.cliente) {
      setCreditos([]);
      return;
    }
    let vivo = true;
    api
      .getMisCreditos()
      .then((c) => vivo && setCreditos(c))
      .catch(() => vivo && setCreditos([]));
    return () => {
      vivo = false;
    };
    // Sólo cuando cambia la clienta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesion?.cliente?.id]);

  // Aplica el ?credito= pendiente cuando ya hay sesión y créditos.
  useEffect(() => {
    const id = estado.creditoPendiente;
    if (!id || cargandoSesion) return;
    if (!sesion) {
      setAviso({ paso: 1, texto: 'Para usar tu servicio prepagado, inicia sesión en el paso "Tus datos"; lo aplicamos en cuanto regreses.', tipo: 'info' });
      return;
    }
    if (!sesion.cliente) return;
    let vivo = true;
    api
      .getMisCreditos()
      .then((lista) => {
        if (!vivo) return;
        const c = lista.find((x) => x.id === id);
        const it = c && creditoUsable(c) ? creditoAItem(c) : null;
        setEstado((e) => {
          if (!it) return { ...e, creditoPendiente: null };
          const existe = e.items.some((x) => x.tipo === it.tipo && x.id === it.id);
          const nuevos = existe ? e.items.map((x) => (x.tipo === it.tipo && x.id === it.id ? { ...x, credito_id: it.credito_id } : x)) : [...e.items, it];
          return { ...e, items: nuevos, creditoPendiente: null };
        });
        setAviso(
          it
            ? { paso: 1, texto: `Usarás tu servicio prepagado: ${c!.nombre}.`, tipo: 'info' }
            : { paso: 1, texto: 'Ese servicio prepagado ya no está disponible (se usó o venció). Puedes elegir servicios normalmente.', tipo: 'alerta' },
        );
      })
      .catch((e) => vivo && setAviso({ paso: 1, texto: mensajeError(e), tipo: 'error' }));
    return () => {
      vivo = false;
    };
  }, [estado.creditoPendiente, sesion, cargandoSesion]);

  // Duración estimada (R2, calculada por la base).
  useEffect(() => {
    if (items.length === 0) {
      setDuracionMin(null);
      return;
    }
    let vivo = true;
    setCargandoDuracion(true);
    api
      .getDuracionReserva(aItemsReserva(items))
      .then((d) => vivo && setDuracionMin(d))
      .catch(() => vivo && setDuracionMin(config.duracion_sesion_min))
      .finally(() => vivo && setCargandoDuracion(false));
    return () => {
      vivo = false;
    };
    // firmaSel resume los ítems
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaSel, config.duracion_sesion_min]);

  // ¿Qué pasos están completos?
  const okServicios = items.length > 0 && tieneServicioBase(items, cat);
  // Un horario guardado antes del día de apertura (o ya pasado) no cuenta.
  const slotVigente = !!estado.slot && fechaLocal(new Date(estado.slot.inicio)) >= primerDiaReservable(config.fecha_apertura);
  const okHorario = okServicios && slotVigente && estado.slotPara === firmaSel;
  const okDatos = okHorario && !!sesion?.cliente && estado.datosListos && estado.usuario === usuario;
  const okFicha = okDatos && !!ficha && estado.fichaPara === firmaFicha;
  const okPoliticas = okFicha && estado.politicasPara === firmaPoliticas;
  const completos = [okServicios, okHorario, okDatos, okFicha, okPoliticas];
  const primeroIncompleto = completos.findIndex((x) => !x);
  const maxPaso = (primeroIncompleto === -1 ? 6 : primeroIncompleto + 1) as Paso;
  const esperandoSesion = cargandoSesion && estado.paso >= 3;
  const paso: Paso = esperandoSesion ? estado.paso : (Math.min(estado.paso, maxPaso) as Paso);

  // Lleva el foco al título del paso al cambiar de paso.
  const pasoVisible = confirmacion ? 7 : paso;
  useEffect(() => {
    const anterior = pasoPrevio.current;
    pasoPrevio.current = pasoVisible;
    // Al abrir la página no se mueve el foco; sólo al cambiar de paso.
    if (anterior === null || anterior === pasoVisible) return;
    tituloRef.current?.focus({ preventScroll: true });
    tituloRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [pasoVisible]);

  const irA = useCallback((n: Paso) => {
    setErrorFinal(null);
    setEstado((e) => ({ ...e, paso: n }));
  }, []);

  /** Aplica cambios y avanza al primer paso que falte (máximo el 6). */
  function avanzar(patch: Partial<EstadoReserva>, fichaNueva: FichaBorrador | null = ficha) {
    setAviso(null);
    setEstado((e) => {
      const n = { ...e, ...patch };
      // Los ítems no cambian al avanzar: la firma de la selección es la actual.
      const s1 = okServicios;
      const s2 = s1 && !!n.slot && fechaLocal(new Date(n.slot.inicio)) >= primerDiaReservable(config.fecha_apertura) && n.slotPara === firmaSel;
      const s3 = s2 && !!sesion?.cliente && n.datosListos && n.usuario === usuario;
      const s4 = s3 && !!fichaNueva && n.fichaPara === firmaFicha;
      const s5 = s4 && n.politicasPara === firmaPoliticas;
      const idx = [s1, s2, s3, s4, s5].findIndex((x) => !x);
      return { ...n, paso: (idx === -1 ? 6 : idx + 1) as Paso };
    });
  }

  // Líneas del resumen
  const lineas: LineaResumen[] = items.map((it) => {
    const prepagado = !!it.credito_id;
    if (it.tipo === 'servicio') {
      const s = porId.get(it.id)!;
      return {
        clave: `s:${it.id}`,
        nombre: s.nombre,
        detalle: prepagado ? 'Servicio prepagado' : s.es_complemento ? 'Complemento' : null,
        precio: s.precio,
        prepagado,
      };
    }
    const p = paquetesPorId.get(it.id)!;
    return { clave: `p:${it.id}`, nombre: p.nombre, detalle: prepagado ? 'Paquete prepagado' : 'Paquete', precio: p.precio, prepagado };
  });
  const total = calcularTotal(lineas);

  const anios = sesion?.cliente?.fecha_nacimiento ? edad(sesion.cliente.fecha_nacimiento, fechaLocal()) : null;
  const requiereTutor = anios !== null && anios < config.edad_mayoria;

  /**
   * Guarda la ficha, acepta las políticas pendientes y crea la cita. Con firma en línea llega la firma del
   * paso 6; sin ella (ESPEC §9) la cita se crea sin firma y sólo se manda, si es menor de edad, el nombre
   * de quien la acompaña (la base lo pide igual). Ese nombre viaja en `firma.tutor_nombre`, sin firmante
   * ni trazo. Como sin firma en línea no se guarda en ningún consentimiento, también va en las notas de la
   * cita para que el equipo sepa quién la acompaña.
   */
  async function confirmar(datos: { firma: DatosFirma } | { tutor: string | null }) {
    if (!estado.slot || !ficha) return;
    setEnviando(true);
    setErrorFinal(null);
    try {
      const fichaFinal = fichaDesdeBorrador(ficha);
      const huella = JSON.stringify(fichaFinal);
      if (fichaGuardada.current !== huella) {
        await api.guardarFicha(fichaFinal);
        fichaGuardada.current = huella;
      }
      if (estado.politicasMarcadas.length) await api.aceptarPoliticas(estado.politicasMarcadas);
      const slot: Slot = estado.slot;
      const tutor = 'tutor' in datos ? datos.tutor?.trim() || null : null;
      const notas = [estado.notas.trim(), tutor ? `Me acompaña: ${tutor} (mamá, papá o tutor).` : ''].filter(Boolean).join('\n');
      const solicitud: SolicitudReserva = {
        items: aItemsReserva(items),
        inicio: slot.inicio,
        personal_id: slot.personal_id,
        notas: notas || null,
      };
      if ('firma' in datos) solicitud.firma = datos.firma;
      else if (tutor) solicitud.firma = { nombre_firmante: '', firma_svg: '', tutor_nombre: tutor };
      const resultado = await api.reservarCita(solicitud);
      // Datos definitivos (los calcula el servidor); si no se pueden leer, usamos lo que ya sabemos.
      let cita = null;
      try {
        cita = (await api.getMisCitas()).find((c) => c.id === resultado.id) ?? null;
      } catch {
        cita = null;
      }
      const totalFinal = cita ? totalCita(cita.items) : total;
      setConfirmacion({
        resultado,
        estado: cita?.estado ?? resultado.estado,
        inicio: cita?.inicio ?? slot.inicio,
        fin: cita?.fin ?? new Date(new Date(slot.inicio).getTime() + (duracionMin ?? config.duracion_sesion_min) * 60000).toISOString(),
        duracion_min: cita?.duracion_min ?? duracionMin ?? config.duracion_sesion_min,
        personal_nombre: cita?.personal_nombre ?? slot.personal_nombre,
        personal_titulo: cita?.personal_titulo ?? null,
        servicios: cita ? cita.items.map((i) => i.nombre) : lineas.map((l) => l.nombre),
        total_texto: totalFinal.texto,
        nota_pago: notaPago(totalFinal),
        cita: cita ?? undefined,
      });
      setFicha(null);
      fichaGuardada.current = null;
      borrarEstado();
      setEstado(estadoInicial());
      setAviso(null);
    } catch (e) {
      const msg = mensajeError(e);
      const destino = pasoDelError(msg);
      if (destino === null) {
        setErrorFinal(msg);
      } else {
        const patch: Partial<EstadoReserva> = { paso: destino };
        if (destino === 2) Object.assign(patch, { slot: null, slotPara: null });
        if (destino === 3) {
          Object.assign(patch, { datosListos: false });
          // Los datos de la sesión pueden estar viejos (p. ej. el equipo registró la fecha de nacimiento).
          void refrescar().catch(() => {});
        }
        if (destino === 4) Object.assign(patch, { fichaPara: null });
        if (destino === 5) Object.assign(patch, { politicasPara: null });
        setEstado((x) => ({ ...x, ...patch }));
        setAviso({
          paso: destino,
          texto:
            destino === 2
              ? `${msg} Conservamos todo lo demás: sólo elige otra hora y vuelve a ${firmaEnLinea ? 'firmar' : 'confirmar'}.`
              : msg,
          tipo: 'error',
        });
      }
    } finally {
      setEnviando(false);
    }
  }

  function reservarOtra() {
    setConfirmacion(null);
    setFicha(null);
    setEstado(estadoInicial());
  }

  const titulo = confirmacion ? '¡Listo! Tu cita está reservada' : titulosPasos(firmaEnLinea)[paso];
  useEffect(() => {
    onReservada?.(!!confirmacion);
  }, [confirmacion, onReservada]);

  return (
    <div className="rv-asistente">
      {!confirmacion && <Progreso paso={paso} maxPaso={maxPaso} nombres={nombresPasos(firmaEnLinea)} onIr={irA} />}
      <div className={confirmacion ? 'rv-sola' : 'rv-rejilla'}>
        <section className="rv-principal" aria-labelledby="rv-titulo-paso">
          <h2 id="rv-titulo-paso" className="rv-titulo-paso" tabIndex={-1} ref={tituloRef}>
            {titulo}
          </h2>
          {aviso && aviso.paso === pasoVisible && (
            <div className={`aviso aviso-${aviso.tipo}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>
              <span>{aviso.texto}</span>
              <button type="button" className="btn btn-texto btn-sm" onClick={() => setAviso(null)}>
                Cerrar aviso
              </button>
            </div>
          )}

          {confirmacion ? (
            <Confirmacion conf={confirmacion} config={config} onOtra={reservarOtra} />
          ) : esperandoSesion ? (
            <Cargando texto="Revisando tu sesión…" />
          ) : paso === 1 ? (
            <PasoServicios
              cat={cat}
              items={items}
              onCambiar={(nuevos) => setEstado((e) => ({ ...e, items: nuevos }))}
              creditos={creditos}
              total={total}
              duracionMin={duracionMin}
              onContinuar={() => avanzar({})}
            />
          ) : paso === 2 ? (
            <PasoHorario
              config={config}
              duracionMin={cargandoDuracion ? null : duracionMin}
              fecha={estado.fecha}
              slot={estado.slot && estado.slotPara === firmaSel ? estado.slot : null}
              onFecha={(f) => setEstado((e) => ({ ...e, fecha: f, slot: e.fecha === f ? e.slot : null, slotPara: e.fecha === f ? e.slotPara : null }))}
              onSlot={(s) => setEstado((e) => ({ ...e, slot: s, slotPara: firmaSel }))}
              onAtras={() => irA(1)}
              onContinuar={() => avanzar({})}
            />
          ) : paso === 3 ? (
            <PasoDatos
              config={config}
              sesion={sesion}
              refrescar={refrescar}
              onAtras={() => irA(2)}
              onListo={() => avanzar({ datosListos: true, usuario })}
            />
          ) : paso === 4 ? (
            <PasoFicha
              categorias={slugsCategorias}
              ficha={ficha}
              onFicha={setFicha}
              onAtras={() => irA(3)}
              onListo={() => avanzar({ fichaPara: firmaFicha })}
            />
          ) : paso === 5 ? (
            <PasoPoliticas
              firmaEnLinea={firmaEnLinea}
              tipos={tipos}
              marcadas={estado.politicasMarcadas}
              consentimientoLeido={estado.consentimientoLeido}
              onAtras={() => irA(4)}
              onListo={(r) => avanzar({ politicasMarcadas: r.marcadas, consentimientoLeido: r.consentimientoLeido, politicasPara: firmaPoliticas })}
            />
          ) : !estado.slot ? null : firmaEnLinea ? (
            <PasoFirma
              lineas={lineas}
              total={total}
              duracionMin={duracionMin}
              slot={estado.slot}
              tipos={tipos}
              requiereTutor={requiereTutor}
              nombreSugerido={nombreCompleto(sesion?.cliente)}
              notas={estado.notas}
              onNotas={(t) => setEstado((e) => ({ ...e, notas: t }))}
              enviando={enviando}
              error={errorFinal}
              onAtras={() => irA(5)}
              onConfirmar={(firma) => void confirmar({ firma })}
            />
          ) : (
            <PasoConfirmar
              lineas={lineas}
              total={total}
              duracionMin={duracionMin}
              slot={estado.slot}
              requiereTutor={requiereTutor}
              notas={estado.notas}
              onNotas={(t) => setEstado((e) => ({ ...e, notas: t }))}
              enviando={enviando}
              error={errorFinal}
              onAtras={() => irA(5)}
              onConfirmar={(tutor) => void confirmar({ tutor })}
            />
          )}
        </section>

        {!confirmacion && (
          // En el paso 6 el resumen ya está dentro del paso: en pantallas chicas no se repite abajo.
          <aside className={`rv-resumen${paso === 6 ? ' rv-resumen-final' : ''}`} aria-label="Resumen de tu cita">
            <ResumenReserva
              lineas={lineas}
              total={total}
              duracionMin={duracionMin}
              cargandoDuracion={cargandoDuracion}
              slot={okHorario ? estado.slot : null}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
