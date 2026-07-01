import React, { useState, useMemo } from 'react';
import { Database, Package, Building2, AlertCircle, BarChart3, Download, RefreshCw, Plus, Hash } from 'lucide-react';
import { Card } from '../design-system/components/data/Card.jsx';
import { Table } from '../design-system/components/data/Table.jsx';
import { ProgressBar } from '../design-system/components/feedback/ProgressBar.jsx';
import { Button } from '../design-system/components/forms/Button.jsx';
import { KpiCard } from '../shared/KpiCard.jsx';
import { ChannelChip } from '../shared/ChannelChip.jsx';
import { StatusPill } from '../shared/StatusPill.jsx';

/** Header row: title/subtitle on the left, three action buttons on the right. */
function CruscottoHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)' }}>
          Cruscotto Distribuzione
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', marginTop: 4 }}>
          Ultimo aggiornamento 2 min fa · Orari CET · Auto-aggiornamento: 60s
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <Button variant="ghost" icon={Download} onClick={() => {}}>Esporta log</Button>
        <Button variant="secondary" onClick={() => {}}>Aggiungi Destinatario</Button>
        <Button variant="primary" onClick={() => {}}>Modifica cruscotto</Button>
      </div>
    </div>
  );
}

/** Horizontal row of 5 KPI cards. */
function KpiRow({ products, packages, clients, dashboard }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
      <div style={{ flex: '1 1 180px' }}>
        <KpiCard
          label="PRODOTTI ATTIVI"
          icon={Database}
          value={products.length}
          sublabel="Prodotti in esecuzione"
          trend="+3 vs la settimana scorsa"
          trendDirection="up"
        />
      </div>
      <div style={{ flex: '1 1 180px' }}>
        <KpiCard
          label="PACCHETTI ATTIVI"
          icon={Package}
          value={packages.length}
          sublabel="Pacchetti attivi"
          trend="nessun cambiamento questa settimana"
          trendDirection="flat"
        />
      </div>
      <div style={{ flex: '1 1 180px' }}>
        <KpiCard
          label="DESTINATARI ATTIVI"
          icon={Building2}
          value={clients.length}
          sublabel="Destinatari B2B"
          trend="+1 questo mese"
          trendDirection="up"
        />
      </div>
      <div style={{ flex: '1 1 180px' }}>
        <KpiCard
          label="ERRORI OGGI"
          icon={AlertCircle}
          value={dashboard.errors.length}
          sublabel="Errori di consegna"
          trend="da 7 ieri"
          trendDirection="down"
          error
        />
      </div>
      <div style={{ flex: '2 1 320px' }}>
        <KpiCard
          label="ELEMENTI CONSEGNATI (ULTIME 24H)"
          icon={BarChart3}
          value="1.842"
          sublabel="Su tutti i canali"
          trend="+214 vs ieri"
          trendDirection="up"
        />
      </div>
    </div>
  );
}

/** Expandable stripe listing today's delivery errors. */
function ErrorStripe({ errors }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card variant="bordered" style={{ marginBottom: 16, padding: 0, overflow: 'hidden' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: 'var(--color-background-feedback-red-light)',
          padding: '12px 16px',
          cursor: 'pointer',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-text-neutral-primary)',
        }}
      >
        {'⚠'} {errors.length} errori di consegna richiedono attenzione — clicca per espandere
      </div>
      {expanded && (
        <div>
          {errors.map((err, i) => (
            <div
              key={`${err.packageName}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '10px 16px',
                borderTop: '1px solid var(--hairline)',
              }}
            >
              <div style={{ flex: '0 0 auto', fontWeight: 'var(--weight-semibold)' }}>{err.packageName}</div>
              <div style={{ flex: '1 1 auto', color: 'var(--color-text-neutral-label)' }}>{err.message}</div>
              <div style={{ flex: '0 0 auto', color: 'var(--color-text-neutral-label)', textAlign: 'right' }}>{err.timestamp}</div>
              <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => {}}>Riprova</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

const DELIVERY_COLUMNS = [
  { key: 'packageName', header: 'Pacchetto', sortable: true },
  { key: 'clientName', header: 'Destinatario' },
  { key: 'channel', header: 'Canale', render: (row) => <ChannelChip channel={row.channel} /> },
  { key: 'lastDeliveryTime', header: 'Ultima consegna', sortable: true },
  { key: 'itemCount', header: 'Elementi', sortable: true },
  { key: 'status', header: 'Stato', render: (row) => <StatusPill status={row.status} /> },
];

/** Sortable table of active deliveries. */
function DeliveryTable({ deliveries }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return deliveries;
    const copy = [...deliveries];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp;
      if (typeof av === 'number' && typeof bv === 'number') {
        cmp = av - bv;
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [deliveries, sortKey, sortDir]);

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return (
    <Card variant="bordered">
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        CONSEGNE ATTIVE
      </div>
      <Table
        columns={DELIVERY_COLUMNS}
        rows={sortedRows}
        rowKey={(row, i) => `${row.packageName}-${row.clientName}-${i}`}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
      />
    </Card>
  );
}

/** Right-side quick action buttons panel. */
function QuickActions() {
  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Azioni Rapide
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Button variant="primary" icon={Plus} onClick={() => {}}>Nuovo Prodotto</Button>
        <Button variant="secondary" icon={Plus} onClick={() => {}}>Nuovo Pacchetto</Button>
        <Button variant="secondary" icon={Plus} onClick={() => {}}>Aggiungi Destinatario</Button>
        <Button variant="secondary" icon={Hash} onClick={() => {}}>Gestisci Tag</Button>
        <div style={{ height: 1, background: 'var(--hairline)', margin: '4px 0' }} />
        <Button variant="ghost" icon={Download} onClick={() => {}}>Esporta Log (CSV)</Button>
      </div>
    </Card>
  );
}

/** Channel breakdown panel: chip + progress bar + count per channel. */
function ChannelBreakdown({ rows }) {
  return (
    <Card variant="bordered">
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        CONSEGNE PER CANALE
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map((row) => (
          <div key={row.channelType} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: '0 0 auto' }}>
              <ChannelChip channel={row.channelType} />
            </div>
            <div style={{ flex: '1 1 auto' }}>
              <ProgressBar value={row.percentage} />
            </div>
            <div style={{ flex: '0 0 auto', fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', minWidth: 40, textAlign: 'right' }}>
              {row.count}
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', marginTop: 10 }}>
        Ultime 24h
      </div>
    </Card>
  );
}

/** Cruscotto — dashboard home section for the NSS Demo widget. */
export function Cruscotto({ dashboard, products, packages, clients }) {
  return (
    <div>
      <CruscottoHeader />
      <KpiRow products={products} packages={packages} clients={clients} dashboard={dashboard} />
      <ErrorStripe errors={dashboard.errors} />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 0%', minWidth: 0 }}>
          <DeliveryTable deliveries={dashboard.deliveries} />
        </div>
        <div style={{ flex: '1 1 0%', minWidth: 0 }}>
          <QuickActions />
          <ChannelBreakdown rows={dashboard.channelBreakdown} />
        </div>
      </div>
    </div>
  );
}

export default Cruscotto;
