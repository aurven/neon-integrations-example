import React from 'react';
import { Card } from '../design-system/components/data/Card.jsx';
import { Icon } from '../design-system/assets/icons/Icon.jsx';

/** Centered empty-state used for sidebar sections that aren't built yet. */
export function Placeholder({ label, icon }) {
  return (
    <Card
      variant="bordered"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: 240,
        textAlign: 'center',
        color: 'var(--color-text-neutral-label)',
      }}
    >
      <span style={{ color: 'var(--color-icon-neutral-quaternary)', display: 'inline-flex' }}>
        <Icon name={icon} size={32} />
      </span>
      <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-primary)' }}>
        {label}
      </div>
      <div>Questa sezione arriva presto.</div>
    </Card>
  );
}
export default Placeholder;
