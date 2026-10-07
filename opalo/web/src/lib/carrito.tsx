import { createContext, useContext, type ReactNode } from 'react';
const Ctx = createContext<null>(null);
export function CarritoProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={null}>{children}</Ctx.Provider>;
}
export function useCarrito() {
  return useContext(Ctx);
}
