'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { studioApi } from '@/lib/client-api';
import type { TerminologyRule } from '@/lib/terminology';
import { Maths } from './maths';
export function TerminologyRules({
  module,
  disabled,
}: {
  module: string;
  disabled: boolean;
}) {
  const [rules, setRules] = useState<TerminologyRule[]>([]),
    [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [editing, setEditing] = useState<TerminologyRule | null>(null),
    [avoid, setAvoid] = useState(''),
    [prefer, setPrefer] = useState(''),
    [reason, setReason] = useState('');
  async function load() {
    const data = await studioApi<{ rules: TerminologyRule[] }>(
      '/api/terminology?module=' + encodeURIComponent(module),
    );
    setRules(data.rules);
    setLoaded(true);
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function reset() {
    setEditing(null);
    setAvoid('');
    setPrefer('');
    setReason('');
  }
  return (
    <details
      className="terminology-rules"
      onToggle={(e) => {
        if (e.currentTarget.open && !loaded && !busy) void act(load);
      }}
    >
      <summary>Shared terminology rules · {module}</summary>
      <p className="hint">
        Save wording corrections for future questions across the team. A normal
        refinement changes only its question. Rules guide wording and cannot
        expand the syllabus.
      </p>
      {error && (
        <p className="error" role="alert">
          <Maths inline text={error} />
        </p>
      )}
      {message && (
        <output>
          <Maths inline text={message} />
        </output>
      )}
      <fieldset disabled={disabled || busy}>
        <Button variant="outline" onClick={() => act(load)}>
          Refresh rules
        </Button>
        {rules.map((rule) => (
          <div className="terminology-row" key={rule.id}>
            <p>
              <strong>
                <Maths inline text={rule.avoid} />
              </strong>{' '}
              → <Maths inline text={rule.prefer} />
              {rule.reason && (
                <>
                  <br />
                  <Maths inline text={rule.reason} />
                </>
              )}
            </p>
            <div className="row-actions">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(rule);
                  setAvoid(rule.avoid);
                  setPrefer(rule.prefer);
                  setReason(rule.reason);
                }}
              >
                Edit rule
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  act(async () => {
                    await studioApi('/api/terminology', 'DELETE', {
                      id: rule.id,
                      revision: rule.revision,
                    });
                    if (editing?.id === rule.id) reset();
                    await load();
                    setMessage('Rule removed for future generations.');
                  })
                }
              >
                Remove rule
              </Button>
            </div>
          </div>
        ))}
        {loaded && !rules.length && <p>No team wording rules saved yet.</p>}
        <div className="terminology-form">
          <label className="field" htmlFor={'term-avoid-' + module}>
            Avoid this term
            <Input
              id={'term-avoid-' + module}
              value={avoid}
              maxLength={100}
              onChange={(e) => setAvoid(e.target.value)}
              placeholder="e.g. antiderivative"
            />
          </label>
          <label className="field" htmlFor={'term-prefer-' + module}>
            Preferred wording
            <Input
              id={'term-prefer-' + module}
              value={prefer}
              maxLength={200}
              onChange={(e) => setPrefer(e.target.value)}
              placeholder="e.g. indefinite integral"
            />
          </label>
          <label className="field" htmlFor={'term-reason-' + module}>
            Reason / teaching note
            <Input
              id={'term-reason-' + module}
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Use the terminology in our EM1 notes"
            />
          </label>
        </div>
        <div className="row-actions">
          <Button
            disabled={!avoid.trim() || !prefer.trim()}
            onClick={() =>
              act(async () => {
                await studioApi('/api/terminology', 'POST', {
                  rule: { module, avoid, prefer, reason },
                  id: editing?.id,
                  revision: editing?.revision,
                });
                reset();
                await load();
                setMessage(
                  'Shared rule saved. It applies to the next generation or refinement.',
                );
              })
            }
          >
            {editing ? 'Save rule changes' : 'Save rule for the team'}
          </Button>
          {editing && (
            <Button variant="outline" onClick={reset}>
              Cancel edit
            </Button>
          )}
        </div>
      </fieldset>
    </details>
  );
}
