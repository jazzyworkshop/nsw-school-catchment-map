import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  GeoJSON,
  useMap,
  ZoomControl,
  Marker,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";

/* ────────────────────────────────────────────────────────────────
   CATCHMENT TYPE HELPERS
   ──────────────────────────────────────────────────────────────── */
const isPrimaryCatchment = (f) =>
  f?.properties?.CATCH_TYPE?.toLowerCase() === "primary";

const isSecondaryCatchment = (f) => {
  const type = (f?.properties?.CATCH_TYPE || "").toLowerCase();
  const desc = (f?.properties?.USE_DESC || "").toLowerCase();
  return (
    type.includes("high") || // catches HIGH_COED, HIGH_BOYS, HIGH_GIRLS, HIGH
    type.includes("secondary") ||
    type.includes("central") ||
    desc.includes("high") || // catches "Billabong HS", "XYZ High School"
    desc.includes("secondary") || // catches "Secondary College", etc.
    desc.includes("central")
  );
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
   LEAFLET ICON FIX
   ──────────────────────────────────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

/* ────────────────────────────────────────────────────────────────
   ZOOM HANDLER
   ──────────────────────────────────────────────────────────────── */
function ZoomHandler({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14, { duration: 1.5 });
  }, [target, map]);
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

const HEADER_HEIGHT = 56;

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
  clearPill: {
    position: "absolute",
    top: 68,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2000,
    background: "#ff4444",
    color: "white",
    border: "none",
    padding: "6px 14px",
    borderRadius: "20px",
    fontSize: "12px",
    cursor: "pointer",
    whiteSpace: "nowrap",
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
function FilterPanel({
  isMobile,
  isOpen,
  onToggle,
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
  if (isMobile) {
    return (
      <>
        {isOpen && <div style={styles.backdrop} onClick={onToggle} />}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            background: "white",
            zIndex: 5000,
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 -4px 20px rgba(0,0,0,0.2)",
            padding: "0 0 24px 0",
            maxHeight: "80vh",
            overflowY: "auto",
            transform: isOpen ? "translateY(0)" : "translateY(100%)",
            transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          <div
            onClick={onToggle}
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "12px 0 4px",
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: 40,
                height: 4,
                background: "#ddd",
                borderRadius: 2,
              }}
            />
          </div>

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
      </>
    );
  }

  const PANEL_WIDTH = 260;
  const TAB_W = 22;
  const TAB_H = 64;
  const tabLeft = isOpen ? PANEL_WIDTH : 0;

  return (
    <>
      {isOpen && (
        <div
          style={{
            ...styles.backdrop,
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
          {isOpen ? "‹" : "›"}
        </span>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
   FILTER CONTENT
   ──────────────────────────────────────────────────────────────── */
function FilterContent({
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
          padding: "18px 20px 12px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <span style={{ fontWeight: 700, fontSize: "15px", color: "#002b5c" }}>
          🔍 Filter Schools
        </span>
      </div>

      <div style={{ padding: "16px 20px" }}>
        {/* School Type */}
        <div style={{ marginBottom: "18px" }}>
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
        <div style={{ marginBottom: "18px" }}>
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
                padding: "5px 0",
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
        <div style={{ marginBottom: "18px" }}>
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
                padding: "5px 0",
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
        <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: "14px" }}>
          <SectionLabel>Overlays</SectionLabel>
          <ToggleRow
            checked={ocFilter}
            onChange={setOcFilter}
            label="Opportunity Classes only"
            icon="⭐"
            tooltip="Filters to schools that run an Opportunity Class (OC) — selective primary classes for high-achieving students in Years 5 & 6."
          />
          <ToggleRow
            checked={showFuture}
            onChange={setShowFuture}
            label="Show future zone changes"
            icon="🔮"
            sublabel="Dashed orange boundaries"
            tooltip="Shows planned catchment boundary changes that have been announced but not yet in effect. Only visible where a zone change is scheduled — most schools will show nothing extra."
          />
        </div>

        {/* Clear filters button */}
        <button
          type="button"
          onClick={onClearFilters}
          style={{
            marginTop: "14px",
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
}

/* ────────────────────────────────────────────────────────────────
   SMALL UI HELPERS
   ──────────────────────────────────────────────────────────────── */
function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "#888",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        marginBottom: "8px",
      }}
    >
      {children}
    </div>
  );
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
function SchoolInfoCard({ school, isMobile, onClose }) {
  if (!school) return null;

  const selectiveInfo =
    SELECTIVE_LABELS[school.selective] || SELECTIVE_LABELS[""];
  const typeColor =
    SCHOOL_COLORS[
      Object.keys(SCHOOL_COLORS).find((k) => school.level.includes(k)) ||
        "Other"
    ] || "#888";

  const mySchoolUrl = `https://www.myschool.edu.au/search?schoolName=${encodeURIComponent(
    school.name,
  )}&suburb=${encodeURIComponent(school.suburb)}`;

  const schoolFinderUrl = `https://schoolfinder.education.nsw.gov.au/index.php?schoolCode=${school.code}`;

  const betterEducationUrl =
    "https://bettereducation.com.au/school/secondary/nsw/sydney-high-school-rankings.aspx";

  const ocDisplay =
    school.oc && school.oc !== "N" ? "Yes (OC classes available)" : "n/a";

  const genderDisplay =
    school.gender === "Coed"
      ? "Co-ed"
      : school.gender === "Boys"
        ? "Boys"
        : school.gender === "Girls"
          ? "Girls"
          : school.gender || "n/a";

  const selectiveDisplay =
    school.selective && school.selective !== "No" && school.selective !== ""
      ? school.selective
      : "No";

  const enrolmentDisplay = school.enrolment
    ? Math.round(school.enrolment)
    : "n/a";

  const cardStyle = isMobile
    ? {
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "white",
        zIndex: 4800,
        borderRadius: "16px 16px 0 0",
        boxShadow: "0 -4px 24px rgba(0,0,0,0.18)",
        padding: "0 0 24px 0",
        animation: "slideUp 0.25s ease-out",
        maxHeight: "70vh",
        overflowY: "auto",
      }
    : {
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        width: "300px",
        background: "white",
        zIndex: 2500,
        boxShadow: "-4px 0 20px rgba(0,0,0,0.12)",
        overflowY: "auto",
        animation: "slideInRight 0.25s ease-out",
      };

  const infoRowStyle = {
    display: "flex",
    flexDirection: "column",
    padding: "8px 18px",
    borderBottom: "1px solid #f3f3f3",
  };

  const labelStyle = {
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#888",
    marginBottom: 3,
  };

  const valueStyle = {
    fontSize: "13px",
    color: "#222",
    fontWeight: 500,
  };

  return (
    <>
      {isMobile && <div style={styles.backdrop} onClick={onClose} />}
      <div style={cardStyle}>
        {isMobile && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "10px 0 4px",
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                background: "#ddd",
                borderRadius: 2,
              }}
            />
          </div>
        )}

        {/* Header */}
        <div
          style={{
            borderTop: `4px solid ${typeColor}`,
            padding: "14px 18px 12px",
            borderBottom: "1px solid #f0f0f0",
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
          }}
        >
          <div style={{ flex: 1 }}>
            <a
              href={
                school.url
                  ? school.url.includes("http")
                    ? school.url
                    : `https://${school.url}`
                  : "#"
              }
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "#002b5c",
                fontSize: "15px",
                fontWeight: 700,
                textDecoration: "none",
                lineHeight: 1.3,
                display: "block",
              }}
            >
              {school.name} ↗
            </a>
            <div style={{ fontSize: "12px", color: "#888", marginTop: 3 }}>
              {school.suburb}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "none",
              fontSize: "18px",
              cursor: "pointer",
              color: "#bbb",
              flexShrink: 0,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Info list */}
        <div style={{ paddingTop: 6 }}>
          <div style={infoRowStyle}>
            <span style={labelStyle}>School type</span>
            <span style={valueStyle}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: typeColor,
                  marginRight: 6,
                }}
              />
              {school.level || "n/a"}
            </span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>OC classes</span>
            <span style={valueStyle}>{ocDisplay}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Gender</span>
            <span style={valueStyle}>{genderDisplay}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Selective</span>
            <span style={valueStyle}>
              {selectiveInfo.label || selectiveDisplay}
            </span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Enrolment</span>
            <span style={valueStyle}>{enrolmentDisplay}</span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>Academic results & programs</span>
            <span style={valueStyle}>
              <a
                href={mySchoolUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1E88E5", textDecoration: "none" }}
              >
                MySchool ↗
              </a>
              <span
                style={{
                  display: "block",
                  fontSize: "11px",
                  color: "#666",
                  marginTop: 2,
                }}
              >
                NAPLAN, ATAR insights & school profile
              </span>
            </span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>HSC rankings</span>
            <span style={valueStyle}>
              <a
                href={betterEducationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1E88E5", textDecoration: "none" }}
              >
                Better Education ↗
              </a>
            </span>
          </div>

          <div style={infoRowStyle}>
            <span style={labelStyle}>
              Verify data on the official School Finder website
            </span>
            <span style={valueStyle}>
              <a
                href={schoolFinderUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1E88E5", textDecoration: "none" }}
              >
                School Finder ↗
              </a>
            </span>
          </div>
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
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCatchment, setActiveCatchment] = useState(null);
  const [futureCatchments, setFutureCatchments] = useState(null);
  const [mapTarget, setMapTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [searchForcedSchool, setSearchForcedSchool] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );

  const [typeFilters, setTypeFilters] = useState(Object.keys(SCHOOL_COLORS));
  const [genderFilter, setGenderFilter] = useState("All");
  const [ocFilter, setOcFilter] = useState(false);
  const [selectiveFilter, setSelectiveFilter] = useState("all");
  const [showFuture, setShowFuture] = useState(false);

  // Residential search state
  const [addressResults, setAddressResults] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressMarker, setAddressMarker] = useState(null);
  const [primaryCatchmentFeature, setPrimaryCatchmentFeature] = useState(null);
  const [secondaryCatchmentFeature, setSecondaryCatchmentFeature] =
    useState(null);
  const [catchmentView, setCatchmentView] = useState("primary"); // "primary" | "secondary"

  // Preload catchments on app mount
  useEffect(() => {
    async function loadData() {
      // If it's already loaded, don't fetch again
      if (window._catchmentCache) return;

      try {
        const res = await fetch("/catchments.geojson");
        const data = await res.json();

        // Save to the global cache
        window._catchmentCache = data;

        // Force a re-render so the useMemo below runs again
        // We do this by updating a simple toggle or dummy state if needed,
        // but usually, if this is at the top level, it will trigger correctly.
        console.log("✓ Catchment data cached globally");
      } catch (err) {
        console.error("Failed to load catchments:", err);
      }
    }
    loadData();
  }, []);

  // O(1) lookup index for catchments
  const catchmentIndex = useMemo(() => {
    if (!window._catchmentCache?.features) return {};

    const index = {};
    window._catchmentCache.features.forEach((feature) => {
      const props = feature.properties || {};

      // Prioritize USE_ID as per your check
      const rawId = props.USE_ID || props.CATCH_CODE || props.SCHOOL_CODE;

      if (rawId) {
        const code = String(rawId).padStart(4, "0");
        index[code] = feature;
      }
    });

    console.log(
      "✓ Index sync'd with USE_ID. Sample keys:",
      Object.keys(index).slice(0, 5),
    );
    return index;
  }, [window._catchmentCache]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handleResize);

    async function loadData() {
      try {
        const response = await fetch("/schools_master.json");
        const data = await response.json();
        const mapped = (data.records || [])
          .map((row) => ({
            code: String(row[0] || ""),
            name: row[2] || "Unknown",
            url: row[8] || "",
            suburb: row[4] || "",
            enrolment: row[10] || 0,
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
    if (!showFuture || futureCatchments) return;

    async function loadFuture() {
      try {
        // Use the existing cache if available, otherwise fetch
        if (!window._catchmentCache) {
          const res = await fetch("/catchments.geojson");
          window._catchmentCache = await res.json();
        }

        const futureFeatures = window._catchmentCache.features.filter((f) => {
          const props = f.properties || {};

          // 1. Identify which property holds the year.
          // Check your console if 'YEAR' doesn't work (might be 'ACT_YEAR' or similar).
          const yearValue = parseInt(props.YEAR || props.ACT_YEAR || 0, 10);

          // 2. Filter for catchments active between 2027 and 2032
          const isFutureYear = yearValue >= 2027 && yearValue <= 2032;

          // 3. Ensure it has a valid catchment type (Primary, High, etc.)
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
      const res = await fetch("/catchments.geojson");
      window._catchmentCache = await res.json();
    }
    return window._catchmentCache;
  }, []);

  // Clear everything (used by clear pill, search clear, and map click)
  function handleClearAll() {
    setActiveCatchment(null);
    setSelectedSchool(null);
    setSearchForcedSchool(null);
    setSearchTerm("");
    setAddressMarker(null);
    setPrimaryCatchmentFeature(null);
    setSecondaryCatchmentFeature(null);
    setCatchmentView("primary");
  }

  const handleClearFilters = () => {
    setTypeFilters(Object.keys(SCHOOL_COLORS));
    setGenderFilter("All");
    setOcFilter(false);
    setSelectiveFilter("all");
    setSearchForcedSchool(null);
  };

  // Map click: click outside catchment clears; inside does nothing
  const handleMapClick = useCallback(
    (e) => {
      setShowResults(false);

      const { lat, lng } = e.latlng;

      if (!primaryCatchmentFeature && !secondaryCatchmentFeature) return;

      const insidePrimary = primaryCatchmentFeature
        ? pointInFeature(lat, lng, primaryCatchmentFeature)
        : false;

      const insideSecondary = secondaryCatchmentFeature
        ? pointInFeature(lat, lng, secondaryCatchmentFeature)
        : false;

      if (insidePrimary || insideSecondary) return;

      handleClearAll();
    },
    [primaryCatchmentFeature, secondaryCatchmentFeature],
  );

  // School click → use index for instant catchment lookup
  const handleSchoolClick = useCallback(
    (school) => {
      // Check all possible ID variations on the clicked dot
      const rawCode = school.USE_ID || school.code || school.SCHOOL_CODE;

      setSelectedSchool(school);
      setMapTarget([school.lat, school.lng]);

      if (rawCode) {
        const paddedCode = String(rawCode).padStart(4, "0");
        const feature = catchmentIndex[paddedCode];

        if (feature) {
          setActiveCatchment({
            type: "FeatureCollection",
            features: [feature],
          });
        } else {
          setActiveCatchment(null);
          console.warn(
            `Code ${paddedCode} not found in index. Field used: USE_ID`,
          );
        }
      }
    },
    [catchmentIndex],
  );

  // Address search (Nominatim)
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
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          searchTerm.trim(),
        )}&addressdetails=1&limit=8&countrycodes=au`;

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "Accept-Language": "en" },
        });

        if (!res.ok) throw new Error("Nominatim error");

        const data = await res.json();
        if (cancelled) return;

        const mapped = data.map((item) => ({
          type: "address",
          label: item.display_name,
          name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
        }));

        setAddressResults(mapped);
      } catch (e) {
        if (!cancelled) setAddressResults([]);
      } finally {
        if (!cancelled) setAddressLoading(false);
      }
    }

    const t = setTimeout(runSearch, 350);
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(t);
    };
  }, [searchTerm]);

  const handleSelect = (item) => {
    setSearchTerm(item.name);
    setShowResults(false);
    setAddressMarker(null);
    setPrimaryCatchmentFeature(null);
    setSecondaryCatchmentFeature(null);

    if (item.type === "school") {
      setMapTarget([item.lat, item.lng]);
      setSelectedSchool(item);

      const paddedCode = String(parseInt(item.code, 10)).padStart(4, "0");
      const feature = catchmentIndex[paddedCode];
      if (feature) {
        setActiveCatchment({ type: "FeatureCollection", features: [feature] });
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
    setSearchTerm(item.name);
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
        const codeRaw = primaryFeature.properties?.USE_ID;
        const paddedCode = String(parseInt(codeRaw, 10)).padStart(4, "0");
        const primarySchool =
          schools.find(
            (s) => String(parseInt(s.code, 10)).padStart(4, "0") === paddedCode,
          ) || null;

        setActiveCatchment({
          type: "FeatureCollection",
          features: [primaryFeature],
        });
        if (primarySchool) {
          setSelectedSchool(primarySchool);
        }
      } else if (secondaryFeature) {
        // Fallback: if no primary but secondary exists
        const codeRaw = secondaryFeature.properties?.USE_ID;
        const paddedCode = String(parseInt(codeRaw, 10)).padStart(4, "0");
        const secSchool =
          schools.find(
            (s) => String(parseInt(s.code, 10)).padStart(4, "0") === paddedCode,
          ) || null;

        setActiveCatchment({
          type: "FeatureCollection",
          features: [secondaryFeature],
        });
        if (secSchool) {
          setSelectedSchool(secSchool);
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

  // Local school + suburb results
  const schoolResults = useMemo(() => {
    if (searchTerm.length < 2) return [];
    const lower = searchTerm.toLowerCase();

    const suburbs = [...new Set(schools.map((s) => s.suburb))]
      .filter((sub) => sub.toLowerCase().includes(lower))
      .map((sub) => ({ type: "suburb", name: sub, label: `🏠 ${sub}` }));

    const schoolMatches = schools
      .filter((s) => s.name.toLowerCase().includes(lower))
      .map((s) => ({ ...s, type: "school", label: `🎓 ${s.name}` }));

    return [...suburbs, ...schoolMatches];
  }, [searchTerm, schools]);

  const combinedResults = [...schoolResults, ...addressResults];

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
        .school-hover-tooltip {
          background: rgba(0, 0, 0, 0.78) !important;
          color: white !important;
          border: none !important;
          border-radius: 7px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          padding: 4px 9px !important;
          white-space: nowrap !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif !important;
        }
        .school-hover-tooltip::before {
          border-top-color: rgba(0, 0, 0, 0.78) !important;
        }
      `}</style>
      <div style={styles.appShell}>
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
                style={{
                  height: isMobile ? "28px" : "34px",
                  width: "auto",
                }}
              />
              Local School Map
            </h1>
            <p style={styles.headerSub}>
              NSW Public School Catchment Areas (Unofficial Tool)
            </p>
          </div>
          {isMobile && (
            <button
              style={styles.filterToggleBtn}
              onClick={() => setFilterOpen((v) => !v)}
              title="Open filters"
            >
              ☰
            </button>
          )}
        </header>

        {/* MAP AREA */}
        <div style={styles.mapArea}>
          {/* Search bar */}
          <div
            style={{
              ...styles.searchWrap,
              maxWidth: !isMobile && selectedSchool ? "380px" : "420px",
              left: !isMobile && selectedSchool ? "calc(50% - 150px)" : "50%",
            }}
          >
            {/* Unified search bar */}
            <div style={styles.searchInner}>
              <input
                type="text"
                placeholder="Search schools, suburbs or address..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => {
                  if (searchTerm.length >= 2) setShowResults(true);
                }}
                style={styles.searchInput}
              />
              {searchTerm && (
                <button onClick={handleClearAll} style={styles.searchClear}>
                  ✕
                </button>
              )}
            </div>

            {/* Unified dropdown */}
            {showResults && (combinedResults.length > 0 || addressLoading) && (
              <ul style={styles.searchDropdown}>
                {/* Schools & Suburbs header */}
                {schoolResults.length > 0 && (
                  <li
                    style={{
                      padding: "6px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#666",
                      background: "#f7f7f7",
                    }}
                  >
                    Schools & Suburbs
                  </li>
                )}

                {/* School + suburb results */}
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

                {/* Address header */}
                {addressResults.length > 0 && (
                  <li
                    style={{
                      padding: "6px 10px",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: "#666",
                      background: "#f7f7f7",
                      marginTop: "4px",
                    }}
                  >
                    Addresses
                  </li>
                )}

                {/* Address loading */}
                {addressLoading && (
                  <li style={{ ...styles.searchItem, color: "#777" }}>
                    Searching addresses...
                  </li>
                )}

                {/* Address results */}
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

          {/* Filter warning / clear pill */}
          {searchForcedSchool ? (
            <div
              style={{
                position: "absolute",
                top: showAddressToggle ? 100 : 68,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 2000,
                background: "#fff8e1",
                border: "1px solid #f59e0b",
                color: "#7a4500",
                padding: "6px 14px",
                borderRadius: "20px",
                fontSize: "11px",
                fontWeight: 500,
                whiteSpace: "nowrap",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              }}
            >
              ⚠️ This school is hidden by your current filters
            </div>
          ) : (
            activeCatchment &&
            !addressMarker && (
              <button style={styles.clearPill} onClick={handleClearAll}>
                ✕ Clear
              </button>
            )
          )}

          {/* MAP */}
          <MapContainer
            center={[-33.86, 151.2]}
            zoom={11}
            style={{ height: "100%", width: "100%" }}
            zoomControl={false}
            onClick={handleMapClick}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
            <ZoomControl position="bottomright" />
            <ZoomHandler target={mapTarget} />

            {activeCatchment && (
              <GeoJSON
                key={`active-${activeCatchment?.features?.[0]?.properties?.CATCH_CODE}`} // Force re-mount
                data={activeCatchment}
                style={{
                  color: "#1E88E5",
                  weight: 3,
                  fillOpacity: 0.15,
                  fillColor: "#1E88E5",
                }}
                onEachFeature={(feature, layer) => {
                  if (!layer) return;
                  layer.on({
                    mouseover: () => {
                      if (!layer || !layer._map || !layer._path) return;
                      try {
                        layer.setStyle({ weight: 4 });
                      } catch {}
                    },
                    mouseout: () => {
                      if (!layer || !layer._map || !layer._path) return;
                      try {
                        layer.setStyle({ weight: 3 });
                      } catch {}
                    },
                  });
                }}
              />
            )}

            {showFuture && futureCatchments &&
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
                  }}
                  eventHandlers={{
                    click: (e) => {
                      if (e.originalEvent) {
                        e.originalEvent.cancelBubble = true;
                      }
                      handleSchoolClick(school);
                      setShowResults(false);
                    },
                    mouseover: (e) => {
                      const layer = e?.target;
                      if (!layer || !layer._map || !layer._path) return;
                      try {
                        layer
                          .bindTooltip(shortName, {
                            permanent: false,
                            direction: "top",
                            offset: [0, -6],
                            className: "school-hover-tooltip",
                          })
                          .openTooltip();
                      } catch {}
                    },
                    mouseout: (e) => {
                      const layer = e?.target;
                      if (!layer || !layer._map) return;
                      try {
                        layer.unbindTooltip();
                      } catch {}
                    },
                  }}
                />
              );
            })}
          </MapContainer>

          <SchoolInfoCard
            school={selectedSchool}
            isMobile={isMobile}
            onClose={() => setSelectedSchool(null)}
          />
        </div>

        {/* FOOTER */}
        <footer style={styles.footer}>
          <strong>Disclaimer:</strong> Unofficial tool. Not affiliated with NSW
          Dept of Education.{" "}
          <strong>
            Verify catchments officially before making enrolment or financial
            decisions.
          </strong>{" "}
          Data: NSW Dept of Education Open Data (April 2026).
        </footer>
      </div>

      {/* Filter panel */}
      <FilterPanel
        isMobile={isMobile}
        isOpen={filterOpen}
        onToggle={() => setFilterOpen((v) => !v)}
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
