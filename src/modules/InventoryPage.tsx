import { useState } from 'react';
import { mod, patchIn, removeIn, saveIn, uid } from '../data/api';
import { useQuery } from '../data/hooks';
import type { InventoryItem } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import './ops.css';
import { PrintExport } from '../components/PrintExport';
import { tableRows } from '../lib/print';

export function InventoryPage() {
  const { schoolId, isAdmin } = useSchool();
  const toast = useToast();
  const items = useQuery<InventoryItem>(mod(schoolId, 'inventory'), `inventory:${schoolId}`);

  const [find, setFind] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [quantity, setQuantity] = useState('0');
  const [reorderAt, setReorderAt] = useState('0');
  const [location, setLocation] = useState('');
  const reset = () => {
    setEditId(null);
    setName('');
    setCategory('');
    setQuantity('0');
    setReorderAt('0');
    setLocation('');
  };
  const edit = (it: InventoryItem) => {
    setEditId(it.id);
    setName(it.name);
    setCategory(it.category);
    setQuantity(String(it.quantity));
    setReorderAt(String(it.reorderAt));
    setLocation(it.location);
  };
  const save = async () => {
    try {
      const item: InventoryItem = {
        id: editId ?? uid(),
        name: name.trim(),
        category: category.trim(),
        quantity: Math.max(0, Number(quantity) || 0),
        reorderAt: Math.max(0, Number(reorderAt) || 0),
        location: location.trim(),
        at: Date.now(),
      };
      await saveIn(schoolId, 'inventory', item);
      toast(editId ? 'Item updated.' : 'Item added.');
      reset();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const remove = async (it: InventoryItem) => {
    try {
      await removeIn(schoolId, 'inventory', it.id);
      if (editId === it.id) reset();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const adjust = async (it: InventoryItem, delta: number) => {
    const next = Math.max(0, it.quantity + delta);
    if (next === it.quantity) return;
    try {
      await patchIn(schoolId, 'inventory', it.id, { quantity: next });
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const sorted = [...items.data].sort((a, b) => a.name.localeCompare(b.name));
  const low = sorted.filter((it) => it.quantity <= it.reorderAt);
  const shown = sorted.filter((it) => !find.trim() || `${it.name} ${it.category} ${it.location}`.toLowerCase().includes(find.trim().toLowerCase()));

  const stockCell = (it: InventoryItem) =>
    isAdmin ? (
      <span className="ops-adjust">
        <button type="button" aria-label={`Remove one ${it.name}`} onClick={() => adjust(it, -1)} disabled={it.quantity <= 0}>
          &minus;
        </button>
        <span className="ops-num">{it.quantity}</span>
        <button type="button" aria-label={`Add one ${it.name}`} onClick={() => adjust(it, 1)}>
          +
        </button>
      </span>
    ) : (
      <span className="ops-num">{it.quantity}</span>
    );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Inventory</h1>
          <p className="lede">Supplies and equipment, with a reorder level for each.</p>
        </div>
        <label className="field search">
          <span className="mono">Find an item</span>
          <input value={find} onChange={(e) => setFind(e.target.value)} placeholder="Name, category or location" />
        </label>
        <PrintExport title="Inventory" rows={() => tableRows(document.querySelector<HTMLTableElement>('.ws-main table'))} />
      </header>

      {low.length > 0 && (
        <section className="panel wide ops-low">
          <h2 className="h3">Low stock</h2>
          <ul className="ops-riders">
            {low.map((it) => (
              <li key={it.id}>
                <span>
                  {it.name}
                  {it.category ? <span className="muted small"> ({it.category})</span> : null}
                </span>
                <span className="muted ops-num">
                  {it.quantity} left, reorder at {it.reorderAt}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAdmin && (
        <section className="panel wide">
          <h2 className="h3">{editId ? 'Edit item' : 'Add an item'}</h2>
          <div className="form-grid">
            <label className="field">
              <span className="mono">Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Whiteboard markers" />
            </label>
            <label className="field">
              <span className="mono">Category</span>
              <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Stationery" />
            </label>
            <label className="field">
              <span className="mono">Quantity</span>
              <input type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </label>
            <label className="field">
              <span className="mono">Reorder at</span>
              <input type="number" min={0} value={reorderAt} onChange={(e) => setReorderAt(e.target.value)} />
            </label>
            <label className="field">
              <span className="mono">Location</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Store room A" />
            </label>
          </div>
          <div className="row-actions">
            {editId ? (
              <button className="link" onClick={reset}>
                Cancel edit
              </button>
            ) : (
              <span />
            )}
            <button className="ticket" onClick={save} disabled={!name.trim()}>
              {editId ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </section>
      )}

      <section className="panel wide">
        <h2 className="h3">All items</h2>
        {shown.length === 0 ? (
          <p className="muted">{items.data.length ? 'No items match your search.' : 'No items recorded yet.'}</p>
        ) : (
          <div className="table-wrap">
            <table className="gradebook">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Category</th>
                  <th scope="col">Location</th>
                  <th scope="col" className="num">In stock</th>
                  <th scope="col" className="num">Reorder at</th>
                  {isAdmin && <th scope="col" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {shown.map((it) => (
                  <tr key={it.id}>
                    <td className="gb-name">{it.name}</td>
                    <td>{it.category || '—'}</td>
                    <td>{it.location || '—'}</td>
                    <td className="num">{stockCell(it)}</td>
                    <td className="num ops-num">{it.reorderAt}</td>
                    {isAdmin && (
                      <td>
                        <div className="head-actions">
                          <button className="link" onClick={() => edit(it)}>
                            Edit
                          </button>
                          <button className="link danger" onClick={() => remove(it)}>
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
