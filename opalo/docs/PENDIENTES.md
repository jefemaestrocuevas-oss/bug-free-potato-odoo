# Ópalo — Datos que faltan para dejar la base completa

Todo esto se puede capturar **desde el panel interno** (`/admin`) sin tocar código.
Entre paréntesis va la pregunta de la presentación *Construyamos Ópalo* de donde sale.

## 1. Precios por confirmar (Catálogo y precios)

Tienen precio en la lista: cejas $120, axilas $120, cara con ceja $330, cadera $500,
bikini clásico $220, brasileño $280, completo $330, pierna completa $450, los cinco
tratamientos faciales $750, shot hidratante $180, ampolleta retardadora $185,
ampolleta despigmentante $235, azuleno $285, y los paquetes Express $300, Media $520,
Rostro $420 y Total $800.

**Sin precio todavía** (se pueden reservar, pero no se venden en línea hasta tener precio):

- Labio superior (bigote), patillas, barbilla, pómulos
- Brazos completos, abdomen, media espalda, espalda completa
- Muslos, media pierna
- Limpieza facial
- Reductivo (por zona)

> De las cuentas de los paquetes se *deduce* bigote ≈ $80 y media pierna ≈ $250
> (Express $300 con 6–7 % de descuento; Media "sueltos $450"). No los cargamos
> porque nadie los ha confirmado (PRE01).

- ¿El Paquete Media se queda en $520 o cambia? (PRE01)
- ¿Los faciales despigmentante y anti acné cuestan más que el hidratante? (PRE01)
- Precio de bienvenida para las clientas de siempre: ¿cuál y hasta cuándo? (PRE02)

## 2. Qué incluye cada servicio (zonas)

Bikini clásico, brasileño y completo; cadera; cara con ceja (SER05). Se escribe en el
campo **"Zonas que incluye"** y aparece en la página de servicios.

## 3. Qué entra el 31 de octubre (etapa de cada servicio)

Todos los servicios están en **disponible**. Lo que la especialista diga que va a
"segunda etapa" o "necesita curso" se cambia en *Catálogo* y deja de poder reservarse
(SER01, SER02).

## 4. Tiempos reales y horario

- Hoy toda cita dura **1 hora** (la sesión estándar). Si un servicio o combinación tarda
  más, se captura su duración en minutos y la agenda reserva 2 horas automáticamente
  (COS01).
- Horario provisional cargado: **martes a viernes 10:00–19:00, sábado 9:00–15:00**,
  lunes y domingo cerrado. Ajustar en *Equipo y capacitaciones → Horario* (COS04).
- Nombre, título, foto y bio de la especialista (hoy dice "Especialista de Ópalo")
  (CLI17).

## 5. Ficha de salud y contraindicaciones

Cargamos 13 preguntas (las 8 condiciones de SER06 + las de faciales y corporales). Hoy
**todas mandan la cita a "por revisar"** cuando la clienta responde "sí": la cita queda
pendiente y la especialista confirma por WhatsApp. Cuando ella dicte su lista final,
cada condición puede cambiar a:
- `no_se_realiza` — no se puede reservar ese servicio en línea,
- `revisar` — se reserva pero queda por confirmar (como hoy),
- `precaucion` — se reserva normal y sólo aparece la alerta en la agenda.

## 6. Políticas y consentimiento

Los seis documentos (términos, aviso de privacidad, cancelación y los tres
consentimientos informados) son **borradores**: deben revisarlos la especialista y un
abogado antes de abrir. Faltan la razón social, el RFC y un correo para temas de
privacidad (SOC07). Regla de lidocaína (SER09). Garantía de retoque (b1).

## 7. Insumos y costos (para saber cuánto deja cada servicio)

Para que la base calcule el costo y el margen de cada servicio hay que capturar:
1. **Productos**: marca, presentación, contenido (g/ml/pz), costo, stock mínimo
   (INS01–INS05).
2. **Proveedores** (INS06).
3. **Recetas**: cuánto se gasta de cada producto por servicio (INS01, INS03).

Mientras no haya recetas, el costo de material aparece en $0 y el margen sale inflado.

## 8. Gastos fijos

Cargamos como recurrentes (sin monto): renta, cuota de mantenimiento del edificio,
luz CFE (bimestral), agua, internet y celular de WhatsApp. Falta el monto estimado y el
día de pago de cada uno.

## 9. Decisiones de la sociedad que el sistema ya soporta

- **Propinas**: se registran aparte del ingreso del spa (son de quien atiende) (b8).
- **Anticipo por WhatsApp**: la base aún no lo exige; se puede agregar cuando lo decidan
  (b2).
- **Bonos de varias sesiones** (p. ej. 3 axilas por $300): la base los soporta como
  paquete tipo `bono`; no hay ninguno cargado hasta que lo aprueben (b4).
- **Pago en línea**: hoy el pedido queda "pendiente de pago" y se paga en el spa o por
  transferencia. Conectar Mercado Pago o Stripe es el siguiente paso cuando lo quieran.

## 10. Firma en cabina (decisión del 8 de octubre)

- Las clientas ya no firman en línea ni ven la firma en el sitio; se firma en la tablet de
  cabina antes del servicio (**Agenda → Firmar en cabina**). Para volver a pedir la firma en
  línea basta con cambiar `configuracion.firma_en_linea` a `true`.
- Los términos y el aviso de privacidad **sí** dicen que el consentimiento se firma en el spa
  (el aviso de privacidad debe declarar que se recaba la firma). Confirmarlo con el abogado.
- Tablet de cabina: activar Acceso guiado (iPad) o fijación de pantalla (Android).

## 11. Tienda de jabones y velas

Lo que falta definir para cargar la línea real (desde **Panel → Taller**):
1. **Productos**: nombre, aroma, contenido neto (g), ingredientes para la etiqueta (nombres
   INCI), modo de uso, advertencias y foto. Los nombres del modo demostración y de los diseños
   (avena y miel, lavanda, carbón activado, rosa y arcilla; velas de lavanda y eucalipto,
   vainilla y coco, naranja y canela) son **propuestas**.
2. **Materias primas** con su costo (aceites, sosa, cera de soya, mechas, fragancias, frascos,
   etiquetas) y su proveedor.
3. **Fórmulas** por lote: cuánto se usa de cada materia prima, cuántas piezas salen y días de
   curado. Con eso el panel calcula el costo por pieza y sugiere precio según el margen.
4. **Precios de venta** (hoy ningún producto real tiene precio).
5. **Existencias**: hoy un pedido en línea no aparta piezas; se validan al cobrar. Si prefieren
   apartar al hacer el pedido, hay que decidirlo (ver ESPEC §10.5).
6. **Requisitos sanitarios y de etiquetado** para fabricar y vender jabones y velas: revisarlos
   con quien les asesore antes de imprimir etiquetas (los diseños dejan espacio para
   ingredientes, lote, caducidad, responsable y "Hecho en México").
7. Envío a domicilio: por ahora sólo se recoge en Ópalo.
