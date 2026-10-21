import { createContext, useContext, useState, type ReactNode } from 'react';

const Ctx = createContext<{ mini: boolean; setMini: (v: boolean) => void }>({
  mini: false,
  setMini: () => {},
});
export function NavStateProvider({ children }: { children: ReactNode }) {
  const [mini, setMini] = useState(false);
  return <Ctx.Provider value={{ mini, setMini }}>{children}</Ctx.Provider>;
}
export const useNavState = () => useContext(Ctx);
