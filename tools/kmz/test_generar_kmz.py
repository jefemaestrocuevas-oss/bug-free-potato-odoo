"""Pruebas de generar_kmz.py.  Correr con:  python -m unittest test_generar_kmz -v"""

import math
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import generar_kmz as g  # noqa: E402

try:
    import pyproj
except ImportError:  # pyproj es opcional: sólo sirve para contrastar
    pyproj = None

KML = "{http://www.opengis.net/kml/2.2}"
AQUI = Path(__file__).resolve().parent


def _csv(texto, codificacion="utf-8"):
    f = tempfile.NamedTemporaryFile("wb", suffix=".csv", delete=False)
    f.write(texto.encode(codificacion))
    f.close()
    return f.name


class TestUTM(unittest.TestCase):
    def test_ida_y_vuelta(self):
        for lat in range(-79, 84, 7):
            for dlon in (-3.4, -1.0, 0.0, 0.7, 2.9):
                lon = -99.0 + dlon  # zona 14
                e, n, z, h = g.latlon_a_utm(lat, lon, 14)
                lat2, lon2 = g.utm_a_latlon(e, n, z, h)
                self.assertLess(g.distancia_m(lat, lon, lat2, lon2), 0.001, (lat, lon))

    def test_zona_y_banda(self):
        self.assertEqual(g.zona_de_longitud(-100.39), 14)
        self.assertEqual(g.zona_de_longitud(-103.35), 13)
        self.assertEqual(g.banda_de_latitud(20.59), "Q")
        self.assertEqual(g.banda_de_latitud(32.5), "S")
        self.assertEqual(g.banda_de_latitud(-34.6), "H")

    @unittest.skipIf(pyproj is None, "pyproj no instalado")
    def test_contra_pyproj(self):
        for epsg, zona, hem, puntos in (
            (32614, 14, "N", [(20.5931, -100.392), (19.4326, -99.1332), (25.6866, -101.9)]),
            (32613, 13, "N", [(20.6597, -103.3496), (32.5149, -104.1)]),
            (32719, 19, "S", [(-33.4489, -70.6693)]),
        ):
            t = pyproj.Transformer.from_crs(4326, epsg, always_xy=True)
            for lat, lon in puntos:
                ref_e, ref_n = t.transform(lon, lat)
                e, n, _, h = g.latlon_a_utm(lat, lon, zona)
                self.assertEqual(h, hem)
                self.assertLess(abs(e - ref_e), 0.001, (lat, lon))
                self.assertLess(abs(n - ref_n), 0.001, (lat, lon))
                lat2, lon2 = g.utm_a_latlon(ref_e, ref_n, zona, hem)
                self.assertLess(g.distancia_m(lat, lon, lat2, lon2), 0.001)


class TestParseo(unittest.TestCase):
    def test_angulos(self):
        casos = {
            ("20.5888", "latitud"): 20.5888,
            ("-100.3899", "longitud"): -100.3899,
            ("20°35'18.5\"N", "latitud"): 20 + 35 / 60 + 18.5 / 3600,
            ("100°23'23.6\"W", "longitud"): -(100 + 23 / 60 + 23.6 / 3600),
            ("100 23 23.6 O", "longitud"): -(100 + 23 / 60 + 23.6 / 3600),
            ("S 33 26 56", "latitud"): -(33 + 26 / 60 + 56 / 3600),
            ("20º 35.3083'", "latitud"): 20 + 35.3083 / 60,
        }
        for (texto, eje), esperado in casos.items():
            self.assertAlmostEqual(g.parsear_angulo(texto, eje), esperado, places=9, msg=texto)
        with self.assertRaises(g.ErrorDatos):
            g.parsear_angulo("20.5 E", "latitud")

    def test_zonas(self):
        self.assertEqual(g.parsear_zona("14Q"), (14, "N", "Q"))
        self.assertEqual(g.parsear_zona("14 q"), (14, "N", "Q"))
        self.assertEqual(g.parsear_zona("13"), (13, "N", None))
        self.assertEqual(g.parsear_zona("19 sur"), (19, "S", None))
        self.assertEqual(g.parsear_zona("19H"), (19, "S", "H"))
        for mala in ("61Q", "abc", "14I"):
            with self.assertRaises(g.ErrorDatos):
                g.parsear_zona(mala)

    def test_colores(self):
        self.assertEqual(g._color_kml("rojo", "ff"), "ff0000ff")
        self.assertEqual(g._color_kml("#00FF80", "59"), "5980ff00")
        with self.assertRaises(g.ErrorDatos):
            g._color_kml("fucsia-neón", "ff")


class TestValidacion(unittest.TestCase):
    def test_latlon_invertidas(self):
        ruta = _csv("elemento,tipo,lat,lon\nP,punto,-100.39,20.59\n")
        with self.assertRaisesRegex(g.ErrorDatos, "invertidas"):
            g.leer_csv(ruta)

    def test_utm_en_columnas_latlon(self):
        ruta = _csv("elemento,tipo,lat,lon\nP,punto,2277500,354100\n")
        with self.assertRaisesRegex(g.ErrorDatos, "UTM"):
            g.leer_csv(ruta)

    def test_utm_sin_zona(self):
        ruta = _csv("elemento,tipo,este,norte\nP,punto,354100,2277500\n")
        with self.assertRaisesRegex(g.ErrorDatos, "zona"):
            g.leer_csv(ruta)

    def test_x_y_invertidos(self):
        ruta = _csv("elemento,tipo,x,y,zona\nP,punto,2277500,354100,14Q\n")
        with self.assertRaisesRegex(g.ErrorDatos, "invertidos"):
            g.leer_csv(ruta)

    def test_banda_s_ambigua(self):
        # 'S' tomado como banda (norte), pero el punto cae en Q: debe avisar.
        ruta = _csv("elemento,tipo,este,norte,zona\nP,punto,354100,2277500,14S\n")
        _, avisos = g.leer_csv(ruta)
        self.assertTrue(any("sur" in a for a in avisos), avisos)

    def test_poligono_cerrado_y_repetidos(self):
        ruta = _csv(
            "elemento,tipo,lat,lon\n"
            "T,poligono,20.0,-100.0\n,,20.0,-99.999\n,,20.0,-99.999\n,,19.999,-99.999\n,,20.0,-100.0\n"
        )
        elementos, avisos = g.leer_csv(ruta)
        self.assertEqual(len(elementos[0]["vertices"]), 3)
        self.assertTrue(any("repetido" in a for a in avisos))

    def test_poligono_cruzado(self):
        ruta = _csv("elemento,tipo,lat,lon\nT,poligono,0,0\n,,0,0.001\n,,0.001,0\n,,0.001,0.001\n")
        _, avisos = g.leer_csv(ruta)
        self.assertTrue(any("se cruzan" in a for a in avisos), avisos)

    def test_pocos_vertices(self):
        ruta = _csv("elemento,tipo,lat,lon\nT,poligono,0,0\n,,0,0.001\n")
        with self.assertRaisesRegex(g.ErrorDatos, "al menos 3"):
            g.leer_csv(ruta)

    def test_signo_faltante(self):
        ruta = _csv("elemento,tipo,lat,lon\nA,punto,20.59,-100.39\nB,punto,20.60,100.39\n")
        _, avisos = g.leer_csv(ruta)
        self.assertTrue(any("signos" in a for a in avisos), avisos)

    def test_tipo_desconocido(self):
        ruta = _csv("elemento,tipo,lat,lon\nA,circulo,20.59,-100.39\n")
        with self.assertRaisesRegex(g.ErrorDatos, "fila 2"):
            g.leer_csv(ruta)

    def test_excel_punto_y_coma_cp1252(self):
        ruta = _csv(
            "Elemento;Tipo;Latitud;Longitud;Descripción\nÁrea común;polígono;20,0;-100,0;Añadido\n"
            ";;20,0;-99,999;\n;;19,999;-99,999;\n",
            codificacion="cp1252",
        )
        elementos, _ = g.leer_csv(ruta)
        self.assertEqual(elementos[0]["nombre"], "Área común")
        self.assertEqual(elementos[0]["tipo"], "poligono")
        self.assertEqual(elementos[0]["descripcion"], "Añadido")
        self.assertAlmostEqual(elementos[0]["vertices"][1]["lon"], -99.999)

    def test_columna_coordenadas_google_maps(self):
        ruta = _csv('elemento,tipo,coordenadas\nP,punto,"20.593100, -100.392000"\n'
                    "Q,punto,20°35'30.5\"N 100°23'32.0\"W\n")
        elementos, _ = g.leer_csv(ruta)
        self.assertAlmostEqual(elementos[0]["vertices"][0]["lon"], -100.392)
        self.assertAlmostEqual(elementos[1]["vertices"][0]["lat"], 20 + 35 / 60 + 30.5 / 3600)


class TestMedidas(unittest.TestCase):
    def test_cuadrado_utm_de_100m(self):
        ruta = _csv(
            "elemento,tipo,este,norte,zona\n"
            "L,poligono,500000,2277500,14Q\n,,500100,2277500,\n,,500100,2277400,\n,,500000,2277400,\n"
        )
        elementos, _ = g.leer_csv(ruta)
        area, perimetro, _ = g.medir(elementos[0])
        # En el meridiano central la escala es 0.9996: 100 m de cuadrícula ≈ 100.04 m reales.
        self.assertAlmostEqual(area, 10000 / 0.9996 ** 2, delta=0.5)
        self.assertAlmostEqual(perimetro, 400 / 0.9996, delta=0.05)

    @unittest.skipIf(pyproj is None, "pyproj no instalado")
    def test_area_contra_geodesica(self):
        geod = pyproj.Geod(ellps="WGS84")
        for lado in (0.001, 0.01, 0.1):  # ~110 m, ~1.1 km, ~11 km
            for lon0 in (-100.39, -102.5):  # cerca del meridiano central y cerca del borde de zona
                lats = [20.59, 20.59, 20.59 - lado, 20.59 - lado * 1.3]
                lons = [lon0, lon0 + lado, lon0 + lado, lon0 - lado * 0.2]
                elem = {"tipo": "poligono", "vertices": [{"lat": a, "lon": b} for a, b in zip(lats, lons)]}
                area, perimetro, _ = g.medir(elem)
                ref_area, ref_per = geod.polygon_area_perimeter(lons, lats)
                self.assertLess(abs(area - abs(ref_area)) / abs(ref_area), 1e-4, (lado, lon0))
                self.assertLess(abs(perimetro - ref_per) / ref_per, 1e-5, (lado, lon0))


class TestKMZ(unittest.TestCase):
    def test_ejemplo_completo(self):
        with tempfile.TemporaryDirectory() as tmp:
            salida = Path(tmp) / "ejemplo.kmz"
            codigo = g.main([str(AQUI / "ejemplo.csv"), str(salida), "--nombre", "Prueba & <ok>", "--vertices"])
            self.assertEqual(codigo, 0)
            with zipfile.ZipFile(salida) as z:
                self.assertEqual(z.namelist(), ["doc.kml"])
                raiz = ET.fromstring(z.read("doc.kml"))
        doc = raiz.find(f"{KML}Document")
        self.assertEqual(doc.find(f"{KML}name").text, "Prueba & <ok>")
        nombres = [p.find(f"{KML}name").text for p in doc.findall(f"{KML}Placemark")]
        self.assertEqual(nombres, ["Terreno ejemplo", "Lote UTM ejemplo", "Acceso", "Entrada"])
        for anillo in doc.iter(f"{KML}LinearRing"):
            coords = anillo.find(f"{KML}coordinates").text.split()
            self.assertEqual(coords[0], coords[-1], "el anillo debe cerrar")
            self.assertEqual(len(coords), 5)
        for c in doc.iter(f"{KML}coordinates"):
            for trio in c.text.split():
                lon, lat, alt = map(float, trio.split(","))
                self.assertTrue(20.5 < lat < 20.7 and -100.5 < lon < -100.3, trio)
        vertices = [f for f in doc.findall(f"{KML}Folder") if f.find(f"{KML}name").text == "Vértices"]
        self.assertEqual(len(vertices), 1)

    def test_salida_kml_plano(self):
        with tempfile.TemporaryDirectory() as tmp:
            salida = Path(tmp) / "x.kml"
            self.assertEqual(g.main([str(AQUI / "ejemplo.csv"), str(salida)]), 0)
            ET.parse(salida)

    def test_error_devuelve_1(self):
        ruta = _csv("elemento,tipo,lat,lon\nP,punto,,\n")
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(g.main([ruta, str(Path(tmp) / "x.kmz")]), 1)


if __name__ == "__main__":
    unittest.main()
