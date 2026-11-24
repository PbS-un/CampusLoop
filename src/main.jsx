import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LANGS, translator } from './locales.js';
import { activeStatuses, allowedActions, campusDate, conditions, slotEnded, emptyListing, filterListings, handoverPlaceLabel, listingPayload, places, possessionFor, reminderFor } from './model.js';
import { connectRepository } from './repository.js';
import { Art, Button, CategoryPicker, CollegeSelect, ConditionFacts, ConditionSelect, DateLabel, DefectsField, Field, Heading, ListingCard, ListingDetails, ListingForm, Status } from './listings.jsx';
import './style.css';

const emptyData = { listings: [], handovers: [], messages: [], replies: [], profile: { college: '' } };
const initialFilters = { kind: 'offer', categories: [], mode: '', query: '' };
const actionText = { accept: 'actionAccept', hand: 'actionHand', place: 'actionPlace', receive: 'actionReceive', cancel: 'cancelHandover' };
const backendErrors = { listing_unavailable: 'notAvailableNow',
  past_date: 'futureTime', active_handover: 'activeHandover', listing_locked: 'activeHandover',
  request_unavailable: 'requestUnavailable', reply_in_handover: 'replyInHandover', college_required: 'collegeRequired' };

function App() {
  const [lang, setLanguage] = useState(() => {
    try { const saved = localStorage.getItem('campus-loop-language'); return LANGS[saved] ? saved : 'en'; } catch { return 'en'; }
  });
  const t = useMemo(() => translator(lang), [lang]);
  const locale = LANGS[lang].date ?? LANGS[lang].html;
  const [repository, setRepository] = useState(null);
  const [data, setData] = useState(emptyData);
  const [page, setPage] = useState({ name: 'discover' });
  const [filters, setFilters] = useState(initialFilters);
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState({ pickup_date: campusDate(), pickup_time: '', place: '', preset: '' });
  const [placeInvalid, setPlaceInvalid] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [replyItem, setReplyItem] = useState({ condition: '', defects: '', submitted: false });
  const [deleteId, setDeleteId] = useState(null);
  const [withdrawId, setWithdrawId] = useState(null);
  const [inboxTab, setInboxTab] = useState('handovers');
  const main = useRef(null);
  const lock = useRef(false);

  function showError(exception, fallback = 'actionError') {
    setError(backendErrors[exception.message] ?? fallback);
  }

  async function connect() {
    setLoading(true);
    setError('');
    try {
      const service = await connectRepository();
      const snapshot = await service.read();
      setData(snapshot);
      setRepository(service);
      const practiceItem = snapshot.listings.find(row => row.id === service.startItemId);
      if (practiceItem) {
        const detail = { name: 'detail', id: practiceItem.id, previous: { name: 'discover' } };
        if (service.scenario === 'reply') go('reply', practiceItem.id, detail);
        else startPlan(practiceItem, detail);
      }
    } catch (exception) { showError(exception, 'loadError'); }
    finally { setLoading(false); }
  }

  useEffect(() => { connect(); }, []);
  useEffect(() => {
    document.documentElement.lang = LANGS[lang].html;
    try { localStorage.setItem('campus-loop-language', lang); } catch { /* Language still works in this session. */ }
  }, [lang]);
  useEffect(() => { main.current?.focus({ preventScroll: true }); }, [page]);
  // Re-check reminder times every minute so they appear and change without a reload.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);

  function go(name, id, previous) {
    setPage({ name, id, previous });
    // Going back to the Handover page returns to the list the user came from.
    if (['replyDetails', 'replyPlan'].includes(name)) setInboxTab('replies');
    if (name === 'handover') setInboxTab('handovers');
    setCancelOpen(false);
    setReceiveOpen(false);
    if (name === 'reply') setReplyItem({ condition: '', defects: '', submitted: false });
    setDeleteId(null);
    setWithdrawId(null);
    setError('');
    setNotice('');
    window.scrollTo(0, 0);
  }

  function goBack() {
    const previous = page.previous;
    go(previous?.name ?? 'discover', previous?.id, previous?.previous);
  }

  async function refresh() {
    if (lock.current || !repository) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try { setData(await repository.read()); }
    catch (exception) { showError(exception, 'loadError'); }
    finally { lock.current = false; setSaving(false); }
  }

  async function change(write, next, messageKey) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await write();
      next?.(result);
      if (messageKey) setNotice(messageKey);
      try { setData(await repository.read()); }
      catch (exception) { showError(exception, 'loadError'); }
    } catch (exception) { showError(exception); }
    finally { lock.current = false; setSaving(false); }
  }

  function startForm(item) {
    setForm({ ...emptyListing(), ...(item ?? { categories: [] }), formMode: item?.pickup_slots?.length ? 'slots' : 'later' });
    go('post', undefined, item?.id ? page : undefined);
  }
  function startPlan(item, previous = page) {
    const suggested = item.pickup_slots.find(slot => slot.date >= campusDate());
    setPlan({ pickup_date: suggested?.date ?? campusDate(), pickup_time: suggested?.start ?? '', place: '', preset: '' });
    setPlaceInvalid(false);
    go('plan', item.id, previous);
  }
  function startReplyPlan(reply) {
    setPlan({ pickup_date: campusDate(), pickup_time: '', place: '', preset: '' });
    setPlaceInvalid(false);
    go('replyPlan', reply.id, page);
  }

  function changePlace(place, preset = '') {
    setPlan(current => ({ ...current, place, preset }));
    setPlaceInvalid(false);
  }

  const userId = repository?.userId;
  const item = data.listings.find(row => row.id === page.id);
  const transfer = data.handovers.find(row => row.id === page.id);
  const reply = data.replies.find(row => row.id === page.id);
  const replyTransfer = reply && data.handovers.find(row => row.reply_id === reply.id);
  const replyRequest = reply && data.listings.find(row => row.id === reply.request_id);
  const demoReply = !repository?.scenario && reply?.sender_id === userId && !!replyRequest?.simulated;
  const receivedDemoReply = !repository?.scenario && reply?.requester_id === userId && !!reply?.simulated;
  const latest = item && data.handovers.find(row => row.listing_id === item.id);
  const owned = item?.owner_id === userId;
  const viewerCollege = data.profile?.college ?? '';
  const matching = filterListings(data.listings, filters, userId, viewerCollege);
  const reminders = data.handovers.map(row => ({ handover: row, reminder: reminderFor(row, userId, now) })).filter(row => row.reminder);
  function reminderText({ handover, reminder }) {
    const when = `${new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${handover.pickup_date}T12:00:00Z`))} ${String(handover.pickup_time).slice(0, 5)}`;
    return t(`reminder_${reminder.kind}`, { item: handover.item_title, when, place: handoverPlaceLabel(handover.place, t) });
  }
  const saveCollege = value => change(() => repository.setCollege(value), null, 'collegeSaved');
  // Demo handovers run in place and are saved; the other usability scenarios open the separate handover test page.
  const canPractise = !!repository && (!repository.scenario || repository.scenario === 'handover');
  const isRoot = ['discover', 'my', 'inbox'].includes(page.name);
  const activeTab = page.name === 'post' || page.name === 'review' ? 'post'
    : ['handover', 'replyDetails', 'replyPlan', 'reopen', 'reopened'].includes(page.name) ? 'inbox' : page.name;

  function deleteControls(row, afterDelete) {
    if (row.owner_id !== userId) return null;
    const locked = data.handovers.some(h => h.listing_id === row.id && activeStatuses.includes(h.status));
    if (locked) return <div className="stack">
      <Button kind="delete" disabled>{t('deleteListing')}</Button>
      <p className="muted">{t('deleteLocked')}</p>
    </div>;
    if (deleteId !== row.id) return <Button kind="delete" disabled={saving} onClick={() => { setDeleteId(row.id); setNotice(''); }}>{t('deleteListing')}</Button>;
    const hasHistory = data.handovers.some(h => h.listing_id === row.id) || data.replies.some(r => r.request_id === row.id);
    const questionId = `delete-ask-${row.id}`;
    return <div className="notice stack" role="group" aria-labelledby={questionId}>
      <strong id={questionId}>{t('deleteAsk', { title: row.title })}</strong>
      {row.simulated ? <p>{t('deleteSampleWarning')}</p> : <>
        <p>{t('deleteWarning')}</p>
        {hasHistory && <p>{t('deleteHistory')}</p>}
      </>}
      <div className="button-row">
        <Button kind="secondary" autoFocus disabled={saving} onClick={() => setDeleteId(null)}>{t('keepListing')}</Button>
        <Button kind="danger" disabled={saving} onClick={() => change(() => repository.deleteListing(row.id),
          () => { setDeleteId(null); afterDelete?.(); }, 'listingDeleted')}>{t('confirmDelete')}</Button>
      </div>
    </div>;
  }

  function postDemoControls(row) {
    if (!repository || repository.scenario || row.owner_id !== userId || row.simulated || row.status !== 'available'
      || data.handovers.some(h => h.listing_id === row.id && activeStatuses.includes(h.status))) return null;
    if (row.audience === 'private') return <p className="muted">{t('privateNoDemo')}</p>;
    const isOffer = row.kind === 'offer';
    return <div className="notice stack"><span className="badge sample">{t('demoControlLabel')}</span>
      <p>{t(isOffer ? 'simulateInterestHint' : 'simulateReplyHint')}</p>
      <Button disabled={saving} onClick={() => change(() => isOffer ? repository.simulateInterest(row.id) : repository.simulateReply(row.id),
        id => go(isOffer ? 'handover' : 'replyDetails', id, page), isOffer ? 'simulateInterestDone' : 'simulateReplyDone')}>
        {t(isOffer ? 'simulateInterest' : 'simulateReply')}</Button>
    </div>;
  }

  function withdrawControls(row, afterWithdraw) {
    if (row.sender_id !== userId) return null;
    if (data.handovers.some(h => h.reply_id === row.id)) return <p className="muted">{t('replyLockedNote')}</p>;
    if (withdrawId !== row.id) return <Button kind="delete" disabled={saving} onClick={() => { setWithdrawId(row.id); setNotice(''); }}>{t('withdrawReply')}</Button>;
    const questionId = `withdraw-ask-${row.id}`;
    return <div className="notice stack" role="group" aria-labelledby={questionId}>
      <strong id={questionId}>{t('withdrawAsk', { title: row.item_title })}</strong>
      <p>{t('withdrawDemoWarning')}</p>
      <div className="button-row">
        <Button kind="secondary" autoFocus disabled={saving} onClick={() => setWithdrawId(null)}>{t('keepReply')}</Button>
        <Button kind="danger" disabled={saving} onClick={() => change(() => repository.withdrawReply(row.id),
          () => { setWithdrawId(null); afterWithdraw?.(); }, 'replyWithdrawn')}>{t('confirmWithdraw')}</Button>
      </div>
    </div>;
  }

  function planForm(onValid, disabled, submitLabel) {
    return <form className="surface stack" noValidate onSubmit={event => {
        event.preventDefault();
        const { pickup_date, pickup_time, preset } = plan;
        if (!pickup_date || !pickup_time) {
          setError('dateTimeRequired');
          event.currentTarget.elements[!pickup_date ? 'pickup_date' : 'pickup_time'].focus();
          return;
        }
        const place = preset || plan.place.trim();
        if (!place || place.length > 100 || /[\u0000-\u001F\u007F-\u009F]/.test(place)) {
          setPlaceInvalid(true);
          event.currentTarget.elements.place.focus();
          return;
        }
        if (new Date(`${pickup_date}T${pickup_time}:00+08:00`) <= new Date()) { setError('futureTime'); return; }
        onValid({ pickup_date, pickup_time, place });
      }}><div className="form-columns">
        <Field label={t('date')}><input name="pickup_date" type="date" min={campusDate()} required value={plan.pickup_date} onChange={event => setPlan({ ...plan, pickup_date: event.target.value })} /></Field>
        <Field label={t('time')}><input name="pickup_time" type="time" required value={plan.pickup_time} onChange={event => setPlan({ ...plan, pickup_time: event.target.value })} /></Field>
      </div><div className="place-field">
        <Field label={t('location')}>
          <input name="place" value={plan.preset ? t(plan.preset) : plan.place} placeholder={t('placeExample')}
            maxLength={100} aria-required="true" aria-invalid={placeInvalid || undefined}
            aria-describedby={placeInvalid ? 'place-error' : undefined} onChange={event => changePlace(event.target.value)} />
        </Field>
        {placeInvalid && <p className="field-error" role="alert" id="place-error">{t('placeRequired')}</p>}
        <div className="place-suggestions" role="group" aria-label={t('suggestedPlaces')}>
          {places.map(place => <button type="button" key={place} aria-pressed={plan.preset === place} onClick={() => changePlace('', place)}>{t(place)}</button>)}
        </div>
      </div><Button type="submit" disabled={saving || disabled}>{t(submitLabel)}</Button></form>;
  }

  function renderPage() {
    if (!repository) return <div className="surface stack">{loading ? <p role="status">{t('refreshing')}</p>
      : <div className="button-row"><Button onClick={connect}>{t('retry')}</Button>
        <a className="button secondary button-link" href="?test=handover">{t('tryDemoHandover')}</a></div>}</div>;
    switch (page.name) {
      case 'discover': return <>
        <section className="hero"><p>{t('campus')}</p><h1>{t('heroTitle')}</h1><p>{t('appIntro')}</p></section>
        <section className="surface stack" aria-label={t('discover')}>
          <div className="switcher" role="group" aria-label={t('listingKind')}>
            {[['offer', 'offers'], ['request', 'requests']].map(([kind, label]) => <button key={kind} type="button" aria-pressed={filters.kind === kind}
              onClick={() => setFilters(old => ({ ...old, kind }))}>{t(label)}</button>)}
          </div>
          <Field label={t('searchLabel')}><input type="search" placeholder={t('search')} value={filters.query}
            onChange={event => setFilters(old => ({ ...old, query: event.target.value }))} /></Field>
          <CategoryPicker label={t('category')} selected={filters.categories} t={t}
            onChange={selected => setFilters(old => ({ ...old, categories: selected }))} />
          <Field label={t('transferType')}><select value={filters.mode} onChange={event => setFilters(old => ({ ...old, mode: event.target.value }))}>
            <option value="">{t('any')}</option><option value="free">{t('free')}</option>
            <option value="sell">{t(filters.kind === 'offer' ? 'forSale' : 'paidRequest')}</option>
          </select></Field>
          {(filters.categories.length > 0 || filters.mode) && <Button kind="quiet" onClick={() =>
            setFilters(old => ({ ...old, categories: [], mode: '' }))}>{t('clearFilters')}</Button>}
        </section>
        <div className="section-row"><h2>{t(filters.kind === 'offer' ? 'results' : 'matchingRequests')}</h2><output aria-live="polite">{matching.length}</output></div>
        {matching.length ? <div className="results">{matching.map(row => <ListingCard key={row.id} item={row} t={t} onOpen={() => go('detail', row.id, page)} />)}</div>
          : <div className="surface stack"><h2>{t(filters.kind === 'offer' ? 'emptyTitle' : 'requestNoMatch')}</h2><p>{t('emptyText')}</p>
            <Button kind="secondary" onClick={() => setFilters(old => ({ ...initialFilters, kind: old.kind }))}>{t('browseAll')}</Button></div>}
      </>;
      case 'my': {
        const myListings = data.listings.filter(row => row.owner_id === userId);
        return <><Heading>{t('listingMine')}</Heading><div className="button-row">
          <Button kind="secondary" disabled={saving} onClick={refresh}>{t('refresh')}</Button>
        </div><section className="surface stack" aria-label={t('myCollege')}>
          <CollegeSelect value={viewerCollege} onChange={saveCollege} t={t} disabled={saving} />
        </section>{myListings.length ? <div className="results">{myListings.map(row => <div className="my-listing stack" key={row.id}>
          <ListingCard item={row} t={t} owner onOpen={() => go('detail', row.id, page)} />
          {deleteControls(row)}
        </div>)}</div>
          : <div className="surface"><p>{t('noListings')}</p></div>}</>;
      }
      case 'detail':
        if (!item) return <div className="surface">{t('notAvailableNow')}</div>;
        return <><Heading note={owned ? t('selfDisplay') : item.display_name}>{item.title}</Heading><div className="surface stack">
          <Art item={item} hero /><div className="badges"><Status value={item.status} t={t} />{item.simulated && <span className="badge sample">{t('simulatedData')}</span>}</div>
          <ListingDetails item={item} t={t} locale={locale} />
        </div><div className="button-row">
          {owned && item.status === 'available' && !activeStatuses.includes(latest?.status) && !item.simulated && <Button onClick={() => startForm(item)}>{t('editListing')}</Button>}
          {latest && <Button kind="secondary" onClick={() => go('handover', latest.id, page)}>{t(latest.status === 'cancelled'
            ? (item.status === 'closed' ? 'viewCancelledHandover' : 'previousHandover') : 'viewPlan')}</Button>}
          {!owned && item.kind === 'request' && <Button onClick={() => go('reply', item.id, page)}>{t('offerToRequest')}</Button>}
          {!owned && item.simulated && item.kind === 'offer' && !latest && item.status === 'available' && (canPractise
            ? <Button onClick={() => startPlan(item)}>{t('tryDemoHandover')}</Button>
            : <a className="button button-link" href={`?test=handover&item=${encodeURIComponent(item.id)}`}>{t('tryDemoHandover')}</a>)}
        </div>{owned && postDemoControls(item)}{owned && deleteControls(item, () => go('my'))}</>;
      case 'post': return <ListingForm form={form} setForm={setForm} t={t} college={viewerCollege} onCollegeChange={saveCollege} onReview={draft => { setForm(draft); go('review', undefined, page); }} />;
      case 'reply': {
        if (!item || owned || item.kind !== 'request' || item.status !== 'available') return <div className="surface">{t('requestUnavailable')}</div>;
        return <><Heading note={`${item.title} · ${item.display_name}`}>{t('replyToRequest')}</Heading>
          <form className="surface stack" key={item.id} noValidate onSubmit={event => {
            event.preventDefault();
            const values = new FormData(event.currentTarget);
            const item_title = String(values.get('itemTitle')).trim();
            const description = String(values.get('description')).trim();
            if (!item_title || !description) {
              setError('replyFieldsRequired');
              event.currentTarget.elements[!item_title ? 'itemTitle' : 'description'].focus();
              return;
            }
            const { condition } = replyItem;
            const defects = replyItem.defects.trim();
            if (!conditions.includes(condition) || (condition === 'hasDefects' && !defects)) {
              setReplyItem(current => ({ ...current, submitted: true }));
              event.currentTarget.elements[!conditions.includes(condition) ? 'condition' : 'defects'].focus();
              return;
            }
            const price = item.mode === 'sell' ? Number(values.get('price')) : null;
            if (item.mode === 'sell' && !(values.get('price') !== '' && price > 0 && price <= 999999.99)) {
              setError('priceError');
              event.currentTarget.elements.price.focus();
              return;
            }
            change(() => repository.sendReply(item.id, { item_title, description, price, condition, defects }),
              id => go('replyDetails', id, { name: 'inbox' }), 'demoReplySaved');
          }}>
            <p className="muted">{t('demoReplyVisibility')}</p>
            <Field label={t('itemName')}><input name="itemTitle" required maxLength={100} /></Field>
            <Field label={t('description')}><textarea name="description" required maxLength={1500} /></Field>
            <div className="form-columns">
              <ConditionSelect value={replyItem.condition} t={t} onChange={value => setReplyItem(current => ({ ...current, condition: value }))}
                error={replyItem.submitted && !conditions.includes(replyItem.condition) ? t('conditionRequired') : null} />
              <DefectsField value={replyItem.defects} t={t} onChange={value => setReplyItem(current => ({ ...current, defects: value }))}
                error={replyItem.submitted && replyItem.condition === 'hasDefects' && !replyItem.defects.trim() ? t('defectsRequired') : null} />
            </div>
            {item.mode === 'sell' && <Field label={t('price')}><input name="price" type="number" min="0.01" max="999999.99" step="0.01" inputMode="decimal" required /></Field>}
            <Button type="submit" disabled={saving}>{t('sendPrivateOffer')}</Button>
          </form></>;
      }
      case 'replyDetails':
        if (!reply) return <div className="surface">{t(saving ? 'refreshing' : 'requestUnavailable')}</div>;
        return <><Heading note={reply.request_title}>{reply.item_title}</Heading><div className="surface stack">
          <div className="badges"><span className="badge">{t(reply.sender_id === userId ? 'offerSent' : 'offerReceived')}</span>
            {reply.status === 'accepted' && <span className="badge confirmed">{t(reply.sender_id === userId ? 'replyAcceptedBadge' : 'youAcceptedBadge')}</span>}
            {demoReply && <span className="badge sample">{t('simulatedData')}</span>}</div>
          <dl className="facts"><div><dt>{t('requests')}</dt><dd>{reply.request_title}</dd></div>
            <div><dt>{t('requestedBy')}</dt><dd>{reply.requester_id === userId ? t('selfDisplay') : reply.requester_name}</dd></div>
            {reply.sender_name && <div><dt>{t('repliedBy')}</dt><dd>{reply.sender_name}</dd></div>}
            <div><dt>{t('description')}</dt><dd>{reply.description}</dd></div>
            {reply.condition && <ConditionFacts item={reply} t={t} />}
            <div><dt>{t('transferType')}</dt><dd>{reply.mode === 'free' ? t('free') : t('namedPrice', { price: reply.price })}</dd></div>
          </dl>
        </div>
        {demoReply && reply.status !== 'accepted' && <div className="notice stack"><span className="badge sample">{t('demoControlLabel')}</span>
          <p>{t('acceptReplyHint')}</p>
          <Button disabled={saving} onClick={() => change(() => repository.acceptReply(reply.id), null, 'replyAcceptedNotice')}>{t('simulateAcceptReply')}</Button></div>}
        {receivedDemoReply && reply.status !== 'accepted' && <div className="surface stack">
          <p>{t('acceptReceivedHint')}</p>
          <Button disabled={saving} onClick={() => change(() => repository.acceptReply(reply.id), null, 'youAcceptedReply')}>{t('acceptThisReply')}</Button></div>}
        {reply.status === 'accepted' && (!replyTransfer || replyTransfer.status === 'cancelled') && <div className="surface stack">
          <p>{t('replyAcceptedNext')}</p><Button disabled={saving} onClick={() => startReplyPlan(reply)}>{t('arrangeReplyHandover')}</Button></div>}
        {replyTransfer && <Button kind="secondary" onClick={() => go('handover', replyTransfer.id, page)}>{t('viewPlan')}</Button>}
        {withdrawControls(reply, () => go('inbox'))}
        <Button kind="secondary" onClick={() => go('inbox')}>{t('openRequestReplies')}</Button></>;
      case 'review': {
        const payload = listingPayload(form);
        const preview = { ...payload, college: payload.audience === 'college' ? viewerCollege : null };
        return <><Heading>{t('reviewTitleWeb')}</Heading><div className="surface stack"><h2>{payload.title}</h2>
          <ListingDetails item={preview} t={t} locale={locale} />
        </div><div className="button-row"><Button disabled={saving} onClick={() => change(() => repository.saveListing(form.id ?? null, payload),
          id => go('detail', id, { name: 'my' }), 'publishedMessage')}>{t(form.id ? 'editSaved' : 'publish')}</Button>
          <Button kind="secondary" disabled={saving} onClick={() => go('post', undefined, page.previous?.previous)}>{t('editDetails')}</Button></div></>;
      }
      case 'plan': return <><Heading note={item?.title}>{t('planHandover')}</Heading>
        {canPractise && item?.simulated && <p className="muted">{t('handoverPracticeNote')}</p>}
        {planForm(values => change(() => repository.propose(page.id, values), id => go('handover', id, { name: 'inbox' }),
          canPractise && item?.simulated ? 'demoAccepted' : 'proposedSaved'), !item, 'propose')}</>;
      case 'replyPlan':
        if (!reply || reply.status !== 'accepted' || !repository.arrangeReply) return <div className="surface">{t('requestUnavailable')}</div>;
        return <><Heading note={`${reply.item_title} · ${reply.request_title}`}>{t('arrangeReplyHandover')}</Heading>
          <p className="muted">{t(reply.sender_id === userId ? 'replyPlanNote' : 'replyPlanNoteReceiver')}</p>
          {planForm(values => change(() => repository.arrangeReply(reply.id, values), id => go('handover', id, { name: 'inbox' }),
            'replyArranged'), false, 'sendArrangement')}</>;
      case 'inbox': return <><Heading>{t('inboxNav')}</Heading><div className="button-row">
        <Button kind="secondary" disabled={saving} onClick={refresh}>{t('refresh')}</Button>
        {repository.resetRelisting && <Button kind="secondary" disabled={saving} onClick={() =>
          change(() => repository.resetRelisting(), null, 'relistingDemoReset')}>{t('resetRelistingDemo')}</Button>}
      </div>
        {reminders.length > 0 && <section className="notice stack" aria-labelledby="reminders-title">
          <h2 id="reminders-title" className="small-heading">{t('remindersTitle', { count: reminders.length })}</h2>
          {reminders.map(row => <button className="conversation reminder" type="button" key={row.handover.id} onClick={() => go('handover', row.handover.id, page)}>
            <span className="conversation-main"><strong>{row.handover.item_title}</strong><span className="conversation-meta">{reminderText(row)}</span></span>
          </button>)}
          <small>{t('remindersNote')}</small>
        </section>}
        <div className="switcher inbox-tabs" role="group" aria-label={t('inboxSections')}>
          <button type="button" aria-pressed={inboxTab === 'handovers'} onClick={() => setInboxTab('handovers')}>
            {t('inboxHandoversTab', { count: data.handovers.length })}</button>
          <button type="button" aria-pressed={inboxTab === 'replies'} onClick={() => setInboxTab('replies')}>
            {t('inboxRepliesTab', { count: data.replies.length })}</button>
        </div>
        {inboxTab === 'handovers' ? <section className="surface stack" aria-labelledby="inbox-handovers">
          <header className="inbox-intro"><h2 id="inbox-handovers">{t('handoverListTitle')}</h2><p className="muted">{t('handoversIntro')}</p></header>
          {data.handovers.length ? data.handovers.map(row => <button className="conversation" type="button" key={row.id} onClick={() => go('handover', row.id, page)}>
            <span className="conversation-main"><strong>{row.item_title}</strong>
              <span className="conversation-meta">{t(row.owner_id === userId ? 'youGive' : 'youReceive')} · <DateLabel value={row.pickup_date} locale={locale} /> · {row.pickup_time.slice(0, 5)} · {handoverPlaceLabel(row.place, t)}</span></span>
            <span className="badges"><Status value={row.status} t={t} />
              {row.reply_id && <span className="badge">{t('fromRequestReply')}</span>}
              {row.simulated && <span className="badge sample">{t('simulatedData')}</span>}</span>
          </button>) : <p>{t('noMessages')}</p>}
        </section> : <section className="surface stack" aria-labelledby="inbox-replies">
          <header className="inbox-intro"><h2 id="inbox-replies">{t('openRequestReplies')}</h2><p className="muted">{t('repliesIntro')}</p></header>
          {data.replies.length ? data.replies.map(row => <div className="reply-row stack" key={row.id}>
            <button className="conversation" type="button" onClick={() => go('replyDetails', row.id, page)}>
              <span className="conversation-main"><strong>{row.item_title}</strong>
                <span className="conversation-meta">{t('replyForRequest', { request: row.request_title, name: row.requester_id === userId ? t('selfDisplay') : row.requester_name })}</span></span>
              <span className="badges"><span className="badge">{t(row.sender_id === userId ? 'offerSent' : 'offerReceived')}</span>
                {row.status === 'accepted' && <span className="badge confirmed">{t(row.sender_id === userId ? 'replyAcceptedBadge' : 'youAcceptedBadge')}</span>}
                {data.handovers.some(h => h.reply_id === row.id) && <span className="badge">{t('handoverArranged')}</span>}</span>
            </button>{withdrawControls(row)}</div>) : <p>{t('noRequestReplies')}</p>}
        </section>}</>;
      case 'handover': {
        if (!transfer) return <div className="surface">{t('notAvailableNow')}</div>;
        const messages = data.messages.filter(row => row.handover_id === transfer.id);
        const actions = allowedActions(transfer, userId);
        const practiceTransfer = canPractise && transfer.simulated && transfer.owner_id !== userId;
        if (practiceTransfer && transfer.status === 'confirmed') actions.unshift('hand', 'place');
        const practiceGiving = canPractise && transfer.simulated && transfer.owner_id === userId && transfer.recipient_id !== userId;
        if (practiceGiving && transfer.status === 'awaiting') actions.unshift('receive');
        const isActive = activeStatuses.includes(transfer.status);
        // R-F3: both people see the same item and terms. Reply handovers use the item offered in the reply.
        const termsSource = transfer.reply_id ? data.replies.find(row => row.id === transfer.reply_id)
          : data.listings.find(row => row.id === transfer.listing_id);
        const termsPrice = termsSource && (termsSource.mode === 'free' ? t('free') : t('namedPrice', { price: termsSource.price }));
        const latestForItem = data.handovers.find(row => row.listing_id === transfer.listing_id);
        const canRelist = transfer.status === 'cancelled' && transfer.owner_id === userId && latestForItem?.id === transfer.id
          && data.listings.some(row => row.id === transfer.listing_id && row.owner_id === userId && row.status === 'closed');
        return <><Heading note={t('viewingAs', { role: t(transfer.owner_id === userId ? 'owner' : 'recipient') })}>{transfer.item_title}</Heading>
          {reminderFor(transfer, userId, now) && <p className="notice" role="note">
            <strong>{t('reminderLabel')}</strong> {reminderText({ handover: transfer, reminder: reminderFor(transfer, userId, now) })}</p>}
          <div className="surface stack"><div className="badges"><Status value={transfer.status} t={t} />
            {transfer.simulated && <span className="badge sample">{t('simulatedData')}</span>}</div>
            <p><DateLabel value={transfer.pickup_date} locale={locale} /> · {transfer.pickup_time.slice(0, 5)} · {handoverPlaceLabel(transfer.place, t)}</p>
            {termsSource && <section className="stack" aria-labelledby="handover-terms"><h2 id="handover-terms" className="small-heading">{t('handoverTerms')}</h2>
              <dl className="facts"><div><dt>{t('transferType')}</dt><dd>{termsPrice}</dd></div>
                {termsSource.condition && <ConditionFacts item={termsSource} t={t} />}</dl></section>}
            <div className="button-row">{actions.map(action => <Button key={action} disabled={saving}
              kind={action === 'cancel' ? 'secondary' : 'primary'} onClick={() => {
                if (action === 'cancel') { setCancelOpen(true); setReceiveOpen(false); }
                // Confirming receipt completes the transfer and cannot be undone, so ask first (not for the simulated other person).
                else if (action === 'receive' && !practiceGiving) { setReceiveOpen(true); setCancelOpen(false); setNotice(''); }
                else change(() => repository.changeHandover(transfer.id, action), null, 'changeSaved');
              }}>{t(practiceTransfer && action === 'hand' ? 'simulateOwnerHand' : practiceTransfer && action === 'place' ? 'simulateOwnerHandover'
                : practiceGiving && action === 'receive' ? 'simulateRequesterReceipt' : actionText[action])}</Button>)}</div>
            {cancelOpen && <div className="notice stack"><p>{t('cancelAsk')}</p><div className="button-row">
              <Button kind="secondary" onClick={() => setCancelOpen(false)} disabled={saving}>{t('keepHandover')}</Button>
              <Button kind="danger" disabled={saving} onClick={() => change(() => repository.changeHandover(transfer.id, 'cancel'), () => setCancelOpen(false), 'changeSaved')}>{t('cancelHandover')}</Button>
            </div></div>}
            {receiveOpen && transfer.status === 'awaiting' && <div className="notice stack" role="group" aria-labelledby="receive-ask">
              <strong id="receive-ask">{t('completeMeaning')}</strong><div className="button-row">
              <Button kind="secondary" autoFocus onClick={() => setReceiveOpen(false)} disabled={saving}>{t('notYet')}</Button>
              <Button disabled={saving} onClick={() => change(() => repository.changeHandover(transfer.id, 'receive'), () => setReceiveOpen(false), 'changeSaved')}>{t('yesReceived')}</Button>
            </div></div>}
            {canRelist && transfer.placed && <div className="notice stack"><strong>{t('retrieveFirst')}</strong>
              <p>{t('retrievalPrompt', { place: handoverPlaceLabel(transfer.place, t) })}</p></div>}
            {canRelist && <div className="stack"><p className="muted">{t('closedText')}</p>
              <Button onClick={() => go('reopen', transfer.listing_id, page)}>{t('reviewReopen')}</Button></div>}
          </div>
          <div className="surface stack"><div className="section-row"><h2>{t(isActive ? 'messages' : 'archived')}</h2>
            <Button kind="quiet" disabled={saving} onClick={refresh}>{t('refresh')}</Button></div>
            {messages.length ? messages.map(row => <p className="bubble" key={row.id}><strong>{row.sender_id === userId ? t('you') : t('reply')}</strong>{row.body}</p>) : <p>{t('noChat')}</p>}
            {isActive && <form className="stack" noValidate onSubmit={event => {
              event.preventDefault(); if (message.trim()) change(() => repository.sendMessage(transfer.id, message.trim()), () => setMessage(''));
            }}><Field label={t('writeMessage')}><textarea maxLength={600} value={message} onChange={event => setMessage(event.target.value)} required /></Field>
              <Button type="submit" disabled={saving || !message.trim()}>{t('send')}</Button></form>}
          </div></>;
      }
      case 'reopen': {
        if (!item || !owned || item.status !== 'closed' || latest?.status !== 'cancelled') return <div className="surface">{t('notAvailableNow')}</div>;
        return <><Heading note={item.title}>{t('reviewReopen')}</Heading><div className="notice stack">
          <strong>{t(latest.placed ? 'retrieveFirst' : 'confirmPossessionTitle')}</strong>
          <p>{t(latest.placed ? 'retrievalPrompt' : 'confirmPossessionBody', { place: handoverPlaceLabel(latest.place, t) })}</p>
        </div>{item.pickup_slots.some(slot => slotEnded(slot)) && <p className="muted">{t('slotsExpiredNote')}</p>}
          <div className="surface"><ListingDetails item={item} t={t} locale={locale} /></div>
          <div className="button-row"><Button kind="secondary" disabled={saving} onClick={goBack}>{t('keepClosed')}</Button>
            <Button disabled={saving} onClick={() => change(() => repository.relist(item.id, possessionFor(latest)),
              () => go('reopened', item.id, page.previous))}>{t(latest.placed ? 'confirmRetrieved' : 'confirmAndReopen')}</Button></div></>;
      }
      case 'reopened': return item && <><Heading note={item.title}>{t('reopenedTitle')}</Heading><div className="surface stack">
        <Status value={item.status} t={t} /><ListingDetails item={item} t={t} locale={locale} /></div>
        <div className="button-row">
          {latest && <Button onClick={() => go('handover', latest.id, page)}>{t('previousHandover')}</Button>}
          <Button kind="secondary" onClick={() => go('my')}>{t('listingMine')}</Button>
        </div></>;
      default: return null;
    }
  }

  const mode = repository && { local: 'localMode', scenario: 'scenarioMode' }[repository.source];
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-block"><span className="brand-mark" aria-hidden="true">↻</span><span className="brand">Campus Loop</span></div>
      <label className="language">
        <span className="language-globe" aria-hidden="true" />
        <span className="language-text">
          <span id="language-label" className="language-label">{t('language')}</span>
          <span className="language-current" aria-hidden="true">{LANGS[lang].name}</span>
        </span>
        <span className="language-chevron" aria-hidden="true" />
        <select aria-labelledby="language-label" value={lang} onChange={event => setLanguage(event.target.value)}>
          {Object.entries(LANGS).map(([code, entry]) => <option key={code} value={code} lang={entry.html}>{entry.name}</option>)}
        </select>
      </label>
    </header>
    <main className="workspace stack" ref={main} tabIndex={-1}>
      <div className="section-row top-line">
        {!isRoot && <Button kind="quiet back-button" aria-label={t('back')} disabled={saving} onClick={goBack}>
          <span aria-hidden="true">←</span>
        </Button>}
        {mode && <p className="mode-label">{t(mode)}</p>}
      </div>
      {error && <p className="notice error" role="alert">{t(error)}</p>}
      {/* The live region stays mounted so screen readers announce new notices; it sits at the top so it is seen. */}
      <div role="status" className={notice ? 'notice success' : 'visually-hidden'}>{notice && t(notice)}</div>
      <div className="stack" aria-busy={saving}>{renderPage()}</div>
    </main>
    {repository && <nav className="bottom-nav" aria-label={t('discover')}>
      {[['discover', 'discover'], ['post', 'post'], ['inbox', 'inboxNav'], ['my', 'listingMine']].map(([name, label]) => <button type="button" key={name}
        aria-current={activeTab === name ? 'page' : undefined} disabled={saving} onClick={() => name === 'post' ? startForm() : go(name)}>{t(label)}
        {name === 'inbox' && reminders.length > 0 && <span className="nav-count"><span aria-hidden="true">{reminders.length}</span>
          <span className="visually-hidden">{t('remindersCount', { count: reminders.length })}</span></span>}</button>)}
    </nav>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
