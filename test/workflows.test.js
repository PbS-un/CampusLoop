import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emptyListing, filterListings, handoverPlaceLabel, listingPayload, missingDetails, sampleListing, seedListings, slotEnded, validSlot } from '../src/model.js';
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
    photo: 'data:image/jpeg;base64,AAAA', pickup_area: ' Library lobby ', pickup_slots: [{ date: '2099-01-02', start: '18:00', end: '19:00' }] });
  const offerId = await repository.saveListing(null, offer);
  // R-U1: the pickup area is saved with the offer and remembered for the next one; choosing a college keeps it.
  assert.equal((await repository.read()).listings.find(row => row.id === offerId).pickup_area, 'Library lobby');
  await repository.setCollege('cytc');
  assert.deepEqual((await repository.read()).profile, { college: 'cytc', pickup_area: 'Library lobby' });
  assert.equal(listingPayload({ ...emptyListing(), kind: 'request', pickup_area: 'library' }).pickup_area, '');
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

test('missing details block confirmation, and keeping an item is separate from a cancelled handover', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key),
  };
  globalThis.location = { search: '' };
  const repository = await connectRepository();
  const draft = { ...emptyListing(), title: 'Desk fan', condition: 'working', photo: 'data:image/jpeg;base64,AAAA', pickup_area: 'library' };

  // R-F2: an offer without a description can be published and receive a proposal, but cannot be confirmed yet.
  assert.deepEqual(missingDetails(listingPayload(draft)), ['description']);
  assert.deepEqual(missingDetails(listingPayload({ ...draft, description: 'x', condition: 'hasDefects', mode: 'sell', price: '' })), ['defects', 'price']);
  assert.deepEqual(missingDetails(seedListings.find(item => item.kind === 'request')), []);
  const offerId = await repository.saveListing(null, listingPayload(draft));
  const proposal = await repository.simulateInterest(offerId);
  await assert.rejects(repository.changeHandover(proposal, 'accept'), { message: 'details_missing' });
  // The owner completes the details while the proposal waits, then confirms.
  await repository.saveListing(offerId, listingPayload({ ...draft, description: 'Quiet, three speeds' }));
  await repository.changeHandover(proposal, 'accept');
  let data = await repository.read();
  assert.equal(data.handovers.find(row => row.id === proposal).status, 'confirmed');
  await assert.rejects(repository.saveListing(offerId, listingPayload({ ...draft, description: 'Changed' })), { message: 'listing_locked' });
  // A cancelled handover closes the post: an unsuccessful attempt, not a decision to keep.
  await repository.changeHandover(proposal, 'cancel');
  assert.equal((await repository.read()).listings.find(row => row.id === offerId).status, 'closed');
  await assert.rejects(repository.keepListing(offerId), { message: 'listing_unavailable' });

  // N5: the owner keeps an available item; it is hidden from others until offered again.
  const lampId = await repository.saveListing(null, listingPayload({ ...draft, title: 'Lamp', description: 'Warm light' }));
  const waiting = await repository.simulateInterest(lampId);
  await assert.rejects(repository.keepListing(lampId), { message: 'listing_locked' });
  await repository.changeHandover(waiting, 'cancel');
  await repository.keepListing(lampId);
  data = await repository.read();
  const lamp = data.listings.find(row => row.id === lampId);
  assert.equal(lamp.status, 'kept');
  assert.equal(filterListings(data.listings, { kind: 'offer', categories: [], mode: '', query: 'Lamp' }, 'someone-else').some(row => row.id === lampId), false);
  await assert.rejects(repository.simulateInterest(lampId), { message: 'listing_unavailable' });
  await repository.offerAgain(lampId);
  data = await repository.read();
  assert.equal(data.listings.find(row => row.id === lampId).status, 'available');
  assert.equal(filterListings(data.listings, { kind: 'offer', categories: [], mode: '', query: 'Lamp' }, 'someone-else').some(row => row.id === lampId), true);
});

test('the sample Introduction to Algorithms appears among the offers only once relisted', () => {
  const offers = { kind: 'offer', categories: [], mode: '', query: 'algorithms' };
  const book = sampleListing('student-a');
  assert.equal(filterListings([book], offers, 'student-a').length, 0);
  assert.equal(filterListings([{ ...book, status: 'available' }], offers, 'student-a').length, 1);
});
