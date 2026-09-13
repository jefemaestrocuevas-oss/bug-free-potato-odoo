# HANDOFF — PLAZA CARE 2408 (CIA / modelo Revit)

**Corte:** 2026-09-13 · **Propósito:** retomar el trabajo en otro chat sin perder contexto.
**Estado del modelo:** lotes 1–6 aplicados en sesión; lote 7 propuesto y a la espera de dos respuestas.

---

## 0. Dónde está cada cosa (leer esto primero)

Este repositorio (`bug-free-potato-odoo`) estaba **vacío** hasta este commit. Contiene
**solo el handoff documental**: el corte de estado, la cola de preguntas y la propuesta del
lote 7. No contiene el modelo ni el arnés.

| Artefacto | Dónde vive | Accesible desde un chat remoto |
|---|---|---|
| `HANDOFF.md`, `progress/CURRENT.md`, `PROPUESTA_AJUSTES_LOTE7.md` | **este repo** | ✅ sí |
| `Proyecto1.rvt` (modelo en sesión) | PC local — `OneDrive\Documentos` | ❌ no |
| `04_MODELO_REVIT/CIA_PC_ARQ_LOCAL_PRELIMINAR_R02B.rvt` (destino del expediente) | PC local | ❌ no |
| `tools/dynamo_uia.ps1` (puente Revit/Dynamo) | PC local | ❌ no |
| `MODELO_QA.json` (baseline de verificación) | PC local | ❌ no |
| `DERIVADOS.tsv` (hashes de derivados) | PC local | ❌ no |
| `features.json`, bitácora, memoria de sesión | PC local | ❌ no |
| DXF / PNG intermedios | PC local, sin versionar | ❌ no |

> ⚠️ **Aviso para el siguiente chat.** El corte de sesión anterior menciona los commits
> `22af281` y `7e03d74` sobre `master`. **Esos commits no están en este repositorio remoto**
> — pertenecen al repo Git local de la PC. Si necesitas su contenido exacto (hashes de
> `DERIVADOS.tsv`, cifras de `MODELO_QA.json`, texto original de la bitácora), hay que leerlo
> en la PC: aquí no está y **no debe reconstruirse de memoria**. Todo número de este handoff
> que no provenga del corte está marcado como `<pendiente>`.

---

## 1. Estado del modelo

| Lote | Contenido | Estado |
|---|---|---|
| 1–3 | Base del modelo | ✅ aplicado **y guardado** en `Proyecto1.rvt` |
| 4 | Alzados y secciones | ⚠️ aplicado, **sin guardar** |
| 5 | Láminas | ⚠️ aplicado, **sin guardar** |
| 6 | Losa del cuerpo D, líneas de propiedad | ⚠️ aplicado, **sin guardar** |
| 7 | Propuesta de 12 ajustes | ⏳ no iniciado — ver `PROPUESTA_AJUSTES_LOTE7.md` |

**Features:** `CIA-BIM-001` **activa** · `CIA-BIM-002` **pausada**.

**Riesgo abierto:** los lotes 4–6 sólo existen en la sesión de Revit abierta. Si esa sesión
se cierra sin guardar, se pierden. Ver §3.

---

## 2. Pasos exactos de reanudación

Secuencia del corte anterior, en orden:

1. **`init`** — arrancar la sesión de trabajo.
2. **Leer la documentación** — este `HANDOFF.md`, luego `progress/CURRENT.md`, luego
   `10_Biblioteca/PLAZA_CARE_2408/00_CONTROL/PROPUESTA_AJUSTES_LOTE7.md`.
3. **Abrir Revit** con el RVT vigente (§0: `Proyecto1.rvt`, o el R02B del expediente si ya
   se hizo el «Guardar como» del ajuste 1).
4. **Abrir Dynamo** desde Revit con la secuencia de teclado **`Alt, G, V, D`**.
5. **Ejecutar la spec** con el puente:
   ```powershell
   tools/dynamo_uia.ps1 -Spec <spec#n> -Ejecutar -Estado
   ```
6. **Comparar el resultado contra `MODELO_QA.json`** — ésa es la evidencia. Sin esa
   comparación, un lote no se considera aplicado.

### Evidencia en el arnés
El criterio de aceptación de cada ajuste es la comparación de `-Estado` contra el baseline
`MODELO_QA.json`, no la inspección visual en Revit. Cada ajuste del lote 7 debe dejar:
su spec ejecutada, el `-Estado` capturado, la diferencia contra el baseline, y el derivado
con su hash en `DERIVADOS.tsv`.

---

## 3. Dos cosas que dependen de ti (bloquean el cierre limpio)

1. **Guardar el modelo en Revit.** `Proyecto1.rvt` (tu `OneDrive\Documentos`) tiene los
   lotes 1–3; los lotes **4–6** (alzados, secciones, láminas, losa D, líneas de propiedad)
   siguen en la sesión **sin guardar**.
   - Mínimo: **`Ctrl+S`**.
   - Preferible: **«Guardar como»** →
     `04_MODELO_REVIT/CIA_PC_ARQ_LOCAL_PRELIMINAR_R02B.rvt` (esto también cierra el
     ajuste 1 del lote 7, `CIA-P-122`).
2. **Responder las preguntas `CIA-P-120` y `CIA-P-121`** — nivel real de PA y vigencia del
   SketchUp SEP 363. Destraban 6 de los 12 ajustes del lote 7 (ver la columna «Bloqueado por»
   en la propuesta).

---

## 4. Cola de preguntas abiertas

| Id | Asunto | Ajuste que destraba |
|---|---|---|
| `CIA-D-009` | Decisión en cola (ver bitácora local) | — |
| `CIA-P-120` | **Nivel real de PA / datum** | 2 (y en cascada 3, 5) |
| `CIA-P-121` | **SketchUp SEP 363: ¿diseño vigente?** | 4 (y en cascada 10) |
| `CIA-P-122` | Guardar el RVT en el expediente | 1 |
| `CIA-P-123` | Cancelería como muro cortina real | 6 |
| `CIA-P-124` | Nivel de los cuerpos B, C, D | 3 |
| `CIA-P-125` | Ejes homónimos | 8 |
| `CIA-P-126` | Puertas de B / C | 7 |
| `CIA-P-127` | Lindero legal / norte / Survey Point | 9 |
| `CIA-P-086` | Referencia de lindero / norte (antecedente de 127) | 9 |
| `CIA-P-092` | Estacionamiento y pisos exteriores | 11 |
| `PC-T0` / `PC-T1` | Puntos de control topográfico | 9 |

Las dos en negrita son las prioritarias.

---

## 5. Lote 7

Los **12 ajustes propuestos**, en orden, con lo que se necesita de ti, la operación del
puente y si son reversibles, están en:

**[`10_Biblioteca/PLAZA_CARE_2408/00_CONTROL/PROPUESTA_AJUSTES_LOTE7.md`](10_Biblioteca/PLAZA_CARE_2408/00_CONTROL/PROPUESTA_AJUSTES_LOTE7.md)**

Resumen del alcance geométrico si `CIA-P-121` se confirma vigente: niveles **+7.60** y
**+11.10**, losas y masas de los **32 locales tipo**, y la torre.

---

## 6. Trampas técnicas ya resueltas

Registradas en la **memoria de sesión local** (no replicada en este repo). Las que constan
en el corte:

- **Apertura de Dynamo** desde Revit: sólo por secuencia de teclado `Alt, G, V, D`.
- **Ejecución de specs**: siempre vía `tools/dynamo_uia.ps1` con `-Ejecutar -Estado`; el
  `-Estado` es lo que se compara contra `MODELO_QA.json`.

El resto del detalle está en la memoria de sesión de la PC. **No reconstruir de memoria** —
leerlo allí.

---

## 7. Qué NO está versionado

- Los **DXF / PNG intermedios**.
- El **RVT** (ni `Proyecto1.rvt` ni el R02B).
- Los cambios de la **sesión C-28 de la tarde** — quedan en el árbol de trabajo del repo
  local, para esa sesión.
