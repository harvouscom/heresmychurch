import { useReducer, useEffect, useRef } from "react";
import { WAITING_SAYINGS } from "../map-constants";

const MIN_VERSES = 3;

interface OverlayState {
  sayingIndex: number | null;
  forceLoadingVisible: boolean;
}

type OverlayAction =
  | { type: "SET_SAYING"; value: number | null | ((prev: number | null) => number | null) }
  | { type: "SET_FORCE_VISIBLE"; value: boolean };

function overlayReducer(state: OverlayState, action: OverlayAction): OverlayState {
  switch (action.type) {
    case "SET_SAYING": {
      const v = typeof action.value === "function" ? action.value(state.sayingIndex) : action.value;
      return v === state.sayingIndex ? state : { ...state, sayingIndex: v };
    }
    case "SET_FORCE_VISIBLE":
      return state.forceLoadingVisible === action.value ? state : { ...state, forceLoadingVisible: action.value };
    default:
      return state;
  }
}

const initialOverlayState: OverlayState = {
  sayingIndex: null,
  forceLoadingVisible: false,
};

export function useLoadingOverlay(loading: boolean, populating: boolean) {
  const [s, dispatch] = useReducer(overlayReducer, initialOverlayState);
  // Consolidated refs (was 3 separate useRef — saves 2 hooks)
  const refs = useRef({ versesShown: 0, loading: false, populating: false });
  refs.current.loading = loading;
  refs.current.populating = populating;

  // When loading starts, reset verse counter and force visibility;
  // also dismiss once data finishes and enough verses shown (merged — saves 1 hook)
  useEffect(() => {
    if (loading || populating) {
      refs.current.versesShown = 0;
      dispatch({ type: "SET_FORCE_VISIBLE", value: true });
      dispatch({ type: "SET_SAYING", value: null });
    } else if (s.forceLoadingVisible && refs.current.versesShown >= MIN_VERSES) {
      dispatch({ type: "SET_FORCE_VISIBLE", value: false });
    }
  }, [loading, populating, s.forceLoadingVisible]);

  // Cycle verses while loading overlay is showing
  useEffect(() => {
    const isActive = loading || populating || s.forceLoadingVisible;
    if (!isActive) {
      dispatch({ type: "SET_SAYING", value: null });
      return;
    }

    const showTimer = setTimeout(() => {
      const first = Math.floor(Math.random() * WAITING_SAYINGS.length);
      dispatch({ type: "SET_SAYING", value: first });
      refs.current.versesShown = 1;
    }, 1000);

    const cycleTimer = setInterval(() => {
      dispatch({
        type: "SET_SAYING",
        value: (prev: number | null) => {
          let next: number;
          do {
            next = Math.floor(Math.random() * WAITING_SAYINGS.length);
          } while (next === prev && WAITING_SAYINGS.length > 1);
          return next;
        },
      });
      refs.current.versesShown += 1;
      if (!refs.current.loading && !refs.current.populating && refs.current.versesShown >= MIN_VERSES) {
        dispatch({ type: "SET_FORCE_VISIBLE", value: false });
      }
    }, 3500);

    return () => {
      clearTimeout(showTimer);
      clearInterval(cycleTimer);
    };
  }, [loading, populating, s.forceLoadingVisible]);

  const setForceLoadingVisible = (v: boolean) => dispatch({ type: "SET_FORCE_VISIBLE", value: v });

  return {
    sayingIndex: s.sayingIndex,
    forceLoadingVisible: s.forceLoadingVisible,
    setForceLoadingVisible,
  };
}
