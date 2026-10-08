// Botones para agregar al carrito: uno sencillo ("Comprar") y otro con opción de regalo.
import { useEffect, useId, useState } from 'react';
import { useCarrito, type NuevoItemCarrito } from '../../lib/carrito';
import { IconoBolsa, IconoCheck, IconoRegalo } from './Iconos';
import './componentes.css';

/** Botón "Comprar": agrega una unidad al carrito y confirma visualmente. */
export function BotonComprar({
  item,
  texto = 'Comprar',
  className = 'btn btn-secundario btn-sm',
}: {
  item: NuevoItemCarrito;
  texto?: string;
  className?: string;
}) {
  const { agregar } = useCarrito();
  const [listo, setListo] = useState(false);
  useEffect(() => {
    if (!listo) return;
    const t = window.setTimeout(() => setListo(false), 2200);
    return () => window.clearTimeout(t);
  }, [listo]);
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        agregar(item);
        setListo(true);
      }}
      aria-label={`${texto}: agregar ${item.nombre} al carrito`}
    >
      {listo ? <IconoCheck tam={18} /> : <IconoBolsa tam={18} />}
      {listo ? 'Agregado' : texto}
    </button>
  );
}

/** Compra con opción "Es para regalo" (nombre de quien lo recibe). */
export function ComprarConRegalo({ item, permitirRegalo = true }: { item: NuevoItemCarrito; permitirRegalo?: boolean }) {
  const { agregar } = useCarrito();
  const id = useId();
  const [esRegalo, setEsRegalo] = useState(false);
  const [para, setPara] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (!listo) return;
    const t = window.setTimeout(() => setListo(false), 2200);
    return () => window.clearTimeout(t);
  }, [listo]);

  const enviar = () => {
    if (esRegalo && !para.trim()) {
      setError('Escribe el nombre de quien recibe el regalo.');
      return;
    }
    agregar({ ...item, regalo_para: esRegalo ? para.trim() : null });
    setError(null);
    setListo(true);
    setEsRegalo(false);
    setPara('');
  };

  return (
    <div className="sp-comprar">
      {permitirRegalo && (
        <label className="check sp-comprar-regalo">
          <input
            type="checkbox"
            checked={esRegalo}
            onChange={(e) => {
              setEsRegalo(e.target.checked);
              setError(null);
            }}
            aria-controls={`${id}-para`}
          />
          <span className="sp-comprar-regalo-texto">
            <IconoRegalo tam={18} /> Es para regalo
          </span>
        </label>
      )}
      {permitirRegalo && esRegalo && (
        <div className="campo sp-comprar-para">
          <label className="etiqueta" htmlFor={`${id}-para`}>
            ¿Para quién es?
          </label>
          <input
            id={`${id}-para`}
            className="input"
            value={para}
            maxLength={80}
            autoComplete="off"
            placeholder="Nombre de quien lo recibe"
            onChange={(e) => {
              setPara(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                enviar();
              }
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-ayuda`}
          />
          <span id={`${id}-ayuda`} className={error ? 'ayuda sp-comprar-error' : 'ayuda sp-ayuda-legible'}>
            {error ?? 'Al registrarse tu pago te damos un código para que se lo entregues.'}
          </span>
        </div>
      )}
      <button type="button" className="btn btn-primario btn-sm sp-comprar-boton" onClick={enviar}>
        {listo ? <IconoCheck tam={18} /> : <IconoBolsa tam={18} />}
        {listo ? 'Agregado al carrito' : 'Agregar al carrito'}
      </button>
    </div>
  );
}
