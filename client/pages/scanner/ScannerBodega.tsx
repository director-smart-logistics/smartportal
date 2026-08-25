import React from "react";
import { ScannerBodegaPage } from "./bodega";
import { ScannerBodegaGate } from "@/components/scanner/ScannerBodegaGate";

export default function ScannerBodega() {
  return (
    <ScannerBodegaGate>
      <div className="h-screen flex overflow-hidden bg-gray-100">
        <ScannerBodegaPage />
      </div>
    </ScannerBodegaGate>
  );
}