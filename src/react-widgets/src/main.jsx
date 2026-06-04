import { createRoot } from 'react-dom/client';
import NeonGridWidget from './NeonGridWidget.jsx';

const container = document.getElementById('root');
if (container && !container._reactRoot) {
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<NeonGridWidget />);
}
