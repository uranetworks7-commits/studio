
"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import React, { createContext, useContext, useState, ReactNode } from "react";

interface ViewportContextType {
  isDesktopView: boolean;
  setIsDesktopView: React.Dispatch<React.SetStateAction<boolean>>;
  isMobile: boolean;
}

const ViewportContext = createContext<ViewportContextType | undefined>(
  undefined
);

export function ViewportProvider({ children }: { children: ReactNode }) {
  const [isDesktopView, setIsDesktopView] = useState(false);
  const isMobile = useIsMobile();

  return (
    <ViewportContext.Provider value={{ isDesktopView, setIsDesktopView, isMobile }}>
      {children}
    </ViewportContext.Provider>
  );
}

export function useViewport() {
  const context = useContext(ViewportContext);
  if (context === undefined) {
    throw new Error("useViewport must be used within a ViewportProvider");
  }
  return context;
}
