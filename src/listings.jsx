import { useRef, useState } from 'react';
import { artSVG } from './art.js';
import { audiences, campusDate, categories, categoriesFor, colleges, conditions, emptySlot, handoverPlaceLabel, normalizeCondition, places, slotEnded, validSlot } from './model.js';

const slotError = slot => !validSlot(slot) ? (slot.start && slot.end && slot.end <= slot.start ? 'pickupOrder' : 'badSlot')
  : slotEnded(slot) ? 'futureTime' : null;
const validPrice = value => value !== '' && value != null && Number(value) > 0 && Number(value) <= 999999.99;

export function Button({ children, kind = 'primary', ...props }) {
  return <button type="button" className={`button ${kind}`} {...props}>{children}</button>;
}

export function Field({ label, children, error }) {
  return <label className="field"><span>{label}</span>{children}{error && <span className="field-error" role="alert">{error}</span>}</label>;
}

export function Heading({ children, note }) {
  return <header className="section-heading"><h1>{children}</h1>{note && <p>{note}</p>}</header>;
}

export function CategoryPicker({ label, selected, onChange, error, t }) {
  return <fieldset className="category-picker" aria-describedby={error ? 'category-error' : undefined}>
    <legend>{label}</legend>
    <div className="category-options">
      {categories.map(category => <label className="category-option" key={category}>
        <input type="checkbox" name="category" value={category} checked={selected.includes(category)} onChange={event =>
          onChange(event.target.checked ? [...selected, category] : selected.filter(value => value !== category))} />
        <span>{t(category)}</span>
      </label>)}
    </div>
    {error && <p className="field-error" role="alert" id="category-error">{error}</p>}
  </fieldset>;
}

export const audienceLabel = (item, t) => item.audience === 'private' ? t('privateAudience')
  : item.audience === 'college' ? t('collegeOnly', { college: item.college ? t(`col_${item.college}`) : t('myCollege') })
    : t('campusAudience');

export function CollegeSelect({ value, onChange, t, error, disabled }) {
  return <div className="field-with-hint">
    <Field label={t('myCollege')} error={error}>
      <select name="college" value={value} disabled={disabled} aria-describedby="college-hint" onChange={event => onChange(event.target.value)}>
        <option value="">{t('collegeNone')}</option>
        {colleges.map(college => <option key={college} value={college}>{t(`col_${college}`)}</option>)}
      </select>
    </Field>
    <small id="college-hint">{t('collegeHint')}</small>
  </div>;
}

const audienceCopy = { campus: ['campusAudience', 'campusAudienceText'], college: ['collegeAudience', 'collegeAudienceText'],
  private: ['privateAudience', 'privateAudienceText'] };

function AudiencePicker({ value, onChange, college, onCollegeChange, collegeError, error, t }) {
  return <fieldset className="audience-picker stack" aria-describedby={error ? 'audience-error' : undefined}>
    <legend>{t('audienceTitle')}</legend>
    <p className="muted">{t('audienceSub')}</p>
    <div className="audience-options">
      {audiences.map(audience => {
        const [title, text] = audienceCopy[audience];
        return <label className="audience-option" key={audience}>
          <input type="radio" name="audience" value={audience} checked={value === audience} onChange={() => onChange(audience)}
            aria-labelledby={`audience-${audience}`} aria-describedby={`audience-${audience}-text`} />
          <span className="audience-copy"><strong id={`audience-${audience}`}>{t(title)}{audience === 'college' && college
            && <span className="badge suggested">{t('audienceSuggested')}</span>}</strong>
            <small id={`audience-${audience}-text`}>{t(text)}</small></span>
        </label>;
      })}
    </div>
    {error && <p className="field-error" role="alert" id="audience-error">{error}</p>}
    {value === 'college' && <CollegeSelect value={college} onChange={onCollegeChange} t={t} error={collegeError} />}
  </fieldset>;
}

export function DateLabel({ value, locale }) {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
}

export function Art({ item, hero = false }) {
  return <div className={`art ${item.art} ${hero ? 'art-hero' : ''}`}>
    {item.photo ? <img src={item.photo} alt="" /> : <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: artSVG(item.art) }} />}
  </div>;
}

const modeLabel = item => item.mode === 'free' ? 'free' : item.kind === 'request' ? 'paidRequest' : 'forSale';
const offerLabel = item => item.kind === 'offer' ? 'offers' : 'requests';
const price = (item, t) => item.mode === 'sell' && item.kind === 'offer' ? t('namedPrice', { price: item.price }) : t(modeLabel(item));

export function Status({ value, t }) {
  return <span className={`badge ${value}`}>{t(value)}</span>;
}

export function ListingCard({ item, t, onOpen, owner = false }) {
  return <button type="button" onClick={onOpen} className="listing-card">
    <Art item={item} />
    <div className="item-copy">
      <h2>{item.title}</h2><p>{categoriesFor(item).map(category => t(category)).join(' · ')} · {owner ? t('selfDisplay') : item.display_name}</p>
      <div className="badges"><span className="badge">{price(item, t)}</span>
        {item.audience !== 'campus' && <span className="badge audience">{audienceLabel(item, t)}</span>}
        {owner && <Status value={item.status} t={t} />}{item.simulated && <span className="badge sample">{t('simulatedData')}</span>}
      </div>
    </div>
  </button>;
}

// No condition is preselected, so the owner rates the item before publishing (R-F2).
export function ConditionSelect({ value, onChange, t, error }) {
  return <Field label={t('condition')} error={error}>
    <select name="condition" value={conditions.includes(value) ? value : ''} aria-required="true" aria-invalid={!!error || undefined}
      onChange={event => onChange(event.target.value)}>
      <option value="" disabled>{t('chooseCondition')}</option>
      {conditions.map(condition => <option key={condition} value={condition}>{t(condition)}</option>)}
    </select>
  </Field>;
}

export function DefectsField({ value, onChange, t, error }) {
  return <div className="field-with-hint">
    <Field label={t('defects')} error={error}>
      <input name="defects" maxLength={300} value={value} aria-describedby="defects-hint" aria-invalid={!!error || undefined}
        onChange={event => onChange(event.target.value)} />
    </Field>
    <small id="defects-hint">{t('defectsBlankHint')}</small>
  </div>;
}

// R-F2: condition and defects are always stated, including when there are none or they are unknown.
export function ConditionFacts({ item, t }) {
  const condition = normalizeCondition(item.condition);
  const defects = item.defects?.trim() || t(condition === 'unknown' ? 'defectsUnknown' : 'noKnownDefects');
  return <>
    <div><dt>{t('condition')}</dt><dd>{t(condition)}</dd></div>
    <div><dt>{t('defects')}</dt><dd>{defects}</dd></div>
  </>;
}

export function ListingDetails({ item, t, locale }) {
  const isOffer = item.kind === 'offer';
  return <dl className="facts">
    <div><dt>{t('listingKind')}</dt><dd>{t(offerLabel(item))}</dd></div>
    <div><dt>{t('category')}</dt><dd>{categoriesFor(item).map(category => t(category)).join(' · ')}</dd></div>
    <div><dt>{t('transferType')}</dt><dd>{price(item, t)}</dd></div>
    <div><dt>{t('description')}</dt><dd>{item.description || t('descriptionNone')}</dd></div>
    {isOffer && <>
      {item.pickup_area && <div><dt>{t('pickupArea')}</dt><dd>{handoverPlaceLabel(item.pickup_area, t)}</dd></div>}
      <ConditionFacts item={item} t={t} />
      <div><dt>{t('pickupAvailability')}</dt><dd>{item.pickup_slots.length ? <ul className="slot-summary">
        {item.pickup_slots.map((slot, index) => <li key={index}><DateLabel value={slot.date} locale={locale} /> · {slot.start}–{slot.end}</li>)}
      </ul> : t('pickupNone')}</dd></div>
      {item.pickup_note && <div><dt>{t('pickupNote')}</dt><dd>{item.pickup_note}</dd></div>}
    </>}
    <div><dt>{t('audience')}</dt><dd>{audienceLabel(item, t)}</dd></div>
  </dl>;
}

// Photos are resized before saving so phone pictures fit in browser storage.
async function resizePhoto(file, maxSide = 900) {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.8);
  } finally { URL.revokeObjectURL(url); }
}

function PickupAreaField({ value, onChange, t, error }) {
  const preset = places.includes(value) ? value : '';
  return <div className="place-field">
    <Field label={t('pickupArea')} error={error}>
      <input name="pickupArea" maxLength={100} value={preset ? t(preset) : value} placeholder={t('placeExample')}
        aria-required="true" aria-invalid={!!error || undefined} aria-describedby="pickup-area-hint" onChange={event => onChange(event.target.value)} />
    </Field>
    <div className="place-suggestions" role="group" aria-label={t('suggestedPlaces')}>
      {places.map(place => <button type="button" key={place} aria-pressed={preset === place} onClick={() => onChange(place)}>{t(place)}</button>)}
    </div>
    <small id="pickup-area-hint">{t('pickupAreaHint')}</small>
  </div>;
}

export function ListingForm({ form, setForm, t, onReview, college = '', onCollegeChange }) {
  const [submitted, setSubmitted] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [readingPhoto, setReadingPhoto] = useState(false);
  const dates = useRef(null);
  const offer = form.kind === 'offer';
  const selectedCategories = categoriesFor(form);
  const pickupArea = (form.pickup_area ?? '').trim();
  const set = (name, value) => setForm(current => ({ ...current, [name]: value }));
  const setSlot = (index, field, value) => setForm(current => ({
    ...current, pickup_slots: current.pickup_slots.map((slot, position) => position === index ? { ...slot, [field]: value } : slot),
  }));

  async function loadPhoto(event) {
    const file = event.target.files[0];
    if (!file) return;
    setPhotoError('');
    setReadingPhoto(true);
    try { set('photo', await resizePhoto(file)); }
    catch { setPhotoError('photoUnreadable'); }
    finally { setReadingPhoto(false); }
  }

  // Report 3, R-U1: an offer needs only a photo, category, condition and pickup area. Everything else is optional.
  function firstProblem() {
    if (offer) {
      if (!form.photo) return 'photo';
      if (!selectedCategories.length) return 'category';
      if (!conditions.includes(normalizeCondition(form.condition))) return 'condition';
      if (!pickupArea || pickupArea.length > 100) return 'pickupArea';
      if (form.condition === 'hasDefects' && !form.defects.trim()) return 'defects';
      if (form.mode === 'sell' && !validPrice(form.price)) return 'price';
      if (form.formMode === 'slots' && form.pickup_slots.some(slotError)) return 'slots';
    } else {
      if (!form.title.trim()) return 'title';
      if (!form.description.trim()) return 'description';
      if (!selectedCategories.length) return 'category';
    }
    if (!audiences.includes(form.audience)) return 'audience';
    if (form.audience === 'college' && !college) return 'college';
    return null;
  }

  function submit(event) {
    event.preventDefault();
    const problem = firstProblem();
    if (problem) {
      setSubmitted(true);
      if (problem === 'slots') dates.current.querySelectorAll('fieldset')[form.pickup_slots.findIndex(slotError)].querySelector('input').focus();
      else event.currentTarget.querySelector(`[name="${problem}"]`)?.focus();
      return;
    }
    const pickup_slots = form.formMode === 'slots' ? form.pickup_slots : [];
    const title = form.title.trim() || t(selectedCategories[0]);
    onReview({ ...form, title, pickup_slots });
  }

  const titleField = <div className="field-with-hint">
    <Field label={t(offer ? 'titleOptional' : 'listingTitle')} error={!offer && submitted && !form.title.trim() ? t('required') : null}>
      <input name="title" maxLength={100} value={form.title} onChange={event => set('title', event.target.value)} aria-describedby={offer ? 'title-hint' : undefined} />
    </Field>
    {offer && <small id="title-hint">{t('titleFallbackHint')}</small>}
  </div>;
  const descriptionField = <div className="field-with-hint">
    <Field label={t(offer ? 'descriptionOptional' : 'description')} error={!offer && submitted && !form.description.trim() ? t('required') : null}>
      <textarea name="description" maxLength={1500} value={form.description} onChange={event => set('description', event.target.value)} aria-describedby={offer ? 'description-hint' : undefined} />
    </Field>
    {offer && <small id="description-hint">{t('descriptionLaterHint')}</small>}
  </div>;
  const categoryField = <CategoryPicker label={t('categoryMultiple')} selected={selectedCategories} t={t} onChange={value => set('categories', value)}
    error={submitted && !selectedCategories.length ? t('categoryRequired') : null} />;
  const transferField = <>
    <Field label={t('transferType')}><select value={form.mode} onChange={event => set('mode', event.target.value)}>
      <option value="free">{t('free')}</option><option value="sell">{t(offer ? 'forSale' : 'paidRequest')}</option>
    </select></Field>
    {offer && form.mode === 'sell' && <Field label={t('price')} error={submitted && !validPrice(form.price) ? t('priceError') : null}><input name="price" type="number" min="0.01" max="999999.99" step="0.01" inputMode="decimal" value={form.price ?? ''} onChange={event => set('price', event.target.value)} /></Field>}
  </>;

  return <form className="stack" noValidate onSubmit={submit}>
    <Heading>{t(form.id ? 'editListing' : 'post')}</Heading>
    <section className="surface stack">
      <fieldset className="listing-type">
        <legend>{t('listingKind')}</legend>
        <div className="listing-type-switch" data-kind={form.kind}>
          {[['offer', 'offerTitle'], ['request', 'requestItem']].map(([kind, label]) => (
            <label className="listing-type-option" key={kind}>
              <input type="radio" name="listing-kind" value={kind} checked={form.kind === kind}
                onChange={() => set('kind', kind)} />
              <span>
                <span className="listing-type-check" aria-hidden="true" />
                <span>{t(label)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {!offer && <>{titleField}{descriptionField}{categoryField}{transferField}</>}
      {offer && <section className="stack" aria-labelledby="required-details">
        <h2 id="required-details" className="small-heading">{t('requiredDetails')}</h2>
        <div className="field-with-hint">
          <Field label={t('photo')} error={submitted && !form.photo && !photoError ? t('photoRequired') : photoError ? t(photoError) : null}>
            <input name="photo" type="file" accept="image/*" aria-required="true" aria-describedby="photo-hint" onChange={loadPhoto} />
          </Field>
          <small id="photo-hint">{t('imageNote')}</small>
        </div>
        {form.photo && <Art item={form} />}
        {categoryField}
        <div className="form-columns">
          <ConditionSelect value={normalizeCondition(form.condition)} onChange={value => set('condition', value)} t={t}
            error={submitted && !conditions.includes(normalizeCondition(form.condition)) ? t('conditionRequired') : null} />
          <DefectsField value={form.defects} onChange={value => set('defects', value)} t={t}
            error={submitted && form.condition === 'hasDefects' && !form.defects.trim() ? t('defectsRequired') : null} />
        </div>
        <PickupAreaField value={form.pickup_area ?? ''} onChange={value => set('pickup_area', value)} t={t}
          error={submitted && (!pickupArea || pickupArea.length > 100) ? t('pickupAreaRequired') : null} />
      </section>}
    </section>
    {offer && <section className="surface stack" aria-labelledby="optional-details">
      <h2 id="optional-details" className="small-heading">{t('optionalDetails')}</h2>
      {titleField}{descriptionField}{transferField}
      <fieldset className="pickup stack">
        <legend>{t('pickupOptional')}</legend>
        <div className="form-columns">
          {[['later', 'pickupLater'], ['slots', 'pickupSet']].map(([mode, label]) => <label className="radio-tile" key={mode}>
            <input type="radio" name="pickup" value={mode} checked={form.formMode === mode} onChange={() => setForm(current => ({
              ...current, formMode: mode, pickup_slots: current.pickup_slots.length ? current.pickup_slots : [emptySlot()],
            }))} />{t(label)}
          </label>)}
        </div>
        {form.formMode === 'slots' && <div className="stack" ref={dates}>
          {form.pickup_slots.map((slot, index) => {
            const timeError = submitted && slotError(slot) && t(slotError(slot));
            return <fieldset className="time-slot stack" key={index}>
              <legend>{t('pickupSlot', { number: index + 1 })}</legend>
              <Field label={t('date')}><input type="date" min={campusDate()} value={slot.date} onChange={event => setSlot(index, 'date', event.target.value)} /></Field>
              <div className="form-columns">
                <Field label={t('pickupStart')}><input type="time" value={slot.start} onChange={event => setSlot(index, 'start', event.target.value)} /></Field>
                <Field label={t('pickupEnd')}><input type="time" value={slot.end} aria-invalid={!!timeError} aria-describedby={timeError ? `slot-error-${index}` : undefined} onChange={event => setSlot(index, 'end', event.target.value)} /></Field>
              </div>
              {timeError && <p id={`slot-error-${index}`} role="alert" className="field-error">{timeError}</p>}
              {form.pickup_slots.length > 1 && <Button kind="quiet" onClick={() => set('pickup_slots', form.pickup_slots.filter((_, position) => position !== index))}>{t('pickupRemove')}</Button>}
            </fieldset>;
          })}
          <Button kind="secondary" disabled={form.pickup_slots.length === 12} onClick={() => set('pickup_slots', [...form.pickup_slots, emptySlot()])}>{t('pickupAdd')}</Button>
          {form.pickup_slots.length === 12 && <small>{t('slotsLimit')}</small>}
        </div>}
        <details open={form.pickup_note ? true : undefined}>
          <summary>{t('pickupAddNote')}</summary>
          <Field label={t('pickupNote')}><input maxLength={300} value={form.pickup_note} onChange={event => set('pickup_note', event.target.value)} /></Field>
          <small>{t('pickupNoteHint')}</small>
        </details>
      </fieldset>
    </section>}
    <section className="surface stack">
      <AudiencePicker value={form.audience} onChange={value => set('audience', value)} college={college}
        onCollegeChange={onCollegeChange} collegeError={submitted && form.audience === 'college' && !college ? t('collegeRequired') : null}
        error={submitted && !audiences.includes(form.audience) ? t('audienceRequired') : null} t={t} />
    </section>
    <Button type="submit" disabled={readingPhoto}>{t('reviewTitleWeb')}</Button>
  </form>;
}
