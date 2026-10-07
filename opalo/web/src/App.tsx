import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SesionProvider } from './lib/sesion';
import { RutaProtegida } from './components/ui/RutaProtegida';
import { LayoutPublico } from './layouts/LayoutPublico';
import { LayoutAdmin } from './layouts/LayoutAdmin';
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

import AdminResumen from './pages/admin/Resumen';
import AdminAgenda from './pages/admin/Agenda';
import AdminClientes from './pages/admin/Clientes';
import AdminExpediente from './pages/admin/Expediente';
import AdminPedidos from './pages/admin/Pedidos';
import AdminInventario from './pages/admin/Inventario';
import AdminCostos from './pages/admin/Costos';
import AdminGastos from './pages/admin/Gastos';
import AdminResultados from './pages/admin/Resultados';
import AdminCatalogo from './pages/admin/Catalogo';
import AdminEquipo from './pages/admin/EquipoAdmin';
import AdminPoliticas from './pages/admin/PoliticasAdmin';

// `VITE_ROUTER=hash` (modo demo/vista previa estática) usa rutas con #.
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter;

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
            <Route path="admin" element={<RutaProtegida personal><LayoutAdmin /></RutaProtegida>}>
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
