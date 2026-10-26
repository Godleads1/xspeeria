'use client';

/**
 * Figma "Advert Placement Setup" and "Add an Advert" (ADR-067; ADR-056 decision 2).
 *
 * Owner (2026-10-20): "the place advert here is done from the web admin, and then everyone using
 * the app sees it in that same location. the size must fit the advert placeholder."
 *
 * Design corrections: Figma's "Select Audience" is left out — the owner said everyone sees it.
 * The picture must have the slot's shape (342 × 113; 1026 × 339 recommended), checked here
 * for a quick answer and again on the server. The link must be https. Times are Lagos time.
 * Display only — the server checks every permission.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';

import { messageFor, type Advert, type AdvertInput, type AdvertPage, type AdvertState } from '../../lib/api';
import { tr } from '../../lib/i18n';
import { readPhoto } from '../../lib/photos';
import { useSession } from '../../lib/session';
import { admin, color } from '../../theme';
import { Button, FormError, Notice, PageTitle, TextInput } from '../forms';
import { Panel, StatusChip } from '../primitives';
import { RowMenu, type RowAction } from '../RowMenu';
import { DataTable, type Column } from '../table/DataTable';
import { when } from './common';
import { isoToLagos, lagosToIso } from './OutagesScreen';

export const ADVERT_STATE: Record<AdvertState, string> = {
  showing: 'Showing now',
  scheduled: 'Scheduled',
  ended: 'Ended',
  off: 'Switched off',
};
const SLOT = { width: 342, height: 113 };

function StateChip({ state }: { state: AdvertState }): ReactElement {
  const tone = state === 'showing' ? 'success' : state === 'scheduled' ? 'warning' : 'neutral';
  return <StatusChip label={tr(ADVERT_STATE[state])} tone={tone} />;
}

/** Pixel size of a chosen picture, read by the browser. */
function pictureSize(base64: string, type: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = `data:${type};base64,${base64}`;
  });
}

/** Same rule as the server: at least the slot size, and its shape within 3 %. */
export function fitsSlot(width: number, height: number): boolean {
  if (width < SLOT.width || height < SLOT.height) return false;
  const ratio = SLOT.width / SLOT.height;
  return Math.abs(width / height - ratio) / ratio <= 0.03;
}

function Thumb({ id }: { id: string }): ReactElement {
  const { api } = useSession();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    void api.advertImageUrl(id).then((u) => {
      made = u;
      if (alive) setUrl(u);
      else if (u) URL.revokeObjectURL(u);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [api, id]);
  return (
    <span style={{ display: 'inline-block', width: 114, aspectRatio: `${SLOT.width} / ${SLOT.height}`, borderRadius: 4, overflow: 'hidden', border: `1px solid ${color.border.subtle}`, backgroundColor: color.bg.sunken, flex: '0 0 auto' }}>
      {/* A local blob URL of a checked picture; next/image can't optimise those. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null}
    </span>
  );
}

export function AdvertsScreen(): ReactElement {
  const { api, can } = useSession();
  const [page, setPage] = useState<AdvertPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Advert | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPage(await api.listAdverts());
    } catch (e) {
      setError(messageFor(e));
    }
  }, [api]);
  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(a: Advert): Promise<void> {
    setError(null);
    try {
      await api.changeAdvert(a.id, { active: !a.active });
      setNotice(a.active ? tr('“{{name}}” is switched off', { name: a.name }) : tr('“{{name}}” is switched on', { name: a.name }));
      await load();
    } catch (e) {
      setError(messageFor(e));
    }
  }

  function actionsFor(a: Advert): RowAction[] {
    if (!can('adverts.update')) return [];
    return [
      { label: tr('Edit'), onSelect: () => setEditing(a), testId: `edit-${a.id}` },
      { label: a.active ? tr('Switch off') : tr('Switch on'), onSelect: () => void toggle(a), danger: a.active, testId: `toggle-${a.id}` },
    ];
  }

  const columns: readonly Column<Advert>[] = [
    {
      key: 'advert',
      header: tr('Advert'),
      render: (a) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Thumb id={a.id} />
          <span>
            <strong>{a.name}</strong>
            {a.link_url ? (
              <span dir="ltr" style={{ display: 'block', fontSize: 12, opacity: 0.75, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.link_url}
              </span>
            ) : null}
          </span>
        </span>
      ),
    },
    { key: 'post', header: tr('Post Date'), render: (a) => when(a.starts_at) },
    { key: 'end', header: tr('End Date'), render: (a) => when(a.ends_at) },
    { key: 'state', header: tr('Status'), render: (a) => <StateChip state={a.state} /> },
    ...(can('adverts.update') ? [{ key: 'actions', header: tr('Action'), render: (a: Advert) => <RowMenu label={tr('Actions for {{name}}', { name: a.name })} actions={actionsFor(a)} testId={`menu-${a.id}`} /> }] : []),
  ];

  const showing = page?.items.find((a) => a.id === page.showing_id) ?? null;
  return (
    <>
      <PageTitle
        crumb={tr('Advert Placement Setup')}
        action={
          can('adverts.create') ? (
            <Button testId="add-advert" onClick={() => setEditing('new')}>
              {tr('Add Advert')}
            </Button>
          ) : undefined
        }
      >
        {tr('Advert Placement Setup')}
      </PageTitle>
      <p data-testid="showing-now" style={{ margin: 0, fontSize: 14, color: color.text.secondary }}>
        {page === null
          ? '\u00a0'
          : showing
          ? tr('Everyone using the app sees “{{name}}” on the Market screen now.', { name: showing.name })
          : tr('No advert is showing; the app shows its “Place advert here” picture.')}
      </p>
      <FormError message={error && page ? error : null} />
      <Notice message={notice} />
      <Panel>
        <DataTable
          caption={tr('Advert Placement Setup')}
          hideCaption
          columns={columns}
          rows={page?.items ?? []}
          status={error && !page ? 'error' : page === null ? 'loading' : 'ready'}
          onRetry={() => void load()}
          emptyTitle={tr('No adverts yet')}
        />
      </Panel>
      {editing ? (
        <AdvertDialog
          advert={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (input) => {
            if (editing === 'new') {
              await api.addAdvert(input as AdvertInput);
              setNotice(tr('Advert “{{name}}” added', { name: input.name ?? '' }));
            } else {
              await api.changeAdvert(editing.id, input);
              setNotice(tr('Advert “{{name}}” saved', { name: input.name ?? editing.name }));
            }
            setEditing(null);
            await load();
          }}
        />
      ) : null}
    </>
  );
}

function AdvertDialog({
  advert,
  onCancel,
  onSave,
}: {
  advert: Advert | null;
  onCancel: () => void;
  onSave: (input: Partial<AdvertInput>) => Promise<void>;
}): ReactElement {
  const [name, setName] = useState(advert?.name ?? '');
  const [start, setStart] = useState(isoToLagos(advert?.starts_at ?? null));
  const [end, setEnd] = useState(isoToLagos(advert?.ends_at ?? null));
  const [link, setLink] = useState(advert?.link_url ?? '');
  const [image, setImage] = useState<{ base64: string; url: string; width: number; height: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function choose(file: File | undefined): Promise<void> {
    setProblem(null);
    if (!file) return;
    const read = await readPhoto(file);
    if ('error' in read) {
      setProblem(tr(read.error.replace('photo', 'picture')));
      return;
    }
    const size = await pictureSize(read.base64, file.type);
    if (!size) {
      setProblem(tr('That file could not be read.'));
      return;
    }
    if (!fitsSlot(size.width, size.height)) {
      setProblem(tr('The picture must have the advert slot’s shape, 342 × 113 (for example 1026 × 339). This one is {{w}} × {{h}}.', { w: size.width, h: size.height }));
      return;
    }
    setImage({ base64: read.base64, url: `data:${file.type};base64,${read.base64}`, width: size.width, height: size.height });
  }

  const linkOk = link.trim() === '' || /^https:\/\/[^\s<>"]+$/.test(link.trim());
  const datesOk = Boolean(lagosToIso(start) && lagosToIso(end)) && end > start;
  const ok = name.trim().length >= 2 && datesOk && linkOk && (advert !== null || image !== null);
  const box = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4, height: 40, fontFamily: 'inherit', fontSize: 14, padding: '0 8px', borderRadius: 6, border: `1px solid ${color.border.strong}`, backgroundColor: color.bg.canvas, color: color.text.primary } as const;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, backgroundColor: admin.scrim, display: 'grid', placeItems: 'center', padding: 16 }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="advert-title"
        data-testid="advert-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ok || busy) return;
          setBusy(true);
          setError(null);
          const input: Partial<AdvertInput> = {
            name: name.trim(),
            starts_at: lagosToIso(start),
            ends_at: lagosToIso(end),
            link_url: link.trim() || null,
          };
          if (image) input.image = image.base64;
          onSave(input).catch((err: unknown) => {
            setError(messageFor(err));
            setBusy(false);
          });
        }}
        style={{ width: 460, maxWidth: '100%', maxHeight: '92vh', overflowY: 'auto', backgroundColor: color.bg.canvas, borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
      >
        <h2 id="advert-title" style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
          {advert ? tr('Edit Advert') : tr('Add an Advert')}
        </h2>
        <TextInput label={tr('Advert name')} value={name} onChange={setName} maxLength={60} testId="advert-name" />
        <label style={{ fontSize: 13 }}>
          {tr('Post Date (Lagos time)')}
          <input data-testid="advert-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} style={box} />
        </label>
        <label style={{ fontSize: 13 }}>
          {tr('End Date (Lagos time)')}
          <input data-testid="advert-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} style={box} />
        </label>
        <TextInput label={tr('URL (optional)')} value={link} onChange={setLink} maxLength={500} testId="advert-url" ltr required={false} placeholder="https://" hint={linkOk ? tr('Opens when someone taps the advert. Must start with https://') : tr('The link must be a full https:// address.')} />
        <div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>{tr('Picture')}</div>
          <div data-testid="advert-preview" style={{ width: '100%', aspectRatio: `${SLOT.width} / ${SLOT.height}`, borderRadius: 10, border: `1px solid ${color.text.disabled}`, overflow: 'hidden', backgroundColor: color.bg.sunken, display: 'grid', placeItems: 'center', fontSize: 13, color: color.text.secondary }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {image ? <img src={image.url} alt={tr('Preview of the advert')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : advert ? <Thumb id={advert.id} /> : tr('342 × 113 slot — 1026 × 339 recommended')}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 14px', border: `1px solid ${color.border.strong}`, borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
              <path d="M14 7 8.5 12.5a2 2 0 0 1-2.8-2.8L12 3.4a3.5 3.5 0 0 1 5 5l-6.6 6.6a5 5 0 0 1-7-7L9 2.5" />
            </svg>
            {advert ? tr('Replace Image') : tr('Attach Image')}
            <input data-testid="advert-image" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void choose(e.target.files?.[0])} style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />
          </label>
          {image ? <span style={{ marginInlineStart: 10, fontSize: 12, color: color.text.secondary }}>{`${image.width} × ${image.height}`}</span> : null}
          {problem ? (
            <p role="alert" data-testid="advert-problem" style={{ margin: '6px 0 0', fontSize: 13, color: color.error.text }}>
              {problem}
            </p>
          ) : null}
        </div>
        <p style={{ margin: 0, fontSize: 12, color: color.text.secondary }}>{tr('Everyone using the app sees the advert on the Market screen between these dates.')}</p>
        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: color.error.text }}>
            {error}
          </p>
        ) : null}
        <div style={{ display: 'flex', gap: 12 }}>
          <span style={{ flex: 1, display: 'flex' }}>
            <Button variant="secondary" block onClick={onCancel}>
              {tr('Cancel')}
            </Button>
          </span>
          <span style={{ flex: 1, display: 'flex' }}>
            <Button type="submit" block testId="advert-save" disabled={!ok} busy={busy}>
              {tr('Save')}
            </Button>
          </span>
        </div>
      </form>
    </div>
  );
}
