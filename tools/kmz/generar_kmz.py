#!/usr/bin/env python3
"""
Genera un archivo KMZ (Google Earth / Google Maps) a partir de un CSV de coordenadas.

    python generar_kmz.py entrada.csv salida.kmz --nombre "Terreno Ricardo"

El formato del CSV está en README.md, en esta misma carpeta. Sólo usa la biblioteca
estándar de Python (3.8+): corre igual en Windows que en Linux, sin instalar nada.
"""

import argparse
import csv
import html
import io
import math
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

# --- Elipsoide WGS84 y parámetros UTM ----------------------------------------------------

A_WGS84 = 6378137.0
F_WGS84 = 1 / 298.257223563
E2_WGS84 = F_WGS84 * (2 - F_WGS84)
K0 = 0.9996
FALSO_ESTE = 500000.0
FALSO_NORTE_SUR = 10000000.0

# Series de Krüger (3er orden en n): error < 1 mm dentro de la zona UTM.
_n = F_WGS84 / (2 - F_WGS84)
_A = A_WGS84 / (1 + _n) * (1 + _n ** 2 / 4 + _n ** 4 / 64)
_ALFA = (
    _n / 2 - 2 * _n ** 2 / 3 + 5 * _n ** 3 / 16,
    13 * _n ** 2 / 48 - 3 * _n ** 3 / 5,
    61 * _n ** 3 / 240,
)
_BETA = (
    _n / 2 - 2 * _n ** 2 / 3 + 37 * _n ** 3 / 96,
    _n ** 2 / 48 + _n ** 3 / 15,
    17 * _n ** 3 / 480,
)
_DELTA = (
    2 * _n - 2 * _n ** 2 / 3 - 2 * _n ** 3,
    7 * _n ** 2 / 3 - 8 * _n ** 3 / 5,
    56 * _n ** 3 / 15,
)
_EXC = math.sqrt(E2_WGS84)

# Bandas de latitud UTM/MGRS: C..M = hemisferio sur, N..X = norte (sin I ni O).
_BANDAS = "CDEFGHJKLMNPQRSTUVWX"


class ErrorDatos(Exception):
    """Error en el CSV de entrada que impide generar el KMZ."""


def zona_de_longitud(lon):
    return int((lon + 180) // 6) % 60 + 1


def meridiano_central(zona):
    return math.radians(6 * zona - 183)


def latlon_a_utm(lat, lon, zona=None):
    """Convierte lat/lon WGS84 (grados) a (este, norte, zona, hemisferio 'N'|'S')."""
    if zona is None:
        zona = zona_de_longitud(lon)
    phi = math.radians(lat)
    dl = math.radians(lon) - meridiano_central(zona)
    t = math.sinh(math.atanh(math.sin(phi)) - _EXC * math.atanh(_EXC * math.sin(phi)))
    xi_p = math.atan2(t, math.cos(dl))
    eta_p = math.atanh(math.sin(dl) / math.sqrt(1 + t * t))
    xi, eta = xi_p, eta_p
    for j, a in enumerate(_ALFA, start=1):
        xi += a * math.sin(2 * j * xi_p) * math.cosh(2 * j * eta_p)
        eta += a * math.cos(2 * j * xi_p) * math.sinh(2 * j * eta_p)
    este = FALSO_ESTE + K0 * _A * eta
    norte = K0 * _A * xi
    hemisferio = "N" if lat >= 0 else "S"
    if hemisferio == "S":
        norte += FALSO_NORTE_SUR
    return este, norte, zona, hemisferio


def utm_a_latlon(este, norte, zona, hemisferio="N"):
    """Convierte UTM WGS84 a (lat, lon) en grados."""
    if hemisferio == "S":
        norte -= FALSO_NORTE_SUR
    xi = norte / (K0 * _A)
    eta = (este - FALSO_ESTE) / (K0 * _A)
    xi_p, eta_p = xi, eta
    for j, b in enumerate(_BETA, start=1):
        xi_p -= b * math.sin(2 * j * xi) * math.cosh(2 * j * eta)
        eta_p -= b * math.cos(2 * j * xi) * math.sinh(2 * j * eta)
    chi = math.asin(math.sin(xi_p) / math.cosh(eta_p))
    phi = chi
    for j, d in enumerate(_DELTA, start=1):
        phi += d * math.sin(2 * j * chi)
    lon = meridiano_central(zona) + math.atan2(math.sinh(eta_p), math.cos(xi_p))
    return math.degrees(phi), math.degrees(lon)


def banda_de_latitud(lat):
    if lat < -80 or lat > 84:
        return None
    return _BANDAS[min(int((lat + 80) // 8), len(_BANDAS) - 1)]


def factor_escala_utm(este, lat):
    """Factor de escala puntual aproximado (error < 1e-7 dentro de la zona)."""
    phi = math.radians(lat)
    s = math.sin(phi)
    radio_medio = A_WGS84 * math.sqrt(1 - E2_WGS84) / (1 - E2_WGS84 * s * s)
    x = (este - FALSO_ESTE) / K0
    return K0 * (1 + x * x / (2 * radio_medio ** 2))


def distancia_m(lat1, lon1, lat2, lon2):
    """Distancia por haversine (esfera de 6371 km); sólo para chequeos gruesos."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


# --- Lectura del CSV --------------------------------------------------------------------

_ALIAS = {
    "elemento": ("elemento", "nombre", "name", "predio", "capa"),
    "tipo": ("tipo", "type", "geometria"),
    "etiqueta": ("etiqueta", "vertice", "punto", "label", "est"),
    "lat": ("lat", "latitud", "latitude"),
    "lon": ("lon", "long", "lng", "longitud", "longitude"),
    "coordenadas": ("coordenadas", "coords", "latlon", "lat,lon", "lat, lon"),
    "este": ("este", "x", "easting", "utm_x", "x_utm"),
    "norte": ("norte", "y", "northing", "utm_y", "y_utm"),
    "zona": ("zona", "zone", "huso", "zona_utm"),
    "descripcion": ("descripcion", "description", "notas", "nota", "comentario"),
    "color": ("color",),
}

_TIPOS = {
    "punto": "punto", "point": "punto", "pin": "punto", "marcador": "punto",
    "linea": "linea", "line": "linea", "ruta": "linea", "trazo": "linea", "polilinea": "linea",
    "poligono": "poligono", "polygon": "poligono", "area": "poligono", "terreno": "poligono",
    "predio": "poligono", "lote": "poligono",
}

_COLORES = {
    "rojo": "FF0000", "amarillo": "FFFF00", "verde": "00B050", "azul": "0070FF",
    "naranja": "FF8C00", "blanco": "FFFFFF", "negro": "000000", "morado": "8000FF",
    "cian": "00FFFF", "rosa": "FF00FF", "cafe": "8B4513", "gris": "808080",
}
_COLOR_DEFECTO = "rojo"


def _normalizar(texto):
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return texto.strip().lower()


def _leer_texto(ruta):
    datos = Path(ruta).read_bytes()
    for codificacion in ("utf-8-sig", "cp1252"):
        try:
            return datos.decode(codificacion)
        except UnicodeDecodeError:
            continue
    raise ErrorDatos(f"No pude leer {ruta}: guárdalo como CSV UTF-8.")


def _mapear_columnas(encabezado):
    mapa = {}
    for i, col in enumerate(encabezado):
        clave = _normalizar(col)
        for campo, alias in _ALIAS.items():
            if clave in alias and campo not in mapa:
                mapa[campo] = i
    return mapa


_RE_NUM = re.compile(r"[-+]?\d+(?:[.,]\d+)?")


def parsear_angulo(texto, eje):
    """Acepta '20.5888', '-100.39', '20°35'18.5\"N', '100 23 23.6 O', etc."""
    original = texto
    texto = (texto or "").strip().upper()
    if not texto:
        raise ErrorDatos(f"falta la {eje}")
    hemisferio = None
    m = re.search(r"([NSEWO])\s*$", texto) or re.match(r"^\s*([NSEWO])", texto)
    if m:
        hemisferio = m.group(1)
        texto = texto.replace(m.group(0), " ", 1)
    partes = _RE_NUM.findall(texto)
    if not partes or len(partes) > 3:
        raise ErrorDatos(f"{eje} ilegible: {original!r}")
    valores = [float(p.replace(",", ".")) for p in partes]
    negativo = texto.strip().startswith("-") or valores[0] < 0
    grados = abs(valores[0])
    if len(valores) > 1:
        grados += valores[1] / 60
    if len(valores) > 2:
        grados += valores[2] / 3600
    if hemisferio in ("S", "W", "O"):
        negativo = True
    if hemisferio is not None:
        esperado = ("N", "S") if eje == "latitud" else ("E", "W", "O")
        if hemisferio not in esperado:
            raise ErrorDatos(f"{eje} con hemisferio {hemisferio!r} que no corresponde: {original!r}")
    return -grados if negativo else grados


def _parsear_numero(texto, campo):
    texto = (texto or "").strip().replace(" ", "")
    if not texto:
        raise ErrorDatos(f"falta {campo}")
    if texto.count(",") == 1 and "." not in texto:
        texto = texto.replace(",", ".")  # decimal con coma
    else:
        texto = texto.replace(",", "")  # separador de miles
    try:
        return float(texto)
    except ValueError:
        raise ErrorDatos(f"{campo} no es un número: {texto!r}") from None


def parsear_zona(texto):
    """'14Q' → (14, 'N', 'Q'); '14 sur' → (14, 'S', None); '14' → (14, 'N', None)."""
    t = _normalizar(texto).replace(" ", "")
    m = re.fullmatch(r"(\d{1,2})([a-z]*)", t)
    if not m or not 1 <= int(m.group(1)) <= 60:
        raise ErrorDatos(f"zona UTM inválida: {texto!r} (ejemplos: 14Q, 13R, 14 norte)")
    numero, sufijo = int(m.group(1)), m.group(2)
    if sufijo in ("", "n", "norte", "north"):
        return numero, "N", None
    if sufijo in ("sur", "south"):
        return numero, "S", None
    if len(sufijo) == 1 and sufijo.upper() in _BANDAS:
        banda = sufijo.upper()
        return numero, ("N" if banda >= "N" else "S"), banda
    raise ErrorDatos(f"zona UTM inválida: {texto!r} (ejemplos: 14Q, 13R, 14 norte)")


def _color_kml(nombre, alfa):
    clave = _normalizar(nombre) or _COLOR_DEFECTO
    rgb = _COLORES.get(clave)
    if rgb is None:
        if re.fullmatch(r"#?[0-9a-fA-F]{6}", clave):
            rgb = clave.lstrip("#").upper()
        else:
            raise ErrorDatos(f"color desconocido: {nombre!r} (usa {', '.join(_COLORES)} o #RRGGBB)")
    return f"{alfa}{rgb[4:6]}{rgb[2:4]}{rgb[0:2]}".lower()


def leer_csv(ruta):
    """Devuelve (elementos, avisos). Cada elemento: dict con nombre, tipo, color, vertices."""
    texto = _leer_texto(ruta)
    lineas = [l for l in texto.splitlines() if l.strip() and not l.lstrip().startswith("#")]
    if not lineas:
        raise ErrorDatos("el CSV está vacío")
    try:
        dialecto = csv.Sniffer().sniff(lineas[0], delimiters=",;\t")
    except csv.Error:
        dialecto = csv.excel
    filas = list(csv.reader(io.StringIO("\n".join(lineas)), dialecto))
    mapa = _mapear_columnas(filas[0])

    for requerido in ("elemento", "tipo"):
        if requerido not in mapa:
            raise ErrorDatos(f"falta la columna '{requerido}' en el encabezado")
    usa_latlon = "lat" in mapa and "lon" in mapa
    usa_coords = "coordenadas" in mapa
    usa_utm = "este" in mapa and "norte" in mapa
    if not (usa_latlon or usa_coords or usa_utm):
        raise ErrorDatos("faltan columnas de coordenadas: usa lat+lon, coordenadas, o este+norte+zona")

    def celda(fila, campo):
        i = mapa.get(campo)
        return fila[i].strip() if i is not None and i < len(fila) else ""

    elementos, avisos = {}, []
    previo, zona_previa = None, None
    for num, fila in enumerate(filas[1:], start=2):
        if not any(c.strip() for c in fila):
            continue
        try:
            nombre = celda(fila, "elemento") or (previo["nombre"] if previo else "")
            if not nombre:
                raise ErrorDatos("falta el nombre del elemento")
            tipo_txt = _normalizar(celda(fila, "tipo"))
            elem = elementos.get(nombre)
            if tipo_txt:
                tipo = _TIPOS.get(tipo_txt)
                if tipo is None:
                    raise ErrorDatos(f"tipo desconocido {tipo_txt!r} (usa punto, linea o poligono)")
            elif elem is not None:
                tipo = elem["tipo"]
            else:
                raise ErrorDatos("falta el tipo (punto, linea o poligono)")

            lat = lon = None
            if usa_latlon and (celda(fila, "lat") or celda(fila, "lon")):
                lat = parsear_angulo(celda(fila, "lat"), "latitud")
                lon = parsear_angulo(celda(fila, "lon"), "longitud")
            elif usa_coords and celda(fila, "coordenadas"):
                partes = re.split(r"\s*[,;]\s*|\s+(?=[-+]?\d)", celda(fila, "coordenadas"), maxsplit=1)
                if len(partes) != 2:
                    raise ErrorDatos("en 'coordenadas' pon 'latitud, longitud' (como las copia Google Maps)")
                lat = parsear_angulo(partes[0], "latitud")
                lon = parsear_angulo(partes[1], "longitud")
            elif usa_utm and (celda(fila, "este") or celda(fila, "norte")):
                este = _parsear_numero(celda(fila, "este"), "este (X)")
                norte = _parsear_numero(celda(fila, "norte"), "norte (Y)")
                zona_txt = celda(fila, "zona") or zona_previa
                if not zona_txt:
                    raise ErrorDatos("coordenadas UTM sin zona (ejemplo: 14Q)")
                zona_previa = zona_txt
                if not 100000 <= este <= 900000:
                    raise ErrorDatos(f"este (X) = {este} fuera de rango UTM; ¿están invertidos X y Y?")
                if not 0 <= norte <= 10000000:
                    raise ErrorDatos(f"norte (Y) = {norte} fuera de rango UTM")
                zona, hemisferio, banda = parsear_zona(zona_txt)
                lat, lon = utm_a_latlon(este, norte, zona, hemisferio)
                real = banda_de_latitud(lat)
                if banda and real and banda != real:
                    avisos.append(
                        f"fila {num}: la zona dice banda {banda} pero el punto cae en banda {real} "
                        f"(lat {lat:.4f}). Si 'S' significaba 'sur', escribe '{zona} sur'."
                    )
            else:
                raise ErrorDatos("fila sin coordenadas")

            if abs(lat) > 90:
                pista = " — parece que latitud y longitud están invertidas" if abs(lon) <= 90 else ""
                pista = pista or " — ¿son coordenadas UTM? usa columnas este/norte/zona"
                raise ErrorDatos(f"latitud {lat} fuera de rango{pista}")
            if abs(lon) > 180:
                raise ErrorDatos(f"longitud {lon} fuera de rango — ¿son coordenadas UTM? usa este/norte/zona")

            if elem is None:
                elem = elementos[nombre] = {
                    "nombre": nombre, "tipo": tipo, "color": celda(fila, "color") or _COLOR_DEFECTO,
                    "descripcion": celda(fila, "descripcion"), "vertices": [], "fila": num,
                }
            elif elem["tipo"] != tipo:
                raise ErrorDatos(f"'{nombre}' ya se usó como {elem['tipo']}, no puede ser {tipo}")
            if not elem["descripcion"] and celda(fila, "descripcion"):
                elem["descripcion"] = celda(fila, "descripcion")
            if celda(fila, "color"):
                elem["color"] = celda(fila, "color")
            elem["vertices"].append({"lat": lat, "lon": lon, "etiqueta": celda(fila, "etiqueta"), "fila": num})
            previo = elem
        except ErrorDatos as exc:
            raise ErrorDatos(f"fila {num}: {exc}") from None

    for elem in elementos.values():
        _color_kml(elem["color"], "ff")  # valida el color
        avisos.extend(_depurar_geometria(elem))
    avisos.extend(_chequeo_dispersion(elementos.values()))
    return list(elementos.values()), avisos


# --- Validación y medidas ---------------------------------------------------------------

def _mismo_punto(a, b):
    return abs(a["lat"] - b["lat"]) < 1e-9 and abs(a["lon"] - b["lon"]) < 1e-9


def _depurar_geometria(elem):
    avisos, v = [], elem["vertices"]
    nombre, tipo = elem["nombre"], elem["tipo"]
    if tipo in ("linea", "poligono"):
        limpios = [v[0]]
        for p in v[1:]:
            if _mismo_punto(p, limpios[-1]):
                avisos.append(f"'{nombre}': vértice repetido en la fila {p['fila']}, lo omití")
            else:
                limpios.append(p)
        if tipo == "poligono" and len(limpios) > 1 and _mismo_punto(limpios[0], limpios[-1]):
            limpios.pop()  # el cierre lo pongo yo
        elem["vertices"] = v = limpios
    minimo = {"punto": 1, "linea": 2, "poligono": 3}[tipo]
    if len(v) < minimo:
        raise ErrorDatos(f"'{nombre}' ({tipo}) necesita al menos {minimo} vértices distintos y tiene {len(v)}")
    if tipo == "poligono":
        cruce = _autointerseccion(v)
        if cruce:
            avisos.append(
                f"'{nombre}': los lados {cruce[0]} y {cruce[1]} se cruzan — ¿vértices fuera de orden?"
            )
    return avisos


def _autointerseccion(v):
    pts = [(p["lon"], p["lat"]) for p in v]
    n = len(pts)
    lados = [(pts[i], pts[(i + 1) % n]) for i in range(n)]

    def orient(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue  # lados contiguos
            (a, b), (c, d) = lados[i], lados[j]
            if orient(a, b, c) * orient(a, b, d) < 0 and orient(c, d, a) * orient(c, d, b) < 0:
                return f"V{i + 1}-V{(i + 1) % n + 1}", f"V{j + 1}-V{(j + 1) % n + 1}"
    return None


def _chequeo_dispersion(elementos):
    pts = [p for e in elementos for p in e["vertices"]]
    if len(pts) < 2:
        return []
    lat_c = sum(p["lat"] for p in pts) / len(pts)
    lon_c = sum(p["lon"] for p in pts) / len(pts)
    lejano = max(pts, key=lambda p: distancia_m(lat_c, lon_c, p["lat"], p["lon"]))
    d = distancia_m(lat_c, lon_c, lejano["lat"], lejano["lon"])
    if d > 50000:
        return [
            f"el punto de la fila {lejano['fila']} está a {d / 1000:,.0f} km del resto — "
            "revisa signos (¿falta el '-' en la longitud?) o dígitos"
        ]
    return []


def medir(elem):
    """Área (m²) y perímetro/longitud (m) sobre el elipsoide, vía UTM corregido por escala."""
    v = elem["vertices"]
    zona = zona_de_longitud(sum(p["lon"] for p in v) / len(v))
    utm = [latlon_a_utm(p["lat"], p["lon"], zona)[:2] for p in v]
    if elem["tipo"] == "poligono":
        pares = list(zip(range(len(v)), list(range(1, len(v))) + [0]))
    else:
        pares = list(zip(range(len(v) - 1), range(1, len(v))))
    longitud = 0.0
    for i, j in pares:
        (e1, n1), (e2, n2) = utm[i], utm[j]
        k1 = factor_escala_utm(e1, v[i]["lat"])
        k2 = factor_escala_utm(e2, v[j]["lat"])
        km = factor_escala_utm((e1 + e2) / 2, (v[i]["lat"] + v[j]["lat"]) / 2)
        longitud += math.hypot(e2 - e1, n2 - n1) / ((k1 + 4 * km + k2) / 6)
    area = None
    if elem["tipo"] == "poligono":
        doble = sum(utm[i][0] * utm[j][1] - utm[j][0] * utm[i][1] for i, j in pares)
        e_c = sum(e for e, _ in utm) / len(utm)
        k_c = factor_escala_utm(e_c, sum(p["lat"] for p in v) / len(v))
        area = abs(doble) / 2 / (k_c * k_c)
    return area, longitud, zona


# --- Escritura del KML ------------------------------------------------------------------

def _x(texto):
    return html.escape(str(texto), quote=True)


def _cdata(texto):
    return "<![CDATA[" + texto.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def _coords(vertices, cerrar=False):
    pts = list(vertices) + ([vertices[0]] if cerrar else [])
    return " ".join(f"{p['lon']:.8f},{p['lat']:.8f},0" for p in pts)


def _tabla_vertices(elem, zona):
    filas = []
    for i, p in enumerate(elem["vertices"], start=1):
        este, norte, _, hem = latlon_a_utm(p["lat"], p["lon"], zona)
        etiqueta = p["etiqueta"] or (f"V{i}" if elem["tipo"] != "punto" else "")
        filas.append(
            f"<tr><td>{_x(etiqueta)}</td><td>{p['lat']:.6f}</td><td>{p['lon']:.6f}</td>"
            f"<td>{este:,.2f}</td><td>{norte:,.2f}</td></tr>"
        )
    hem_txt = "N" if elem["vertices"][0]["lat"] >= 0 else "S"
    return (
        '<table border="1" cellpadding="3" cellspacing="0" style="border-collapse:collapse;font-size:11px">'
        f"<tr><th></th><th>Latitud</th><th>Longitud</th><th>Este (UTM {zona}{hem_txt})</th>"
        f"<th>Norte (UTM {zona}{hem_txt})</th></tr>" + "".join(filas) + "</table>"
    )


def _descripcion(elem):
    partes = []
    if elem["descripcion"]:
        partes.append(f"<p>{_x(elem['descripcion'])}</p>")
    area, longitud, zona = medir(elem) if elem["tipo"] != "punto" else (None, None, None)
    if area is not None:
        partes.append(
            f"<p><b>Superficie:</b> {area:,.2f} m² ({area / 10000:,.4f} ha)<br>"
            f"<b>Perímetro:</b> {longitud:,.2f} m<br><b>Vértices:</b> {len(elem['vertices'])}</p>"
        )
    elif longitud is not None:
        partes.append(f"<p><b>Longitud:</b> {longitud:,.2f} m</p>")
    if zona is None:
        zona = zona_de_longitud(elem["vertices"][0]["lon"])
    partes.append(_tabla_vertices(elem, zona))
    partes.append("<p style='font-size:10px;color:#666'>Datum WGS84. Medidas sobre el elipsoide.</p>")
    return "".join(partes)


def _estilos(elementos):
    bloques, vistos = [], set()
    for e in elementos:
        clave = (e["tipo"], _normalizar(e["color"]))
        if clave in vistos:
            continue
        vistos.add(clave)
        sid = _id_estilo(e)
        linea = _color_kml(e["color"], "ff")
        if e["tipo"] == "punto":
            bloques.append(
                f'<Style id="{sid}"><IconStyle><color>{linea}</color><scale>1.1</scale>'
                "<Icon><href>http://maps.google.com/mapfiles/kml/pushpin/wht-pushpin.png</href></Icon>"
                '<hotSpot x="20" y="2" xunits="pixels" yunits="pixels"/></IconStyle>'
                "<LabelStyle><scale>0.9</scale></LabelStyle></Style>"
            )
        else:
            relleno = _color_kml(e["color"], "59") if e["tipo"] == "poligono" else "00ffffff"
            bloques.append(
                f'<Style id="{sid}"><IconStyle><scale>0</scale></IconStyle>'
                "<LabelStyle><scale>1.0</scale></LabelStyle>"
                f"<LineStyle><color>{linea}</color><width>3</width></LineStyle>"
                f"<PolyStyle><color>{relleno}</color></PolyStyle></Style>"
            )
    bloques.append(
        '<Style id="vertice"><IconStyle><scale>0.6</scale>'
        "<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>"
        "</IconStyle><LabelStyle><scale>0.7</scale></LabelStyle></Style>"
    )
    return "\n".join(bloques)


def _id_estilo(e):
    return "est_" + e["tipo"] + "_" + re.sub(r"[^a-z0-9]", "", _normalizar(e["color"]))


def _centroide(vertices):
    return (sum(p["lat"] for p in vertices) / len(vertices), sum(p["lon"] for p in vertices) / len(vertices))


def _placemark(elem):
    nombre, estilo = _x(elem["nombre"]), _id_estilo(elem)
    desc = _cdata(_descripcion(elem))
    v = elem["vertices"]
    if elem["tipo"] == "punto":
        marcas = []
        for i, p in enumerate(v, start=1):
            titulo = p["etiqueta"] or (elem["nombre"] if len(v) == 1 else f"{elem['nombre']} {i}")
            sub = dict(elem, vertices=[p])
            marcas.append(
                f"<Placemark><name>{_x(titulo)}</name><description>{_cdata(_descripcion(sub))}</description>"
                f"<styleUrl>#{estilo}</styleUrl><Point><coordinates>{_coords([p])}</coordinates></Point></Placemark>"
            )
        if len(marcas) == 1:
            return marcas[0]
        return f"<Folder><name>{nombre}</name>{''.join(marcas)}</Folder>"
    lat_c, lon_c = _centroide(v)
    etiqueta = f"<Point><coordinates>{lon_c:.8f},{lat_c:.8f},0</coordinates></Point>"
    if elem["tipo"] == "linea":
        geom = (
            "<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>"
            f"<coordinates>{_coords(v)}</coordinates></LineString>"
        )
    else:
        geom = (
            "<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>"
            f"<outerBoundaryIs><LinearRing><coordinates>{_coords(v, cerrar=True)}</coordinates>"
            "</LinearRing></outerBoundaryIs></Polygon>"
        )
        geom = etiqueta + geom
    return (
        f"<Placemark><name>{nombre}</name><description>{desc}</description>"
        f"<styleUrl>#{estilo}</styleUrl><MultiGeometry>{geom}</MultiGeometry></Placemark>"
    )


def _carpeta_vertices(elementos):
    carpetas = []
    for e in elementos:
        if e["tipo"] == "punto":
            continue
        marcas = []
        for i, p in enumerate(e["vertices"], start=1):
            titulo = p["etiqueta"] or f"V{i}"
            marcas.append(
                f"<Placemark><name>{_x(titulo)}</name><description>{p['lat']:.6f}, {p['lon']:.6f}</description>"
                f"<styleUrl>#vertice</styleUrl><Point><coordinates>{_coords([p])}</coordinates></Point></Placemark>"
            )
        carpetas.append(f"<Folder><name>{_x(e['nombre'])}</name>{''.join(marcas)}</Folder>")
    if not carpetas:
        return ""
    return f"<Folder><name>Vértices</name>{''.join(carpetas)}</Folder>"


def construir_kml(elementos, nombre_documento, con_vertices=False):
    todos = [p for e in elementos for p in e["vertices"]]
    lat_c, lon_c = _centroide(todos)
    extension = max(distancia_m(lat_c, lon_c, p["lat"], p["lon"]) for p in todos)
    rango = max(extension * 3.0, 400.0)
    cuerpo = "\n".join(_placemark(e) for e in elementos)
    vertices = _carpeta_vertices(elementos) if con_vertices else ""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n'
        f"<name>{_x(nombre_documento)}</name>\n<open>1</open>\n"
        f"<LookAt><longitude>{lon_c:.8f}</longitude><latitude>{lat_c:.8f}</latitude>"
        f"<altitude>0</altitude><heading>0</heading><tilt>0</tilt><range>{rango:.0f}</range>"
        "<altitudeMode>relativeToGround</altitudeMode></LookAt>\n"
        f"{_estilos(elementos)}\n{cuerpo}\n{vertices}\n</Document>\n</kml>\n"
    )


def escribir(kml, salida):
    salida = Path(salida)
    if salida.suffix.lower() == ".kml":
        salida.write_text(kml, encoding="utf-8")
        return
    with zipfile.ZipFile(salida, "w", compression=zipfile.ZIP_DEFLATED) as kmz:
        kmz.writestr("doc.kml", kml.encode("utf-8"))


def resumen(elementos, avisos):
    lineas = []
    for e in elementos:
        if e["tipo"] == "punto":
            lineas.append(f"  • {e['nombre']}: {len(e['vertices'])} punto(s)")
            continue
        area, longitud, _ = medir(e)
        if area is not None:
            lineas.append(
                f"  • {e['nombre']}: polígono de {len(e['vertices'])} vértices, "
                f"{area:,.2f} m² ({area / 10000:,.4f} ha), perímetro {longitud:,.2f} m"
            )
        else:
            lineas.append(f"  • {e['nombre']}: línea de {len(e['vertices'])} vértices, {longitud:,.2f} m")
    lat_c, lon_c = _centroide([p for e in elementos for p in e["vertices"]])
    lineas.append(f"  Centro: {lat_c:.6f}, {lon_c:.6f} → https://www.google.com/maps?q={lat_c:.6f},{lon_c:.6f}")
    for a in avisos:
        lineas.append(f"  ⚠ {a}")
    return "\n".join(lineas)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Genera un KMZ para Google Earth a partir de un CSV.")
    ap.add_argument("entrada", help="CSV con las coordenadas (ver README.md)")
    ap.add_argument("salida", help="archivo de salida .kmz (o .kml)")
    ap.add_argument("--nombre", help="nombre que se verá en Google Earth (por defecto, el del archivo)")
    ap.add_argument("--vertices", action="store_true", help="agrega una carpeta con cada vértice marcado")
    args = ap.parse_args(argv)
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(errors="replace")
        sys.stderr.reconfigure(errors="replace")
    try:
        elementos, avisos = leer_csv(args.entrada)
        kml = construir_kml(elementos, args.nombre or Path(args.salida).stem, args.vertices)
        escribir(kml, args.salida)
    except (ErrorDatos, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    print(f"Listo: {args.salida}")
    print(resumen(elementos, avisos))
    return 0


if __name__ == "__main__":
    sys.exit(main())
