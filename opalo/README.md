# Ópalo · sitio web y base de datos

Sistema web del spa **Ópalo** (Momentum Centro Sur, Torre 2, Int. 207, Querétaro ·
WhatsApp 442 170 1466). Un solo sitio con tres partes:

| Parte | Para quién | Qué hace |
|---|---|---|
| **Sitio público** | cualquiera | Servicios y paquetes con precios, tienda (comprar servicios para usar después o regalar), equipo y capacitaciones, políticas. |
| **Reserva y Mi cuenta** | clientas | Reservar en un calendario (sesiones de 1 h), llenar la ficha de salud, aceptar políticas, **firmar el consentimiento en pantalla**; ver sus citas (quién atiende, tiempo estimado), pedidos, servicios prepagados y documentos firmados. |
| **Panel interno** `/admin` | especialista y socios | Agenda, clientas y expedientes, pedidos y pagos, inventario con alertas de reposición, costo y margen por servicio, gastos (luz, agua, internet, renta…), resultados del mes, catálogo y precios, equipo, políticas. |

## Cómo está hecho

- **Base de datos:** PostgreSQL en [Supabase](https://supabase.com) (cuentas de usuario,
  seguridad por fila, funciones). Todo en `supabase/`. Explicación para no técnicos en
  [`docs/MODELO_DATOS.md`](docs/MODELO_DATOS.md); contrato técnico en
  [`docs/ESPEC.md`](docs/ESPEC.md).
- **Sitio:** React + Vite + TypeScript en `web/`. Funciona en **modo demostración**
  (datos de ejemplo guardados en el navegador) mientras no se conecte Supabase.
- **Catálogo:** una sola fuente, [`datos/catalogo.json`](datos/catalogo.json), y las
  políticas en [`datos/politicas/`](datos/politicas/). De ahí sale `supabase/seed.sql`.
- **Lo que falta confirmar** con la especialista: [`docs/PENDIENTES.md`](docs/PENDIENTES.md).

## Verlo en tu computadora (modo demostración)

```bash
cd opalo/web
npm install
npm run dev        # abre http://localhost:5173
```

Entra a **Mi cuenta → Entrar** y usa uno de los botones de cuentas de ejemplo
(clienta, especialista o socia/o administración). Los datos viven sólo en tu navegador;
"Reiniciar datos" en la franja superior los regresa al inicio.

## Pruebas

```bash
cd opalo/web && npm test && npm run build      # sitio
bash opalo/supabase/scripts/probar_local.sh    # base de datos (necesita PostgreSQL 16 local)
```

## Publicarlo de verdad (cuando lo decidan)

1. **Supabase** (plan gratuito para empezar): crear proyecto en la región más cercana,
   aplicar las migraciones de `supabase/migrations/` en orden y luego `supabase/seed.sql`
   (ver [`supabase/README.md`](supabase/README.md)). Activar el inicio de sesión por
   correo. Crear la cuenta de cada socio y la especialista desde el sitio y darles rol
   `admin` o `personal`.
2. **Sitio**: en Vercel, Netlify o Cloudflare Pages (gratis), carpeta `opalo/web`,
   comando `npm run build`, salida `dist`, con las variables `VITE_SUPABASE_URL` y
   `VITE_SUPABASE_ANON_KEY` (ver `web/.env.example`). Configurar que todas las rutas
   sirvan `index.html`.
3. Dominio propio (p. ej. `opalospa.mx`) apuntando al sitio.

> El plan gratuito de Supabase pausa el proyecto tras una semana sin uso; con el spa
> abierto y clientas reservando eso no pasa, pero conviene revisarlo antes de abrir.

## Qué sigue

- Revisar con la especialista y un abogado las políticas y el consentimiento.
- Capturar precios faltantes, insumos, recetas y gastos fijos (ver `docs/PENDIENTES.md`).
- Pago en línea (Mercado Pago o Stripe) y recordatorios automáticos por WhatsApp o correo.
