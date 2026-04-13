import React, { useEffect, useState, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  GeoJSON,
  useMap,
  ZoomControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// 1. FIXED LEAFLET ICONS
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// 2. ZOOM HANDLER
function ZoomHandler({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 14, { duration: 1.5 });
  }, [target, map]);
  return null;
}

const SCHOOL_COLORS = {
  Primary: "#43A047",
  Secondary: "#1E88E5",
  Central: "#8E24AA",
  Special: "#FB8C00",
  Other: "#E91E63",
};

function MapView() {
  const [schools, setSchools] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCatchment, setActiveCatchment] = useState(null);
  const [mapTarget, setMapTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false,
  );
  const [showResults, setShowResults] = useState(false);

  const [typeFilters, setTypeFilters] = useState(Object.keys(SCHOOL_COLORS));
  const [genderFilter, setGenderFilter] = useState("All");
  const [ocFilter, setOcFilter] = useState(false);

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

  const fetchBoundary = async (code) => {
    // Load and cache the GeoJSON on first call
    if (!window._catchmentCache) {
      const res = await fetch("/catchments.geojson");
      window._catchmentCache = await res.json();
    }

    const paddedCode = String(parseInt(code, 10)).padStart(4, "0");

    const feature = window._catchmentCache.features.find(
      (f) => String(f.properties.USE_ID).padStart(4, "0") === paddedCode,
    );

    if (feature) {
      setActiveCatchment({ type: "FeatureCollection", features: [feature] });
    } else {
      setActiveCatchment(null);
      console.log("No catchment found for code:", paddedCode);
    }
  };

  // 3. SEARCH SUGGESTIONS LOGIC
  const searchResults = useMemo(() => {
    if (searchTerm.length < 2) return [];

    const lowerTerm = searchTerm.toLowerCase();

    // Get unique suburbs that match
    const suburbs = [...new Set(schools.map((s) => s.suburb))]
      .filter((sub) => sub.toLowerCase().includes(lowerTerm))
      .map((sub) => ({ type: "suburb", name: sub, label: `🏠 ${sub}` }));

    // Get schools that match
    const schoolMatches = schools
      .filter((s) => s.name.toLowerCase().includes(lowerTerm))
      .map((s) => ({ ...s, type: "school", label: `🎓 ${s.name}` }));

    return [...suburbs, ...schoolMatches].slice(0, 10);
  }, [searchTerm, schools]);

  const handleSelect = (item) => {
    setSearchTerm(item.name);
    setShowResults(false);

    if (item.type === "school") {
      // Zoom to school and fetch its boundary
      setMapTarget([item.lat, item.lng]);
      fetchBoundary(item.code);
    } else {
      // If a suburb was selected, find the first school in that suburb to center the map
      const firstInSuburb = schools.find((s) => s.suburb === item.name);
      if (firstInSuburb) {
        setMapTarget([firstInSuburb.lat, firstInSuburb.lng]);
      }
    }
  };

  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const typeLabel =
        Object.keys(SCHOOL_COLORS).find((k) => s.level.includes(k)) || "Other";
      const matchesType = typeFilters.includes(typeLabel);
      const matchesGender = genderFilter === "All" || s.gender === genderFilter;
      const matchesOC = !ocFilter || (s.oc && s.oc !== "N");
      return matchesType && matchesGender && matchesOC;
    });
  }, [schools, typeFilters, genderFilter, ocFilter]);

  if (loading)
    return <div style={{ padding: "20px" }}>Loading Map Data...</div>;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          backgroundColor: "#002b5c",
          color: "white",
          padding: "12px 10px",
          zIndex: 3000,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <span>📍</span>
            <h1 style={{ margin: 0, fontSize: isMobile ? "18px" : "22px" }}>
              Local School Map
            </h1>
          </div>
          <p style={{ margin: "2px 0 0", fontSize: "11px", opacity: 0.8 }}>
            Independent boundary tool (Unofficial)
          </p>
        </div>
      </header>

      <div style={{ flex: 1, position: "relative" }}>
        {/* CUSTOM SEARCH BAR */}
        <div
          style={{
            position: "absolute",
            top: 15,
            left: "5%",
            width: "90%",
            maxWidth: "400px",
            zIndex: 4000,
          }}
        >
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search schools or suburbs..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowResults(true);
              }}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                border: "1px solid #ccc",
                boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                fontSize: "14px",
              }}
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setActiveCatchment(null);
                }}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "none",
                  fontSize: "18px",
                  cursor: "pointer",
                  color: "#999",
                }}
              >
                ✕
              </button>
            )}
          </div>

          {showResults && searchResults.length > 0 && (
            <ul
              style={{
                background: "white",
                listStyle: "none",
                margin: "4px 0 0",
                padding: "0",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                maxHeight: "300px",
                overflowY: "auto",
                border: "1px solid #eee",
              }}
            >
              {searchResults.map((item, i) => (
                <li
                  key={i}
                  onClick={() => handleSelect(item)}
                  style={{
                    padding: "12px",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                    fontSize: "13px",
                    hover: { background: "#f9f9f9" },
                  }}
                  onMouseEnter={(e) => (e.target.style.background = "#f9f9f9")}
                  onMouseLeave={(e) => (e.target.style.background = "white")}
                >
                  {item.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        {activeCatchment && (
          <button
            onClick={() => setActiveCatchment(null)}
            style={{
              position: "absolute",
              top: 80,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2000,
              background: "#ff4444",
              color: "white",
              border: "none",
              padding: "8px 15px",
              borderRadius: "20px",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            ✕ Clear Boundary
          </button>
        )}

        <MapContainer
          center={[-33.86, 151.2]}
          zoom={11}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
          <ZoomControl position="bottomright" />
          <ZoomHandler target={mapTarget} />

          {activeCatchment && (
            <GeoJSON
              key={JSON.stringify(activeCatchment)}
              data={activeCatchment}
              style={{ color: "#ff4444", weight: 3, fillOpacity: 0.2 }}
              onEachFeature={(feature, layer) => {
                // This helps center the map on the catchment
                if (feature.geometry) {
                  // map.fitBounds(layer.getBounds()); // Optional: Auto-zoom to boundary
                }
              }}
            />
          )}

          {filteredSchools.map((school) => (
            <CircleMarker
              key={school.code}
              center={[school.lat, school.lng]}
              radius={8}
              pathOptions={{
                fillColor:
                  SCHOOL_COLORS[
                    Object.keys(SCHOOL_COLORS).find((k) =>
                      school.level.includes(k),
                    ) || "Other"
                  ] || "#888",
                color: "white",
                weight: 1,
                fillOpacity: 0.8,
              }}
              eventHandlers={{ click: () => fetchBoundary(school.code) }}
            >
              <Popup>
                <div style={{ minWidth: "180px", padding: "2px" }}>
                  <div
                    onClick={() =>
                      school.url &&
                      window.open(
                        school.url.includes("http")
                          ? school.url
                          : `https://${school.url}`,
                        "_blank",
                      )
                    }
                    style={{
                      color: "#1E88E5",
                      fontSize: "15px",
                      fontWeight: "bold",
                      textDecoration: "underline",
                      cursor: "pointer",
                      marginBottom: "8px",
                    }}
                  >
                    {school.name}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      lineHeight: "1.6",
                      color: "#333",
                      marginBottom: "10px",
                    }}
                  >
                    <strong>Type:</strong> {school.level}
                    <br />
                    <strong>Gender:</strong> {school.gender}
                    <br />
                    <strong>Selective:</strong> {school.selective}
                    <br />
                    <strong>Enrolment:</strong> {Math.round(school.enrolment)}
                    <br />
                    {school.oc !== "N" && (
                      <span style={{ color: "#2e7d32", fontWeight: "bold" }}>
                        ★ OC Classes Available
                      </span>
                    )}
                  </div>
                  <div
                    onClick={() =>
                      window.open(
                        `https://schoolfinder.education.nsw.gov.au/index.php?schoolCode=${school.code}`,
                        "_blank",
                      )
                    }
                    style={{
                      textAlign: "center",
                      fontSize: "10px",
                      color: "#666",
                      padding: "4px",
                      background: "#f5f5f5",
                      borderRadius: "4px",
                      cursor: "pointer",
                      border: "1px solid #ddd",
                    }}
                  >
                    Verify on Official School Finder ↗
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>

        <div
          style={{
            position: "absolute",
            bottom: isMobile ? 10 : 30,
            left: 10,
            zIndex: 2000,
            background: "white",
            padding: "12px",
            borderRadius: "12px",
            boxShadow: "0 2px 15px rgba(0,0,0,0.2)",
            width: isMobile ? "140px" : "180px",
            fontSize: "11px",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              marginBottom: "8px",
              borderBottom: "1px solid #eee",
              paddingBottom: "4px",
            }}
          >
            Filter Schools
          </div>
          <select
            onChange={(e) => setGenderFilter(e.target.value)}
            style={{ width: "100%", marginBottom: "10px", padding: "4px" }}
          >
            <option value="All">All Genders</option>
            <option value="Coed">Co-educational</option>
            <option value="Boys">Boys Only</option>
            <option value="Girls">Girls Only</option>
          </select>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "10px",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={ocFilter}
              onChange={(e) => setOcFilter(e.target.checked)}
              style={{ marginRight: "8px" }}
            />
            Opportunity Classes
          </label>
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
                marginBottom: "5px",
                cursor: "pointer",
                opacity: typeFilters.includes(label) ? 1 : 0.3,
              }}
            >
              <div
                style={{
                  width: "10px",
                  height: "10px",
                  background: color,
                  borderRadius: "50%",
                  marginRight: "8px",
                }}
              />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <footer
        style={{
          backgroundColor: "#f1f1f1",
          padding: "6px 10px",
          textAlign: "center",
          fontSize: "10px",
          color: "#555",
          borderTop: "1px solid #ddd",
          zIndex: 3000,
        }}
      >
        <p style={{ margin: "0" }}>
          <strong>Disclaimer:</strong> This is NOT an official government
          website and is not affiliated with the NSW Dept of Education.
        </p>
        <p style={{ margin: "2px 0 0", lineHeight: "1.2" }}>
          Tool for informational purposes only. Catchments change without
          notice.{" "}
          <strong>
            Verify boundaries officially before making financial or enrollment
            decisions.
          </strong>
          <br />
          Data Source: NSW Dept of Education Open Data (Last Records: April
          2026).
        </p>
      </footer>
    </div>
  );
}

export default MapView;
