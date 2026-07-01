import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// 1. LAZY LOAD MAPVIEW: Keeps initial bundle size tiny
const MapView = lazy(() => import('./MapView'));
const About = lazy(() => import('./About'));
const Privacy = lazy(() => import('./Privacy'));

// 2. LOADING STATE: Displays smoothly while MapView chunks are fetched
const MapLoader = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh', 
    fontFamily: 'sans-serif',
    color: '#002b5c', 
    fontWeight: 600 
  }}>
    Loading Map Engine...
  </div>
);

function App() {
  return (
    <Router>
      <div className="App">
        {/* Suspense coordinates with the lazy loader seamlessly */}
        <Suspense fallback={<MapLoader />}>
          <Routes>
            {/* Home view */}
            <Route path="/" element={<MapView />} />
            
            {/* SEO Deep-links */}
            <Route path="/catchment/:schoolSlug" element={<MapView />} />

            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<Privacy />} />
            
            {/* 3. TRUE REDIRECT: Changes URL bar back to home if a typo occurs */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;