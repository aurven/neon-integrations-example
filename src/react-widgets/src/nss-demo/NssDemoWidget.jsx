import React, { useState } from 'react';
import { Sidebar } from './design-system/components/navigation/Sidebar.jsx';
import { SidebarButton } from './design-system/components/navigation/SidebarButton.jsx';
import { Placeholder } from './shared/Placeholder.jsx';
import { SEED_PRODUCTS, SEED_PACKAGES, SEED_CLIENTS } from './data.js';
import './nss-demo.css';

// Real sections (built out in Tasks 2-5) — each gets its own sidebar key.
const REAL_SECTIONS = [
  { key: 'cruscotto', label: 'Cruscotto', icon: 'IconDashboard' },
  { key: 'prodotti', label: 'Prodotti', icon: 'IconDatabase' },
  { key: 'pacchetti', label: 'Pacchetti', icon: 'IconBundle' },
  { key: 'clienti', label: 'Clienti', icon: 'IconCompany' },
];

// Non-functional placeholder sections — always render the shared empty state.
const PLACEHOLDER_SECTIONS = [
  { label: 'Destinazioni', icon: 'IconConnectionOn' },
  { label: 'Log Distribuzione', icon: 'IconHistory' },
  { label: 'Gestione Tag', icon: 'IconHashtag' },
  { label: 'Impostazioni', icon: 'IconCustomization' },
];

const HELP_SECTION = { label: 'Aiuto', icon: 'IconHelp' };

function placeholderKey(label) {
  return `placeholder:${label}`;
}

export function NssDemoWidget() {
  const [products, setProducts] = useState(SEED_PRODUCTS);
  const [packages, setPackages] = useState(SEED_PACKAGES);
  const [clients, setClients] = useState(SEED_CLIENTS);
  const [activeSection, setActiveSection] = useState('cruscotto');

  let mainContent;
  if (activeSection === 'cruscotto') {
    mainContent = <div>Cruscotto — TODO Task 2</div>;
  } else if (activeSection === 'prodotti') {
    mainContent = <div>Prodotti — TODO Task 3</div>;
  } else if (activeSection === 'pacchetti') {
    mainContent = <div>Pacchetti — TODO Task 4</div>;
  } else if (activeSection === 'clienti') {
    mainContent = <div>Clienti — TODO Task 5</div>;
  } else if (activeSection.startsWith('placeholder:')) {
    const label = activeSection.slice('placeholder:'.length);
    const section = PLACEHOLDER_SECTIONS.find((s) => s.label === label) || HELP_SECTION;
    mainContent = <Placeholder label={section.label} icon={section.icon} />;
  }

  return (
    <div className="nss-demo-root">
      <Sidebar
        footer={
          <SidebarButton
            icon={HELP_SECTION.icon}
            aria-label={HELP_SECTION.label}
            className="neon-sidebar-btn--disabled"
            onClick={() => setActiveSection(placeholderKey(HELP_SECTION.label))}
          />
        }
      >
        {REAL_SECTIONS.map((section) => (
          <SidebarButton
            key={section.key}
            icon={section.icon}
            aria-label={section.label}
            selected={activeSection === section.key}
            onClick={() => setActiveSection(section.key)}
          />
        ))}
        {PLACEHOLDER_SECTIONS.map((section) => (
          <SidebarButton
            key={section.label}
            icon={section.icon}
            aria-label={section.label}
            className="neon-sidebar-btn--disabled"
            onClick={() => setActiveSection(placeholderKey(section.label))}
          />
        ))}
      </Sidebar>
      <div className="nss-demo-main">{mainContent}</div>
    </div>
  );
}

export default NssDemoWidget;
