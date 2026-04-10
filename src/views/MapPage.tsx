import MapView from '../components/map/MapView';
import MapErrorBoundary from '../components/map/MapErrorBoundary';
import MapOnboarding from '../components/map/MapOnboarding';
import { useLegacyTileCacheMigration } from '../hooks/useLegacyTileCacheMigration';

export default function MapPage() {
  useLegacyTileCacheMigration('MapPage');

  return (
    <MapErrorBoundary>
      <div style={{ width: '100%', height: '100vh' }}>
        <MapView />
        <MapOnboarding />
      </div>
    </MapErrorBoundary>
  );
}
