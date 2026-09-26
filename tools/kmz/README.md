# Generador de KMZ

Convierte una tabla de coordenadas (CSV) en un `.kmz` que se abre en Google Earth,
Google Earth Web, Google My Maps o la app de Google Earth en el celular.

Sólo usa Python 3 estándar: no hay que instalar bibliotecas.

## Uso rápido en Windows

1. Llena la tabla en Excel con las columnas de abajo y guárdala como **CSV UTF-8**.
2. Arrastra el `.csv` sobre **`generar_kmz.bat`**.
3. El `.kmz` aparece junto al CSV, con el mismo nombre. En la ventana se ven la superficie,
   el perímetro, un enlace de Google Maps al centro y los avisos si algo se ve raro.

Desde la terminal:

```
python generar_kmz.py terreno.csv terreno.kmz --nombre "Terreno Ricardo" --vertices
```

`--vertices` agrega una carpeta con cada vértice marcado y etiquetado.

## Columnas del CSV

Una fila por vértice. En las filas que siguen al primer vértice, `elemento` y `tipo`
pueden quedar vacíos: se toman de la fila anterior.

| Columna | Obligatoria | Qué va |
|---|---|---|
| `elemento` | sí | Nombre que se verá en el mapa (ej. `Terreno Ricardo`) |
| `tipo` | sí | `punto`, `linea` o `poligono` |
| `etiqueta` | no | Nombre del vértice (`V1`, `A`, `EST 1`…) |
| `lat`, `lon` | una de las tres formas | Grados decimales (`20.5931`, `-100.392`) o grados-minutos-segundos (`20°35'30.5"N`) |
| `coordenadas` | ″ | `lat, lon` en una sola celda, tal cual lo copia Google Maps |
| `este`, `norte`, `zona` | ″ | UTM WGS84 en metros. `zona` como `14Q`, `13R`, `14` o `14 sur` |
| `color` | no | `rojo` (por defecto), `amarillo`, `verde`, `azul`, `naranja`, `blanco`, `morado`… o `#RRGGBB` |
| `descripcion` | no | Texto que aparece al hacer clic en el elemento |

También reconoce `x`/`y` para este/norte, `latitud`/`longitud`, y separador `;` (Excel en
español). Ver `ejemplo.csv`.

**Cuadro de construcción:** en los cuadros mexicanos la columna **Y es el norte** y la
**X es el este**. Cópialas a `norte` y `este`, no al revés; si quedan invertidas, el script
lo detecta y lo avisa.

## Qué revisa antes de generar

- Latitud y longitud invertidas, o UTM puesto en columnas de lat/lon.
- X y Y invertidos en UTM, y UTM sin zona.
- La banda de la zona (`14Q`) contra la latitud real del punto. Con `14S`, avisa si
  quisiste decir «sur».
- Un punto a más de 50 km del resto, casi siempre por un signo `-` que falta en la
  longitud.
- Vértices repetidos, polígonos con menos de 3 vértices y lados que se cruzan (vértices
  fuera de orden).

Si hay un error, lo dice en español y con el número de fila del CSV.

## Qué contiene el KMZ

- Cada polígono con contorno de color y relleno semitransparente, y su nombre al centro.
- Al hacer clic: superficie en m² y hectáreas, perímetro, y la tabla de vértices en
  lat/lon y UTM.
- La vista inicial encuadra todo.

Las superficies y distancias se calculan sobre el elipsoide WGS84 (UTM corregido por
factor de escala). Contra el cálculo geodésico de `pyproj` la diferencia es menor a
0.01 % en superficie y a 0.001 % en perímetro.

## Pruebas

```
python -m unittest test_generar_kmz -v
```

Si `pyproj` está instalado, las pruebas también contrastan UTM, superficies y perímetros
contra él.
