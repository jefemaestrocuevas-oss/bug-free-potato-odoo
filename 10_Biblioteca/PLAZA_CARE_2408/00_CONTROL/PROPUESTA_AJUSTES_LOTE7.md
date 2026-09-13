# PROPUESTA DE AJUSTES — LOTE 7

**Proyecto:** PLAZA CARE 2408 · **Corte:** 2026-09-13 · **Estado:** propuesto, no iniciado

> **Nota de procedencia.** Esta propuesta se consolida en este repositorio a partir del corte
> de sesión. El identificador concreto de cada spec (`<spec#n>`) se asigna al redactarla en el
> arnés de la PC — aquí se describe **qué debe hacer** la operación del puente, no un id
> inventado. Las cifras marcadas `<pendiente>` sólo pueden llenarse leyendo `MODELO_QA.json`
> y `DERIVADOS.tsv` en la PC.

---

## 1. Estado del modelo antes del lote 7

| Elemento | Estado actual | Ajuste que lo toca |
|---|---|---|
| Archivo de trabajo | `Proyecto1.rvt` en `OneDrive\Documentos`, fuera del expediente | 1 |
| Lotes 1–3 | aplicados y guardados | — |
| Lotes 4–6 (alzados, secciones, láminas, losa D, líneas de propiedad) | aplicados, **sin guardar** | 1 |
| Nivel de PA / datum | provisional, sin confirmar contra proyecto | 2 |
| Niveles de cuerpos B, C, D | sin definir | 3 |
| Diseño vigente | SketchUp **SEP 363** sin confirmar como vigente | 4 |
| Niveles +7.60 / +11.10 | no modelados | 4 |
| Losas y masas de los 32 locales tipo | no modelados | 4 |
| Torre | no modelada | 4 |
| Escalera curva extremo este | no modelada | 5 |
| Cancelería | genérica, no es muro cortina real | 6 |
| Puertas de cuerpos B / C | ausentes | 7 |
| Ejes homónimos | duplicados / en conflicto | 8 |
| Lindero legal, norte, Survey Point | sin fijar contra `PC-T0` / `PC-T1` | 9 |
| Nombres de locales | provisionales | 10 |
| Estacionamiento y pisos exteriores | no modelados | 11 |
| Revisión arquitectónica | sin revisor independiente | 12 |

**Features:** `CIA-BIM-001` activa · `CIA-BIM-002` pausada.

---

## 2. Resumen de los 12 ajustes

| # | Ajuste | Pregunta | Bloqueado por | Reversible |
|:--:|---|---|---|:--:|
| 1 | Guardar el RVT en el expediente | `CIA-P-122` | acción del usuario | ✅ |
| 2 | Nivel real de PA / datum | `CIA-P-120` | **respuesta 120** | ✅ |
| 3 | Nivel de los cuerpos B, C, D | `CIA-P-124` | ajuste 2 | ✅ |
| 4 | SketchUp SEP 363 como diseño vigente | `CIA-P-121` | **respuesta 121** | ⚠️ parcial |
| 5 | Escalera curva del extremo este | — | ajuste 2 (desnivel) | ✅ |
| 6 | Cancelería como muro cortina real | `CIA-P-123` | — | ⚠️ parcial |
| 7 | Puertas de B / C | `CIA-P-126` | ajuste 3 | ✅ |
| 8 | Ejes homónimos | `CIA-P-125` | — | ✅ |
| 9 | Lindero legal / norte / Survey Point | `CIA-P-127`, `CIA-P-086`, `PC-T0`/`PC-T1` | — | ⚠️ parcial |
| 10 | Nombres reales de locales | — | ajuste 4 | ✅ |
| 11 | Estacionamiento y pisos exteriores | `CIA-P-092` | ajuste 9 | ✅ |
| 12 | Revisor arquitectónico independiente | — | ajustes 1–11 | n/a |

**Orden recomendado:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12.
El orden no es arbitrario: 2 fija el datum del que cuelgan 3 y 5; 4 define la geometría que
10 nombra; 9 fija el sistema de coordenadas que 11 usa.

---

## 3. Detalle por ajuste

### 1 — Guardar el RVT en el expediente  ·  `CIA-P-122`
- **Qué necesito de ti:** que confirmes el destino y ejecutes el guardado en Revit.
  «Guardar como» → `04_MODELO_REVIT/CIA_PC_ARQ_LOCAL_PRELIMINAR_R02B.rvt`.
  Como mínimo `Ctrl+S` sobre `Proyecto1.rvt` para no perder los lotes 4–6.
- **Operación del puente:** ninguna — es acción manual en Revit. El puente sólo verifica
  después (`-Estado`) que el modelo abierto es el del expediente.
- **Reversible:** ✅ sí. El original queda intacto.
- **Por qué va primero:** todo lo demás se aplica sobre este archivo. Aplicar ajustes sobre
  un RVT que luego no se guarda tira el trabajo.

### 2 — Nivel real de PA / datum  ·  `CIA-P-120`
- **Qué necesito de ti:** la **cota real de PA** y contra qué datum se mide.
- **Operación del puente:** spec que reasigna la elevación del nivel PA. En Revit, mover el
  nivel arrastra lo que está asociado a él, así que **no hay que remodelar**: se mueve el
  nivel y todo sigue.
- **Reversible:** ✅ sí — es un cambio de parámetro; se revierte reasignando la cota anterior.
- **Bloquea:** ajustes 3 y 5.

### 3 — Nivel de los cuerpos B, C, D  ·  `CIA-P-124`
- **Qué necesito de ti:** la cota de cada cuerpo (B, C, D), o la confirmación de que comparten
  la de PA.
- **Operación del puente:** spec que crea/ajusta los niveles por cuerpo y reasocia los
  elementos existentes de cada cuerpo a su nivel.
- **Reversible:** ✅ sí, mientras se registre la asociación previa en el `-Estado`.
- **Depende de:** ajuste 2.

### 4 — SketchUp SEP 363 como diseño vigente  ·  `CIA-P-121`
- **Qué necesito de ti:** confirmar que **SEP 363 es el diseño vigente** (y si no, cuál lo es).
- **Alcance si se confirma** — esto es el grueso del lote 7:
  - niveles **+7.60** y **+11.10**;
  - **losas** de esos niveles;
  - **masas de los 32 locales tipo**;
  - la **torre**.
- **Operación del puente:** serie de specs (una por bloque: niveles → losas → masas → torre),
  cada una con su `-Estado` comparado contra `MODELO_QA.json`. No hacerlo en una sola spec:
  si falla a la mitad, el rollback es mucho más costoso.
- **Reversible:** ⚠️ parcial. Los niveles y losas sí; las masas y la torre implican geometría
  nueva cuya eliminación hay que hacer por spec inversa, no a mano.
- **Bloquea:** ajuste 10.

### 5 — Escalera curva del extremo este
- **Qué necesito de ti:** el **desnivel definido** que salva (depende del ajuste 2), y el radio
  / huella si no se toma del SEP 363.
- **Operación del puente:** spec de escalera por boceto curvo entre las dos cotas.
- **Reversible:** ✅ sí — elemento aislado, se borra sin arrastrar nada.
- **Depende de:** ajuste 2.

### 6 — Cancelería como muro cortina real  ·  `CIA-P-123`
- **Qué necesito de ti:** confirmar que la cancelería debe ser **muro cortina real con puertas
  de cristal** (no muro genérico con acabado), y el despiece de montantes si está definido.
- **Operación del puente:** spec que sustituye el tipo por muro cortina, define rejilla y
  coloca las puertas de cristal como paneles.
- **Reversible:** ⚠️ parcial. Cambiar de tipo destruye la cancelería genérica previa; el
  retorno es re-aplicar el tipo anterior, no un undo.
- **Nota:** hacerlo antes del ajuste 7 evita colocar puertas dos veces.

### 7 — Puertas de B / C  ·  `CIA-P-126`
- **Qué necesito de ti:** tipo, ancho y posición de las puertas de los cuerpos B y C.
- **Operación del puente:** spec de colocación de puertas en los muros de B y C.
- **Reversible:** ✅ sí.
- **Depende de:** ajuste 3 (las puertas van al nivel del cuerpo).

### 8 — Ejes homónimos  ·  `CIA-P-125`
- **Qué necesito de ti:** el criterio de renombrado — qué eje conserva el nombre y cómo se
  distinguen los homónimos (sufijo por cuerpo, renumeración, etc.).
- **Operación del puente:** spec de renombrado de rejillas.
- **Reversible:** ✅ sí — es nomenclatura; se revierte con el mapa inverso, que la spec debe
  dejar registrado en el `-Estado`.

### 9 — Lindero legal / norte / Survey Point  ·  `CIA-P-127`, `CIA-P-086`, `PC-T0`/`PC-T1`
- **Qué necesito de ti:** el **lindero legal** (cuadro de construcción o DXF de referencia),
  el **norte** a usar, y las coordenadas de `PC-T0` / `PC-T1` para fijar el Survey Point.
- **Operación del puente:** spec que fija Survey Point y norte verdadero, y traza las líneas
  de propiedad del lindero legal. Ojo: el lote 6 ya dejó líneas de propiedad — esta spec las
  **reemplaza**, no las suma.
- **Reversible:** ⚠️ parcial. Mover el Survey Point reubica el modelo respecto al mundo; hay
  que capturar la posición previa en el `-Estado` antes de aplicar.
- **Bloquea:** ajuste 11.

### 10 — Nombres reales de locales
- **Qué necesito de ti:** la tabla de nombres reales por local (o confirmar que se toman del
  SEP 363).
- **Operación del puente:** spec que escribe el parámetro de nombre en las masas/locales
  creados por el ajuste 4.
- **Reversible:** ✅ sí.
- **Depende de:** ajuste 4 — sin las masas de los 32 locales tipo no hay a qué poner nombre.

### 11 — Estacionamiento y pisos exteriores  ·  `CIA-P-092`
- **Qué necesito de ti:** traza del estacionamiento, número de cajones y acabados de pisos
  exteriores.
- **Operación del puente:** spec de suelos exteriores + líneas de cajones.
- **Reversible:** ✅ sí.
- **Depende de:** ajuste 9 (la traza se referencia al lindero).

### 12 — Revisor arquitectónico independiente
- **Qué necesito de ti:** a quién designas como revisor, y si la revisión es sobre el R02B o
  sobre una revisión posterior.
- **Operación del puente:** ninguna. Es control de calidad humano sobre el resultado de 1–11.
- **Reversible:** n/a.
- **Por qué va al final:** revisar antes de cerrar los 11 anteriores genera observaciones sobre
  geometría que va a cambiar igual.

---

## 4. Evidencia exigida por ajuste

Ningún ajuste se marca aplicado sin las cuatro piezas:

1. Spec ejecutada vía `tools/dynamo_uia.ps1 -Spec <spec#n> -Ejecutar -Estado`.
2. `-Estado` capturado **antes y después**.
3. Diferencia contra el baseline `MODELO_QA.json`.
4. Derivado registrado con su hash en `DERIVADOS.tsv`.

Para los ajustes marcados «reversible ⚠️ parcial» (4, 6, 9) el `-Estado` **previo** no es
opcional: es el único camino de vuelta.

---

## 5. Camino crítico

```
[usuario: Ctrl+S / Guardar como]  ──► 1
[usuario: responde CIA-P-120]     ──► 2 ──► 3 ──► 7
                                      └──► 5
[usuario: responde CIA-P-121]     ──► 4 ──► 10
                                  ──► 6
                                  ──► 8
                                  ──► 9 ──► 11
                                            └──► 12
```

Dos respuestas (`CIA-P-120`, `CIA-P-121`) destraban 6 de los 12 ajustes. Los ajustes 6 y 8 no
dependen de nadie y pueden adelantarse hoy mismo.
