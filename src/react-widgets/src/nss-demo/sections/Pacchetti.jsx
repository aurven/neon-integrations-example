import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Check, Search, CheckSquare, Square } from 'lucide-react';
import { Card } from '../design-system/components/data/Card.jsx';
import { KeyValue } from '../design-system/components/data/KeyValue.jsx';
import { TextField } from '../design-system/components/forms/TextField.jsx';
import { Select } from '../design-system/components/forms/Select.jsx';
import { Button } from '../design-system/components/forms/Button.jsx';
import { Chip } from '../design-system/components/forms/Chip.jsx';
import { ToggleGroup } from '../design-system/components/forms/ToggleGroup.jsx';

const LEVEL_OPTIONS = [
  { value: 'Standard', label: 'Standard' },
  { value: 'Enterprise', label: 'Enterprise' },
  { value: 'Premium', label: 'Premium' },
  { value: 'Personalizzato', label: 'Personalizzato' },
];

const FREQUENCY_OPTIONS = [
  { value: 'Tempo reale', label: 'In tempo reale' },
  { value: 'Ogni 5 minuti', label: '5 minuti' },
  { value: 'Ogni 15 minuti', label: '15 minuti' },
  { value: 'Orario', label: 'Orario' },
];

const SORT_OPTIONS = [
  { value: 'Più recenti prima', label: 'Più recenti prima' },
  { value: 'Data pubblicazione', label: 'Data pubblicazione' },
  { value: 'Punteggio urgenza', label: 'Punteggio urgenza' },
  { value: 'Peso personalizzato', label: 'Peso personalizzato' },
];

const AGE_LIMIT_OPTIONS = [
  { value: 'Nessun limite', label: 'Nessun limite' },
  { value: 'Ultimi 7 giorni', label: 'Ultimi 7 giorni' },
  { value: 'Ultimi 30 giorni', label: 'Ultimi 30 giorni' },
  { value: 'Ultimi 90 giorni', label: 'Ultimi 90 giorni' },
];

const STATUS_ITEMS = [
  { value: true, label: 'Attivo' },
  { value: false, label: 'Non attivo' },
];

const DOT_COLORS = [
  'var(--color-background-product-primary)',
  'var(--color-background-feedback-green)',
  'var(--color-background-feedback-red)',
  'var(--color-background-feedback-yellow)',
  'var(--color-background-feedback-blue)',
];

function blankDraft() {
  return {
    name: '',
    level: 'Standard',
    description: '',
    updateFrequency: 'Tempo reale',
    isActive: true,
    selectedProductIds: [],
    sortOrder: 'Più recenti prima',
    maxItemsPerResponse: 100,
    contentAgeLimitDays: 'Nessun limite',
  };
}

function draftFromPackage(pkg) {
  return {
    name: pkg.name,
    level: pkg.level,
    description: pkg.description,
    updateFrequency: pkg.updateFrequency,
    isActive: pkg.isActive,
    // Copy (not shared reference) so edits to the draft don't mutate the
    // shared packages array until "Salva Pacchetto" is clicked.
    selectedProductIds: [...(pkg.productIds || [])],
    sortOrder: pkg.sortOrder,
    maxItemsPerResponse: pkg.maxItemsPerResponse,
    contentAgeLimitDays: pkg.contentAgeLimitDays,
  };
}

/** Deterministic pseudo "added today" figure derived from a product's own fields. */
function addedTodayFor(product) {
  return (product.name.length * 3) % 50;
}

/** Left column: list of existing packages + "Nuovo Pacchetto" button. */
function PackageList({ packages, selectedPackageId, onSelect, onNew }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button variant="primary" icon={Plus} onClick={onNew} style={{ marginBottom: 4 }}>
        Nuovo Pacchetto
      </Button>
      {packages.map((pkg) => (
        <Card
          key={pkg.id}
          variant="bordered"
          interactive
          selected={pkg.id === selectedPackageId}
          onClick={() => onSelect(pkg.id)}
          style={{ cursor: 'pointer', padding: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-primary)' }}>
              {pkg.name}
            </span>
            <Chip kind="info" color="blue">{pkg.level}</Chip>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', marginTop: 6 }}>
            {(pkg.productIds || []).length} prodotti · {pkg.isActive ? 'Attivo' : 'Non attivo'}
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Identity + configuration form fields. */
function PackageForm({ draft, onChange }) {
  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Dettagli Pacchetto
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: '2 1 0%' }}>
          <TextField
            label="Nome Pacchetto"
            required
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Es. Enterprise News Pack"
          />
        </div>
        <div style={{ flex: '1 1 0%' }}>
          <Select
            label="Livello Pacchetto"
            value={draft.level}
            onChange={(v) => onChange({ ...draft, level: v })}
            options={LEVEL_OPTIONS}
          />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <TextField
          label="Descrizione"
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          placeholder="Breve descrizione del pacchetto"
        />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 0%' }}>
          <Select
            label="Frequenza Aggiornamento"
            value={draft.updateFrequency}
            onChange={(v) => onChange({ ...draft, updateFrequency: v })}
            options={FREQUENCY_OPTIONS}
          />
        </div>
        <div style={{ flex: '1 1 0%' }}>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-label)', marginBottom: 6 }}>
            Stato
          </div>
          <ToggleGroup
            items={STATUS_ITEMS}
            value={draft.isActive}
            onChange={(v) => onChange({ ...draft, isActive: v })}
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: '1 1 0%' }}>
          <Select
            label="Ordinamento"
            value={draft.sortOrder}
            onChange={(v) => onChange({ ...draft, sortOrder: v })}
            options={SORT_OPTIONS}
          />
        </div>
        <div style={{ flex: '1 1 0%' }}>
          <TextField
            label="Max elementi per risposta"
            value={draft.maxItemsPerResponse}
            onChange={(e) => onChange({ ...draft, maxItemsPerResponse: Number(e.target.value) || 0 })}
            inputProps={{ type: 'number', min: 0 }}
          />
        </div>
        <div style={{ flex: '1 1 0%' }}>
          <Select
            label="Limite età contenuto"
            value={draft.contentAgeLimitDays}
            onChange={(v) => onChange({ ...draft, contentAgeLimitDays: v })}
            options={AGE_LIMIT_OPTIONS}
          />
        </div>
      </div>
    </Card>
  );
}

/** Searchable multi-select checklist of ALL products (reads the live `products` prop). */
function ProductChecklist({ products, selectedProductIds, onToggle }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Prodotti Inclusi
      </div>
      <div style={{ marginBottom: 12 }}>
        <TextField
          icon={Search}
          placeholder="Cerca prodotto per nome…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          clearable
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
            Nessun prodotto corrisponde alla ricerca.
          </div>
        )}
        {filtered.map((p) => {
          const isSelected = selectedProductIds.includes(p.id);
          return (
            <div
              key={p.id}
              onClick={() => onToggle(p.id)}
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
                {p.name}
              </span>
              <Chip kind="info" color="blue">{p.category}</Chip>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', minWidth: 80, textAlign: 'right' }}>
                {p.matchedItemCount.toLocaleString('it-IT')} elementi
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Right summary panel: 2x2 stat grid, product breakdown, assigned clients, config recap. */
function SummaryPanel({ pkg, draft, selectedProducts, clients }) {
  const totalItems = useMemo(
    () => selectedProducts.reduce((sum, p) => sum + (p.matchedItemCount || 0), 0),
    [selectedProducts]
  );
  const addedToday = useMemo(
    () => selectedProducts.reduce((sum, p) => sum + addedTodayFor(p), 0),
    [selectedProducts]
  );
  const assignedClients = useMemo(() => {
    if (!pkg) return [];
    return (clients || []).filter((c) => (c.packageIds || []).includes(pkg.id));
  }, [clients, pkg]);

  const stats = [
    { label: 'PRODOTTI', value: draft.selectedProductIds.length },
    { label: 'ELEMENTI TOTALI', value: totalItems.toLocaleString('it-IT') },
    { label: 'AGGIUNTI OGGI', value: addedToday.toLocaleString('it-IT') },
    { label: 'DESTINATARI CHE LO USANO', value: assignedClients.length },
  ];

  return (
    <div>
      <Card variant="bordered" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {stats.map((s) => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-label)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {s.label}
              </div>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginTop: 6 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card variant="bordered" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
          Composizione Prodotti
        </div>
        {selectedProducts.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
            Nessun prodotto selezionato.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {selectedProducts.map((p, idx) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    flex: '0 0 auto',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: DOT_COLORS[idx % DOT_COLORS.length],
                  }}
                />
                <span style={{ flex: '1 1 0%', fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-primary)' }}>
                  {p.name}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)' }}>
                  {p.matchedItemCount.toLocaleString('it-IT')}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card variant="bordered" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
          Destinatari Assegnati
        </div>
        {assignedClients.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
            Nessun destinatario utilizza questo pacchetto.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {assignedClients.map((c) => (
              <Chip key={c.id} kind="info" color="grey">{c.name}</Chip>
            ))}
          </div>
        )}
      </Card>

      <Card variant="bordered">
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
          Configurazione
        </div>
        <KeyValue label="Livello">{draft.level}</KeyValue>
        <KeyValue label="Frequenza">{FREQUENCY_OPTIONS.find((o) => o.value === draft.updateFrequency)?.label || draft.updateFrequency}</KeyValue>
        <KeyValue label="Ordinamento">{draft.sortOrder}</KeyValue>
        <KeyValue label="Limite età">{draft.contentAgeLimitDays}</KeyValue>
        <KeyValue label="Deduplicazione">Per ID articolo</KeyValue>
      </Card>
    </div>
  );
}

/** Pacchetti — package configuration section: list, form, product checklist, live summary. */
export function Pacchetti({ packages, setPackages, products, clients }) {
  const [selectedPackageId, setSelectedPackageId] = useState(packages.length > 0 ? packages[0].id : null);
  const [draft, setDraft] = useState(() => {
    const first = packages.length > 0 ? packages[0] : null;
    return first ? draftFromPackage(first) : blankDraft();
  });

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.id === selectedPackageId) || null,
    [packages, selectedPackageId]
  );

  useEffect(() => {
    if (selectedPackage) {
      setDraft(draftFromPackage(selectedPackage));
    } else {
      setDraft(blankDraft());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPackageId]);

  // Always derived live from the `products` prop — never a local shadow copy.
  const selectedProducts = useMemo(
    () => products.filter((p) => draft.selectedProductIds.includes(p.id)),
    [products, draft.selectedProductIds]
  );

  function handleNew() {
    setSelectedPackageId(null);
    setDraft(blankDraft());
  }

  function toggleProduct(productId) {
    setDraft((prev) => {
      const isSelected = prev.selectedProductIds.includes(productId);
      return {
        ...prev,
        selectedProductIds: isSelected
          ? prev.selectedProductIds.filter((id) => id !== productId)
          : [...prev.selectedProductIds, productId],
      };
    });
  }

  function handleSave() {
    if (!draft.name.trim()) return;
    if (selectedPackageId == null) {
      const newPackage = {
        id: `pkg-${Date.now()}`,
        name: draft.name.trim(),
        level: draft.level,
        description: draft.description,
        updateFrequency: draft.updateFrequency,
        isActive: draft.isActive,
        productIds: draft.selectedProductIds,
        sortOrder: draft.sortOrder,
        maxItemsPerResponse: draft.maxItemsPerResponse,
        contentAgeLimitDays: draft.contentAgeLimitDays,
        assignedClientIds: [],
      };
      setPackages((prev) => [...prev, newPackage]);
      setSelectedPackageId(newPackage.id);
    } else {
      setPackages((prev) =>
        prev.map((pkg) =>
          pkg.id === selectedPackageId
            ? {
                ...pkg,
                name: draft.name.trim(),
                level: draft.level,
                description: draft.description,
                updateFrequency: draft.updateFrequency,
                isActive: draft.isActive,
                productIds: draft.selectedProductIds,
                sortOrder: draft.sortOrder,
                maxItemsPerResponse: draft.maxItemsPerResponse,
                contentAgeLimitDays: draft.contentAgeLimitDays,
              }
            : pkg
        )
      );
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)' }}>
          Pacchetti
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', marginTop: 4 }}>
          Componi i pacchetti di distribuzione a partire dai prodotti editoriali.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 260px', minWidth: 0 }}>
          <PackageList
            packages={packages}
            selectedPackageId={selectedPackageId}
            onSelect={setSelectedPackageId}
            onNew={handleNew}
          />
        </div>
        <div style={{ flex: '2 1 0%', minWidth: 0 }}>
          <PackageForm draft={draft} onChange={setDraft} />
          <ProductChecklist
            products={products}
            selectedProductIds={draft.selectedProductIds}
            onToggle={toggleProduct}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" icon={Check} onClick={handleSave}>Salva Pacchetto</Button>
            <Button variant="secondary" onClick={() => {}}>Salva Bozza</Button>
          </div>
        </div>
        <div style={{ flex: '1 1 0%', minWidth: 0 }}>
          <SummaryPanel
            pkg={selectedPackage}
            draft={draft}
            selectedProducts={selectedProducts}
            clients={clients}
          />
        </div>
      </div>
    </div>
  );
}

export default Pacchetti;
