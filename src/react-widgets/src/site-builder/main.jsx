import { createRoot } from 'react-dom/client';
import SiteBuilderWidget from './SiteBuilderWidget.jsx';
import './site-builder.css';

const container = document.getElementById('root');
if (container && !container._reactRoot) {
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<SiteBuilderWidget />);
}
