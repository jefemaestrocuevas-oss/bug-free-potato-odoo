// ESPEC §9 en Mi cuenta: con configuracion.firma_en_linea = false no se invita a firmar (ni avisos de
// "falta tu firma" en las citas); /cuenta/firmar/:id sólo explica que la firma es en el spa, y
// "Mis documentos" muestra la copia de lo firmado en el spa. Con true vuelve la firma desde el portal.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CitaDetalle, Configuracion, ConsentimientoFirmado, Politica, Sesion } from '../../lib/api/tipos';
import { SeccionCitas } from '../../components/cuenta/SeccionCitas';
import { SeccionDocumentos } from '../../components/cuenta/SeccionDocumentos';
import FirmarPendiente, { MSG_FIRMA_EN_SPA } from './FirmarPendiente';

const m = vi.hoisted(() => ({
  getMisCitas: vi.fn(),
  getConfiguracion: vi.fn(),
  getMisConsentimientos: vi.fn(),
  getPoliticasVigentes: vi.fn(),
  getCatalogo: vi.fn(),
  cancelarCita: vi.fn(),
  sesion: null as unknown,
}));
vi.mock('../../lib/api', () => ({
  api: {
    modo: 'demo',
    getMisCitas: m.getMisCitas,
    getConfiguracion: m.getConfiguracion,
    getMisConsentimientos: m.getMisConsentimientos,
    getPoliticasVigentes: m.getPoliticasVigentes,
    getCatalogo: m.getCatalogo,
    cancelarCita: m.cancelarCita,
  },
}));
vi.mock('../../lib/sesion', () => ({
  useSesion: () => ({ sesion: m.sesion, cargando: false, refrescar: vi.fn(), esPersonal: false, esAdmin: false }),
}));

/** "firm" al inicio de palabra: firma, firmar, firmes… (no "confirmar"). */
const SIN_FIRMA = /\bfirm/i;

const CONFIG: Configuracion = {
  nombre_negocio: 'Ópalo',
  lema: null,
  telefono_whatsapp: '4421701466',
  direccion: 'Querétaro, Qro.',
  zona_horaria: 'America/Mexico_City',
  duracion_sesion_min: 60,
  intervalo_slots_min: 60,
  anticipacion_min_horas: 2,
  ventana_reserva_dias: 60,
  horas_cancelacion: 24,
  tolerancia_retraso_min: 15,
  edad_minima: 15,
  edad_mayoria: 18,
  vigencia_creditos_dias: 365,
  fecha_apertura: '2026-10-31',
  firma_en_linea: false,
};
const CON_FIRMA: Configuracion = { ...CONFIG, firma_en_linea: true };

const SESION: Sesion = {
  user_id: 'u-1',
  email: 'mariana@ejemplo.mx',
  rol: 'cliente',
  cliente: { id: 'c-1', nombre: 'Mariana', apellidos: 'López (ejemplo)', telefono: '4420000001', email: 'mariana@ejemplo.mx', fecha_nacimiento: '1994-05-12', acepta_promociones: false },
};

/** Cita próxima sin consentimiento firmado (se firma en la cabina). */
const CITA: CitaDetalle = {
  id: 'cita-1',
  cliente_id: 'c-1',
  cliente_nombre: 'Mariana López (ejemplo)',
  cliente_telefono: null,
  inicio: '2099-11-03T16:00:00.000Z',
  fin: '2099-11-03T17:00:00.000Z',
  duracion_min: 60,
  estado: 'confirmada',
  origen: 'web',
  primera_vez: false,
  requiere_revision: false,
  alertas: [],
  notas_cliente: null,
  total: 120,
  personal_id: 'pe-1',
  personal_nombre: 'Sofía (ejemplo)',
  personal_titulo: null,
  cabina_nombre: null,
  consentimientos_firmados: 0,
  pagado: 0,
  items: [{ nombre: 'Axilas', precio: 120, duracion_min: null, servicio_id: 's-1', paquete_id: null }],
};

const POLITICA: Politica = {
  id: 'pol-dep-1',
  tipo: 'consentimiento_depilacion',
  version: 1,
  titulo: 'Consentimiento informado: depilación con cera',
  contenido_md: '# Consentimiento\n\nTexto del documento de ejemplo.',
  hash_sha256: null,
  vigente_desde: null,
};

const CONSENTIMIENTO: ConsentimientoFirmado = {
  id: 'con-1',
  cita_id: 'cita-0',
  politica_tipo: 'consentimiento_depilacion',
  politica_titulo: POLITICA.titulo,
  politica_version: 1,
  nombre_firmante: 'Mariana López (ejemplo)',
  tutor_nombre: null,
  firma_svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 9"/></svg>',
  documento_hash: 'a'.repeat(64),
  firmado_en: '2026-11-03T15:50:00.000Z',
};

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar(veces = 6) {
  for (let i = 0; i < veces; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
}

async function montar(el: JSX.Element, url = '/') {
  await act(async () => {
    raiz.render(<MemoryRouter initialEntries={[url]}>{el}</MemoryRouter>);
  });
  await esperar();
}

/** Texto visible: sin el contenido de los documentos plegados. */
function textoVisible(): string {
  const copia = contenedor.cloneNode(true) as HTMLElement;
  copia.querySelectorAll('.rv-documento').forEach((d) => d.remove());
  return copia.textContent ?? '';
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.sesion = SESION;
  m.getMisCitas.mockReset().mockResolvedValue([CITA]);
  m.getConfiguracion.mockReset().mockResolvedValue(CONFIG);
  m.getMisConsentimientos.mockReset().mockResolvedValue([CONSENTIMIENTO]);
  m.getPoliticasVigentes.mockReset().mockResolvedValue([POLITICA]);
  m.getCatalogo.mockReset().mockResolvedValue({ categorias: [], servicios: [], paquetes: [] });
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
  vi.restoreAllMocks();
});

describe('Mis citas', () => {
  it('firma_en_linea = false: la cita sin consentimiento no pide firmar', async () => {
    await montar(<SeccionCitas config={CONFIG} />);
    expect(contenedor.textContent).toContain('Axilas');
    expect(contenedor.querySelector('a[href="/cuenta/firmar/cita-1"]')).toBeNull();
    expect(contenedor.textContent).not.toMatch(SIN_FIRMA);
  });

  it('firma_en_linea = true: avisa que falta la firma y lleva a firmar', async () => {
    await montar(<SeccionCitas config={CON_FIRMA} />);
    const enlace = contenedor.querySelector('a[href="/cuenta/firmar/cita-1"]');
    expect(enlace?.textContent).toBe('Firmar consentimiento');
    expect(contenedor.textContent).toContain('Falta tu firma del consentimiento informado.');
  });
});

describe('/cuenta/firmar/:citaId', () => {
  const pagina = (
    <Routes>
      <Route path="/cuenta/firmar/:citaId" element={<FirmarPendiente />} />
    </Routes>
  );

  it('firma_en_linea = false: explica que la firma es en el spa y regresa a Mis citas, sin panel de firma', async () => {
    await montar(pagina, '/cuenta/firmar/cita-1');
    expect(contenedor.textContent).toContain(MSG_FIRMA_EN_SPA);
    expect(MSG_FIRMA_EN_SPA).toBe('La firma se hace en el spa, el día de tu cita.');
    expect(contenedor.querySelector('a[href="/cuenta/citas"]')).not.toBeNull();
    expect(contenedor.querySelector('canvas')).toBeNull();
    expect(contenedor.textContent).not.toContain('Firmar consentimiento');
    expect(m.getMisCitas).not.toHaveBeenCalled();
  });

  it('firma_en_linea = true: conserva la firma desde el portal', async () => {
    m.getConfiguracion.mockResolvedValue(CON_FIRMA);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); // jsdom no dibuja
    await montar(pagina, '/cuenta/firmar/cita-1');
    await esperar();
    expect(contenedor.querySelector('h1')?.textContent).toBe('Firma tu consentimiento');
    expect(contenedor.querySelector('canvas[aria-label="Recuadro de firma"]')).not.toBeNull();
    expect([...contenedor.querySelectorAll('button')].some((b) => b.textContent === 'Firmar consentimiento')).toBe(true);
  });
});

describe('Mis documentos', () => {
  it('firma_en_linea = false: muestra la copia de lo firmado en el spa, sin invitar a firmar', async () => {
    await montar(<SeccionDocumentos firmaEnLinea={false} />);
    expect(contenedor.querySelector('h2')?.textContent).toBe('Mis documentos');
    expect(contenedor.textContent).toContain('Tu copia de los consentimientos que firmaste en el spa.');
    expect(contenedor.textContent).toContain('Mariana López (ejemplo)');
    const copia = contenedor.querySelector('details.cu-copia')!;
    expect(copia.querySelector('summary')?.textContent).toBe('Leer el documento');
    expect(copia.textContent).toContain('Texto del documento de ejemplo.');
    // Nada lleva a firmar ni a la página pública del consentimiento (que no se publica).
    expect(contenedor.querySelector('a[href^="/politicas/"]')).toBeNull();
    expect(contenedor.querySelector('a[href^="/cuenta/firmar"]')).toBeNull();
  });

  it('firma_en_linea = false y sin documentos: no menciona la firma', async () => {
    m.getMisConsentimientos.mockResolvedValue([]);
    await montar(<SeccionDocumentos firmaEnLinea={false} />);
    expect(contenedor.textContent).toContain('Aún no tienes documentos');
    expect(textoVisible()).not.toMatch(SIN_FIRMA);
  });

  it('versión anterior a la vigente: explica cómo pedir esa copia (con firma en línea, enlaza a la vigente)', async () => {
    m.getPoliticasVigentes.mockResolvedValue([{ ...POLITICA, version: 2 }]);
    await montar(<SeccionDocumentos firmaEnLinea />);
    expect(contenedor.textContent).toContain('Si quieres el texto de la versión 1, pídelo en el spa o por WhatsApp.');
    expect(contenedor.querySelector('details.cu-copia')).toBeNull();
    expect(contenedor.querySelector('a[href="/politicas/consentimiento_depilacion"]')?.textContent).toBe('Ver la política vigente');
  });
});
