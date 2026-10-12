'use client';

import { useCallback, useRef, useState } from 'react';

/** Keep a form open on failure and prevent duplicate network submissions. */
export function useAsyncMutation(onError: (message: string) => void) {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const mutate = useCallback(async (operation: () => Promise<void>, reportError = onError): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    try {
      await operation();
      return true;
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'تعذر حفظ التغيير. حاول مرة أخرى.';
      reportError(message);
      // A confirmation can overlay the original form's inline error.
      if (reportError !== onError) onError(message);
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [onError]);
  return { mutate, pending };
}
