import './App.css';
import MapView from './MapView';

function App() {
  return (
    // The height: '100vh' ensures the app takes up the full browser height
    // display: 'flex' allows the children to stack and fill space
    <div className="App" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        background: '#1A237E',
        color: 'white',
        fontSize: '18px',
        fontWeight: 'bold',
        zIndex: 1001, // Stays above the map
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
      }}>
        📍 Catchment Lens — NSW Schools
      </div>

      {/* MapView - flex: 1 tells it to take up all remaining vertical space */}
      <div style={{ flex: 1, position: 'relative' }}>
        <MapView />
      </div>

    </div>
  );
}

export default App;