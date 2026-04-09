import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default Leaflet icon markers (standard procedure)
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper component to handle smooth map movement
function ZoomHandler({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.flyTo(bounds, 14, { duration: 1.5 });
    }
  }, [bounds, map]);
  return null;
}

const SCHOOL_COLORS = {
  Primary: '#43A047',   // Green
  Secondary: '#1E88E5', // Blue
  Central: '#8E24AA',   // Purple
  Special: '#FB8C00',   // Orange
  Other: '#E91E63',     // Pink
  Default: '#888888'    // Grey
};

function getSchoolColor(type) {
  if (!type) return SCHOOL_COLORS.Default;
  const t = type.toLowerCase();
  if (t.includes('primary')) return SCHOOL_COLORS.Primary;
  if (t.includes('secondary') || t.includes('high')) return SCHOOL_COLORS.Secondary;
  if (t.includes('central')) return SCHOOL_COLORS.Central;
  if (t.includes('special')) return SCHOOL_COLORS.Special;
  return SCHOOL_COLORS.Other;
}

function MapView() {
  const [schools, setSchools] = useState([]);
  const [status, setStatus] = useState("Loading schools...");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCatchment, setActiveCatchment] = useState(null);
  const [mapTarget, setMapTarget] = useState(null);

  // 1. Load Master School Data
  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/schools_master.json');
        const data = await response.json();
        const mappedSchools = (data.records || []).map((row) => {
          if (!row || row.length < 42) return null;
          return {
            code: String(row[0]).trim(),
            name: row[2] || "Unknown School",
            url: row[8] || "",
            suburb: row[4] || "Unknown Suburb",
            enrolment: parseFloat(row[10]) || 0,
            level: row[14] || "Other",
            selective: row[15] || "N/A",
            oc: row[16] || "N",
            gender: row[23] || "Coed",
            lat: parseFloat(row[40]),
            lng: parseFloat(row[41])
          };
        }).filter(s => s && !isNaN(s.lat) && !isNaN(s.lng));

        setSchools(mappedSchools);
        setStatus(`Showing ${mappedSchools.length} schools`);
      } catch (err) {
        setStatus("Error loading school data.");
      }
    }
    loadData();
  }, []);

  // 2. Live API Catchment Fetcher
  const fetchCatchment = async (schoolCode) => {
    setActiveCatchment(null); // Clear previous zone immediately
    const cleanCode = schoolCode.trim();
    const paddedCode = cleanCode.padStart(4, '0');
    
    // We loop through standard layers: 1 (Primary), 2 (Secondary), 0 (Combined/Other)
    const layers = [1, 2, 0];
    
    for (const layerId of layers) {
      const where = `school_code='${cleanCode}' OR school_code='${paddedCode}'`;
      const url = `https://services1.arcgis.com/BDe79YI8Y57zYt8F/arcgis/rest/services/NSW_Public_School_Catchments/FeatureServer/${layerId}/query?where=${encodeURIComponent(where)}&outFields=*&f=geojson&outSR=4326`;
      
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const data = await res.json();
        
        if (data.features && data.features.length > 0) {
          setActiveCatchment(data);
          return; // Stop searching once we hit a result
        }
      } catch (e) {
        console.warn(`Layer ${layerId} fetch error. Retrying...`);
      }
    }
    console.log("No catchment found for school:", cleanCode);
  };

  // 3. Search Logic (Filtering & Suggestions)
  const { filteredSchools, suggestions } = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return { filteredSchools: schools, suggestions: [] };

    const matches = schools.filter(s => 
      s.name.toLowerCase().includes(term) || 
      s.suburb.toLowerCase().includes(term)
    );

    const subSuggest = Array.from(new Set(matches.map(s => s.suburb)))
      .filter(sub => sub.toLowerCase().includes(term))
      .slice(0, 3)
      .map(sub => ({
        type: 'suburb',
        label: sub,
        lat: matches.find(m => m.suburb === sub)?.lat,
        lng: matches.find(m => m.suburb === sub)?.lng
      }));

    const schSuggest = matches
      .filter(s => s.name.toLowerCase().includes(term))
      .slice(0, 5)
      .map(s => ({ type: 'school', label: s.name, lat: s.lat, lng: s.lng }));

    return { filteredSchools: matches, suggestions: [...subSuggest, ...schSuggest] };
  }, [searchTerm, schools]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', fontFamily: 'sans-serif' }}>
      
      {/* Floating Search Interface */}
      <div style={{ position: 'absolute', top: 20, left: 60, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search school or suburb..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ 
              padding: '12px 45px 12px 20px', 
              width: '320px', 
              borderRadius: '30px', 
              border: 'none', 
              boxShadow: '0 4px 15px rgba(0,0,0,0.2)', 
              fontSize: '15px', 
              outline: 'none' 
            }}
          />
          {searchTerm && (
            <button 
              onClick={() => { setSearchTerm(""); setActiveCatchment(null); }} 
              style={{ position: 'absolute', right: '15px', background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#888' }}
            >✕</button>
          )}
          
          {searchTerm.length > 2 && suggestions.length > 0 && (
            <div style={{ position: 'absolute', top: '55px', width: '100%', background: 'white', borderRadius: '15px', boxShadow: '0 8px 20px rgba(0,0,0,0.15)', overflow: 'hidden' }}>
              {suggestions.map((item, idx) => (
                <div 
                  key={idx} 
                  onClick={() => { 
                    setSearchTerm(item.label); 
                    if (item.lat) setMapTarget([item.lat, item.lng]); 
                  }}
                  style={{ padding: '12px 15px', fontSize: '14px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <span>{item.type === 'suburb' ? '🏠' : '🎓'}</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.85)', padding: '5px 15px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', width: 'fit-content', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
          {status}
        </div>
      </div>

      <MapContainer center={[-33.8688, 151.2093]} zoom={11} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <ZoomHandler bounds={mapTarget} />

        {/* Catchment Zone Overlay */}
        {activeCatchment && (
          <GeoJSON 
            key={JSON.stringify(activeCatchment)}
            data={activeCatchment}
            style={{ 
              color: '#D32F2F', 
              weight: 3, 
              fillOpacity: 0.3, 
              fillColor: '#F44336' 
            }}
          />
        )}

        {/* School Markers */}
        {filteredSchools.map((school) => (
          <CircleMarker
            key={school.code}
            center={[school.lat, school.lng]}
            radius={7}
            pathOptions={{ 
              fillColor: getSchoolColor(school.level), 
              color: 'white', 
              weight: 1.5, 
              fillOpacity: 0.9 
            }}
            eventHandlers={{ 
              click: () => fetchCatchment(school.code) 
            }}
          >
            <Popup>
              <div style={{ fontSize: '14px', minWidth: '220px', padding: '5px' }}>
                <div 
                  onClick={() => {
                    const url = school.url.startsWith('http') ? school.url : `https://${school.url}`;
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  style={{ color: '#1E88E5', fontSize: '16px', fontWeight: 'bold', textDecoration: 'underline', cursor: 'pointer', marginBottom: '8px' }}
                >
                  {school.name}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', borderTop: '1px solid #eee', paddingTop: '8px' }}>
                  <span><strong>Suburb:</strong> {school.suburb}</span>
                  <span><strong>Level:</strong> {school.level}</span>
                  <span><strong>Selective:</strong> {school.selective}</span>
                  <span><strong>OC Class:</strong> {school.oc === 'Y' ? '✅' : 'No'}</span>
                  <span><strong>Enrolment:</strong> {Math.round(school.enrolment)}</span>
                  <span><strong>Gender:</strong> {school.gender}</span>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Transparent Legend */}
      <div style={{ 
        position: 'absolute', bottom: 30, right: 20, zIndex: 1000, 
        background: 'rgba(255, 255, 255, 0.85)', 
        backdropFilter: 'blur(4px)', 
        padding: '15px 20px', 
        borderRadius: '12px', 
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)', 
        fontSize: '14px', 
        minWidth: '160px',
        border: '1px solid rgba(255,255,255,0.3)'
      }}>
        <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '10px', borderBottom: '1px solid #ccc', paddingBottom: '6px' }}>
          School Type
        </div>
        {Object.entries(SCHOOL_COLORS).map(([label, color]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
            <div style={{ width: '12px', height: '12px', background: color, borderRadius: '50%', marginRight: '12px', border: '1px solid rgba(0,0,0,0.1)' }}></div>
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default MapView;