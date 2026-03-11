import React, { useReducer, useRef, useEffect } from "react";
import {
  sizeCategories,
  DENOMINATION_GROUPS,
} from "../church-data";

interface UIState {
  hoveredChurch: any;
  /** Church shown in preview card when opened by click/tap; stays until View church or dismiss */
  previewChurch: any;
  /** When true, preview card stays open on mouse out and is interactive (View church button) */
  previewPinned: boolean;
  hoveredState: string | null;
  hoveredCounty: string | null;
  tooltipPos: { x: number; y: number };
  showFilterPanel: boolean;
  searchCollapsed: boolean;
  activeSize: Set<string>;
  activeDenominations: Set<string>;
  showSizeFilters: boolean;
  showDenomFilters: boolean;
  showLanguageFilters: boolean;
  languageFilter: string;
  showListModal: boolean;
  showAddChurchFromSummary: boolean;
  /** When set, Add Church form opens for this state (national view, from search state filter). */
  addChurchForState: string | null;
  showSummary: boolean;
  showLegend: boolean;
}

type UIAction =
  | { type: "SET_HOVERED_CHURCH"; value: any }
  | { type: "SET_PREVIEW_CHURCH"; value: any }
  | { type: "SET_PREVIEW_PINNED"; value: boolean }
  | { type: "SET_HOVERED_STATE"; value: string | null }
  | { type: "SET_HOVERED_COUNTY"; value: string | null }
  | { type: "SET_TOOLTIP_POS"; value: { x: number; y: number } }
  | { type: "SET_SHOW_FILTER_PANEL"; value: boolean | ((prev: boolean) => boolean) }
  | { type: "SET_SEARCH_COLLAPSED"; value: boolean }
  | { type: "TOGGLE_SIZE"; label: string }
  | { type: "TOGGLE_DENOM"; label: string }
  | { type: "SET_SHOW_SIZE_FILTERS"; value: boolean }
  | { type: "SET_SHOW_DENOM_FILTERS"; value: boolean }
  | { type: "SET_SHOW_LANGUAGE_FILTERS"; value: boolean }
  | { type: "SET_LANGUAGE_FILTER"; value: string }
  | { type: "SET_SHOW_LIST_MODAL"; value: boolean }
  | { type: "SET_SHOW_ADD_CHURCH"; value: boolean }
  | { type: "SET_ADD_CHURCH_FOR_STATE"; value: string | null }
  | { type: "SET_SHOW_SUMMARY"; value: boolean | ((prev: boolean) => boolean) }
  | { type: "SET_SHOW_LEGEND"; value: boolean };

function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "SET_HOVERED_CHURCH":
      return state.hoveredChurch === action.value ? state : { ...state, hoveredChurch: action.value };
    case "SET_PREVIEW_CHURCH":
      return state.previewChurch === action.value ? state : { ...state, previewChurch: action.value };
    case "SET_PREVIEW_PINNED":
      return state.previewPinned === action.value ? state : { ...state, previewPinned: action.value };
    case "SET_HOVERED_STATE":
      return state.hoveredState === action.value ? state : { ...state, hoveredState: action.value };
    case "SET_HOVERED_COUNTY":
      return state.hoveredCounty === action.value ? state : { ...state, hoveredCounty: action.value };
    case "SET_TOOLTIP_POS":
      return { ...state, tooltipPos: action.value };
    case "SET_SHOW_FILTER_PANEL": {
      const v = typeof action.value === "function" ? action.value(state.showFilterPanel) : action.value;
      return v === state.showFilterPanel ? state : { ...state, showFilterPanel: v };
    }
    case "SET_SEARCH_COLLAPSED":
      return state.searchCollapsed === action.value ? state : { ...state, searchCollapsed: action.value };
    case "TOGGLE_SIZE": {
      const next = new Set(state.activeSize);
      next.has(action.label) ? next.delete(action.label) : next.add(action.label);
      return { ...state, activeSize: next };
    }
    case "TOGGLE_DENOM": {
      const next = new Set(state.activeDenominations);
      next.has(action.label) ? next.delete(action.label) : next.add(action.label);
      return { ...state, activeDenominations: next };
    }
    case "SET_SHOW_SIZE_FILTERS":
      return state.showSizeFilters === action.value ? state : { ...state, showSizeFilters: action.value };
    case "SET_SHOW_DENOM_FILTERS":
      return state.showDenomFilters === action.value ? state : { ...state, showDenomFilters: action.value };
    case "SET_SHOW_LANGUAGE_FILTERS":
      return state.showLanguageFilters === action.value ? state : { ...state, showLanguageFilters: action.value };
    case "SET_LANGUAGE_FILTER":
      return state.languageFilter === action.value ? state : { ...state, languageFilter: action.value };
    case "SET_SHOW_LIST_MODAL":
      return state.showListModal === action.value ? state : { ...state, showListModal: action.value };
    case "SET_SHOW_ADD_CHURCH":
      return state.showAddChurchFromSummary === action.value ? state : { ...state, showAddChurchFromSummary: action.value };
    case "SET_ADD_CHURCH_FOR_STATE":
      return state.addChurchForState === action.value ? state : { ...state, addChurchForState: action.value };
    case "SET_SHOW_SUMMARY": {
      const v = typeof action.value === "function" ? action.value(state.showSummary) : action.value;
      return v === state.showSummary ? state : { ...state, showSummary: v };
    }
    case "SET_SHOW_LEGEND":
      return state.showLegend === action.value ? state : { ...state, showLegend: action.value };
    default:
      return state;
  }
}

const initialUIState: UIState = {
  hoveredChurch: null,
  previewChurch: null,
  previewPinned: false,
  hoveredState: null,
  hoveredCounty: null,
  tooltipPos: { x: 0, y: 0 },
  showFilterPanel: false,
  searchCollapsed: typeof window !== "undefined" && window.innerWidth < 768,
  activeSize: new Set(sizeCategories.map((c) => c.label)),
  activeDenominations: new Set(DENOMINATION_GROUPS.map((g) => g.label)),
  showSizeFilters: false,
  showDenomFilters: false,
  showLanguageFilters: false,
  languageFilter: "all",
  showListModal: false,
  showAddChurchFromSummary: false,
  addChurchForState: null,
  showSummary: false,
  showLegend: false,
};

export function useUIState(focusedState: string | null) {
  const [s, dispatch] = useReducer(uiReducer, initialUIState);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Close summary dropdown when clicking outside
  useEffect(() => {
    if (!s.showSummary) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (summaryRef.current && !summaryRef.current.contains(e.target as Node)) {
        dispatch({ type: "SET_SHOW_SUMMARY", value: false });
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [s.showSummary]);

  // Close summary, pinned preview, and add-church-for-state when navigating
  useEffect(() => {
    dispatch({ type: "SET_SHOW_SUMMARY", value: false });
    dispatch({ type: "SET_PREVIEW_CHURCH", value: null });
    dispatch({ type: "SET_PREVIEW_PINNED", value: false });
    dispatch({ type: "SET_ADD_CHURCH_FOR_STATE", value: null });
  }, [focusedState]);

  // Plain setter functions — dispatch is guaranteed stable by React, so no useCallback needed
  const setHoveredChurch = (v: any) => dispatch({ type: "SET_HOVERED_CHURCH", value: v });
  const setPreviewChurch = (v: any) => dispatch({ type: "SET_PREVIEW_CHURCH", value: v });
  const setPreviewPinned = (v: boolean) => dispatch({ type: "SET_PREVIEW_PINNED", value: v });
  const setPinnedPreview = (church: any, pos: { x: number; y: number }) => {
    dispatch({ type: "SET_TOOLTIP_POS", value: pos });
    dispatch({ type: "SET_PREVIEW_CHURCH", value: church });
    dispatch({ type: "SET_PREVIEW_PINNED", value: true });
  };
  const clearPreview = () => {
    dispatch({ type: "SET_PREVIEW_CHURCH", value: null });
    dispatch({ type: "SET_PREVIEW_PINNED", value: false });
  };
  const setHoveredState = (v: string | null) => dispatch({ type: "SET_HOVERED_STATE", value: v });
  const setHoveredCounty = (v: string | null) => dispatch({ type: "SET_HOVERED_COUNTY", value: v });
  const setShowFilterPanel = (v: boolean | ((prev: boolean) => boolean)) => dispatch({ type: "SET_SHOW_FILTER_PANEL", value: v });
  const setSearchCollapsed = (v: boolean) => dispatch({ type: "SET_SEARCH_COLLAPSED", value: v });
  const setShowSizeFilters = (v: boolean) => dispatch({ type: "SET_SHOW_SIZE_FILTERS", value: v });
  const setShowDenomFilters = (v: boolean) => dispatch({ type: "SET_SHOW_DENOM_FILTERS", value: v });
  const setShowLanguageFilters = (v: boolean) => dispatch({ type: "SET_SHOW_LANGUAGE_FILTERS", value: v });
  const setLanguageFilter = (v: string) => dispatch({ type: "SET_LANGUAGE_FILTER", value: v });
  const setShowListModal = (v: boolean) => dispatch({ type: "SET_SHOW_LIST_MODAL", value: v });
  const setShowAddChurchFromSummary = (v: boolean) => dispatch({ type: "SET_SHOW_ADD_CHURCH", value: v });
  const setAddChurchForState = (v: string | null) => dispatch({ type: "SET_ADD_CHURCH_FOR_STATE", value: v });
  const setShowSummary = (v: boolean | ((prev: boolean) => boolean)) => dispatch({ type: "SET_SHOW_SUMMARY", value: v });
  const setShowLegend = (v: boolean) => dispatch({ type: "SET_SHOW_LEGEND", value: v });
  const toggleSize = (label: string) => dispatch({ type: "TOGGLE_SIZE", label });
  const toggleDenom = (label: string) => dispatch({ type: "TOGGLE_DENOM", label });
  const handleMouseMove = (e: React.MouseEvent) => {
    // Don't move the tooltip when preview is pinned, so the "View church" button stays clickable
    if (!s.previewPinned) {
      dispatch({ type: "SET_TOOLTIP_POS", value: { x: e.clientX, y: e.clientY } });
    }
  };

  return {
    hoveredChurch: s.hoveredChurch, setHoveredChurch,
    previewChurch: s.previewChurch, setPreviewChurch,
    previewPinned: s.previewPinned, setPreviewPinned,
    setPinnedPreview, clearPreview,
    hoveredState: s.hoveredState, setHoveredState,
    hoveredCounty: s.hoveredCounty, setHoveredCounty,
    tooltipPos: s.tooltipPos,
    showFilterPanel: s.showFilterPanel, setShowFilterPanel,
    searchCollapsed: s.searchCollapsed, setSearchCollapsed,
    activeSize: s.activeSize, toggleSize, showSizeFilters: s.showSizeFilters, setShowSizeFilters,
    activeDenominations: s.activeDenominations, toggleDenom, showDenomFilters: s.showDenomFilters, setShowDenomFilters,
    showLanguageFilters: s.showLanguageFilters, setShowLanguageFilters,
    languageFilter: s.languageFilter, setLanguageFilter,
    showListModal: s.showListModal, setShowListModal,
    showAddChurchFromSummary: s.showAddChurchFromSummary, setShowAddChurchFromSummary,
    addChurchForState: s.addChurchForState, setAddChurchForState,
    showSummary: s.showSummary, setShowSummary, summaryRef, showLegend: s.showLegend, setShowLegend,
    handleMouseMove,
  };
}
