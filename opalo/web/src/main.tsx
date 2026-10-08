import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Primero los estilos base: así el CSS de cada sección gana a igual especificidad.
import './styles/tokens.css';
import './styles/base.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
