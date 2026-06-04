import { createRoot } from 'react-dom/client';
import PrintQueryBoard from './PrintQueryBoard.jsx';

const container = document.getElementById('root');
if (container && !container._reactRoot) {
  const root = createRoot(container);
  container._reactRoot = root;
  root.render(<PrintQueryBoard />);
}
