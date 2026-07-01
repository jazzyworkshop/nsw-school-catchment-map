import React from 'react';
import { Link } from 'react-router-dom';

function About() {
  return (
    <div style={{ maxWidth: '800px', margin: '40px auto', padding: '0 20px', fontFamily: 'sans-serif', color: '#333', lineHeight: '1.4' }}>
      <Link to="/" style={{ color: '#1E88E5', textDecoration: 'none', fontWeight: 'bold' }}>← Back to Interactive Map</Link>
      
      <h1 style={{ color: '#002b5c', marginTop: '20px' }}>About the School Catchment Map</h1>
      <p>This interactive platform helps parents, families, and residents visualise school boundaries and explore local school information across New South Wales.</p>
      
      <hr style={{ border: '0', borderTop: '1px solid #eee', margin: '15px 0' }} />
      
      <h2>Data Transparency & Sources</h2>
      <p>We believe in transparency. The underlying geographic and school information displayed on this app is compiled entirely from verified public administration datasets:</p>
      <ul>
        <li><strong>School Profile & Catchment Boundaries:</strong> Sourced from the <em>NSW Department of Education</em> under Creative Commons licensing.</li>
        <li><strong>Academic Performance & ICSEA Metrics:</strong> Compiled via public records available on the <em>Australian Curriculum, Assessment and Reporting Authority (ACARA) MySchool</em> database.</li>
      </ul>
      <p style={{ fontStyle: 'italic', color: '#666' }}>Disclaimer: While we regularly update our platform against official releases, boundary changes can occur. Always verify your exact street address with the NSW Department of Education School Finder before making property commitments.</p>

      <hr style={{ border: '0', borderTop: '1px solid #eee', margin: '15px 0' }} />

          </div>
  );
}

export default About;