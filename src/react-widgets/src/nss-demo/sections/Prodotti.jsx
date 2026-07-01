import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../design-system/components/data/Card.jsx';
import { TextField } from '../design-system/components/forms/TextField.jsx';
import { Select } from '../design-system/components/forms/Select.jsx';
import { Button } from '../design-system/components/forms/Button.jsx';
import { Chip } from '../design-system/components/forms/Chip.jsx';
import { ToggleGroup } from '../design-system/components/forms/ToggleGroup.jsx';

const CATEGORY_OPTIONS = [
  { value: 'News', label: 'News' },
  { value: 'Sport', label: 'Sport' },
  { value: 'Finance', label: 'Finance' },
  { value: 'Politics', label: 'Politics' },
  { value: 'Tech', label: 'Tech' },
];

const FAMILY_OPTIONS = [
  { value: 'Argomento', label: 'Argomento' },
  { value: 'Urgenza', label: 'Urgenza' },
  { value: 'Formato', label: 'Formato' },
  { value: 'Canale', label: 'Canale' },
  { value: 'Lingua', label: 'Lingua' },
  { value: 'Sezione', label: 'Sezione' },
  { value: 'Tag', label: 'Tag' },
];

const AND_OR_ITEMS = [
  { value: 'AND', label: 'AND' },
  { value: 'OR', label: 'OR' },
];

function blankCondition() {
  return { family: 'Argomento', matchType: 'is', values: [] };
}

function blankGroup() {
  return { type: 'INCLUDI', operator: 'AND', conditions: [blankCondition()] };
}

function blankDraft() {
  return {
    name: '',
    category: 'News',
    description: '',
    rules: { mode: 'ALL', groups: [blankGroup()] },
  };
}

function draftFromProduct(product) {
  return {
    name: product.name,
    category: product.category,
    description: product.description,
    // Deep-clone rules so edits to the draft don't mutate the shared products array
    // until "Salva Prodotto" is clicked.
    rules: JSON.parse(JSON.stringify(product.rules)),
  };
}

/** Pseudo-random-feeling but deterministic recompute of the live match count from the current rules. */
function computeMatchedItemCount(baseCount, rules) {
  let active = 0;
  let excluded = 0;
  (rules?.groups || []).forEach((group) => {
    group.conditions.forEach((cond) => {
      if (!cond.values || cond.values.length === 0) return;
      if (group.type === 'ESCLUDI') {
        excluded += cond.values.length;
      } else {
        active += cond.values.length;
      }
    });
  });
  const raw = baseCount + active * 37 - excluded * 19;
  return Math.max(12, Math.min(9999, Math.round(raw)));
}

/** Left column: list of existing products + "Nuovo Prodotto" button. */
function ProductList({ products, selectedProductId, onSelect, onNew }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Button variant="primary" icon="IconAdd" onClick={onNew} style={{ marginBottom: 4 }}>
        Nuovo Prodotto
      </Button>
      {products.map((p) => (
        <Card
          key={p.id}
          variant="bordered"
          interactive
          selected={p.id === selectedProductId}
          onClick={() => onSelect(p.id)}
          style={{ cursor: 'pointer', padding: 12 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-primary)' }}>
              {p.name}
            </span>
            <Chip kind="info" color="blue">{p.category}</Chip>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', marginTop: 6 }}>
            {p.matchedItemCount.toLocaleString('it-IT')} elementi
          </div>
        </Card>
      ))}
    </div>
  );
}

/** Identity fields: Nome Prodotto / Categoria / Descrizione. */
function IdentityForm({ draft, onChange }) {
  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Identità Prodotto
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: '2 1 0%' }}>
          <TextField
            label="Nome Prodotto"
            required
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="Es. IT Breaking News"
          />
        </div>
        <div style={{ flex: '1 1 0%' }}>
          <Select
            label="Categoria"
            value={draft.category}
            onChange={(v) => onChange({ ...draft, category: v })}
            options={CATEGORY_OPTIONS}
          />
        </div>
      </div>
      <TextField
        label="Descrizione"
        value={draft.description}
        onChange={(e) => onChange({ ...draft, description: e.target.value })}
        placeholder="Breve descrizione del prodotto"
      />
    </Card>
  );
}

/** One condition row: family select, values as removable chips, add-tag input. */
function ConditionRow({ condition, onChange, onRemove }) {
  const [tagInput, setTagInput] = useState('');

  function addTag() {
    const v = tagInput.trim();
    if (!v) return;
    if (condition.values.includes(v)) {
      setTagInput('');
      return;
    }
    onChange({ ...condition, values: [...condition.values, v] });
    setTagInput('');
  }

  function removeTag(idx) {
    onChange({ ...condition, values: condition.values.filter((_, i) => i !== idx) });
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderTop: '1px solid var(--hairline)' }}>
      <div style={{ flex: '0 0 160px' }}>
        <Select
          size="sm"
          value={condition.family}
          onChange={(v) => onChange({ ...condition, family: v })}
          options={FAMILY_OPTIONS}
        />
      </div>
      <div style={{ flex: '0 0 auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', paddingTop: 8, whiteSpace: 'nowrap' }}>
        includi qualunque
      </div>
      <div style={{ flex: '1 1 0%', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        {condition.values.map((v, idx) => (
          <Chip key={`${v}-${idx}`} kind="input" onRemove={() => removeTag(idx)}>{v}</Chip>
        ))}
        <div style={{ minWidth: 140 }}>
          <TextField
            size="sm"
            placeholder="Aggiungi valore + Invio"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            inputProps={{
              onKeyDown: (e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTag();
                }
              },
            }}
          />
        </div>
      </div>
      <Button variant="tertiary" size="sm" iconOnly icon="IconDelete" aria-label="Rimuovi condizione" onClick={onRemove} />
    </div>
  );
}

/** One rule group (INCLUDI/ESCLUDI card) with AND/OR toggle and its condition rows. */
function RuleGroup({ group, onChange, onRemove }) {
  function updateCondition(idx, next) {
    const conditions = group.conditions.map((c, i) => (i === idx ? next : c));
    onChange({ ...group, conditions });
  }

  function removeCondition(idx) {
    onChange({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) });
  }

  function addCondition() {
    onChange({ ...group, conditions: [...group.conditions, blankCondition()] });
  }

  return (
    <Card variant="bordered" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Chip kind="info" color={group.type === 'INCLUDI' ? 'green' : 'red'}>{group.type}</Chip>
          <ToggleGroup
            items={AND_OR_ITEMS}
            value={group.operator}
            onChange={(v) => onChange({ ...group, operator: v })}
          />
        </div>
        <Button variant="tertiary" size="sm" icon="IconDelete" onClick={onRemove}>Rimuovi gruppo</Button>
      </div>
      {group.conditions.map((cond, idx) => (
        <ConditionRow
          key={idx}
          condition={cond}
          onChange={(next) => updateCondition(idx, next)}
          onRemove={() => removeCondition(idx)}
        />
      ))}
      <div style={{ marginTop: 8 }}>
        <Button variant="tertiary" size="sm" icon="IconAdd" onClick={addCondition}>+ Aggiungi condizione</Button>
      </div>
    </Card>
  );
}

/** Full query-rule-builder: list of groups + "+ Aggiungi gruppo". */
function QueryRuleBuilder({ rules, onChange }) {
  function updateGroup(idx, next) {
    const groups = rules.groups.map((g, i) => (i === idx ? next : g));
    onChange({ ...rules, groups });
  }

  function removeGroup(idx) {
    onChange({ ...rules, groups: rules.groups.filter((_, i) => i !== idx) });
  }

  function addGroup() {
    onChange({ ...rules, groups: [...rules.groups, blankGroup()] });
  }

  return (
    <Card variant="bordered" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
        Regole di Query
      </div>
      {rules.groups.map((group, idx) => (
        <RuleGroup
          key={idx}
          group={group}
          onChange={(next) => updateGroup(idx, next)}
          onRemove={() => removeGroup(idx)}
        />
      ))}
      <Button variant="secondary" size="sm" icon="IconAdd" onClick={addGroup}>+ Aggiungi gruppo</Button>
    </Card>
  );
}

/** Right summary panel: live match count, volume bars, recent matches, used-in-packages. */
function SummaryPanel({ product, draft, matchedItemCount, packages }) {
  const maxVolume = useMemo(() => {
    if (!product?.volumeByDay?.length) return 1;
    return Math.max(...product.volumeByDay.map((d) => d.count), 1);
  }, [product]);

  const usedInPackages = useMemo(() => {
    if (!product) return [];
    return (packages || []).filter((pkg) => (pkg.productIds || []).includes(product.id));
  }, [packages, product]);

  return (
    <div>
      <Card variant="bordered" style={{ marginBottom: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text-neutral-label)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Elementi Corrispondenti
        </div>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginTop: 8 }}>
          {matchedItemCount.toLocaleString('it-IT')}
        </div>
      </Card>

      {product && (
        <>
          <Card variant="bordered" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
              Volume per Giorno
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {product.volumeByDay.map((d) => (
                <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: '0 0 28px', fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)' }}>{d.day}</div>
                  <div style={{ flex: '1 1 0%', background: 'var(--color-background-neutral-secondary)', borderRadius: 4, overflow: 'hidden', height: 8 }}>
                    <div
                      style={{
                        width: `${Math.round((d.count / maxVolume) * 100)}%`,
                        height: '100%',
                        background: 'var(--color-background-brand)',
                      }}
                    />
                  </div>
                  <div style={{ flex: '0 0 32px', fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', textAlign: 'right' }}>{d.count}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="bordered" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
              Corrispondenze Recenti
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {product.recentMatches.map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span
                    style={{
                      flex: '0 0 auto',
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      marginTop: 5,
                      background: m.isUrgent ? 'var(--color-background-feedback-red)' : 'var(--color-background-feedback-green)',
                    }}
                  />
                  <div style={{ flex: '1 1 0%' }}>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-primary)' }}>{m.headline}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)', marginTop: 2 }}>{m.timeAgo}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card variant="bordered">
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)', marginBottom: 12 }}>
              Usato nei Pacchetti
            </div>
            {usedInPackages.length === 0 ? (
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)' }}>
                Nessun pacchetto utilizza questo prodotto.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {usedInPackages.map((pkg) => (
                  <div key={pkg.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-primary)' }}>{pkg.name}</span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-neutral-label)' }}>
                      {(pkg.assignedClientIds || []).length} clienti
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/** Prodotti — product catalogue section: list, identity form, query-rule-builder, live summary. */
export function Prodotti({ products, setProducts, packages }) {
  const [selectedProductId, setSelectedProductId] = useState(products.length > 0 ? products[0].id : null);
  const [draft, setDraft] = useState(() => {
    const first = products.length > 0 ? products[0] : null;
    return first ? draftFromProduct(first) : blankDraft();
  });

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId]
  );

  useEffect(() => {
    if (selectedProduct) {
      setDraft(draftFromProduct(selectedProduct));
    } else {
      setDraft(blankDraft());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductId]);

  const baseCount = selectedProduct ? selectedProduct.matchedItemCount : 120;
  const liveMatchedItemCount = useMemo(
    () => computeMatchedItemCount(baseCount, draft.rules),
    [baseCount, draft.rules]
  );

  function handleNew() {
    setSelectedProductId(null);
    setDraft(blankDraft());
  }

  function handleSave() {
    if (!draft.name.trim()) return;
    if (selectedProductId == null) {
      const newProduct = {
        id: `prod-${Date.now()}`,
        name: draft.name.trim(),
        category: draft.category,
        description: draft.description,
        matchedItemCount: liveMatchedItemCount,
        lastSaved: new Date().toISOString(),
        volumeByDay: [
          { day: 'Lun', count: 0 },
          { day: 'Mar', count: 0 },
          { day: 'Mer', count: 0 },
          { day: 'Gio', count: 0 },
          { day: 'Ven', count: 0 },
          { day: 'Sab', count: 0 },
          { day: 'Dom', count: 0 },
        ],
        recentMatches: [],
        rules: draft.rules,
      };
      setProducts((prev) => [...prev, newProduct]);
      setSelectedProductId(newProduct.id);
    } else {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selectedProductId
            ? { ...p, ...draft, matchedItemCount: liveMatchedItemCount, lastSaved: new Date().toISOString() }
            : p
        )
      );
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color: 'var(--color-text-neutral-primary)' }}>
          Prodotti
        </div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-neutral-label)', marginTop: 4 }}>
          Configura i prodotti editoriali e le regole di corrispondenza dei contenuti.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 260px', minWidth: 0 }}>
          <ProductList
            products={products}
            selectedProductId={selectedProductId}
            onSelect={setSelectedProductId}
            onNew={handleNew}
          />
        </div>
        <div style={{ flex: '2 1 0%', minWidth: 0 }}>
          <IdentityForm draft={draft} onChange={setDraft} />
          <QueryRuleBuilder rules={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" icon="IconCheck" onClick={handleSave}>Salva Prodotto</Button>
            <Button variant="secondary" onClick={() => {}}>Salva Bozza</Button>
          </div>
        </div>
        <div style={{ flex: '1 1 0%', minWidth: 0 }}>
          <SummaryPanel
            product={selectedProduct}
            draft={draft}
            matchedItemCount={liveMatchedItemCount}
            packages={packages}
          />
        </div>
      </div>
    </div>
  );
}

export default Prodotti;
