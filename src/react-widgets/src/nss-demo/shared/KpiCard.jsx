import React from 'react';
import { Card } from '../design-system/components/data/Card.jsx';
import { Icon } from '../design-system/assets/icons/Icon.jsx';

const TREND_COLOR = {
  up: 'var(--color-text-feedback-green-dark)',
  down: 'var(--color-text-feedback-red-dark)',
  flat: 'var(--color-text-neutral-label)',
};

/** KPI summary card used on Cruscotto — bordered Card with icon, big value, sublabel and trend. */
export function KpiCard({ label, value, icon, sublabel, trend, trendDirection = 'flat', error = false }) {
  return (
    <Card
      variant="bordered"
      style={error ? { background: 'var(--color-background-feedback-red-light)', borderColor: 'var(--color-background-feedback-red)' } : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--color-text-neutral-label)' }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
        <span style={{ display: 'inline-flex', color: 'var(--color-icon-neutral-tertiary)' }}>
          <Icon name={icon} size={16} />
        </span>
      </div>
      <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginTop: 8 }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', marginTop: 4 }}>
          {sublabel}
        </div>
      )}
      {trend && (
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: TREND_COLOR[trendDirection] || TREND_COLOR.flat, marginTop: 4 }}>
          {trend}
        </div>
      )}
    </Card>
  );
}
export default KpiCard;
