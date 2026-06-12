import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  GeoJSON,
  useMap,
  ZoomControl,
  Tooltip,
  useMapEvents,
  Marker,
} from "react-leaflet";
import L from "leaflet";
import { useParams, useNavigate } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";
import * as topojson from "topojson-client";
import Fuse from "fuse.js";
import { motion, useAnimation } from "framer-motion";

/* ────────────────────────────────────────────────────────────────
   MAP PIN ICON
   ──────────────────────────────────────────────────────────────── */

let DefaultIcon = L.icon({
  iconUrl: "/marker-icon.png",
  shadowUrl: "/marker-shadow.png",
  iconSize: [25, 41], // Standard size
  iconAnchor: [12, 41], // Points the tip of the pin to the lat/lng
  popupAnchor: [1, -34], // Where the school name popup appears
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

/* ────────────────────────────────────────────────────────────────
   CATCHMENT TYPE HELPERS
   ──────────────────────────────────────────────────────────────── */
const ENABLE_FUTURE_ZONES = false;
const isPrimaryCatchment = (f) => f?.properties?.CATCH_TYPE?.toLowerCase() === "primary";

const isSecondaryCatchment = ({ properties = {} }) => {
  const searchString = `${properties.CATCH_TYPE || ""} ${properties.USE_DESC || ""}`.toLowerCase();
  return ["high", "secondary", "central"].some((word) => searchString.includes(word));
};

// Use Number() for faster parsing if you know input is always numeric-like
const normalizeCode = (val) => {
  const num = String(val).replace(/\D/g, ""); // Strips non-numeric
  return num.length > 0 ? num.padStart(4, "0") : null;
};

/* ────────────────────────────────────────────────────────────────
   MAP ERROR BOUNDARY
   ──────────────────────────────────────────────────────────────── */
class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Map Error Caught:", error, errorInfo);
    setTimeout(() => {
      this.setState({ hasError: false });
    }, 1000);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#f8f9fa",
            color: "#002b5c",
            flexDirection: "column",
          }}
        >
          <p>🔄 Resetting map layers...</p>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ────────────────────────────────────────────────────────────────
   ZOOM HANDLER
   ──────────────────────────────────────────────────────────────── */
// 💡 Accept isMobile as a prop from the parent component
function ZoomHandler({ target }) {
  const map = useMap();

  useEffect(() => {
    // Only proceed if target is valid [lat, lng]
    if (!target || !Array.isArray(target) || target.length < 2) return;

    map.stop();
    map.flyTo(target, 14, {
      duration: 0.4,
      easeLinearity: 0.7,
      noMoveStart: true,
    });

    const onMoveEnd = () => map.invalidateSize({ animate: false });
    map.once("moveend", onMoveEnd);

    return () => map.off("moveend", onMoveEnd);
  }, [target, map]);

  return null;
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(e) {
        if (e.originalEvent._stopped) return;
      onMapClick();
    },
  });
  return null;
}
/* ────────────────────────────────────────────────────────────────
   CONSTANTS
   ──────────────────────────────────────────────────────────────── */
const SCHOOL_COLORS = {
  Primary: "#43A047",
  Secondary: "#1E88E5",
  Central: "#8E24AA",
  Special: "#FB8C00",
  Other: "#E91E63",
};

const panelTransition = {
  type: "tween",
  ease: "circOut",
  duration: 0.3
};

const SELECTIVE_LABELS = {
  "Fully selective": {
    label: "Fully Selective",
    color: "#6a0dad",
    bg: "#f3e8ff",
  },
  "Partially selective": {
    label: "Partially Selective",
    color: "#b45309",
    bg: "#fef3c7",
  },
  No: { label: "", color: "", bg: "" },
  "": { label: "", color: "", bg: "" },
};

const HEADER_HEIGHT = 48;
/* ────────────────────────────────────────────────────────────────
   INLINE STYLES
   ──────────────────────────────────────────────────────────────── */
const styles = {
  appShell: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    backgroundColor: "#002b5c",
    color: "white",
    padding: "10px 16px",
    zIndex: 5100,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
    height: HEADER_HEIGHT,
  },
  headerTitle: { margin: 0 },
  headerSub: { margin: "1px 2 0", fontSize: "11px", opacity: 0.7 },
  mapArea: { flex: 1, position: "relative", overflow: "hidden" },
  footer: {
    backgroundColor: "#f1f1f1",
    padding: "5px 10px",
    textAlign: "center",
    fontSize: "10px",
    color: "#555",
    borderTop: "1px solid #ddd",
    zIndex: 3000,
    flexShrink: 0,
    lineHeight: 1.4,
  },
  searchWrap: {
    position: "absolute",
    top: 12,
    left: "50%",
    transform: "translateX(-50%)",
    width: "calc(100% - 100px)",
    maxWidth: "420px",
    zIndex: 4000,
  },
  searchInner: { position: "relative" },
  searchInput: {
    width: "100%",
    padding: "11px 40px 11px 14px",
    borderRadius: "10px",
    border: "1px solid #ccc",
    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
    fontSize: "14px",
    outline: "none",
    boxSizing: "border-box",
  },
  searchClear: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "none",
    fontSize: "16px",
    cursor: "pointer",
    color: "#999",
  },
  searchDropdown: {
    background: "white",
    listStyle: "none",
    margin: "4px 0 0",
    padding: 0,
    borderRadius: "10px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.15)",
    maxHeight: "280px",
    overflowY: "auto",
    border: "1px solid #eee",
  },
  searchItem: {
    padding: "11px 14px",
    borderBottom: "1px solid #f0f0f0",
    cursor: "pointer",
    fontSize: "13px",
  },
  filterToggleBtn: {
    background: "white",
    border: "none",
    borderRadius: "10px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.15)",
    cursor: "pointer",
    padding: "8px 10px",
    fontSize: "18px",
    lineHeight: 1,
    color: "#002b5c",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.3)",
    zIndex: 4500,
  },
  searchModeToggle: {
    position: "absolute",
    top: -26,
    right: 0,
    display: "inline-flex",
    background: "white",
    borderRadius: 999,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    overflow: "hidden",
    border: "1px solid #ddd",
    fontSize: 11,
  },
  searchModeButton: (active) => ({
    padding: "4px 8px",
    cursor: "pointer",
    background: active ? "#002b5c" : "white",
    color: active ? "white" : "#555",
    border: "none",
    outline: "none",
    fontWeight: active ? 600 : 400,
  }),
  addressCatchmentToggle: {
    position: "absolute",
    top: 68,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2100,
    background: "white",
    borderRadius: 999,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    border: "1px solid #eee",
    display: "inline-flex",
    overflow: "hidden",
    fontSize: 11,
  },
  loadingBadge: {
    position: "absolute",
    top: 68, // aligns under search bar (same as clear pill)
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2000,
    background: "rgba(0, 43, 92, 0.92)",
    color: "white",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "12px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 6,
    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
    pointerEvents: "none",
  },
  addressCatchmentButton: (active) => ({
    padding: "5px 10px",
    cursor: "pointer",
    background: active ? "#002b5c" : "white",
    color: active ? "white" : "#555",
    border: "none",
    outline: "none",
    fontWeight: active ? 600 : 400,
  }),
};

/* ────────────────────────────────────────────────────────────────
   FILTER PANEL
   ──────────────────────────────────────────────────────────────── */

const PEEK_HEIGHT = 60;
const DEFAULT_FILTERS = {
  gender: "All",
  oc: false,
  selective: "all",
  future: false,
  types: Object.keys(SCHOOL_COLORS)
};

function FilterPanel({
  isMobile: passedIsMobile,
  isOpen,
  onToggle,
  typeFilters,
  showFilterPeek,
  setTypeFilters,
  genderFilter,
  setGenderFilter,
  ocFilter,
  setOcFilter,
  selectiveFilter,
  setSelectiveFilter,
  showFuture,
  setShowFuture,
  onClearFilters,
}) {
  const [isTrueMobile, setIsTrueMobile] = useState(false);
  const [snapState, setSnapState] = useState("peeking");
  const controls = useAnimation();
 
  // 1. Mobile Layout Calculation (Memoized for performance)
  const mobileLayout = useMemo(() => {
    if (!passedIsMobile) return null;
    const h = window.innerHeight;
    return {
      variants: {
        peeking: { y: h - PEEK_HEIGHT },
        full: { y: h * 0.12 },
        closed: { y: h + 100 },
      },
    };
  }, [passedIsMobile]);

  // 2. Device detection
useEffect(() => {
    const isMobileOS = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsTrueMobile(isMobileOS && passedIsMobile);
  }, [passedIsMobile]);

  // 3. Coordinated state management
useEffect(() => {
    if (!isTrueMobile) return;
    const targetState = !showFilterPeek && !isOpen ? "closed" : (isOpen ? "full" : "peeking");
    setSnapState(targetState);
    controls.start(targetState, panelTransition);
  }, [isOpen, showFilterPeek, isTrueMobile, controls]);

  /* ==========================================================================
     1. MOBILE DRAWER LAYOUT
     ========================================================================== */

const hasActiveFilters = useMemo(() => 
    genderFilter !== "All" ||
    ocFilter ||
    selectiveFilter !== "all" ||
    showFuture ||
    typeFilters.length !== Object.keys(SCHOOL_COLORS).length
  , [genderFilter, ocFilter, selectiveFilter, showFuture, typeFilters]);

const handleReset = () => {
  setGenderFilter(DEFAULT_FILTERS.gender);
  setOcFilter(DEFAULT_FILTERS.oc);
  setSelectiveFilter(DEFAULT_FILTERS.selective);
  setShowFuture(DEFAULT_FILTERS.future);
  setTypeFilters(DEFAULT_FILTERS.types);
};

if (isTrueMobile && mobileLayout) {
    return (
      <>
        {/* Backdrop for the Filter Panel when in FULL state */}
        {isOpen && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0,0,0,0.3)",
              zIndex: 4999,
              opacity: 1,
              transition: "opacity 0.28s ease",
            }}
            onClick={onToggle}
          />
        )}

  <motion.div
  drag="y"
  dragConstraints={{
    top: mobileLayout?.variants.full.y ?? 0,
    bottom: mobileLayout?.variants.peeking.y ?? 0
  }}
  dragElastic={0} // Completely removes "stretching" feel
  initial="peeking"
  animate={controls}
  transition={panelTransition} // Handles state-driven changes (e.g., clicking the handle)
  dragDirectionLock
  dragMomentum={false} 
  // 💡 REMOVED: dragTransition (not needed when using manual controls.start)
  dragListener={true}
  variants={mobileLayout?.variants}
  style={{ 
    position: "fixed",
    left: "8px",
    right: "8px",
    bottom: 0,
    height: "100vh",
    background: "white",
    zIndex: 5000,
    borderRadius: "24px 24px 0 0",
    boxShadow: "0 -8px 30px rgba(0,0,0,0.15)",
    touchAction: "none",
    willChange: "transform",
    display: "flex",
    flexDirection: "column",
    visibility: snapState === "closed" ? "hidden" : "visible",
  }}
  onDragEnd={(e, info) => {
  const swipeThreshold = 8;
  const velocityThreshold = 16;

  // 1. Logic for DOWNWARD movement (Closing)
  if (info.velocity.y > velocityThreshold || info.offset.y > swipeThreshold) {
    if (snapState === "full") {
      setSnapState("peeking");
      controls.start("peeking", panelTransition);
      // If you have a specific "onMinimize" for filters, call it here
    } else if (snapState === "peeking") {
      setSnapState("closed");
      controls.start("closed", panelTransition);
      if (onToggle) onToggle(); // Using onToggle to notify parent of closure
    }
  } 
  // 2. Logic for UPWARD movement (Opening)
  else if (info.velocity.y < -velocityThreshold || info.offset.y < -swipeThreshold) {
    if (snapState === "peeking") {
      setSnapState("full");
      controls.start("full", panelTransition);
    } else {
      // Already full, snap back to maintain position
      controls.start("full", panelTransition);
    }
  } 
  // 3. Logic for Release (Snap back to current state)
  else {
    controls.start(snapState, panelTransition);
  }
}}
>
          {/* VISUAL HANDLE & TAB */}
          <div
            onClick={onToggle}
            style={{
              width: "100%",
              height: "40px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "grab",
              flexShrink: 0,
              touchAction: "none",
            }}
          >
            <div
              style={{
                width: 40,
                height: 5,
                background: hasActiveFilters && !isOpen ? "#1E88E5" : "#E2E8F0",
                borderRadius: 10,
                marginBottom: "4px",
              }}
            />
            {!isOpen && (
              <span
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: hasActiveFilters ? "#1E88E5" : "#666",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {hasActiveFilters ? "Filters • Active" : "Filters"}
              </span>
            )}
          </div>

          {/* INNER CONTENT AREA */}
          <div
            style={{
              flex: "0 1 auto",
              height: "calc(100% - 40px)",
              overflow: "hidden",
              paddingBottom: "100px",
              pointerEvents: "auto",
              touchAction: "none",
            }}
          >
            <FilterContent
              typeFilters={typeFilters}
              setTypeFilters={setTypeFilters}
              genderFilter={genderFilter}
              setGenderFilter={setGenderFilter}
              ocFilter={ocFilter}
              setOcFilter={setOcFilter}
              selectiveFilter={selectiveFilter}
              setSelectiveFilter={setSelectiveFilter}
              showFuture={showFuture}
              setShowFuture={setShowFuture}
              onClearFilters={onClearFilters}
            />
          </div>
        </motion.div>
      </>
    );
  }

  /* ==========================================================================
     2. DESKTOP SIDEBAR LAYOUT
     ========================================================================== */
  const PANEL_WIDTH = 260;
  const TAB_W = 22;
  const TAB_H = 64;
  const HEADER_HEIGHT = 60;
  const tabLeft = isOpen ? PANEL_WIDTH : 0;

  return (
    <>
      {isOpen && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.1)",
            transition: "opacity 0.25s ease-in-out",
            top: HEADER_HEIGHT,
            zIndex: 4900,
          }}
          onClick={onToggle}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: HEADER_HEIGHT,
          bottom: 0,
          left: 0,
          width: PANEL_WIDTH,
          background: "white",
          zIndex: 5000,
          overflowY: "auto",
          overflowX: "hidden",
          direction: "rtl",
          transform: isOpen ? "translateX(0)" : `translateX(-${PANEL_WIDTH}px)`,
          transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: isOpen ? "4px 0 20px rgba(0,0,0,0.15)" : "none",
        }}
      >
        <div style={{ direction: "ltr" }}>
          <FilterContent
            typeFilters={typeFilters}
            setTypeFilters={setTypeFilters}
            genderFilter={genderFilter}
            setGenderFilter={setGenderFilter}
            ocFilter={ocFilter}
            setOcFilter={setOcFilter}
            selectiveFilter={selectiveFilter}
            setSelectiveFilter={setSelectiveFilter}
            showFuture={showFuture}
            setShowFuture={setShowFuture}
            onClearFilters={onClearFilters}
          />
        </div>
      </div>

      <div
        onClick={onToggle}
        title={isOpen ? "Close filters" : "Open filters"}
        style={{
          position: "fixed",
          top: HEADER_HEIGHT + 80,
          left: tabLeft,
          width: TAB_W,
          height: TAB_H,
          background: "#002b5c",
          borderRadius: "0 10px 10px 0",
          cursor: "pointer",
          zIndex: 5001,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "3px 2px 10px rgba(0,0,0,0.25)",
          transition: "left 0.28s cubic-bezier(0.4,0,0.2,1)",
          userSelect: "none",
        }}
      >
        <span
          style={{
            color: "white",
            fontSize: "16px",
            fontWeight: 700,
            lineHeight: 1,
            marginLeft: isOpen ? -1 : 2,
          }}
        >
          {isOpen ? (
            <span style={{ fontSize: "22px", lineHeight: "1" }}>‹</span>
          ) : (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="5" x2="21" y2="5"></line>
              <circle cx="8" cy="5" r="2"></circle>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <circle cx="16" cy="12" r="2"></circle>
              <line x1="3" y1="19" x2="21" y2="19"></line>
              <circle cx="10" cy="19" r="2"></circle>
            </svg>
          )}
        </span>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
   FILTER CONTENT (Memoized)
   ──────────────────────────────────────────────────────────────── */
const FilterContent = React.memo(function FilterContent({
  typeFilters,
  setTypeFilters,
  genderFilter,
  setGenderFilter,
  ocFilter,
  setOcFilter,
  selectiveFilter,
  setSelectiveFilter,
  showFuture,
  setShowFuture,
  onClearFilters,
}) {
  return (
    <div>
      <div
        style={{
          padding: "14px 20px 10px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "15px", color: "#002b5c" }}>
          🔍 Filter Schools
        </span>
      </div>

      <div style={{ padding: "12px 20px" }}>
        {/* School Type */}
        <div style={{ marginBottom: "12px" }}>
          <SectionLabel>School Type</SectionLabel>
          {Object.entries(SCHOOL_COLORS).map(([label, color]) => (
            <div
              key={label}
              onClick={() =>
                setTypeFilters((p) =>
                  p.includes(label)
                    ? p.filter((l) => l !== label)
                    : [...p, label],
                )
              }
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 10px",
                marginBottom: "4px",
                borderRadius: "8px",
                cursor: "pointer",
                background: typeFilters.includes(label)
                  ? `${color}18`
                  : "#f9f9f9",
                border: `1px solid ${
                  typeFilters.includes(label) ? color : "#eee"
                }`,
                transition: "all 0.15s",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: color,
                  marginRight: 10,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: typeFilters.includes(label) ? "#222" : "#aaa",
                }}
              >
                {label}
              </span>
              {typeFilters.includes(label) && (
                <span
                  style={{
                    marginLeft: "auto",
                    color: color,
                    fontSize: "14px",
                  }}
                >
                  ✓
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Gender */}
        <div style={{ marginBottom: "12px" }}>
          <SectionLabel>Gender</SectionLabel>
          {[
            { value: "All", label: "All" },
            { value: "Coed", label: "Co-educational" },
            { value: "Boys", label: "Boys Only" },
            { value: "Girls", label: "Girls Only" },
          ].map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "4px 0",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              <input
                type="radio"
                name="gender"
                value={opt.value}
                checked={genderFilter === opt.value}
                onChange={() => setGenderFilter(opt.value)}
                style={{ marginRight: 8 }}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {/* Selective Status */}
        <div style={{ marginBottom: "12px" }}>
          <SectionLabel>Selective Status</SectionLabel>
          {[
            { value: "all", label: "All Schools" },
            { value: "Fully selective", label: "Fully Selective" },
            { value: "Partially selective", label: "Partially Selective" },
            { value: "non", label: "Non-Selective Only" },
          ].map((opt) => (
            <label
              key={opt.value}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "4px 0",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              <input
                type="radio"
                name="selective"
                value={opt.value}
                checked={selectiveFilter === opt.value}
                onChange={() => setSelectiveFilter(opt.value)}
                style={{ marginRight: 8 }}
              />
              {opt.label}
            </label>
          ))}
        </div>

        {/* Overlays */}
        <div style={{ marginBottom: "12px" }}>
          <SectionLabel>Overlays</SectionLabel>
          <ToggleRow
            checked={ocFilter}
            onChange={setOcFilter}
            label="Opportunity Classes only"
            icon="⭐"
            tooltip="Filters to schools that run an Opportunity Class (OC)..."
          />
          {ENABLE_FUTURE_ZONES && (
            <ToggleRow
              checked={showFuture}
              onChange={setShowFuture}
              label="Show future zone changes"
              icon="🔮"
              sublabel="Dashed orange boundaries"
              tooltip="Shows planned catchment boundary changes..."
            />
          )}
        </div>

        {/* Clear filters button */}
        <button
          type="button"
          onClick={onClearFilters}
          style={{
            marginTop: "10px",
            width: "100%",
            padding: "10px 12px",
            borderRadius: "8px",
            border: "none",
            cursor: "pointer",
            background: "#e63946",
            color: "white",
            fontWeight: 700,
            fontSize: "14px",
            textAlign: "center",
            lineHeight: 1.2,
          }}
        >
          Clear filters
          <div style={{ fontSize: "11px", opacity: 0.9 }}>show all schools</div>
        </button>
      </div>
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────
   SMALL UI HELPERS
   ──────────────────────────────────────────────────────────────── */
const SECTION_LABEL_STYLE = {
  fontSize: "11px",
  fontWeight: 700,
  color: "#888",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: "8px",
};

function SectionLabel({ children }) {
  return <div style={SECTION_LABEL_STYLE}>{children}</div>;
}

function ToggleRow({ checked, onChange, label, icon, sublabel, tooltip }) {
  const [showTip, setShowTip] = useState(false);
  return (
    <div
      onClick={() => onChange((v) => !v)}
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 10px",
        marginBottom: "6px",
        borderRadius: "8px",
        cursor: "pointer",
        background: checked ? "#e8f5e9" : "#f9f9f9",
        border: `1px solid ${checked ? "#43A047" : "#eee"}`,
        transition: "all 0.15s",
        position: "relative",
      }}
    >
      <span style={{ fontSize: "15px", marginRight: 10 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: checked ? "#2e7d32" : "#555",
            display: "flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          {label}
          {tooltip && (
            <span
              onClick={(e) => e.stopPropagation()}
              onMouseEnter={() => setShowTip(true)}
              onMouseLeave={() => setShowTip(false)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 15,
                height: 15,
                borderRadius: "50%",
                background: "#ccc",
                color: "white",
                fontSize: "9px",
                fontWeight: 700,
                cursor: "default",
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              i
            </span>
          )}
        </div>
        {sublabel && (
          <div style={{ fontSize: "11px", color: "#999", marginTop: 1 }}>
            {sublabel}
          </div>
        )}
      </div>

      {tooltip && showTip && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            left: 8,
            right: 8,
            background: "#222",
            color: "white",
            fontSize: "11px",
            padding: "7px 10px",
            borderRadius: 7,
            lineHeight: 1.5,
            zIndex: 9999,
            pointerEvents: "none",
            boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
          }}
        >
          {tooltip}
          <div
            style={{
              position: "absolute",
              bottom: -5,
              left: 16,
              width: 10,
              height: 10,
              background: "#222",
              transform: "rotate(45deg)",
            }}
          />
        </div>
      )}

      <div
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          background: checked ? "#43A047" : "#ddd",
          position: "relative",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "white",
            transition: "left 0.2s",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
   SCHOOL INFO CARD
   ──────────────────────────────────────────────────────────────── */
function SchoolInfoCard({ school, isMobile, isOpen, onOpen, onMinimize, onClose }) {
  const controls = useAnimation();
  const [snapState, setSnapState] = useState("closed");

  const variants = useMemo(() => {
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return {
      peeking: { y: h * 0.65 },
      full: { y: h * 0.12 },
      closed: { y: h + 100 },
    };
  }, []);

  // Synchronize layout animations with lifecycle changes
useEffect(() => {
    if (!isMobile) return;
    const targetState = !school ? "closed" : (isOpen ? "full" : "peeking");
    setSnapState(targetState);
    controls.start(targetState, panelTransition);
  }, [school, isOpen, isMobile, controls]);

  // Compute school branding color profiles safely if school exists
  const level = school?.level || "";
  let typeColor;
  if (level.includes("Primary")) {
    typeColor = SCHOOL_COLORS.Primary;
  } else if (level.includes("Secondary") || level.includes("High")) {
    typeColor = SCHOOL_COLORS.Secondary;
  } else if (level.includes("Central")) {
    typeColor = SCHOOL_COLORS.Central;
  } else {
    typeColor = SCHOOL_COLORS.Other || "#888";
  }

   // Render nothing on desktop if no active data profile is selected
  if (!isMobile && !school) return null;

  return (
    <>
      {!isMobile ? (
        /* ==========================================================================
           1. DESKTOP VIEW PANEL
           ========================================================================== */
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "350px",
            background: "white",
            zIndex: 3000,
            boxShadow: "-4px 0 20px rgba(0,0,0,0.15)",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CardBody
            school={school}
            typeColor={typeColor}
            onClose={onClose}
            isMobile={false}
          />
        </div>
      ) : (
        /* ==========================================================================
           2. MOBILE BOTTOM SHEET VIEW
           ========================================================================== */
        <>
          {/* Transparent click backdrop wrapper when sheet is fully expanded */}
          {school && isOpen && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0,0,0,0.3)",
                zIndex: 4799,
              }}
              onClick={() => {
                setSnapState("peeking");
                controls.start("peeking");
                if (onMinimize) onMinimize(); // 💡 Minimizes to peek on backdrop click
              }}
            />
          )}

          <motion.div
            drag="y"
            dragConstraints={{ top: variants.full.y, bottom: variants.peeking.y }}
            dragElastic={0}
            dragDirectionLock
            dragMomentum={false} // Disable momentum to prevent physics overshoot
            transition={panelTransition}
            dragListener={true}
            variants={variants}
            initial="closed"
            animate={controls}
            style={{
              position: "fixed",
              left: "8px",
              right: "8px",
              bottom: 0,
              height: "100vh",
              background: "white",
              zIndex: 4800,
              borderRadius: "24px 24px 0 0",
              overflow: "hidden",
              boxShadow: "0 -8px 30px rgba(0,0,0,0.08)",
              touchAction: "none",
              willChange: "transform",
              display: "flex",
              flexDirection: "column",
              visibility: snapState === "closed" ? "hidden" : "visible",
            }}
onDragEnd={(e, info) => {
              const swipeThreshold = 8;
              const velocityThreshold = 16;

              if (info.velocity.y > velocityThreshold || info.offset.y > swipeThreshold) {
                const nextState = snapState === "full" ? "peeking" : "closed";
                setSnapState(nextState);
                controls.start(nextState, panelTransition);
                if (nextState === "peeking" && onMinimize) onMinimize();
                if (nextState === "closed" && onClose) onClose();
              } else if (info.velocity.y < -velocityThreshold || info.offset.y < -swipeThreshold) {
                setSnapState("full");
                controls.start("full", panelTransition);
                if (onOpen) onOpen();
              } else {
                controls.start(snapState, panelTransition);
              }
            }}
          >
            {/* VISUAL GRAB HANDLE TAB */}
            <div
             style={{
                width: "100%",
                height: "30px",
                display: "flex",
                justifyContent: "center",
                cursor: "grab",
                flexShrink: 0,
                touchAction: "none",
              }}
              onClick={() => {
                const nextState = snapState === "peeking" ? "full" : "peeking";
                setSnapState(nextState);
                controls.start(nextState, panelTransition);
                if (nextState === "full" && onOpen) onOpen();
                if (nextState === "peeking" && onMinimize) onMinimize();
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 5,
                  background: "#E2E8F0",
                  borderRadius: 10,
                  marginTop: "12px",
                }}
              />
            </div>

            {/* INNER SCROLL CONTENT CONTAINER */}
            <div
              style={{
                height: "calc(100% - 30px)",
                overflow: "hidden",
                // paddingBottom: "100px",
                pointerEvents: "auto",
                flex: "0 1 auto",
              }}
            >
              {school && (
                <CardBody
                  school={school}
                  typeColor={typeColor}
                  onClose={onClose}
                  isMobile={true}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </>
  );
}

// 2. THE CONTENT ENGINE
const ICSEA_LEVELS = [
  { min: 1200, label: "Very High", color: "#006400", textColor: "white" },
  { min: 1100, label: "High", color: "#4CAF50", textColor: "white" },
  { min: 900, label: "Average", color: "#FFD700", textColor: "black" },
  { min: 700, label: "Low", color: "#FF8C00", textColor: "white" },
  { min: 0, label: "Very Low", color: "#D32F2F", textColor: "white" }
];

const getIcseaInfo = (value) => {
  const num = Number(value);
  if (isNaN(num)) return { label: "n/a", color: "#f5f5f5", textColor: "#888", val: "n/a" };
  const level = ICSEA_LEVELS.find(l => num >= l.min) || ICSEA_LEVELS[4];
  return { ...level, val: num };
};

const InfoRow = ({ label, children }) => (
  <div style={{ display: "flex", flexDirection: "column", padding: "8px 18px", borderBottom: "1px solid #f3f3f3" }}>
    <span style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#888", marginBottom: 3 }}>{label}</span>
    <span style={{ fontSize: "13px", color: "#222", fontWeight: 500 }}>{children}</span>
  </div>
);

/* ────────────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────────────── */
function CardBody({ school, typeColor, onClose, isMobile }) {
  
  const data = useMemo(() => {
    // If no school is selected, return a safe, empty object structure
    if (!school) {
      return {
        visible: false,
        name: "", website: "", suburb: "", gender: "", enrolment: "", oc: "",
        icsea: { val: "n/a", label: "n/a", color: "#f5f5f5", textColor: "#888" },
        selective: { label: "No", color: "#666", bg: "transparent" },
        mySchool: { url: "#", label: "", desc: "" },
        betterEducation: { url: "#", label: "" },
        schoolFinder: { url: "#", label: "" }
      };
    }

    // When a school exists, calculate all production data safely
    return {
      visible: true,
      name: school.name,
      website: school.url?.startsWith("http") ? school.url : `https://${school.url}`,
      suburb: school.suburb,
      gender: { Coed: "Co-ed", Boys: "Boys", Girls: "Girls" }[school.gender] || school.gender || "n/a",
      enrolment: school.enrolment ? `${Math.round(school.enrolment).toLocaleString()} Students` : "n/a",
      icsea: getIcseaInfo(school.icsea),
      selective: (typeof SELECTIVE_LABELS !== "undefined" && SELECTIVE_LABELS[school.selective]) || { label: school.selective || "No", color: "#666", bg: "transparent" },
      oc: school.oc && school.oc !== "N" ? "Yes (OC classes available)" : "n/a",
      mySchool: {
        url: `https://www.myschool.edu.au/search?schoolName=${encodeURIComponent(school.name)}`,
        label: "MySchool ↗",
        desc: "NAPLAN, ATAR insights & school profile"
      },
      betterEducation: {
        url: "https://bettereducation.com.au/school/secondary/nsw/sydney-high-school-rankings.aspx", // Modify if mapping dynamic urls later
        label: "Better Education ↗"
      },
      schoolFinder: {
        url: `https://schoolfinder.education.nsw.gov.au/index.php?schoolCode=${school.code}`,
        label: "School Finder ↗"
      }
    };
  }, [school]);

  // Use the memoized visibility flag to decide if the card should render UI
  if (!data.visible) return null;

  const handleDomainSearch = () => {
    const slug = String(school.suburb || "").trim().toLowerCase().replace(/\s+/g, "-");
    window.open(`https://www.domain.com.au/suburb-profile/${slug}-nsw-${school.postcode}`, "_blank");
  };

  return (
    <>
      {/* HEADER */}
      <div style={{ borderTop: `4px solid ${typeColor}`, padding: isMobile ? "12px 16px" : "14px 18px", display: "flex", justifyContent: "space-between", gap: "12px", backgroundColor: "white" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <a href={data.website} target="_blank" rel="noopener noreferrer" style={{ color: "#002b5c", fontSize: isMobile ? "15px" : "17px", fontWeight: 800, textDecoration: "none" }}>
            {data.name} <span style={{ opacity: 0.6 }}>↗</span>
          </a>
          <div style={{ fontSize: "12px", color: "#666", marginTop: "4px" }}>{data.suburb}</div>
        </div>
        <button onClick={onClose} style={{ border: "none", background: "#f5f5f5", borderRadius: "50%", width: "30px", height: "30px", cursor: "pointer" }}>✕</button>
      </div>

      {/* BODY */}
      <div style={{ paddingTop: 6 }}>
        <InfoRow label="School type">
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%", background: typeColor, marginRight: 6 }} />
            {school.level || "n/a"}
        </InfoRow>
        <InfoRow label="OC classes">{data.oc}</InfoRow>
        <InfoRow label="Gender">{data.gender}</InfoRow>
        <InfoRow label="Selective">
           <span style={{ color: data.selective.color, backgroundColor: data.selective.bg, padding: data.selective.bg !== "transparent" ? "2px 8px" : "0", borderRadius: "4px" }}>
             {data.selective.label}
           </span>
        </InfoRow>
        <InfoRow label="Enrolment">{data.enrolment}</InfoRow>
        <InfoRow label="School Community Advantage (ICSEA)">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            ICSEA Score: {data.icsea.val}
            <span style={{ fontSize: "10px", fontWeight: "800", padding: "2px 6px", borderRadius: "4px", backgroundColor: data.icsea.color, color: data.icsea.textColor }}>
              {data.icsea.label}
            </span>
          </div>
        </InfoRow>

        {/* EXTERNAL LINKS */}
<InfoRow label="Academic results & programs">
  <a href={data.mySchool.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1E88E5", textDecoration: "none" }}>
    {data.mySchool.label}
  </a>
  <span style={{ display: "block", fontSize: "11px", color: "#666", marginTop: 2 }}>
    {data.mySchool.desc}
  </span>
</InfoRow>

<InfoRow label="HSC rankings">
  <a href={data.betterEducation.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1E88E5", textDecoration: "none" }}>
    {data.betterEducation.label}
  </a>
</InfoRow>

<InfoRow label="Verify data on official website">
  <a href={data.schoolFinder.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1E88E5", textDecoration: "none" }}>
    {data.schoolFinder.label}
  </a>
</InfoRow>
        
        <div style={{ padding: "12px 18px" }}>
          <button onClick={handleDomainSearch} style={{ backgroundColor: "#009a44", color: "white", padding: "12px", borderRadius: "8px", border: "none", width: "100%", fontWeight: 600 }}>
            📊 {school.suburb} Suburb Profile & Rentals
          </button>
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
   GEOMETRY HELPER
   ──────────────────────────────────────────────────────────────── */
function pointInFeature(lat, lng, feature) {
  if (!feature || !feature.geometry) return false;

  try {
    return turf.booleanPointInPolygon(turf.point([lng, lat]), feature);
  } catch (e) {
    console.error("turf.booleanPointInPolygon error:", e);
    return false;
  }
}

/* ────────────────────────────────────────────────────────────────
   MAIN MAP VIEW (logic)
   ──────────────────────────────────────────────────────────────── */
function MapViewInner() {
  const [schools, setSchools] = useState([]);
  const [displayTerm, setDisplayTerm] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [activeCatchment, setActiveCatchment] = useState(null);
  const navigate = useNavigate();
  const { schoolSlug } = useParams();
  const [futureCatchments, setFutureCatchments] = useState(null);
  const [mapTarget, setMapTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchForcedSchool, setSearchForcedSchool] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [schoolCardOpen, setSchoolCardOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1024px)");
    const userAgent = typeof window.navigator === "undefined" ? "" : navigator.userAgent;
    const isMobileOS = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const handleDeviceChange = (e) => {
      setIsMobile(e.matches && isMobileOS);
    };
    
    setIsMobile(mediaQuery.matches && isMobileOS);
    mediaQuery.addEventListener("change", handleDeviceChange);
    return () => mediaQuery.removeEventListener("change", handleDeviceChange);
  }, []);

  const [genderFilter, setGenderFilter] = useState(DEFAULT_FILTERS.gender);
  const [typeFilters, setTypeFilters] = useState(DEFAULT_FILTERS.types);
  const [ocFilter, setOcFilter] = useState(false);
  const [selectiveFilter, setSelectiveFilter] = useState("all");
  const [showFuture, setShowFuture] = useState(false);

  // Residential search state
  const [addressResults, setAddressResults] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressMarker, setAddressMarker] = useState(null);
  const [primaryCatchmentFeature, setPrimaryCatchmentFeature] = useState(null);
  const [secondaryCatchmentFeature, setSecondaryCatchmentFeature] = useState(null);
  const [catchmentView, setCatchmentView] = useState("primary"); // "primary" | "secondary"
  const [geoData, setGeoData] = useState(null);
  const [catchmentsReady, setCatchmentsReady] = useState(false);

  // Derived peek bar visibility: Hide filter peek when a school is open or address is marked
  const showFilterPeek = selectedSchool === null && addressMarker === null;

  // COORDINATED FILTER TOGGLE FUNCTION (Updated for Coordinated Architecture)
  const handleToggleFilter = useCallback(() => {
    setFilterOpen((prev) => {
      const nextState = !prev;
      // If opening filters, safely dismiss school panels, card layout parameters, and address vectors
      if (nextState === true) {
        setSelectedSchool(null);
        setSchoolCardOpen(false); // Force card layout variable down
        setActiveCatchment(null);
        setAddressMarker(null);
        setPrimaryCatchmentFeature(null);
        setSecondaryCatchmentFeature(null);
      }
      return nextState;
    });
  }, []);

  // 💡 HOOK HANDLER: Call this whenever a school node item is selected on the map or search bar
  const handleSelectSchool = useCallback((schoolItem) => {
    setFilterOpen(false);      // Close filters expanded layout view
    setSelectedSchool(schoolItem);
    setSchoolCardOpen(false);   // Reset card sheet layout back to PEEK state on clear selection
  }, []);

  // 💡 HOOK HANDLER: Safely closes school card completely and brings back the filter peek bar
  const handleCloseSchoolCard = useCallback(() => {
    setSelectedSchool(null);
    setSchoolCardOpen(false);
  }, []);

  // 💡 NEW HOOK HANDLER: Minimizes card back to PEEK state, keeping school active (and filters hidden)
const handleMinimizeSchoolCard = useCallback(() => {
  setSchoolCardOpen(false);
}, []); 

  // The Memoized Index
  const catchmentIndex = useMemo(() => {
    if (!geoData?.features) return {};

    console.log("Building catchment index...");

    const index = Object.create(null);

    for (const feature of geoData.features) {
      const props = feature.properties || {};

      const rawId =
        props.school_code ||
        props.C_CODE ||
        props.USE_ID ||
        props.CATCH_CODE ||
        props.SCHOOL_CODE;

      const code = normalizeCode(rawId || "");
      if (!code) continue;

      if (!index[code]) index[code] = [];
      index[code].push(feature);
    }

    console.log(`✓ Index built: ${Object.keys(index).length} codes`);
    return index;
  }, [geoData]);

  // 3. Preload catchments on app mount
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadData() {
      const cached = window._catchmentCache;
      if (cached) {
        if (!cancelled) {
          setGeoData(cached);
          setCatchmentsReady(true);
        }
        return;
      }

      try {
        const res = await fetch("/catchments.json", { signal: controller.signal });
        if (!res.ok) throw new Error(`Catchment fetch failed: ${res.status}`);

        const topology = await res.json();
        const objectKey = Object.keys(topology.objects || {})[0];
        if (!objectKey) throw new Error("Invalid TopoJSON data");

        const decodedData = topojson.feature(topology, topology.objects[objectKey]);

        if (cancelled) return;
        window._catchmentCache = decodedData;
        setGeoData(decodedData); // Triggers the useMemo above.
        setCatchmentsReady(true);
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Catchment Load Error:", err);
        }
      }
    }

    loadData();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);

    async function loadData() {
      try {
        setLoading(true);
        const response = await fetch("/schools_master.json");
        const data = await response.json();

        const mapped = (data.records || [])
          .map((row) => ({
            code: String(row[0] || ""),
            name: row[2] || "Unknown",
            url: row[8] || "",
            suburb: row[4] || "",
            postcode: row[5] || "",
            enrolment: row[10] || 0,
            icsea: row[13] || null,
            level: row[14] || "Other",
            selective: row[15] || "No",
            oc: row[16] || "N",
            gender: row[23] || "Coed",
            lat: parseFloat(row[40]),
            lng: parseFloat(row[41]),
          }))
          .filter((s) => !isNaN(s.lat) && !isNaN(s.lng));

        setSchools(mapped);
      } catch (e) {
        console.error("Data error", e);
      } finally {
        setLoading(false);
      }
    }

    loadData();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!ENABLE_FUTURE_ZONES || !showFuture || futureCatchments) return;

    async function loadFuture() {
      try {
        // Use the existing cache if available, otherwise fetch
        if (!window._catchmentCache) {
          const res = await fetch("/catchments.json");
          window._catchmentCache = await res.json();
        }

        const futureFeatures = window._catchmentCache.features.filter((f) => {
          const props = f.properties || {};

          // 1. Identify which property holds the year.
          const yearValue = parseInt(props.YEAR || props.ACT_YEAR || 0, 10);

          // 2. Filter for catchments active between 2027 and 2032
          const isFutureYear = yearValue >= 2027 && yearValue <= 2032;

          const hasValidType = !!props.CATCH_TYPE;

          return isFutureYear && hasValidType;
        });

        if (futureFeatures.length > 0) {
          setFutureCatchments({
            type: "FeatureCollection",
            features: futureFeatures,
          });
          console.log(
            `✓ ${futureFeatures.length} future zones loaded (2027-2032)`,
          );
        }
      } catch (e) {
        console.error("Future zones error", e);
      }
    }

    loadFuture();
  }, [showFuture, futureCatchments]);

  const ensureCatchmentCache = useCallback(async () => {
    if (!window._catchmentCache) {
      try {
        const res = await fetch("/catchments.json");
        const topology = await res.json();

        const objectKey = Object.keys(topology.objects)[0];
        const geoData = topojson.feature(topology, topology.objects[objectKey]);

        window._catchmentCache = geoData;

        console.log(`✓ Catchment cache initialized (${objectKey})`);
        console.log("Sample Properties:", geoData.features[0].properties);
      } catch (err) {
        console.error("Failed to initialize catchment cache:", err);
        return null;
      }
    }
    return window._catchmentCache;
  }, []);

  useEffect(() => {
    if (selectedSchool && selectedSchool.name) {
      document.title = `${selectedSchool.name} Catchment Area Map | Local School Map`;
    } else {
      document.title = `NSW School Catchment Areas Map | Search zones by Suburb, School or Address`;
    }
  }, [selectedSchool]);

  // Clear everything (used by clear pill, search clear, and map click)
  const handleClearAll = useCallback(() => {
    setShowResults(false);
    setActiveCatchment(null);
    setSelectedSchool(null);
    setSearchForcedSchool(null);
    setPrimaryCatchmentFeature(null);
    setSecondaryCatchmentFeature(null);
    setCatchmentView("primary");
    setDisplayTerm("");
    setSearchTerm("");
    setAddressMarker(null);
    setAddressResults([]);
    setAddressLoading(false);

    // 3. Defer navigation to the next macro-task tick to let Leaflet settle
    setTimeout(() => {
      if (typeof navigate === "function") {
        navigate("/");
      }
    }, 10);
  }, [navigate]);

  // 2. Clear filters logic
  const handleClearFilters = useCallback(() => {
    setTypeFilters(Object.keys(SCHOOL_COLORS));
    setGenderFilter("All");
    setOcFilter(false);
    setSelectiveFilter("all");
    setSearchForcedSchool(null);
  }, []);

  // School click → use index for instant catchment lookup
  const handleSchoolClick = useCallback(
    (school) => {
      if (!school || !school.name) return;

      setFilterOpen(false);

      // 1. Sanitize the name into a secure, URL-friendly slug
      const slug = school.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-");

      // 2. Navigation & State Update
      navigate(`/catchment/${slug}`);
      setSelectedSchool(school);

      // 3. Position the Map
      if (isMobile) {
        const mobileLat = (school.lat || 0) + 0.005;
        setMapTarget([mobileLat, school.lng || 0]);
      } else {
        setMapTarget([school.lat || 0, school.lng || 0]);
      }

      // 4. Catchment Logic with extra validation
      const code = normalizeCode(school.code);

      if (
        !catchmentsReady ||
        !catchmentIndex ||
        Object.keys(catchmentIndex).length === 0
      ) {
        console.warn("Catchment data is still initializing...");
        setActiveCatchment(null);
        return;
      }

      const features = catchmentIndex[code];

      setTimeout(() => {
        if (features && features.length > 0) {
          setActiveCatchment({
            type: "FeatureCollection",
            features,
          });
        } else {
          setActiveCatchment(null);
        }
      }, 50); // 50ms to let map engine reset
    },
    // All dependencies must be listed here in one single array
    [
      catchmentIndex,
      catchmentsReady,
      isMobile,
      navigate,
      setSelectedSchool,
      setMapTarget,
      setActiveCatchment,
    ],
  );

  useEffect(() => {
    // If data just finished loading AND a school is already selected but has no catchment visible
    if (catchmentsReady && selectedSchool && !activeCatchment) {
      const code = normalizeCode(selectedSchool.code);
      const features = catchmentIndex[code];

      if (features) {
        setActiveCatchment({
          type: "FeatureCollection",
          features,
        });
        console.log("Catchment auto-applied after data load completion.");
      }
    }
  }, [catchmentsReady, selectedSchool, catchmentIndex, activeCatchment]);

  useEffect(() => {
    // Only run this if we have a slug in the URL and our schools list has loaded
    if (schoolSlug && schools.length > 0) {
      // Find the school that matches the URL slug
      const targetSchool = schools.find(
        (s) => s.name.toLowerCase().replace(/\s+/g, "-") === schoolSlug,
      );

      if (targetSchool) {
        console.log("Deep link detected for:", targetSchool.name);
        // This triggers the map zoom and shows the catchment automatically
        handleSchoolClick(targetSchool);
      }
    }
  }, [schoolSlug, schools, handleSchoolClick]);
  // Address search (Nominatim)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(displayTerm);
    }, 300); // 300ms delay to stop the lag

    return () => clearTimeout(timer);
  }, [displayTerm]);
  // Address search (Nominatim) - Triggered only by searchTerm
  useEffect(() => {
    if (searchTerm.trim().length < 3) {
      setAddressResults([]);
      setAddressLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    async function runSearch() {
      try {
        setAddressLoading(true);
        const nswViewbox = "141.0,-28.1,153.6,-37.5";
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchTerm.trim(),
        )}&addressdetails=1&limit=15&countrycodes=au&viewbox=${nswViewbox}&bounded=1`;

        const res = await fetch(url, {
          signal: controller.signal,
          method: "GET",

          mode: "cors", // Explicitly ask for Cross-Origin Resource Sharing
          cache: "no-cache", // Tells the Service Worker NOT to use a stale/broken cache
          credentials: "omit", 

          headers: {
            "Accept-Language": "en",
            Accept: "application/json",
          },
        });

        if (!res.ok) throw new Error("Nominatim error");

        const data = await res.json();
        if (cancelled) return;

        const mapped = data
          .filter((item) => {
            const address = item.address || {};
            const state = address.state || "";
            return (
              state.toLowerCase().includes("new south wales") ||
              state.toLowerCase() === "nsw"
            );
          })
          .slice(0, 8)
          .map((item) => ({
            type: "address",
            label: item.display_name,
            name: item.display_name,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }));

        setAddressResults(mapped);
      } catch (e) {
        if (e.name !== "AbortError" && !cancelled) {
          setAddressResults([]);
        }
      } finally {
        if (!cancelled) setAddressLoading(false);
      }
    }

    runSearch(); // Call directly because the debounce happens in the first useEffect

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [searchTerm]); // Watches the debounced term

  const handleSelect = (item) => {
    setSearchTerm(item.name);
    setDisplayTerm(item.name);
    setShowResults(false);
    setAddressMarker(null);
    setPrimaryCatchmentFeature(null);
    setSecondaryCatchmentFeature(null);

    if (item.type === "school") {
      setFilterOpen(false);
      setMapTarget([item.lat, item.lng]);
      setSelectedSchool(item);

      const paddedCode = String(parseInt(item.code, 10)).padStart(4, "0");
      const features = catchmentIndex[paddedCode];
      if (features) {
        setActiveCatchment({
          type: "FeatureCollection",
          features,
        });
      }

      const typeLabel =
        Object.keys(SCHOOL_COLORS).find((k) => item.level?.includes(k)) ||
        "Other";
      const hiddenByType = !typeFilters.includes(typeLabel);
      const hiddenByGender =
        genderFilter !== "All" && item.gender !== genderFilter;
      const hiddenByOC = ocFilter && (!item.oc || item.oc === "N");
      const hiddenBySelective =
        selectiveFilter !== "all" &&
        !(
          selectiveFilter === "non" &&
          (!item.selective || item.selective === "No" || item.selective === "")
        ) &&
        item.selective !== selectiveFilter;

      const wouldBeHidden =
        hiddenByType || hiddenByGender || hiddenByOC || hiddenBySelective;
      setSearchForcedSchool(wouldBeHidden ? item : null);
    } else {
      setSearchForcedSchool(null);
      const first = schools.find((s) => s.suburb === item.name);
      if (first) setMapTarget([first.lat, first.lng]);
    }
  };

  const handleAddressSelect = async (item) => {
    setFilterOpen(false);
    setSearchTerm(item.name);
    setDisplayTerm(item.name);
    setShowResults(false);
    setSearchForcedSchool(null);
    setSelectedSchool(null);
    setMapTarget([item.lat, item.lng]);
    setAddressMarker({ lat: item.lat, lng: item.lng });
    setCatchmentView("primary");

    try {
      const cache = await ensureCatchmentCache();
      const features = cache.features || [];

      let primaryFeature = null;
      let secondaryFeature = null;

      for (const f of features) {
        if (!f.geometry) continue;

        if (!primaryFeature && isPrimaryCatchment(f)) {
          if (pointInFeature(item.lat, item.lng, f)) {
            primaryFeature = f;
          }
        }

        if (!secondaryFeature && isSecondaryCatchment(f)) {
          if (pointInFeature(item.lat, item.lng, f)) {
            secondaryFeature = f;
          }
        }

        if (primaryFeature && secondaryFeature) break;
      }

      setPrimaryCatchmentFeature(primaryFeature || null);
      setSecondaryCatchmentFeature(secondaryFeature || null);

      if (primaryFeature) {
        const code = normalizeCode(primaryFeature.properties?.USE_ID);

        const features = (code && catchmentIndex[code]) || [primaryFeature];

        setActiveCatchment({
          type: "FeatureCollection",
          features,
        });

        const primarySchool =
          schools.find((s) => normalizeCode(s.code) === code) || null;

        if (primarySchool) {
          setSelectedSchool(primarySchool);
        }
      } else if (secondaryFeature) {
        // Fallback: if no primary but secondary exists
        const code = normalizeCode(secondaryFeature.properties?.USE_ID);

        const features = (code && catchmentIndex[code]) || [secondaryFeature];

        setActiveCatchment({
          type: "FeatureCollection",
          features,
        });

        const secondarySchool =
          schools.find((s) => normalizeCode(s.code) === code) || null;

        if (secondarySchool) {
          setSelectedSchool(secondarySchool);
        }

        setCatchmentView("secondary");
      }

      console.log("Address search result:", {
        primaryFeature: primaryFeature?.properties?.USE_DESC,
        secondaryFeature: secondaryFeature?.properties?.USE_DESC,
        addressLat: item.lat,
        addressLng: item.lng,
      });
    } catch (e) {
      console.error("Address catchment detection error", e);
    }
  };

  const handleCurrentLocation = () => {
    // 1. Check if the browser supports geolocation
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser or device.");
      return;
    }

    // 2. Trigger your existing loading overlay
    setAddressLoading(true);

    // 3. Request high-accuracy GPS coordinates
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // 4. Create a faux "item" to feed into your existing address handler
        const currentLocationItem = {
          name: "📍 My Current Location",
          lat: latitude,
          lng: longitude,
          type: "address",
        };

        // 5. Fire your existing master function to detect the catchment and draw the map!
        handleAddressSelect(currentLocationItem);
        setAddressLoading(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        alert(
          "Unable to retrieve your location. Please check your device location permissions.",
        );
        setAddressLoading(false);
      },
      {
        enableHighAccuracy: true, // Forces phone GPS over Wi-Fi guessing for accurate boundary detection
        timeout: 10000,
        maximumAge: 0,
      },
    );
  };

  // Local school + suburb results
  // 1. Setup Fuse instances (memoized for performance)
  const fuseSchools = useMemo(
    () =>
      new Fuse(schools, {
        keys: ["name"],
        threshold: 0.35,
        distance: 100,
        minMatchCharLength: 2,
      }),
    [schools],
  );

  // 1. Setup Fuse for Suburbs
  const fuseSuburbs = useMemo(() => {
    // Ensure schools exists and map unique suburb names
    const uniqueSuburbs = [...new Set(schools.map((s) => s.suburb))]
      .filter(Boolean)
      .map((sub) => ({ name: sub }));

    return new Fuse(uniqueSuburbs, {
      keys: ["name"],
      threshold: 0.3,
      minMatchCharLength: 2,
    });
  }, [schools]);

  // 2. Fuzzy Search Logic
  const schoolResults = useMemo(() => {
    // IMPORTANT: Use displayTerm here so the search reacts to typing
    if (!displayTerm || displayTerm.length < 2) return [];

    const suburbMatches = fuseSuburbs
      .search(displayTerm)
      .slice(0, 5)
      .map((result) => ({
        type: "suburb",
        name: result.item.name,
        label: `🏠 ${result.item.name}`,
      }));

    const schoolMatches = fuseSchools
      .search(displayTerm)
      .slice(0, 10)
      .map((result) => ({
        ...result.item,
        type: "school",
        label: `🎓 ${result.item.name}`,
      }));

    // Combine them
    return [...suburbMatches, ...schoolMatches];
  }, [displayTerm, fuseSchools, fuseSuburbs]);

  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const typeLabel =
        Object.keys(SCHOOL_COLORS).find((k) => s.level.includes(k)) || "Other";

      const matchesType = typeFilters.includes(typeLabel);
      const matchesGender = genderFilter === "All" || s.gender === genderFilter;
      const matchesOC = !ocFilter || (s.oc && s.oc !== "N");

      const sel = (s.selective || "").trim().toLowerCase();

      const matchesSelective =
        selectiveFilter === "all" ||
        (selectiveFilter === "Fully selective" && sel === "fully selective") ||
        (selectiveFilter === "Partially selective" &&
          sel === "partially selective") ||
        (selectiveFilter === "non" &&
          (sel === "no" ||
            sel === "n" ||
            sel === "" ||
            sel === "non-selective" ||
            sel === "not selective" ||
            sel === "n/a" ||
            sel === "none"));

      return matchesType && matchesGender && matchesOC && matchesSelective;
    });
  }, [schools, typeFilters, genderFilter, ocFilter, selectiveFilter]);

  const schoolsToRender = useMemo(() => {
    if (
      !searchForcedSchool ||
      filteredSchools.some((s) => s.code === searchForcedSchool.code)
    ) {
      return filteredSchools;
    }
    return [...filteredSchools, searchForcedSchool];
  }, [filteredSchools, searchForcedSchool]);

  const showAddressToggle =
    (primaryCatchmentFeature || secondaryCatchmentFeature) && addressMarker;

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          color: "#002b5c",
        }}
      >
        <div style={{ fontSize: 32 }}>🗺️</div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          Loading School Map...
        </div>
      </div>
    );

  return (
    <>
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .search-item:hover { background: #f5f7ff !important; }               
      `}</style>
      <div style={{ ...styles.appShell, willChange: "transform" }}>
        {/* HEADER */}
<header style={styles.header}>
  <div
    style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      textAlign: "center",
    }}
  >
    <h1
      style={{
        ...styles.headerTitle,
        fontSize: isMobile ? "16px" : "20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      <img
        src="/logo_main.png"
        alt="Logo"
        style={{ height: isMobile ? "28px" : "34px", width: "auto" }}
      />
      Local School Map
    </h1>
    <p style={styles.headerSub}>
      Find your local school catchment area | NSW
    </p>
  </div>
</header>
        {/* MAP AREA */}
        <div style={styles.mapArea}>
          {/* Search bar wrapper with dynamic positioning */}
          <div
            style={{
              ...styles.searchWrap,
              maxWidth: !isMobile && selectedSchool ? "380px" : "420px",
              left: !isMobile && selectedSchool ? "calc(50% - 150px)" : "50%",
              transition: "all 0.3s ease-in-out", // Smooth move when sidebar opens
            }}
          >
            <div style={styles.searchInner}>
              <input
                type="text"
                placeholder="Search schools, suburbs or address..."
                aria-label="Search for NSW schools and catchment zones by address or name"
                value={displayTerm}
                onChange={(e) => {
                  const rawValue = e.target.value;
                  const cleanValue = rawValue.replace(/[<>"{}[\]]/g, "");

                  // Update visual text
                  setDisplayTerm(cleanValue);

                  // Handle dropdown visibility
                  if (cleanValue.length >= 2) {
                    setShowResults(true);
                  } else {
                    setShowResults(false);
                  }
                }}
                onFocus={() => {
                  if (displayTerm.length >= 2) setShowResults(true);
                }}
                style={styles.searchInput}
              />

              {displayTerm && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  style={styles.searchClear}
                  aria-label="Clear search"
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Dropdown Logic */}
            {showResults &&
              (schoolResults.length > 0 ||
                addressResults.length > 0 ||
                addressLoading) && (
                <ul style={styles.searchDropdown}>
                  {/* Combined Schools & Suburbs Section */}
                  {schoolResults.length > 0 && (
                    <>
                      <li style={styles.dropdownHeader}>Schools & Suburbs</li>
                      {schoolResults.map((item, i) => (
                        <li
                          key={`school-${i}`}
                          className="search-item"
                          onClick={() => handleSelect(item)}
                          style={styles.searchItem}
                        >
                          {item.label}
                        </li>
                      ))}
                    </>
                  )}

                  {/* Address Section */}
                  {addressResults.length > 0 && (
                    <li style={styles.dropdownHeader}>Addresses</li>
                  )}

                  {addressLoading && (
                    <li style={{ ...styles.searchItem, color: "#777" }}>
                      Searching addresses...
                    </li>
                  )}

                  {!addressLoading &&
                    addressResults.map((item, i) => (
                      <li
                        key={`addr-${i}`}
                        className="search-item"
                        onClick={() => handleAddressSelect(item)}
                        style={styles.searchItem}
                      >
                        📍 {item.label}
                      </li>
                    ))}
                </ul>
              )}
          </div>

          {/* Address catchment toggle (Primary / Secondary) */}
          {showAddressToggle && (
            <div style={styles.addressCatchmentToggle}>
              <button
                type="button"
                style={styles.addressCatchmentButton(
                  catchmentView === "primary",
                )}
                onClick={() => {
                  if (!primaryCatchmentFeature) return;
                  setCatchmentView("primary");
                  setActiveCatchment({
                    type: "FeatureCollection",
                    features: [primaryCatchmentFeature],
                  });
                  if (primaryCatchmentFeature.properties?.USE_ID) {
                    const codeRaw = primaryCatchmentFeature.properties.USE_ID;
                    const paddedCode = String(parseInt(codeRaw, 10)).padStart(
                      4,
                      "0",
                    );
                    const primarySchool =
                      schools.find(
                        (s) =>
                          String(parseInt(s.code, 10)).padStart(4, "0") ===
                          paddedCode,
                      ) || null;
                    if (primarySchool) setSelectedSchool(primarySchool);
                  }
                }}
              >
                Primary catchment
              </button>
              <button
                type="button"
                style={styles.addressCatchmentButton(
                  catchmentView === "secondary",
                )}
                onClick={() => {
                  if (!secondaryCatchmentFeature) return;
                  setCatchmentView("secondary");
                  setActiveCatchment({
                    type: "FeatureCollection",
                    features: [secondaryCatchmentFeature],
                  });

                  const codeRaw = secondaryCatchmentFeature.properties?.USE_ID;
                  if (codeRaw) {
                    const paddedCode = String(parseInt(codeRaw, 10)).padStart(
                      4,
                      "0",
                    );
                    const secSchool = schools.find(
                      (s) =>
                        String(parseInt(s.code, 10)).padStart(4, "0") ===
                        paddedCode,
                    );
                    if (secSchool) {
                      setSelectedSchool(secSchool);
                    } else {
                      console.warn(
                        "Secondary school not found for code:",
                        paddedCode,
                      );
                    }
                  }
                }}
              >
                Secondary catchment
              </button>
            </div>
          )}
          {!catchmentsReady && (
            <div style={styles.loadingBadge}>⏳ Loading catchments…</div>
          )}

          {/* Filter warning / clear pill */}
          {searchForcedSchool && (
            <div
              style={{
                position: "absolute",
                top: 80,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 2000,
                background: "#fff8e1",
                border: "1px solid #f59e0b",
                color: "#7a4500",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 600,
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              ⚠️ This school is hidden by your current filters
            </div>
          )}

          {/* MAP */}
<MapContainer
  preferCanvas={true}
  zoomSnap={1}
  zoomDelta={1}
  wheelDebounceTime={10}
  center={[-33.86, 151.2]}
  zoom={11}
  tap={false}
  style={{ height: "100%", width: "100%" }}
  zoomControl={false}
>

<ZoomHandler target={mapTarget} isMobile={isMobile} />
 
  <MapClickHandler onMapClick={handleClearAll} />

  <TileLayer
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    attribution="&copy; OpenStreetMap contributors"
  />
  {!isMobile && <ZoomControl position="bottomright" />}
  <ZoomHandler target={mapTarget} />

  {activeCatchment?.features?.length > 0 && (
    <GeoJSON
      key={activeCatchment.features[0].properties.USE_ID}
      data={activeCatchment}
      smoothFactor={0}
      style={{
        color: "#1E88E5",
        weight: 3,
        fillOpacity: 0.15,
        fillColor: "#1E88E5",
      }}
      onEachFeature={(feature, layer) => {
        if (!layer) return;

        const handleMouseOver = () => {
          if (!layer || !layer._map || !layer._path) return;
          try {
            layer.setStyle({ weight: 4 });
          } catch {}
        };

        const handleMouseOut = () => {
          if (!layer || !layer._map || !layer._path) return;
          try {
            layer.setStyle({ weight: 3 });
          } catch {}
        };

        const handleFeatureClick = (e) => {
          if (e && e.originalEvent) {
            L.DomEvent.stopPropagation(e);
          }
        };

        layer.on({
          mouseover: handleMouseOver,
          mouseout: handleMouseOut,
          click: handleFeatureClick,
        });

        layer.on("remove", () => {
          try {
            layer.off("mouseover", handleMouseOver);
            layer.off("mouseout", handleMouseOut);
            layer.off("click", handleFeatureClick);
          } catch {}
        });
      }}
    />
  )}

  {ENABLE_FUTURE_ZONES && showFuture && futureCatchments &&
    /* prettier-ignore */
    <GeoJSON
key={"future-layer-" + showFuture + "-" + (futureCatchments?.features?.length || 0)}
data={futureCatchments}
style={{
  color: "#FF8C00",
  weight: 2.5,
  dashArray: "8, 5",
  fillOpacity: 0.08,
  fillColor: "#FF8C00",
}}
onEachFeature={(feature, layer) => {
  if (!layer || !feature.properties) return;
  const schoolName = feature.properties.USE_DESC || "Future Zone";
  try {
    layer.bindTooltip("Future: " + schoolName, {
      permanent: false,
      sticky: true,
      className: "future-tooltip",
    });
  } catch (e) {}

  const safeSetStyle = (style) => {
    if (!layer || !layer._map || !layer.setStyle) return;
    try { layer.setStyle(style); } catch (err) {}
  };

  const handleMouseOver = () => safeSetStyle({ weight: 3.5, color: "#cc6600", fillOpacity: 0.2 });
  const handleMouseOut = () => safeSetStyle({ weight: 2.5, color: "#FF8C00", fillOpacity: 0.08 });
  const handleClick = (e) => {
    if (e.originalEvent) e.originalEvent.stopPropagation();
    if (layer._map && layer.getBounds) layer._map.fitBounds(layer.getBounds(), { padding: [40, 40] });
  };

  layer.on({ mouseover: handleMouseOver, mouseout: handleMouseOut, click: handleClick });
  layer.on("remove", () => {
    try {
      layer.off("mouseover", handleMouseOver);
      layer.off("mouseout", handleMouseOut);
      layer.off("click", handleClick);
    } catch (e) {}
  });
}}
/>}

  {/* Address marker */}
  {addressMarker && (
    <Marker position={[addressMarker.lat, addressMarker.lng]} />
  )}

  {schoolsToRender.map((school) => {
    const typeKey =
      Object.keys(SCHOOL_COLORS).find((k) =>
        school.level.includes(k),
      ) || "Other";
    const isSelected = selectedSchool?.code === school.code;
    const isForced = searchForcedSchool?.code === school.code;
    const shortName = school.name
      .replace("Public School", "PS")
      .replace("High School", "HS")
      .replace("Primary School", "PS")
      .replace("Central School", "CS")
      .replace("Secondary College", "SC")
      .replace("School", "Sch");
    return (
      <CircleMarker
        key={school.code}
        center={[school.lat, school.lng]}
        radius={isSelected ? 11 : 8}
        pathOptions={{
          fillColor: SCHOOL_COLORS[typeKey] || "#888",
          color: isSelected
            ? "#002b5c"
            : isForced
              ? "#f59e0b"
              : "white",
          weight: isSelected ? 2.5 : isForced ? 2 : 1,
          fillOpacity:
            isForced && !isSelected ? 0.5 : isSelected ? 1 : 0.8,
          dashArray: isForced && !isSelected ? "4 3" : undefined,
          interactive: true,
        }}
        eventHandlers={{
          click: (e) => {
            if (e.originalEvent) e.originalEvent.cancelBubble = true;
            handleSchoolClick(school);
            setShowResults(false);
          },
        }}
      >
        <Tooltip
          direction="top"
          offset={[0, -10]}
          opacity={1}
          sticky={true}
          className="school-hover-tooltip"
        >
          {shortName}
        </Tooltip>
      </CircleMarker>
    );
  })}
</MapContainer>

{/* GPS Location Button */}
{(!isMobile || !filterOpen) && (
  <button
    onClick={handleCurrentLocation}
    title="What Catchment Area am I in?"
    style={{
      position: "absolute",
      bottom: isMobile ? "120px" : "100px",
      right: "10px",
      zIndex: 1000,
      backgroundColor: "white",
      border: "2px solid rgba(0,0,0,0.2)",
      borderRadius: "4px",
      width: "34px",
      height: "34px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      boxShadow: "0 1px 5px rgba(0,0,0,0.65)",
      transition: "background-color 0.2s ease, bottom 0.3s ease",
    }}
    onMouseEnter={(e) =>
      (e.currentTarget.style.backgroundColor = "#f4f4f4")
    }
    onMouseLeave={(e) =>
      (e.currentTarget.style.backgroundColor = "white")
    }
  >
    <svg
      width="16" 
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Main circle */}
      <circle cx="12" cy="12" r="10"></circle>
      
      {/* Crosshair lines */}
      <line x1="22" y1="12" x2="18" y2="12"></line>
      <line x1="6" y1="12" x2="2" y2="12"></line>
      <line x1="12" y1="6" x2="12" y2="2"></line>
      <line x1="12" y1="22" x2="12" y2="18"></line>
    </svg>
  </button>
)}

      <SchoolInfoCard
  school={selectedSchool}
  isMobile={isMobile}
  isOpen={schoolCardOpen}
  onOpen={() => setSchoolCardOpen(true)}
  onMinimize={handleMinimizeSchoolCard} 
  onClose={handleCloseSchoolCard}       
/>
        </div>{" "}
        {/* Closes mapArea */}
        {/* FOOTER - Moved inside the appShell div */}
        <footer style={styles.footer}>
          <strong>Disclaimer:</strong> Unofficial tool. Not affiliated with NSW
          Dept of Education.{" "}
          <strong>
            Verify catchments officially before making enrolment or financial
            decisions.
          </strong>{" "}
          Data: NSW Dept of Education Open Data (April 2026).
        </footer>
      </div>{" "}
      {/* Closes appShell */}
      {/* Filter Panel - Inside the main fragment, but outside appShell */}
      <FilterPanel
  isMobile={isMobile}
  isOpen={filterOpen}
  onToggle={handleToggleFilter}
  showFilterPeek={showFilterPeek}
  typeFilters={typeFilters}
  setTypeFilters={setTypeFilters}
  genderFilter={genderFilter}
  setGenderFilter={setGenderFilter}
  ocFilter={ocFilter}
  setOcFilter={setOcFilter}
  selectiveFilter={selectiveFilter}
  setSelectiveFilter={setSelectiveFilter}
  showFuture={showFuture}
  setShowFuture={setShowFuture}
  onClearFilters={handleClearFilters}
/>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
   WRAPPED EXPORT WITH ERROR BOUNDARY
   ──────────────────────────────────────────────────────────────── */
function MapView() {
  return (
    <MapErrorBoundary>
      <MapViewInner />
    </MapErrorBoundary>
  );
}

export default MapView;
