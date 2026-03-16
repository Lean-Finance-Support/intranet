"use client";

import { useState } from "react";
import QuarterSelector from "./quarter-selector";
import ModelsClientList from "./models-client-list";

export default function ModelosClientWorkspace() {
  const [quarter, setQuarter] = useState(1);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-text-muted mb-2">
          Trimestre
        </label>
        <QuarterSelector selected={quarter} onChange={setQuarter} />
      </div>

      <div className="border-t border-gray-200 pt-6">
        <ModelsClientList key={quarter} quarter={quarter} />
      </div>
    </div>
  );
}
