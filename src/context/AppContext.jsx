// Central app store: holds state, saves it to LocalStorage, runs the
// background checks (ack deadlines + expiry) and provides helpers for
// toasts, confirm dialogs and page navigation.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createDemoState } from '../data/demoData.js';
import { clearState, loadState, saveState } from '../services/storageService.js';
import { processTick, recomputeStatuses } from '../services/reservationService.js';
import { addLog } from '../services/logService.js';

const AppContext = createContext(null);
const TICK_MS = 5000;

function initialState() {
  const saved = loadState();
  if (saved) return saved;
  const s = createDemoState(Date.now());
  recomputeStatuses(s, Date.now());
  return s;
}

export function AppProvider({ children }) {
  const [state, setState] = useState(initialState);
  const [now, setNow] = useState(Date.now());
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [route, setRoute] = useState({ page: 'overview', params: {} });
  const stateRef = useRef(state);

  const toast = useCallback((type, title, message) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-4), { id, type, title, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 8000 : 5500);
  }, []);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  // Runs an action on a copy of the state, then saves it.
  // fn(draft, now) can return any result object.
  const run = useCallback((fn) => {
    const draft = structuredClone(stateRef.current);
    const t = Date.now();
    let result;
    try {
      result = fn(draft, t) ?? {};
    } catch (err) {
      console.error(err);
      toast('error', 'Action failed', err.message);
      return { ok: false, reason: err.message };
    }
    recomputeStatuses(draft, t);
    stateRef.current = draft;
    setState(draft);
    setNow(t);
    saveState(draft);
    return result;
  }, [toast]);

  // Background checks every 5 seconds
  useEffect(() => {
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const draft = structuredClone(stateRef.current);
      const { changed, events } = processTick(draft, t);
      recomputeStatuses(draft, t);
      if (changed) {
        stateRef.current = draft;
        setState(draft);
        saveState(draft);
        events.forEach((e) => toast(e.type, e.title, e.message));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [toast]);

  const confirm = useCallback(
    (options) => new Promise((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const closeConfirm = (answer) => {
    confirmState?.resolve(answer);
    setConfirmState(null);
  };

  const navigate = useCallback((page, params = {}) => {
    setRoute({ page, params });
    window.scrollTo({ top: 0 });
  }, []);

  const resetDemo = useCallback(() => {
    clearState();
    const t = Date.now();
    const s = createDemoState(t);
    recomputeStatuses(s, t);
    addLog(s, t, { type: 'Simulation reset', description: 'Demo data restored to the original sample scenario', status: 'info' });
    stateRef.current = s;
    setState(s);
    saveState(s);
    setNow(t);
  }, []);

  const value = {
    state,
    now,
    run,
    toast,
    toasts,
    dismissToast,
    confirm,
    confirmState,
    closeConfirm,
    route,
    navigate,
    resetDemo,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}

// Helper: runs an action and shows a success or error toast automatically.
export function useAction() {
  const { run, toast } = useApp();
  return useCallback(
    (fn, { success, successMsg, errorTitle = 'Action blocked' } = {}) => {
      const res = run(fn);
      if (res && res.ok === false) {
        toast('error', errorTitle, (res.reasons ?? [res.reason]).join(' • '));
      } else if (success) {
        toast('success', success, typeof successMsg === 'function' ? successMsg(res) : successMsg);
      }
      return res;
    },
    [run, toast],
  );
}
