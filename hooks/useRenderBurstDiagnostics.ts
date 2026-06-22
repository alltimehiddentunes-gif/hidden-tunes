import { useEffect, useRef } from 'react';

import { logHeatRender } from '../utils/heatPerformanceDiagnostics';

export function useRenderBurstDiagnostics(
  label: string,
  details: Record<string, string | number | boolean | null | undefined> = {}
) {
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  useEffect(() => {
    logHeatRender(label, renderCountRef.current, details);
  });
}
