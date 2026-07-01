import React from 'react';
import { Link } from 'react-router-dom';

function Privacy() {
  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif', color: '#333', lineHeight: '1.5' }}>
      <Link to="/" style={{ color: '#1E88E5', textDecoration: 'none', fontWeight: 'bold' }}>← Back to Interactive Map</Link>
      
      <h1 style={{ color: '#002b5c', marginTop: '20px' }}>Privacy Policy & Terms</h1>
      <p>Last Updated: {new Date().getFullYear()}</p>
      
      <p>Your privacy is important. This mapping application does not store, collect, or upload your personal physical location data to external database servers.</p>
      
      <h3>1. Local Storage and Cache Usage</h3>
      <p>To optimise performance and minimise your data load, this web app saves map configuration preferences locally in your device's browser memory (via LocalStorage and Service Workers). This data never leaves your computer.</p>
      
      <h3>2. Third-Party Mapping Assets</h3>
      <p>Map tiles and geocoding translation lookups are safely handled by OpenStreetMap and the Nominatim API. No uniquely tracking metadata is intentionally transmitted during these network calls.</p>
      
      <h3>3. External Educational Resources</h3>
      <p>When you click external links (like Domain or MySchool), your privacy defaults to the policies managed by those respective domains.</p>
    </div>
  );
}

export default Privacy;