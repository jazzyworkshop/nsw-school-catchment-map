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
function ZoomHandler({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.flyTo(bounds, 14, { duration: 1.5 });
  }, [bounds, map]);
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

  // Filters
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

  const filteredSchools = useMemo(() => {
    return schools.filter((s) => {
      const typeLabel =
        Object.keys(SCHOOL_COLORS).find((k) => s.level.includes(k)) || "Other";
      const matchesType = typeFilters.includes(typeLabel);
      const matchesSearch =
        !searchTerm ||
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.suburb.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesGender = genderFilter === "All" || s.gender === genderFilter;
      const matchesOC = !ocFilter || (s.oc && s.oc !== "N");
      return matchesType && matchesSearch && matchesGender && matchesOC;
    });
  }, [schools, searchTerm, typeFilters, genderFilter, ocFilter]);

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
      {/* HEADER */}
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
        {/* Search */}
        <div
          style={{
            position: "absolute",
            top: 15,
            left: "5%",
            width: "90%",
            maxWidth: "400px",
            zIndex: 2000,
          }}
        >
          <input
            type="text"
            placeholder="Search school or suburb..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 20px",
              borderRadius: "30px",
              border: "1px solid #ccc",
              boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
              fontSize: "16px",
              boxSizing: "border-box",
            }}
          />
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
            attribution="&copy; OpenStreetMap | Data: NSW Dept of Education"
          />
          <ZoomControl position="bottomright" />
          <ZoomHandler bounds={mapTarget} />

          {activeCatchment && (
            <GeoJSON
              data={activeCatchment}
              style={{ color: "#ff4444", weight: 3, fillOpacity: 0.2 }}
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
              eventHandlers={{
                click: () => {
                  const url = `https://services1.arcgis.com/BDe79YI8Y57zYt8F/arcgis/rest/services/NSW_Public_School_Catchments/FeatureServer/1/query?where=school_code='${school.code}'&outFields=*&f=geojson&outSR=4326`;
                  fetch(url)
                    .then((r) => r.json())
                    .then((d) => d.features?.length && setActiveCatchment(d));
                },
              }}
            >
              <Popup>
                <div style={{ minWidth: "180px", padding: "2px" }}>
                  {/* Title as Website Link */}
                  <div
                    onClick={() => {
                      if (!school.url) return;
                      window.open(
                        school.url.includes("http")
                          ? school.url
                          : `https://${school.url}`,
                        "_blank",
                      );
                    }}
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

                  {/* Full Info List Restored */}
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

                  {/* Smaller, Subtle Verification Button */}
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

        {/* Filter Panel */}
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
                setTypeFilters((prev) =>
                  prev.includes(label)
                    ? prev.filter((l) => l !== label)
                    : [...prev, label],
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
          padding: "10px",
          textAlign: "center",
          fontSize: "10px",
          color: "#555",
          borderTop: "1px solid #ddd",
          zIndex: 3000,
        }}
      >
        <div style={{ marginBottom: "4px" }}>
          <strong>Data Current as of:</strong> April 2026
        </div>
        <p style={{ margin: "0 0 4px" }}>
          <strong>Disclaimer:</strong> This is NOT an official government
          website and is not affiliated with the NSW Dept of Education.
        </p>
        <p style={{ margin: 0, lineHeight: "1.4" }}>
          Tool for informational purposes only. Catchments change without
          notice.{" "}
          <strong>
            Verify boundaries officially before making financial or enrollment
            decisions.
          </strong>
          <br />
          Data Source: NSW Dept of Education Open Data (Last Records:
          07/04/2026).
        </p>
      </footer>
    </div>
  );
}

export default MapView;
