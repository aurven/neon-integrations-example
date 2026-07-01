import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, Check, CheckSquare, Square, ChevronUp, ChevronDown } from 'lucide-react';
import { Card } from '../design-system/components/data/Card.jsx';
import { KeyValue } from '../design-system/components/data/KeyValue.jsx';
import { TextField } from '../design-system/components/forms/TextField.jsx';
import { Select } from '../design-system/components/forms/Select.jsx';
import { Button } from '../design-system/components/forms/Button.jsx';
import { Chip } from '../design-system/components/forms/Chip.jsx';
import { ToggleGroup } from '../design-system/components/forms/ToggleGroup.jsx';
import { Label } from '../design-system/components/forms/Label.jsx';
import { Modal } from '../design-system/components/overlay/Modal.jsx';
import { StatusPill } from '../shared/StatusPill.jsx';

// Cross-checked against the exact `type` values used in SEED_CLIENTS
// (data.js): 'Editore', 'Agenzia', 'Broadcast'. Those three are a subset of
// this option list, so pre-existing seed clients resolve to a real label —
// no blank-dropdown regression like Tasks 3/4.
const TYPE_OPTIONS = [
  { value: 'Editore', label: 'Editore' },
  { value: 'Agenzia', label: 'Agenzia' },
  { value: 'Broadcast', label: 'Broadcast' },
  { value: 'Istituzionale', label: 'Istituzionale' },
  { value: 'Rivenditore', label: 'Rivenditore' },
];

const STATUS_ITEMS = [
  { value: true, label: 'Attivo' },
  { value: false, label: 'Non attivo' },
];

function blankDraft() {
  return {
    name: '',
    organization: '',
    email: '',
    type: 'Editore',
    notes: '',
    isActive: true,
    selectedPackageIds: [],
    channels: [],
  };
}

function draftFromClient(client) {
  return {
    name: client.name,
    organization: client.organization,
    email: client.email,
    type: client.type,
    notes: client.notes,
    isActive: client.isActive,
    // Copies (not shared references) so edits to the draft don't mutate the
    // shared clients array until "Salva Cliente" is clicked.
    selectedPackageIds: [...(client.packageIds || [])],
    channels: (client.channels || []).map((ch) => ({
      ...ch,
      includedPackageIds: [...(ch.includedPackageIds || [])],
    })),
  };
}

/** Left column: list of existing clients + "Nuovo Cliente" button. */
function ClientList({ clients, selectedClientId, onSelect, onNew }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button variant="primary" icon={Plus} onClick={onNew} style={{ marginBottom: 4 }}>
        Nuovo Destinatario
      </Button>
      {clients.map((client) => (
        <Card
          key={client.id}
          variant="bordered"
          interactive
          selected={client.id === selectedClientId}
          onClick={() => onSelect(client.id)}
          style={{ cursor: 'pointer', padding: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-primary)' }}>
              {client.name}
            </span>
            <StatusPill status={client.isActive ? 'Attivo' : 'Non attivo'} />
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', marginTop: 6 }}>
            {client.organization}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Identity + configuration form fields. */
function ClientForm({ draft, onChange }) {
  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Dettagli Destinatario
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: '1 1 0%' }}>
          <TextField
            label="Nome destinatario"
            required
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Es. Meridiano News Srl"
          />
        </div>
        <div style={{ flex: '1 1 0%' }}>
          <TextField
            label="Organizzazione"
            value={draft.organization}
            onChange={(e) => onChange({ ...draft, organization: e.target.value })}
            placeholder="Es. Meridiano Media Group"
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: '1 1 0%' }}>
          <TextField
            label="Email di riferimento"
            required
            value={draft.email}
            onChange={(e) => onChange({ ...draft, email: e.target.value })}
            placeholder="Es. tech@destinatario.it"
          />
        </div>
        <div style={{ flex: '1 1 0%' }}>
          <Select
            label="Tipo destinatario"
            value={draft.type}
            onChange={(v) => onChange({ ...draft, type: v })}
            options={TYPE_OPTIONS}
          />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <Label>Note interne</Label>
        <div className="neon neon-input neon-textarea">
          <textarea
            className="neon-input__control"
            value={draft.notes}
            onChange={(e) => onChange({ ...draft, notes: e.target.value })}
            placeholder="Note visibili solo internamente"
            rows={3}
          />
        </div>
      </div>
      <div>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-label)', marginBottom: 6 }}>
          Stato
        </div>
        <ToggleGroup
          items={STATUS_ITEMS}
          value={draft.isActive}
          onChange={(v) => onChange({ ...draft, isActive: v })}
        />
      </div>
    </Card>
  );
}

/** Searchable multi-select checklist of ALL packages (reads the live `packages` prop). */
function PackageChecklist({ packages, selectedPackageIds, onToggle }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter((p) => p.name.toLowerCase().includes(q));
  }, [packages, query]);

  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Pacchetti Assegnati
      </div>
      <div style={{ marginBottom: 12 }}>
        <TextField
          icon={Search}
          placeholder="Cerca pacchetto per nome…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          clearable
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
            Nessun pacchetto corrisponde alla ricerca.
          </div>
        )}
        {filtered.map((pkg) => {
          const isSelected = selectedPackageIds.includes(pkg.id);
          return (
            <div
              key={pkg.id}
              onClick={() => onToggle(pkg.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 4px',
                borderTop: '1px solid var(--hairline)',
                cursor: 'pointer',
              }}
            >
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
              <span style={{ flex: '1 1 0%', fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-primary)' }}>
                {pkg.name}
              </span>
              <Chip kind="info" color="blue">{pkg.level}</Chip>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', minWidth: 80, textAlign: 'right' }}>
                {(pkg.productIds || []).length} prodotti
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** One channel row: identity chips, inclusion count, remove/expand controls, and (when expanded) a package-inclusion checklist. */
function ChannelRow({ channel, selectedPackageIds, packagesById, expanded, onToggleExpand, onTogglePackage }) {
  return (
    <Card variant="bordered" style={{ marginBottom: 8, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: '1 1 0%', fontSize: 'var(--text-sm)', fontFamily: 'monospace', color: 'var(--color-text-neutral-primary)' }}>
          {channel.name}
        </span>
        <Chip kind="info" color="blue">{channel.type}</Chip>
        <Chip kind="info" color="grey">{channel.mode}</Chip>
        <StatusPill status={channel.status} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', whiteSpace: 'nowrap' }}>
          {(channel.includedPackageIds || []).length}/{selectedPackageIds.length} inclusi
        </span>
        <Button variant="ghost" size="sm" onClick={() => {}}>Rimuovi</Button>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          icon={expanded ? ChevronUp : ChevronDown}
          aria-label={expanded ? 'Comprimi' : 'Espandi'}
          onClick={() => onToggleExpand(channel.id)}
        />
      </div>
      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {selectedPackageIds.length === 0 && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
              Nessun pacchetto assegnato a questo destinatario.
            </div>
          )}
          {selectedPackageIds.map((pkgId) => {
            const pkg = packagesById.get(pkgId);
            const isIncluded = (channel.includedPackageIds || []).includes(pkgId);
            return (
              <div
                key={pkgId}
                onClick={() => onTogglePackage(channel.id, pkgId)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', cursor: 'pointer' }}
              >
                {isIncluded ? <CheckSquare size={16} /> : <Square size={16} />}
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-primary)' }}>
                  {pkg ? pkg.name : pkgId}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Channel accordion: existing channels + "+ Assegna canale" (opens an explanatory no-op modal). */
function ChannelAccordion({ channels, selectedPackageIds, packages, expandedChannelId, onToggleExpand, onTogglePackage }) {
  const [modalOpen, setModalOpen] = useState(false);
  const packagesById = useMemo(() => new Map(packages.map((p) => [p.id, p])), [packages]);

  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Canali di Consegna
      </div>
      {channels.length === 0 && (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', marginBottom: 12 }}>
          Nessun canale configurato per questo destinatario.
        </div>
      )}
      {channels.map((channel) => (
        <ChannelRow
          key={channel.id}
          channel={channel}
          selectedPackageIds={selectedPackageIds}
          packagesById={packagesById}
          expanded={expandedChannelId === channel.id}
          onToggleExpand={onToggleExpand}
          onTogglePackage={onTogglePackage}
        />
      ))}
      <Button
        variant="tertiary"
        icon={Plus}
        onClick={() => setModalOpen(true)}
        style={{ borderStyle: 'dashed', width: '100%', justifyContent: 'center' }}
      >
        Assegna canale
      </Button>
      <Modal
        open={modalOpen}
        title="Assegna canale"
        onClose={() => setModalOpen(false)}
        footer={<Button variant="primary" onClick={() => setModalOpen(false)}>Chiudi</Button>}
      >
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-primary)' }}>
          La configurazione dei canali di consegna non è disponibile in questa demo.
        </div>
      </Modal>
    </Card>
  );
}

/** Right summary panel: identity, contact, assigned packages, active channels. */
function SummaryPanel({ draft, packages }) {
  const assignedPackages = useMemo(
    () => packages.filter((p) => draft.selectedPackageIds.includes(p.id)),
    [packages, draft.selectedPackageIds]
  );

  return (
    <div>
      <Card variant="bordered" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)' }}>
          {draft.name || 'Nuovo destinatario'}
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', marginTop: 2, marginBottom: 10 }}>
          {draft.organization || '—'} · {draft.type}
        </div>
        <div style={{ marginBottom: 10 }}>
          <StatusPill status={draft.isActive ? 'Attivo' : 'Non attivo'} />
        </div>
        <KeyValue label="Email">{draft.email || '—'}</KeyValue>
      </Card>

      <Card variant="bordered" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
          Pacchetti Assegnati
        </div>
        {assignedPackages.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
            Nessun pacchetto assegnato.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {assignedPackages.map((p) => (
              <Chip key={p.id} kind="info" color="blue">{p.name}</Chip>
            ))}
          </div>
        )}
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)' }}>
          {assignedPackages.length} di {packages.length} pacchetti attivati
        </div>
      </Card>

      <Card variant="bordered">
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
          Canali Attivi
        </div>
        {draft.channels.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
            Nessun canale configurato.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {draft.channels.map((ch) => (
              <div key={ch.id} style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'monospace', color: 'var(--color-text-neutral-primary)' }}>
                  {ch.name}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)' }}>
                  {(ch.includedPackageIds || []).length} pkg
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/** Clienti — receivers configuration section: list, form, package checklist, channel accordion, live summary. */
export function Clienti({ clients, setClients, packages }) {
  const [selectedClientId, setSelectedClientId] = useState(clients.length > 0 ? clients[0].id : null);
  const [draft, setDraft] = useState(() => {
    const first = clients.length > 0 ? clients[0] : null;
    return first ? draftFromClient(first) : blankDraft();
  });
  const [expandedChannelId, setExpandedChannelId] = useState(null);

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || null,
    [clients, selectedClientId]
  );

  useEffect(() => {
    if (selectedClient) {
      setDraft(draftFromClient(selectedClient));
    } else {
      setDraft(blankDraft());
    }
    setExpandedChannelId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClientId]);

  function handleNew() {
    setSelectedClientId(null);
    setDraft(blankDraft());
    setExpandedChannelId(null);
  }

  function togglePackage(packageId) {
    setDraft((prev) => {
      const isSelected = prev.selectedPackageIds.includes(packageId);
      return {
        ...prev,
        selectedPackageIds: isSelected
          ? prev.selectedPackageIds.filter((id) => id !== packageId)
          : [...prev.selectedPackageIds, packageId],
      };
    });
  }

  function toggleChannelExpand(channelId) {
    setExpandedChannelId((prev) => (prev === channelId ? null : channelId));
  }

  function toggleChannelPackage(channelId, packageId) {
    setDraft((prev) => ({
      ...prev,
      channels: prev.channels.map((ch) => {
        if (ch.id !== channelId) return ch;
        const included = ch.includedPackageIds || [];
        const isIncluded = included.includes(packageId);
        return {
          ...ch,
          includedPackageIds: isIncluded
            ? included.filter((id) => id !== packageId)
            : [...included, packageId],
        };
      }),
    }));
  }

  function handleSave() {
    if (!draft.name.trim() || !draft.email.trim()) return;
    if (selectedClientId == null) {
      const newClient = {
        id: `client-${Date.now()}`,
        name: draft.name.trim(),
        organization: draft.organization,
        email: draft.email.trim(),
        type: draft.type,
        isActive: draft.isActive,
        notes: draft.notes,
        packageIds: draft.selectedPackageIds,
        channels: draft.channels,
      };
      setClients((prev) => [...prev, newClient]);
      setSelectedClientId(newClient.id);
    } else {
      setClients((prev) =>
        prev.map((client) =>
          client.id === selectedClientId
            ? {
                ...client,
                name: draft.name.trim(),
                organization: draft.organization,
                email: draft.email.trim(),
                type: draft.type,
                isActive: draft.isActive,
                notes: draft.notes,
                packageIds: draft.selectedPackageIds,
                channels: draft.channels,
              }
            : client
        )
      );
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)' }}>
          Destinatari
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', marginTop: 4 }}>
          Gestisci i destinatari e i pacchetti a loro assegnati.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 260px', minWidth: 0 }}>
          <ClientList
            clients={clients}
            selectedClientId={selectedClientId}
            onSelect={setSelectedClientId}
            onNew={handleNew}
          />
        </div>
        <div style={{ flex: '2 1 0%', minWidth: 0 }}>
          <ClientForm draft={draft} onChange={setDraft} />
          <PackageChecklist
            packages={packages}
            selectedPackageIds={draft.selectedPackageIds}
            onToggle={togglePackage}
          />
          <ChannelAccordion
            channels={draft.channels}
            selectedPackageIds={draft.selectedPackageIds}
            packages={packages}
            expandedChannelId={expandedChannelId}
            onToggleExpand={toggleChannelExpand}
            onTogglePackage={toggleChannelPackage}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" icon={Check} onClick={handleSave}>Salva Destinatario</Button>
            <Button variant="secondary" onClick={() => {}}>Salva Bozza</Button>
          </div>
        </div>
        <div style={{ flex: '1 1 0%', minWidth: 0 }}>
          <SummaryPanel draft={draft} packages={packages} />
        </div>
      </div>
    </div>
  );
}

export default Clienti;
