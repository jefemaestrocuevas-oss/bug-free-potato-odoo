// Cuentas del modo demostración (sólo existen en el navegador; no aplican con Supabase).

/**
 * El modo demostración sólo se usa a propósito: en desarrollo (npm run dev), con `--mode demo`
 * (vista previa) y en las pruebas. Es una constante de compilación: en la versión que se publica
 * vale false y el empaquetador quita las cuentas de ejemplo y sus contraseñas.
 */
export const DEMO_PERMITIDO = import.meta.env.DEV || import.meta.env.MODE === 'demo' || import.meta.env.MODE === 'test';

/** Aviso del modo demostración: el mismo en el sitio y en el panel. */
export const AVISO_DEMO = 'Modo demostración: los datos se guardan sólo en este navegador.';

export const PASSWORD_DEMO = 'demo1234';

const CUENTAS = [
  { etiqueta: 'Clienta de ejemplo', email: 'clienta@demo.opalo.mx', password: PASSWORD_DEMO, rol: 'cliente' as const },
  { etiqueta: 'Especialista (personal)', email: 'especialista@demo.opalo.mx', password: PASSWORD_DEMO, rol: 'personal' as const },
  { etiqueta: 'Socia/o (administración)', email: 'admin@demo.opalo.mx', password: PASSWORD_DEMO, rol: 'admin' as const },
];

export const CUENTAS_DEMO: typeof CUENTAS = DEMO_PERMITIDO ? CUENTAS : [];
