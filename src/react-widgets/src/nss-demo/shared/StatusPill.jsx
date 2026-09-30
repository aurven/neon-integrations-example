import React from 'react';
import { StatusDot } from '../design-system/components/feedback/Badge.jsx';

const STATUS_COLOR = {
  OK: 'var(--color-background-feedback-green)',
  Attivo: 'var(--color-background-feedback-green)',
  Errore: 'var(--color-background-feedback-red)',
  Parziale: 'var(--color-background-feedback-yellow)',
  'In Pausa': 'var(--color-background-neutral-quaternary)',
  'In pausa': 'var(--color-background-neutral-quaternary)',
};

/** Colored status dot + verbatim Italian label, for deliveries/channels/clients. */
export function StatusPill({ status }) {
  return <StatusDot label={status} color={STATUS_COLOR[status] || 'var(--color-background-neutral-quaternary)'} />;
}
export default StatusPill;
