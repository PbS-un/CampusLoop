import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyListing, filterListings, handoverPlaceLabel, listingPayload, reminderFor, seedListings, slotEnded, validSlot } from '../src/model.js';
import { connectRepository } from '../src/repository.js';

test('discovery combines a search, category, transfer mode, and visibility', () => {
  const hidden = { ...seedListings.find(item => item.kind === 'request'), id: 'private', audience: 'private' };
  const rows = filterListings([...seedListings, hidden], { kind: 'request', categories: ['study'], mode: 'free', query: '  dÉsk  lamp  ' });
  assert.deepEqual(rows.map(item => item.title), ['Free desk lamp for studying']);
  for (const kind of ['offer', 'request']) {
    const sample = seedListings.find(item => item.kind === kind);
    const ownPost = { ...sample, id: 'own-post', owner_id: 'student-a', simulated: false };
    const filters = { kind, categories: [sample.category], mode: sample.mode, query: sample.title };
    assert.deepEqual(filterListings([ownPost, sample], filters, 'student-a').map(item => item.id), [sample.id]);
    assert.deepEqual(filterListings([ownPost, sample], filters, 'student-b').map(item => item.id), ['own-post', sample.id]);
  }
  const collegeOffer = { ...seedListings[0], id: 'college-offer', audience: 'college', college: 'cytc' };
  const allOffers = { kind: 'offer', categories: [], mode: '', query: '' };
  assert.equal(filterListings([collegeOffer], allOffers, 'viewer').length, 0);
  assert.equal(filterListings([collegeOffer], allOffers, 'viewer', 'mlc').length, 0);
  assert.equal(filterListings([collegeOffer], allOffers, 'viewer', 'cytc').length, 1);
  assert.equal(validSlot({ date: '2026-02-29', start: '19:00', end: '20:00' }), false);
  assert.equal(validSlot({ date: '2028-02-29', start: '19:00', end: '20:00' }), true);
  assert.equal(validSlot({ date: '2028-02-29', start: '20:00', end: '19:00' }), false);
  const noonInMacau = new Date('2026-11-23T12:00:00+08:00');
  assert.equal(slotEnded({ date: '2026-01-01', start: '09:00', end: '10:00' }, noonInMacau), true);
  assert.equal(slotEnded({ date: '2026-11-23', start: '10:00', end: '11:59' }, noonInMacau), true);
  assert.equal(slotEnded({ date: '2026-11-23', start: '11:00', end: '13:00' }, noonInMacau), false);
  assert.equal(handoverPlaceLabel('library', () => '圖書館正門'), '圖書館正門');
  assert.equal(handoverPlaceLabel('Library, west lobby', () => 'Unrelated label'), 'Library, west lobby');
});

test('in-page reminders follow the handover status without changing it', () => {
  const now = new Date('2026-11-24T12:00:00+08:00');
  const base = { owner_id: 'owner', recipient_id: 'recipient', pickup_date: '2026-11-25', pickup_time: '10:00', status: 'confirmed' };
  const kind = (handover, user) => reminderFor(handover, user, now)?.kind ?? null;
  assert.equal(kind(base, 'owner'), 'soon');
  assert.equal(kind(base, 'recipient'), 'soon');
  assert.equal(kind({ ...base, pickup_date: '2026-11-26' }, 'owner'), null);
  assert.equal(kind({ ...base, pickup_date: '2026-11-24', pickup_time: '11:00:00' }, 'owner'), 'dueOwner');
  assert.equal(kind({ ...base, pickup_date: '2026-11-24', pickup_time: '11:00' }, 'recipient'), 'dueRecipient');
  assert.equal(kind({ ...base, status: 'awaiting' }, 'recipient'), 'receipt');
  assert.equal(kind({ ...base, status: 'awaiting' }, 'owner'), 'followUp');
  for (const status of ['proposed', 'cancelled', 'completed']) assert.equal(kind({ ...base, status }, 'owner'), null);
  assert.equal(kind(base, 'someone-else'), null);
  const handover = { ...base };
  reminderFor(handover, 'owner', now);
  assert.deepEqual(handover, base);
});

test('the local demo saves posts in the browser and simulates the other student', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key),
  };
  globalThis.location = { search: '' };
  const repository = await connectRepository();
  assert.equal(repository.source, 'local');

  // Someone has the item you asked for: accept the simulated reply, agree a time and place, and receive it.
  const request = listingPayload({ ...emptyListing(), kind: 'request', title: 'Need a calculator', description: 'For exams' });
  const requestId = await repository.saveListing(null, request);
  const replyId = await repository.simulateReply(requestId);
  await repository.acceptReply(replyId);
  const plan = { pickup_date: '2099-01-01', pickup_time: '18:00', place: 'library' };
  const replyHandover = await repository.arrangeReply(replyId, plan);
  await repository.changeHandover(replyHandover, 'place');
  await repository.changeHandover(replyHandover, 'receive');
  let data = await repository.read();
  assert.equal(data.handovers.find(row => row.id === replyHandover).status, 'completed');
  assert.equal(data.listings.find(row => row.id === requestId).status, 'completed');

  // Someone wants your offer: accept the simulated proposal, leave the item, and the other student confirms receipt.
  const offer = listingPayload({ ...emptyListing(), title: 'Desk fan', description: 'Works well', condition: 'working',
    pickup_slots: [{ date: '2099-01-02', start: '18:00', end: '19:00' }] });
  const offerId = await repository.saveListing(null, offer);
  const interest = await repository.simulateInterest(offerId);
  for (const action of ['accept', 'place', 'receive']) await repository.changeHandover(interest, action);
  data = await repository.read();
  assert.equal(data.listings.find(row => row.id === offerId).status, 'completed');

  // A reload reads the same data back from browser storage.
  const reloaded = await (await connectRepository()).read();
  assert.deepEqual(reloaded.listings.filter(row => row.owner_id === repository.userId && !row.simulated).map(row => row.title).sort(), ['Desk fan', 'Need a calculator']);
  assert.equal(reloaded.handovers.filter(row => row.status === 'completed').length, 2);

  // Reset demo removes the simulated activity but keeps your own posts, which become available again.
  await repository.resetRelisting();
  data = await repository.read();
  assert.equal(data.replies.length, 0);
  assert.equal(data.handovers.filter(row => row.id !== 'sample-handover').length, 0);
  assert.deepEqual(data.listings.filter(row => row.owner_id === repository.userId && !row.simulated).map(row => row.status), ['available', 'available']);
});
