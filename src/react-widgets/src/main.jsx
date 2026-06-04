import { createRoot } from 'react-dom/client';
import NeonGridWidget from './NeonGridWidget.jsx';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<NeonGridWidget />);
}
