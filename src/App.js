import React, { Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import "./App.css";

// Lazy-loaded pages
const MapView = lazy(() => import("./MapView"));
const About = lazy(() => import("./About"));
const Privacy = lazy(() => import("./Privacy"));

// Loading screen while chunks load
const MapLoader = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      fontFamily: "sans-serif",
      color: "#002b5c",
      fontWeight: 600,
    }}
  >
    Loading Map Engine...
  </div>
);

function App() {
  return (
    <Router>
      <div className="App">
        <Suspense fallback={<MapLoader />}>
          <Routes>
            {/* Home */}
            <Route path="/" element={<MapView />} />

            {/* Deep link for school catchments */}
            <Route path="/catchment/:schoolSlug" element={<MapView />} />

            {/* Static pages */}
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />

            {/* Redirect unknown routes */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;
