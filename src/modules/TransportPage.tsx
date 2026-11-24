import { useState } from 'react';
import { mod, paths, removeIn, saveIn, saveStudent, uid } from '../data/api';
import { useQuery } from '../data/hooks';
import type { BusRoute, StudentProfile } from '../data/types';
import { friendlyError } from '../lib/errors';
import { useToast } from '../ui/toast';
import { useSchool } from '../school/SchoolContext';
import './ops.css';

const naira = (n: number) => '₦' + (n || 0).toLocaleString('en-NG');

export function TransportPage() {
  const { schoolId, isAdmin } = useSchool();
  const toast = useToast();
  const routes = useQuery<BusRoute>(mod(schoolId, 'routes'), `routes:${schoolId}`);
  // Only admins can read the whole student roster, so riders are shown to admins.
  const students = useQuery<StudentProfile>(isAdmin ? paths.students(schoolId) : null, `tr-students:${schoolId}:${isAdmin}`);

  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [driver, setDriver] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [stops, setStops] = useState('');
  const [fee, setFee] = useState('');
  const reset = () => {
    setEditId(null);
    setName('');
    setDriver('');
    setDriverPhone('');
    setStops('');
    setFee('');
  };
  const edit = (r: BusRoute) => {
    setEditId(r.id);
    setName(r.name);
    setDriver(r.driver);
    setDriverPhone(r.driverPhone);
    setStops(r.stops);
    setFee(String(r.fee));
  };
  const save = async () => {
    try {
      const route: BusRoute = { id: editId ?? uid(), name: name.trim(), driver: driver.trim(), driverPhone: driverPhone.trim(), stops: stops.trim(), fee: Math.max(0, Number(fee) || 0), at: Date.now() };
      await saveIn(schoolId, 'routes', route);
      toast(editId ? 'Route updated.' : 'Route added.');
      reset();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };
  const remove = async (r: BusRoute) => {
    try {
      await removeIn(schoolId, 'routes', r.id);
      if (editId === r.id) reset();
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const setRoute = async (s: StudentProfile, routeId: string | null) => {
    try {
      if (routeId) {
        await saveStudent(schoolId, { ...s, routeId });
      } else {
        const { routeId: _drop, ...rest } = s;
        void _drop;
        await saveStudent(schoolId, rest as StudentProfile);
      }
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const unassigned = students.data.filter((s) => !s.routeId).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="display-sm">Transport</h1>
          <p className="lede">Bus routes, drivers and who rides each one.</p>
        </div>
        {isAdmin && routes.data.length > 0 && (
          <div className="head-actions">
            <button className="pill ghost" onClick={() => window.print()}>
              Print rider lists
            </button>
          </div>
        )}
      </header>

      {isAdmin && (
        <section className="panel wide">
          <h2 className="h3">{editId ? 'Edit route' : 'Add a route'}</h2>
          <div className="form-grid">
            <label className="field">
              <span className="mono">Route name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ikeja line" />
            </label>
            <label className="field">
              <span className="mono">Termly fee</span>
              <input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="25000" />
            </label>
            <label className="field">
              <span className="mono">Driver</span>
              <input value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Driver's name" />
            </label>
            <label className="field">
              <span className="mono">Driver phone</span>
              <input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} placeholder="080..." />
            </label>
          </div>
          <label className="field">
            <span className="mono">Stops</span>
            <textarea className="ruled" rows={2} value={stops} onChange={(e) => setStops(e.target.value)} placeholder="Allen Avenue, Opebi, Oregun" />
          </label>
          <div className="row-actions">
            {editId ? (
              <button className="link" onClick={reset}>
                Cancel edit
              </button>
            ) : (
              <span />
            )}
            <button className="ticket" onClick={save} disabled={!name.trim()}>
              {editId ? 'Save route' : 'Add route'}
            </button>
          </div>
        </section>
      )}

      {routes.data.length === 0 && <p className="muted">No routes yet.</p>}

      {routes.data.map((r) => {
        const riders = students.data.filter((s) => s.routeId === r.id).sort((a, b) => a.name.localeCompare(b.name));
        return (
          <section className="panel wide" key={r.id}>
            <div className="panel-head">
              <h2 className="h3">{r.name}</h2>
              <span className="mono muted">{isAdmin ? `${riders.length} riders` : naira(r.fee) + ' a term'}</span>
            </div>
            <dl className="rc-who">
              <div>
                <dt>Driver</dt>
                <dd>{r.driver || '—'}</dd>
              </div>
              <div>
                <dt>Phone</dt>
                <dd>{r.driverPhone || '—'}</dd>
              </div>
              <div>
                <dt>Termly fee</dt>
                <dd>{naira(r.fee)}</dd>
              </div>
            </dl>
            {r.stops && <p className="small muted">Stops: {r.stops}</p>}

            {isAdmin && (
              <>
                <h3 className="mono">Riders</h3>
                {riders.length === 0 ? (
                  <p className="muted small">No students on this route yet.</p>
                ) : (
                  <ul className="ops-riders">
                    {riders.map((s) => (
                      <li key={s.id}>
                        <span>
                          {s.name}
                          {s.guardians[0]?.name ? ` — ${s.guardians[0].name}` : ''}
                        </span>
                        <span className="ops-chiprow">
                          <span className="muted">{s.guardians[0]?.phone || 'No phone'}</span>
                          <button className="link danger" onClick={() => setRoute(s, null)}>
                            Remove
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <label className="field">
                  <span className="mono">Add a rider</span>
                  <select
                    value=""
                    onChange={(e) => {
                      const s = unassigned.find((x) => x.id === e.target.value);
                      if (s) setRoute(s, r.id);
                    }}
                  >
                    <option value="">Choose a student</option>
                    {unassigned.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="row-actions">
                  <button className="link" onClick={() => edit(r)}>
                    Edit route
                  </button>
                  <button className="link danger" onClick={() => remove(r)}>
                    Remove route
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
