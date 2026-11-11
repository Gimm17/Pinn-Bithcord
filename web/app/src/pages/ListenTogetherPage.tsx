import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Copy, Crown, LogOut, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { useSignedIn } from '@/data/music/queries';
import { isTauriDesktop } from '@/extension/useExtension';
import { cleanCode, inviteUrl } from '@/party/invite';
import {
  controlsLocked,
  createParty,
  DEFAULT_SERVER,
  joinParty,
  leaveParty,
  messageOf,
  party,
  partyServer,
  partySettings,
  previewParty,
  savePartySettings,
  useParty,
} from '@/party/listenTogether';
import { usePlayer } from '@/state/player';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const lede = 'mx-4 mb-4 type-body-tall text-secondary';
const error = 'mx-4 mt-3 type-callout text-red';
const primary = 'flex-none rounded-pill bg-key-bg px-4 py-1.5 type-body-emphasized text-on-accent disabled:opacity-45';
// The code, large, as the phone shows it.
const invite = 'flex flex-col items-center gap-2.5 rounded-[10px] bg-quinary px-4 py-7 text-center';
const inviteCode = 'type-[700_40px/48px] tracking-[0.18em]';

/**
 * Listen Together (ListenTogetherScreen on the phone): start a party or join
 * one by code, then the party itself — its code and invite link, who's in it,
 * and the host's controls. Opened from Settings, and from an invite link
 * (`/invite/:code`), where joining waits for a tap: a browser only lets audio
 * start after the listener has interacted with the page.
 */
export default function ListenTogetherPage() {
  const params = useParams();
  const [search] = useSearchParams();
  const inviteCode = params.code ? cleanCode(params.code) : null;
  const inviteServer = search.get('server');
  const state = useParty();
  // The desktop has no YouTube Music sign-in; it jams as the device itself.
  const signedIn = useSignedIn() || isTauriDesktop();

  return (
    <div className={settingsUi.centered}>
      <PageHeader title="Listen Together" />
      <div className={settingsUi.body}>
        {state.code ? (
          <InParty />
        ) : inviteCode ? (
          <InviteCard code={inviteCode} server={inviteServer} signedIn={signedIn} />
        ) : (
          <StartOrJoin signedIn={signedIn} />
        )}
        {state.error && <p className={error}>{state.error}</p>}
      </div>
    </div>
  );
}

function SignInFirst() {
  return (
    <p className={`${settingsUi.footer} mb-4`}>
      Listen Together uses your YouTube Music account for your name and picture in the party. Sign in on music.youtube.com,
      then come back.
    </p>
  );
}

function StartOrJoin({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [settings, setSettings] = useState(partySettings);
  const autoplay = usePlayer((s) => s.autoplay);
  const create = useMutation({ mutationFn: () => createParty({ autoplayEnabled: autoplay }) });
  const update = (change: Partial<typeof settings>) => {
    savePartySettings(change);
    setSettings(partySettings());
  };

  return (
    <>
      <p className={lede}>
        Listen to the same music at the same moment with up to five devices. Anyone in the party can play, pause and skip.
      </p>
      {!signedIn && <SignInFirst />}
      <section className={settingsUi.group}>
        <div className={settingsUi.row}>
          <span className={settingsUi.rowText}>
            <span>Start a Party</span>
            <span className={settingsUi.rowDetail}>Whatever you’re playing comes with you.</span>
          </span>
          <button className={primary} disabled={!signedIn || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Starting…' : 'Start'}
          </button>
        </div>
        <form
          className={settingsUi.controlRow}
          onSubmit={(e) => {
            e.preventDefault();
            const cleaned = cleanCode(code);
            if (cleaned) navigate(`/invite/${cleaned}`);
          }}
        >
          <span>Join with a Code</span>
          <span className="flex gap-2">
            <input
              className="w-[110px] flex-none rounded-[8px] border-0 bg-quaternary px-2.5 py-[5px] text-center type-body tracking-[0.12em] text-primary uppercase"
              value={code}
              maxLength={7}
              placeholder="ABC123"
              aria-label="Party code"
              onChange={(e) => setCode(e.currentTarget.value.toUpperCase())}
            />
            <button className={primary} type="submit" disabled={!cleanCode(code)}>
              Join
            </button>
          </span>
        </form>
      </section>

      <h2 className={settingsUi.sectionHeader}>You</h2>
      <section className={settingsUi.group}>
        <label className={settingsUi.controlRow}>
          <span>Name in parties</span>
          <input
            className={settingsUi.input}
            placeholder="Your name in the party"
            value={settings.nickname}
            maxLength={80}
            onChange={(e) => update({ nickname: e.currentTarget.value })}
          />
        </label>
        <label className={settingsUi.controlRow}>
          <span>Party server</span>
          <input
            className={settingsUi.input}
            placeholder={DEFAULT_SERVER ? new URL(DEFAULT_SERVER).host : 'party.example.com'}
            value={settings.customServer}
            onChange={(e) => update({ customServer: e.currentTarget.value })}
          />
        </label>
      </section>
      <p className={settingsUi.footer}>Leave the server empty to use BitChord’s. Anyone joining your party uses the server it’s on.</p>
    </>
  );
}

/** An invite: who's in it, then a tap to join (the tap also lets the browser start audio). */
function InviteCard({ code, server, signedIn }: { code: string; server: string | null; signedIn: boolean }) {
  const preview = useQuery({ queryKey: ['party', 'preview', code, server], queryFn: () => previewParty(code, server), retry: false });
  const join = useMutation({ mutationFn: () => joinParty(code, server) });
  const data = preview.data;
  return (
    <div className={invite}>
      <p className={inviteCode}>{code}</p>
      {preview.isPending && <p className={settingsUi.footer}>Looking up the party…</p>}
      {preview.isError && <p className={error}>{messageOf(preview.error)}</p>}
      {data && (
        <>
          <p className={lede}>
            {data.hostName ? `${data.hostName}’s party` : 'A Listen Together party'}
            {data.memberCount ? ` · ${data.memberCount} of ${data.maxMembers} listening` : ''}
          </p>
          <div className="flex gap-1.5">
            {data.members.map((m, i) => (
              <Avatar key={i} name={m.displayName} url={m.avatarUrl} large />
            ))}
          </div>
        </>
      )}
      {!signedIn && <SignInFirst />}
      <button
        className="mt-1.5 flex-none rounded-pill bg-key-bg px-7 py-2.5 type-title-3-emphasized text-on-accent disabled:opacity-45"
        disabled={!signedIn || join.isPending || data?.isFull || preview.isError}
        onClick={() => join.mutate()}
      >
        {data?.isFull ? 'This party is full' : join.isPending ? 'Joining…' : 'Tap to Join'}
      </button>
    </div>
  );
}

/**
 * The host's level for one listener's device.
 *
 * `percent === null` is a real state — nobody has set this device, so its own
 * volume stands — and the row says so rather than showing 0, which would read
 * as silence the host chose. While dragging, the value is local: a round trip
 * cannot drive a thumb, and the party's copy takes over again on release.
 */
function MemberVolume({ percent, onSet }: { percent: number | null; onSet: (percent: number | null) => void }) {
  const [drag, setDrag] = useState<number | null>(null);
  const shown = drag ?? percent ?? 0;
  return (
    <div className="flex items-center gap-3 px-4 pb-2.5 ps-[52px]">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={shown}
        // The party's number is the authority; when the host has set nothing
        // the slider has no position that means anything, so it says so.
        aria-label="Volume for this listener"
        className="h-1 min-w-0 flex-1 accent-key"
        onChange={(e) => setDrag(Number(e.currentTarget.value))}
        onPointerUp={() => {
          if (drag === null) return;
          onSet(drag);
          setDrag(null);
        }}
        onKeyUp={() => {
          if (drag === null) return;
          onSet(drag);
          setDrag(null);
        }}
      />
      <span className="w-24 flex-none type-callout text-secondary">
        {percent === null ? 'Their own level' : `${shown}%`}
      </span>
      {percent !== null && (
        <button className={settingsUi.inlineButton} onClick={() => onSet(null)} title="Hand the level back to their device">
          Reset
        </button>
      )}
    </div>
  );
}

function Avatar({ name, url, large = false }: { name: string; url: string | null; large?: boolean }) {
  const className = `grid place-items-center rounded-full bg-quaternary object-cover type-callout-emphasized ${large ? 'size-9' : 'size-6'}`;
  return url ? (
    <img className={className} src={url} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className={className}>{name.slice(0, 1).toUpperCase()}</span>
  );
}

function InParty() {
  const state = useParty();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  // The player's own mute, not a party control: the party hears nothing of it,
  // and the device keeps following every control while staying silent.
  const muted = usePlayer((s) => s.muted);
  const toggleMute = usePlayer((s) => s.toggleMute);
  const isHost = state.you?.isHost === true;
  const locked = controlsLocked(state);
  const custom = partyServer() && partyServer() !== DEFAULT_SERVER ? partyServer() : null;
  const link = inviteUrl(state.code!, custom);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const status =
    state.connection === 'live'
      ? state.clockSynced
        // performance.timeOrigin carries sub-millisecond precision, so the raw
        // sample is a float; the phone's own string is an integer (`%1$d`).
        ? `In sync · ${Math.round(state.roundTripMs)} ms round trip`
        : 'Measuring the clock…'
      : state.connection === 'connecting'
        ? 'Reconnecting…'
        : 'Offline';

  return (
    <>
      <div className={invite}>
        <p className={inviteCode}>{state.code}</p>
        <p className={settingsUi.footer}>{status}</p>
        <button
          className="inline-flex items-center gap-1.5 rounded-pill bg-quaternary px-3.5 py-1.5 type-callout-emphasized"
          onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
          title={link}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? 'Copied' : 'Copy Invite Link'}
        </button>
      </div>

      <h2 className={settingsUi.sectionHeader}>
        Listening · {state.members.length} of {state.maxMembers}
      </h2>
      <section className={settingsUi.group}>
        {state.members.map((m) => (
          <div key={m.memberId}>
            <div className={settingsUi.integrationPlain}>
              <Avatar name={m.displayName} url={m.avatarUrl} />
              <span className={settingsUi.integrationName}>
                {m.displayName}
                {m.memberId === state.you?.memberId && <span className="text-secondary"> (you)</span>}
              </span>
              <span className={settingsUi.value}>
                {m.isHost && <Crown size={14} aria-label="Host" />}
                <span className="size-2 rounded-full bg-quaternary data-on:bg-green" data-on={m.connected || undefined} title={m.connected ? 'Connected' : 'Reconnecting'} />
                {isHost && m.memberId !== state.you?.memberId && (
                  <button className={settingsUi.inlineButton} onClick={() => party.kick(m.memberId)} title="Remove from the party">
                    <UserMinus size={13} />
                  </button>
                )}
              </span>
            </div>
            {/* Under the row, not inside the grid: a slider squeezed beside a
                name and a Remove button is a control nobody can hit. */}
            {isHost && m.memberId !== state.you?.memberId && (
              <MemberVolume percent={m.volumePercent} onSet={(percent) => party.setMemberVolume(m.memberId, percent)} />
            )}
          </div>
        ))}
      </section>

      <h2 className={settingsUi.sectionHeader}>This device</h2>
      <section className={settingsUi.group}>
        <Toggle
          label="Play on this device"
          detail="This device’s own mute. Off keeps it silent while it still follows every control in the party; the others hear nothing of it."
          checked={!muted}
          onChange={() => toggleMute()}
        />
      </section>

      <h2 className={settingsUi.sectionHeader}>Party</h2>
      <section className={settingsUi.group}>
        <Toggle
          label="AutoPlay"
          detail="Keep the party going with similar music when the queue runs out."
          checked={state.playback.autoplayEnabled}
          onChange={(on) => !locked && party.setAutoplay(on)}
        />
        {isHost && (
          <Toggle
            label="Only I control the music"
            detail="Others can listen but not play, pause, skip or change the queue."
            checked={state.hostOnlyControl}
            onChange={party.setHostOnlyControl}
          />
        )}
      </section>
      {locked && <p className={settingsUi.footer}>The host controls the music in this party. You can still pause your own device.</p>}

      {state.activity.length > 0 && (
        <>
          <h2 className={settingsUi.sectionHeader}>Activity</h2>
          <section className={settingsUi.group}>
            {state.activity.slice(0, 8).map((a, i) => (
              <div key={i} className={settingsUi.row}>
                <span className={settingsUi.rowText}>
                  <span>
                    {a.by} · {a.action}
                  </span>
                  {a.detail && <span className={settingsUi.rowDetail}>{a.detail}</span>}
                </span>
                <span className={settingsUi.rowDetail}>{new Date(a.atMs).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              </div>
            ))}
          </section>
        </>
      )}

      <button className="mx-4 mt-6 inline-flex items-center gap-1.5 type-body-emphasized text-red" onClick={() => void leaveParty().then(() => navigate('/settings/listen-together'))}>
        <LogOut size={15} />
        Leave Party
      </button>
    </>
  );
}
