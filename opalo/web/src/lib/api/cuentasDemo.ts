// Cuentas del modo demostración (sólo existen en el navegador; no aplican con Supabase).
export const PASSWORD_DEMO = 'demo1234';

export const CUENTAS_DEMO = [
  { etiqueta: 'Clienta de ejemplo', email: 'clienta@demo.opalo.mx', password: PASSWORD_DEMO, rol: 'cliente' as const },
  { etiqueta: 'Especialista (personal)', email: 'especialista@demo.opalo.mx', password: PASSWORD_DEMO, rol: 'personal' as const },
  { etiqueta: 'Socia/o (administración)', email: 'admin@demo.opalo.mx', password: PASSWORD_DEMO, rol: 'admin' as const },
];
