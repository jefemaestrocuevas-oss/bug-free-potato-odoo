# RUN ACTUAL — PLAZA CARE 2408

**Corte:** 2026-09-13 · **Sesión:** cierre para retomar en otro chat
**Estado global:** 🟡 en pausa por dos respuestas pendientes del usuario (`CIA-P-120`, `CIA-P-121`)

---

## Siguiente acción concreta

```
1. init
2. leer HANDOFF.md → progress/CURRENT.md → PROPUESTA_AJUSTES_LOTE7.md
3. abrir Revit con el RVT vigente
4. abrir Dynamo:  Alt, G, V, D
5. tools/dynamo_uia.ps1 -Spec <spec#n> -Ejecutar -Estado
6. comparar -Estado contra MODELO_QA.json   ← ésta es la evidencia
```

No arrancar el lote 7 antes de tener respuesta a `CIA-P-120` y `CIA-P-121`: seis de los doce
ajustes dependen de ellas y aplicarlos antes obliga a rehacerlos.

---

## Run por lotes

| Lote | Contenido | Aplicado | Guardado en disco | Evidencia vs `MODELO_QA.json` |
|---|---|:---:|:---:|---|
| 1 | Base del modelo | ✅ | ✅ `Proyecto1.rvt` | en repo local |
| 2 | Base del modelo | ✅ | ✅ `Proyecto1.rvt` | en repo local |
| 3 | Base del modelo | ✅ | ✅ `Proyecto1.rvt` | en repo local |
| 4 | Alzados y secciones | ✅ | ❌ **sólo en sesión** | en repo local |
| 5 | Láminas | ✅ | ❌ **sólo en sesión** | en repo local |
| 6 | Losa cuerpo D, líneas de propiedad | ✅ | ❌ **sólo en sesión** | en repo local |
| 7 | 12 ajustes propuestos | ⏳ | — | — |

---

## Bloqueos activos

| # | Bloqueo | Dueño | Impacto si no se resuelve |
|---|---|---|---|
| B1 | Lotes 4–6 sin guardar en Revit (`Ctrl+S`) | **usuario** | se pierden al cerrar la sesión de Revit |
| B2 | `CIA-P-120` — nivel real de PA / datum | **usuario** | bloquea ajustes 2, 3, 5 |
| B3 | `CIA-P-121` — vigencia del SketchUp SEP 363 | **usuario** | bloquea ajustes 4, 10 |
| B4 | `CIA-D-009` en cola | por definir | ver bitácora local |

---

## Features

| Feature | Estado |
|---|---|
| `CIA-BIM-001` | 🟢 activa |
| `CIA-BIM-002` | ⏸️ pausada |

---

## Registro del arnés

- **Puente:** `tools/dynamo_uia.ps1` (PC local). Apertura de Dynamo por `Alt, G, V, D`.
- **Baseline de QA:** `MODELO_QA.json` (PC local).
- **Derivados:** `DERIVADOS.tsv` con hashes (PC local). Los DXF/PNG intermedios no se versionan.
- **Cola / bitácora:** `CIA-D-009`, `CIA-P-120`…`CIA-P-127` (PC local).

> Los hashes y las cifras de QA **no se transcriben aquí**: están únicamente en la PC. Este
> documento registra el *estado* del run, no sustituye la evidencia del arnés.

---

## Qué queda fuera de este commit

- El RVT y los DXF/PNG intermedios.
- Los cambios de la **sesión C-28 de la tarde** (quedan en el árbol de trabajo local).
