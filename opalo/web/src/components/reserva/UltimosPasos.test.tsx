// ESPEC §9: pasos 5 (políticas) y 6 (revisa y confirma / firma) de la reserva en los dos modos de
// configuracion.firma_en_linea. Con false (lo de Ópalo) nada habla de firmar; con true vuelve la firma.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Politica, Slot, TipoPolitica } from '../../lib/api/tipos';
import { duracion, fechaLarga, hora } from '../../lib/format';
import { eventoDeCita, generarIcs } from './ics';
import { MSG_TUTOR, PasoConfirmar } from './PasoConfirmar';
import { PasoFirma } from './PasoFirma';
import { PasoPoliticas } from './PasoPoliticas';
import type { LineaResumen } from './Piezas';
import { calcularTotal } from './utilidades';

const m = vi.hoisted(() => ({ getPoliticasVigentes: vi.fn(), getMisAceptaciones: vi.fn(), getConfiguracion: vi.fn() }));
vi.mock('../../lib/api', () => ({
  api: { modo: 'demo', getPoliticasVigentes: m.getPoliticasVigentes, getMisAceptaciones: m.getMisAceptaciones, getConfiguracion: m.getConfiguracion },
}));

/** "firm" al inicio de palabra: firma, firmar, firmes, Firmado… (no "confirmar"). */
const SIN_FIRMA = /\bfirm/i;

function politica(tipo: TipoPolitica, id: string): Politica {
  return { id, tipo, version: 1, titulo: `Documento ${tipo}`, contenido_md: `Texto de ${tipo}.`, hash_sha256: null, vigente_desde: null };
}
const VIGENTES = [politica('terminos', 't1'), politica('privacidad', 'p1'), politica('cancelacion', 'c1'), politica('consentimiento_depilacion', 'cd1')];

const SLOT: Slot = { inicio: '2026-11-03T16:00:00.000Z', fin: '2026-11-03T17:00:00.000Z', personal_id: 'pe1', personal_nombre: 'Sofía (ejemplo)' };
const LINEAS: LineaResumen[] = [
  { clave: 's:1', nombre: 'Axilas', precio: 180, prepagado: false },
  { clave: 's:2', nombre: 'Bigote', precio: null, prepagado: false },
];

let contenedor: HTMLDivElement;
let raiz: Root;

async function esperar(veces = 5) {
  for (let i = 0; i < veces; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
}

async function montar(el: JSX.Element) {
  await act(async () => {
    raiz.render(<MemoryRouter>{el}</MemoryRouter>);
  });
  await esperar();
}

const boton = (texto: string) => [...contenedor.querySelectorAll('button')].find((b) => b.textContent === texto);
const casillas = () => [...contenedor.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];

function escribir(el: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  m.getPoliticasVigentes.mockReset().mockResolvedValue(VIGENTES);
  // Ya aceptó el aviso de privacidad: sólo faltan términos y cancelación.
  m.getMisAceptaciones.mockReset().mockResolvedValue(['p1']);
  m.getConfiguracion.mockReset().mockReturnValue(new Promise(() => {}));
  contenedor = document.createElement('div');
  document.body.appendChild(contenedor);
  raiz = createRoot(contenedor);
});

afterEach(() => {
  act(() => raiz.unmount());
  contenedor.remove();
});

describe('Paso 5 · políticas', () => {
  it('firma_en_linea = false: sólo pide las políticas generales que faltan, sin consentimiento ni firma', async () => {
    const onListo = vi.fn();
    await montar(
      <PasoPoliticas firmaEnLinea={false} tipos={['consentimiento_depilacion']} marcadas={[]} consentimientoLeido={false} onAtras={() => {}} onListo={onListo} />,
    );
    expect(casillas()).toHaveLength(2);
    expect(contenedor.textContent).toContain('Términos y condiciones');
    expect(contenedor.textContent).toContain('Política de cancelación');
    expect(contenedor.textContent).not.toContain('Aviso de privacidad'); // ya aceptado
    expect(contenedor.textContent).not.toContain('consentimiento_depilacion');
    expect(contenedor.textContent).not.toMatch(/consentimiento informado/i);
    expect(contenedor.textContent).not.toMatch(SIN_FIRMA);
    expect(boton('Continuar a la firma')).toBeUndefined();

    await act(async () => boton('Continuar')!.click());
    expect(contenedor.querySelector('[role=alert]')?.textContent).toContain('Antes de reservar necesitas aceptar');
    expect(onListo).not.toHaveBeenCalled();

    for (const c of casillas()) await act(async () => c.click());
    await act(async () => boton('Continuar')!.click());
    expect(onListo).toHaveBeenCalledWith({ marcadas: ['t1', 'c1'], consentimientoLeido: false });
  });

  it('firma_en_linea = false y ya aceptó todo: sólo lo confirma y deja seguir', async () => {
    m.getMisAceptaciones.mockResolvedValue(['t1', 'p1', 'c1']);
    const onListo = vi.fn();
    await montar(<PasoPoliticas firmaEnLinea={false} tipos={['consentimiento_depilacion']} marcadas={[]} consentimientoLeido={false} onAtras={() => {}} onListo={onListo} />);
    expect(contenedor.textContent).toContain('Ya aceptaste la versión vigente');
    expect(casillas()).toHaveLength(0);
    await act(async () => boton('Continuar')!.click());
    expect(onListo).toHaveBeenCalledWith({ marcadas: [], consentimientoLeido: false });
  });

  it('firma_en_linea = true: muestra el consentimiento y pide marcarlo como leído antes de la firma', async () => {
    const onListo = vi.fn();
    await montar(
      <PasoPoliticas firmaEnLinea tipos={['consentimiento_depilacion']} marcadas={['t1', 'c1']} consentimientoLeido={false} onAtras={() => {}} onListo={onListo} />,
    );
    expect(contenedor.textContent).toContain('Texto de consentimiento_depilacion.');
    expect(contenedor.textContent).toContain('lo firmaré en el siguiente paso');
    await act(async () => boton('Continuar a la firma')!.click());
    expect(contenedor.textContent).toContain('Marca que leíste el consentimiento para continuar.');
    expect(onListo).not.toHaveBeenCalled();
    await act(async () => casillas().at(-1)!.click());
    await act(async () => boton('Continuar a la firma')!.click());
    expect(onListo).toHaveBeenCalledWith({ marcadas: ['t1', 'c1'], consentimientoLeido: true });
  });
});

describe('Paso 6 · revisa y confirma (firma_en_linea = false)', () => {
  function paso(extra: Partial<Parameters<typeof PasoConfirmar>[0]> = {}) {
    const onConfirmar = vi.fn();
    const el = (
      <PasoConfirmar
        lineas={LINEAS}
        total={calcularTotal(LINEAS)}
        duracionMin={60}
        slot={SLOT}
        requiereTutor={false}
        notas=""
        onNotas={() => {}}
        enviando={false}
        error={null}
        onAtras={() => {}}
        onConfirmar={onConfirmar}
        {...extra}
      />
    );
    return { el, onConfirmar };
  }

  it('resume servicios, día, hora, quién te atiende, tiempo estimado y total, y confirma sin firma', async () => {
    const { el, onConfirmar } = paso();
    await montar(el);
    const texto = contenedor.textContent ?? '';
    for (const esperado of ['Axilas', 'Bigote', 'Por confirmar', fechaLarga(SLOT.inicio), hora(SLOT.inicio), 'Sofía (ejemplo)', duracion(60), calcularTotal(LINEAS).texto])
      expect(texto).toContain(esperado);
    expect(texto).not.toMatch(SIN_FIRMA);
    expect(texto).not.toMatch(/consentimiento/i);
    expect(contenedor.querySelector('canvas')).toBeNull();
    await act(async () => boton('Confirmar mi cita')!.click());
    expect(onConfirmar).toHaveBeenCalledWith(null);
  });

  it('menor de edad: pide el nombre de quien la acompaña antes de confirmar', async () => {
    const { el, onConfirmar } = paso({ requiereTutor: true });
    await montar(el);
    expect(contenedor.textContent).toContain('Nombre de mamá, papá o tutor que te acompañará');
    expect(contenedor.textContent).not.toMatch(SIN_FIRMA);
    await act(async () => boton('Confirmar mi cita')!.click());
    expect(contenedor.querySelector('#rv-tutor-error')?.textContent).toBe(MSG_TUTOR);
    expect(onConfirmar).not.toHaveBeenCalled();
    await act(async () => escribir(contenedor.querySelector<HTMLInputElement>('#rv-tutor')!, '  Laura Pérez '));
    await act(async () => boton('Confirmar mi cita')!.click());
    expect(onConfirmar).toHaveBeenCalledWith('Laura Pérez');
  });

  it('un error del servidor se muestra con sus atajos', async () => {
    const { el } = paso({ error: 'Ya tienes 3 citas próximas; para agendar otra escríbenos por WhatsApp al 442 170 1466.' });
    await montar(el);
    const alerta = contenedor.querySelector('[role=alert]')!;
    expect(alerta.textContent).toContain('Ya tienes 3 citas próximas');
    expect(alerta.querySelector('a[href="/cuenta/citas"]')).not.toBeNull();
    expect([...alerta.querySelectorAll('a')].some((a) => a.getAttribute('href')?.includes('wa.me'))).toBe(true);
  });

  it('el evento de calendario no menciona la firma', () => {
    const ics = generarIcs(
      eventoDeCita(
        { id: 'c1', inicio: SLOT.inicio, fin: SLOT.fin, servicios: ['Axilas', 'Bigote'], personal_nombre: SLOT.personal_nombre },
        { nombre_negocio: 'Ópalo', direccion: 'Querétaro, Qro.', telefono_whatsapp: '4421701466', tolerancia_retraso_min: 10, horas_cancelacion: 24 },
      ),
    );
    expect(ics).toContain('SUMMARY:Cita en Ópalo: Axilas y Bigote');
    expect(ics).toContain('Te atiende Sofía (ejemplo).');
    expect(ics).not.toMatch(SIN_FIRMA);
  });
});

describe('Paso 6 · firma en pantalla (firma_en_linea = true)', () => {
  it('pide la firma antes de confirmar', async () => {
    // jsdom no dibuja en canvas; PanelFirma tolera que no haya contexto.
    const lienzo = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const onConfirmar = vi.fn();
    await montar(
      <PasoFirma
        lineas={LINEAS}
        total={calcularTotal(LINEAS)}
        duracionMin={60}
        slot={SLOT}
        tipos={['consentimiento_depilacion']}
        requiereTutor={false}
        nombreSugerido="Mariana López"
        notas=""
        onNotas={() => {}}
        enviando={false}
        error={null}
        onAtras={() => {}}
        onConfirmar={onConfirmar}
      />,
    );
    expect(contenedor.textContent).toContain('Tu firma');
    expect(contenedor.querySelector('canvas[aria-label="Recuadro de firma"]')).not.toBeNull();
    await act(async () => boton('Confirmar mi cita')!.click());
    expect(contenedor.querySelector('[role=alert]')?.textContent).toContain('Falta tu firma o tu nombre completo.');
    expect(onConfirmar).not.toHaveBeenCalled();
    lienzo.mockRestore();
  });
});
