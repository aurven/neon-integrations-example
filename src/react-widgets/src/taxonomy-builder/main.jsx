import { createRoot } from 'react-dom/client';
import TaxonomyBuilderWidget from './TaxonomyBuilderWidget.jsx';
import './taxonomy-builder.css';

const container = document.getElementById('root');
if (container && !container._reactRoot) {
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<TaxonomyBuilderWidget />);
}
