// Operaciones de la clienta con sesión iniciada. Escribe sólo por RPC, salvo sus datos básicos.
import { ErrorOpalo, type OpaloApi } from '../tipos';
import {
  aCitaDetalle,
  aCliente,
  aConsentimiento,
  aCredito,
  aFichaSalud,
  aPedidoDetalle,
  aResultadoPedido,
  aResultadoReserva,
  COLUMNAS_CITA_DETALLE,
  COLUMNAS_CLIENTE,
  COLUMNAS_CONSENTIMIENTO,
  COLUMNAS_CREDITO,
  COLUMNAS_PEDIDO_DETALLE,
  limpio,
  texto,
} from './conversion';
import type { Contexto } from './contexto';
import { itemsReserva } from './publico';

type ApiClienta = Pick<
  OpaloApi,
  | 'actualizarMisDatos'
  | 'getMiFicha'
  | 'guardarFicha'
  | 'getMisAceptaciones'
  | 'aceptarPoliticas'
  | 'reservarCita'
  | 'getMisCitas'
  | 'cancelarCita'
  | 'firmarConsentimientoCita'
  | 'crearPedido'
  | 'cancelarPedido'
  | 'getMisPedidos'
  | 'getMisCreditos'
  | 'canjearRegalo'
  | 'getMisConsentimientos'
>;

export const COLUMNAS_FICHA = 'id, respuestas, detalles, alergias, medicamentos, observaciones, acepta_datos_sensibles, creado_en';

/** Ficha vigente (la más reciente) de una clienta. */
export function consultaFichaVigente(ctx: Contexto, clienteId: string) {
  return ctx.sb
    .from('fichas_salud')
    .select(COLUMNAS_FICHA)
    .eq('cliente_id', clienteId)
    .order('creado_en', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function consultaConsentimientos(ctx: Contexto, clienteId: string) {
  return ctx.sb
    .from('consentimientos')
    .select(COLUMNAS_CONSENTIMIENTO)
    .eq('cliente_id', clienteId)
    .order('firmado_en', { ascending: false });
}

export function crearApiClienta(ctx: Contexto): ApiClienta {
  const { sb } = ctx;

  return {
    async actualizarMisDatos(datos) {
      const uid = await ctx.exigirUid();
      const nombre = (datos.nombre ?? '').trim();
      if (!nombre) throw new ErrorOpalo('Escribe tu nombre.');
      const f = await ctx.fila(
        sb
          .from('clientes')
          .update({
            nombre,
            apellidos: limpio(datos.apellidos),
            telefono: limpio(datos.telefono),
            fecha_nacimiento: limpio(datos.fecha_nacimiento),
            acepta_promociones: !!datos.acepta_promociones,
          })
          .eq('usuario_id', uid)
          .select(COLUMNAS_CLIENTE)
          .maybeSingle(),
      );
      if (!f) throw await ctx.errorSinFilas('propio');
      ctx.recordarCliente(uid, texto(f.id));
      return aCliente(f);
    },

    async getMiFicha() {
      const id = await ctx.miClienteId();
      return aFichaSalud(await ctx.fila(consultaFichaVigente(ctx, id)));
    },

    async guardarFicha(ficha) {
      await ctx.rpc('guardar_ficha_salud', {
        p_respuestas: ficha.respuestas ?? {},
        p_detalles: ficha.detalles ?? {},
        p_alergias: limpio(ficha.alergias),
        p_medicamentos: limpio(ficha.medicamentos),
        p_observaciones: limpio(ficha.observaciones),
        p_acepta_datos_sensibles: ficha.acepta_datos_sensibles === true,
      });
    },

    async getMisAceptaciones() {
      const id = await ctx.miClienteId();
      const fs = await ctx.filas(sb.from('aceptaciones_politica').select('politica_id').eq('cliente_id', id));
      return fs.map((f) => texto(f.politica_id));
    },

    async aceptarPoliticas(politica_ids) {
      await ctx.rpc('aceptar_politicas', { p_politica_ids: politica_ids ?? [], p_user_agent: ctx.userAgent() });
    },

    async reservarCita(s) {
      const data = await ctx.rpc('reservar_cita', {
        p_items: itemsReserva(s.items),
        p_inicio: s.inicio,
        p_nombre_firmante: (s.firma?.nombre_firmante ?? '').trim(),
        p_firma_svg: s.firma?.firma_svg ?? '',
        p_personal_id: s.personal_id || null,
        p_notas: limpio(s.notas),
        p_tutor_nombre: limpio(s.firma?.tutor_nombre),
        p_user_agent: ctx.userAgent(),
      });
      return aResultadoReserva(data);
    },

    async getMisCitas() {
      const id = await ctx.miClienteId();
      const fs = await ctx.filas(
        sb.from('v_citas_detalle').select(COLUMNAS_CITA_DETALLE).eq('cliente_id', id).order('inicio', { ascending: false }),
      );
      return fs.map(aCitaDetalle);
    },

    async cancelarCita(cita_id, motivo) {
      await ctx.rpc('cancelar_cita', { p_cita_id: cita_id, p_motivo: limpio(motivo) });
    },

    async firmarConsentimientoCita(cita_id, firma) {
      await ctx.rpc('firmar_consentimiento_cita', {
        p_cita_id: cita_id,
        p_nombre_firmante: (firma?.nombre_firmante ?? '').trim(),
        p_firma_svg: firma?.firma_svg ?? '',
        p_tutor_nombre: limpio(firma?.tutor_nombre),
        p_user_agent: ctx.userAgent(),
      });
    },

    async crearPedido(items, metodo_pago, notas) {
      const data = await ctx.rpc('crear_pedido', {
        p_items: (items ?? []).map((it) => ({
          tipo: it.tipo,
          id: it.id,
          cantidad: Math.round(Number(it.cantidad)),
          regalo_para: limpio(it.regalo_para),
        })),
        p_metodo_pago: metodo_pago,
        p_notas: limpio(notas),
      });
      return aResultadoPedido(data);
    },

    async cancelarPedido(pedido_id) {
      await ctx.rpc('cancelar_pedido', { p_pedido_id: pedido_id });
    },

    async getMisPedidos() {
      const id = await ctx.miClienteId();
      const fs = await ctx.filas(
        sb.from('v_pedidos_detalle').select(COLUMNAS_PEDIDO_DETALLE).eq('cliente_id', id).order('creado_en', { ascending: false }),
      );
      return fs.map(aPedidoDetalle);
    },

    async getMisCreditos() {
      const id = await ctx.miClienteId();
      const fs = await ctx.filas(
        sb.from('v_creditos').select(COLUMNAS_CREDITO).eq('cliente_id', id).order('creado_en', { ascending: false }),
      );
      return fs.map(aCredito);
    },

    async canjearRegalo(codigo) {
      await ctx.rpc('canjear_regalo', { p_codigo: (codigo ?? '').replace(/[^A-Za-z0-9]/g, '').toUpperCase() });
    },

    async getMisConsentimientos() {
      const id = await ctx.miClienteId();
      return (await ctx.filas(consultaConsentimientos(ctx, id))).map(aConsentimiento);
    },
  };
}
