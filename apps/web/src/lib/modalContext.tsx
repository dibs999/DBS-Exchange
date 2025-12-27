import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ModalContextType {
  openDeposit: () => void;
  openWithdraw: () => void;
  openFaucet: () => void;
  depositOpen: boolean;
  withdrawOpen: boolean;
  faucetOpen: boolean;
  setDepositOpen: (open: boolean) => void;
  setWithdrawOpen: (open: boolean) => void;
  setFaucetOpen: (open: boolean) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [faucetOpen, setFaucetOpen] = useState(false);

  const openDeposit = () => setDepositOpen(true);
  const openWithdraw = () => setWithdrawOpen(true);
  const openFaucet = () => setFaucetOpen(true);

  return (
    <ModalContext.Provider
      value={{
        openDeposit,
        openWithdraw,
        openFaucet,
        depositOpen,
        withdrawOpen,
        faucetOpen,
        setDepositOpen,
        setWithdrawOpen,
        setFaucetOpen,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
}

