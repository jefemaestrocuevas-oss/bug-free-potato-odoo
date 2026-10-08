import { lazy, Suspense } from 'react';
import { BrowserRouter, HashRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Cargando } from './components/ui/Estado';
import { LimiteError } from './components/ui/LimiteError';
import { SesionProvider } from './lib/sesion';
import { RutaProtegida } from './components/ui/RutaProtegida';
import { LayoutPublico } from './layouts/LayoutPublico';
import { CarritoProvider } from './lib/carrito';

import Inicio from './pages/publico/Inicio';
import Servicios from './pages/publico/Servicios';
import Tienda from './pages/publico/Tienda';
import Carrito from './pages/publico/Carrito';
import Equipo from './pages/publico/Equipo';
import Politicas from './pages/publico/Politicas';
import NoEncontrada from './pages/publico/NoEncontrada';

import Reservar from './pages/reserva/Reservar';

import Entrar from './pages/cuenta/Entrar';
import MiCuenta from './pages/cuenta/MiCuenta';
import FirmarPendiente from './pages/cuenta/FirmarPendiente';

// El panel interno se carga aparte: el sitio público pesa menos y un error del panel
// no tumba el sitio (lo contiene su propio ErrorBoundary).
const LayoutAdmin = lazy(() => import('./layouts/LayoutAdmin').then((m) => ({ default: m.LayoutAdmin })));
const AdminResumen = lazy(() => import('./pages/admin/Resumen'));
const AdminAgenda = lazy(() => import('./pages/admin/Agenda'));
const AdminClientes = lazy(() => import('./pages/admin/Clientes'));
const AdminExpediente = lazy(() => import('./pages/admin/Expediente'));
const AdminPedidos = lazy(() => import('./pages/admin/Pedidos'));
const AdminInventario = lazy(() => import('./pages/admin/Inventario'));
const AdminCostos = lazy(() => import('./pages/admin/Costos'));
const AdminGastos = lazy(() => import('./pages/admin/Gastos'));
const AdminResultados = lazy(() => import('./pages/admin/Resultados'));
const AdminCatalogo = lazy(() => import('./pages/admin/Catalogo'));
const AdminEquipo = lazy(() => import('./pages/admin/EquipoAdmin'));
const AdminPoliticas = lazy(() => import('./pages/admin/PoliticasAdmin'));

// `VITE_ROUTER=hash` (sitio estático sin reescrituras) usa rutas con #;
// `VITE_ROUTER=memory` (vista previa incrustada) no toca la URL.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter;

export function App() {
  return (
    <Router>
      <SesionProvider>
        <CarritoProvider>
          <Routes>
            <Route element={<LayoutPublico />}>
              <Route index element={<Inicio />} />
              <Route path="servicios" element={<Servicios />} />
              <Route path="tienda" element={<Tienda />} />
              <Route path="carrito" element={<Carrito />} />
              <Route path="equipo" element={<Equipo />} />
              <Route path="politicas" element={<Politicas />} />
              <Route path="politicas/:tipo" element={<Politicas />} />
              <Route path="reservar" element={<Reservar />} />
              <Route path="entrar" element={<Entrar />} />
              <Route path="cuenta" element={<RutaProtegida><MiCuenta /></RutaProtegida>} />
              <Route path="cuenta/:seccion" element={<RutaProtegida><MiCuenta /></RutaProtegida>} />
              <Route path="cuenta/firmar/:citaId" element={<RutaProtegida><FirmarPendiente /></RutaProtegida>} />
              <Route path="*" element={<NoEncontrada />} />
            </Route>
            <Route
              path="admin"
              element={
                <RutaProtegida personal>
                  <LimiteError lugar="el panel interno">
                    <Suspense fallback={<Cargando texto="Abriendo el panel…" />}>
                      <LayoutAdmin />
                    </Suspense>
                  </LimiteError>
                </RutaProtegida>
              }
            >
              <Route index element={<AdminResumen />} />
              <Route path="agenda" element={<AdminAgenda />} />
              <Route path="clientes" element={<AdminClientes />} />
              <Route path="clientes/:id" element={<AdminExpediente />} />
              <Route path="pedidos" element={<AdminPedidos />} />
              <Route path="inventario" element={<AdminInventario />} />
              <Route path="costos" element={<AdminCostos />} />
              <Route path="gastos" element={<RutaProtegida admin><AdminGastos /></RutaProtegida>} />
              <Route path="resultados" element={<RutaProtegida admin><AdminResultados /></RutaProtegida>} />
              <Route path="catalogo" element={<RutaProtegida admin><AdminCatalogo /></RutaProtegida>} />
              <Route path="equipo" element={<RutaProtegida admin><AdminEquipo /></RutaProtegida>} />
              <Route path="politicas" element={<RutaProtegida admin><AdminPoliticas /></RutaProtegida>} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
          </Routes>
        </CarritoProvider>
      </SesionProvider>
    </Router>
  );
}
