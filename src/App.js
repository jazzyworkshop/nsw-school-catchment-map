import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MapView from './MapView';
import './App.css';

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* This matches the home page */}
          <Route path="/" element={<MapView />} />
          
          {/* This matches specific school pages for SEO */}
          <Route path="/catchment/:schoolSlug" element={<MapView />} />
          
          {/* Fallback route to redirect any typos back to the home map */}
          <Route path="*" element={<MapView />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;