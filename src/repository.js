import { activeStatuses, allowedActions, campusDate, colleges, missingDetails, normalizeCondition, possessionFor, slotEnded, reachable, sampleId, sampleListing, seedListings, testModes } from './model.js';

const storageKey = 'campus-loop-web-v1';
const guest = 'local-guest';
const demoOwner = 'demo-owner';
const demoRequester = 'demo-requester';
const demoPeerName = 'Demo Kai';

function nextCampusDay() {
  const day = new Date(`${campusDate()}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

function createRelistingSample(owner, placed) {
  const listing = sampleListing(owner);
  const handover = {
    id: 'sample-handover', listing_id: listing.id, item_title: listing.title, owner_id: owner,
    recipient_id: null, pickup_date: campusDate(), pickup_time: '18:00', place: 'library', status: 'cancelled',
    placed, simulated: true, created_at: new Date().toISOString(),
  };
  const message = { id: 'sample-message', handover_id: handover.id, sender_id: null,
    body: 'Demo Rui: I can no longer make the pickup.' };
  return { listing, handover, message };
}

function reopenListing(listing, handover, possession) {
  if (listing?.status !== 'closed' || handover?.status !== 'cancelled' || possession !== possessionFor(handover)) {
    throw new Error('confirm_possession');
  }
  listing.status = 'available';
  // Pickup times that have already passed are not offered again.
  listing.pickup_slots = (listing.pickup_slots ?? []).filter(slot => !slotEnded(slot));
}

const sampleDeletedKey = 'campus-loop-sample-deleted';

function demoRepository(scenario, startItemId, relistingPractice = false) {
  let data = { listings: structuredClone(seedListings), handovers: [], messages: [], replies: [], profile: { college: '', pickup_area: '' } };
  if (!scenario) {
    try { data = { ...data, ...JSON.parse(localStorage.getItem(storageKey)) }; } catch { /* Browser storage is optional. */ }
    data.profile = { college: '', pickup_area: '', ...data.profile };
    // Saved demo data from an earlier version may lack newer sample listings; add them back.
    const known = new Set(data.listings.map(row => row.id));
    data.listings.push(...structuredClone(seedListings.filter(row => !known.has(row.id))));
    for (const row of data.listings) {
      if (row.condition) row.condition = normalizeCondition(row.condition);
      if (row.simulated && !row.pickup_area) row.pickup_area = seedListings.find(seed => seed.id === row.id)?.pickup_area ?? '';
    }
  }

  function persist() {
    if (scenario) return;
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch { /* Without storage, changes last until reload. */ }
  }

  // Normal mode: the sample Introduction to Algorithms is saved with your own posts, so once relisted it can be
  // handed over like them. Deleting it only hides it in this browser; Reset demo brings it back.
  let sampleDeleted = false;
  try { sampleDeleted = localStorage.getItem(sampleDeletedKey) === '1'; } catch { /* Browser storage is optional. */ }
  function setSampleDeleted(value) {
    sampleDeleted = value;
    try { if (value) localStorage.setItem(sampleDeletedKey, '1'); else localStorage.removeItem(sampleDeletedKey); }
    catch { /* The sample stays hidden for this session. */ }
  }
  function restoreSample() {
    const ids = new Set(data.handovers.filter(row => row.listing_id === sampleId).map(row => row.id));
    data.listings = data.listings.filter(row => row.id !== sampleId);
    data.handovers = data.handovers.filter(row => !ids.has(row.id));
    data.messages = data.messages.filter(row => !ids.has(row.handover_id));
    const { listing, handover, message } = createRelistingSample(guest, true);
    data.listings.unshift(listing);
    data.handovers.unshift(handover);
    data.messages.push(message);
  }
  if (!scenario && !sampleDeleted && !data.listings.some(row => row.id === sampleId)) {
    restoreSample();
    persist();
  }

  const recoverySample = ['recovery', 'retrieval'].includes(scenario)
    ? createRelistingSample(guest, scenario === 'retrieval') : null;
  if (recoverySample) {
    const { listing, handover, message } = recoverySample;
    data.listings.unshift(listing);
    data.handovers.unshift(handover);
    data.messages.push(message);
  }

  return {
    source: scenario ? 'scenario' : 'local', userId: guest, scenario, startItemId,
    ...(!scenario && {
      async resetRelisting() {
        setSampleDeleted(false);
        await this.resetDemoActivity();
        restoreSample();
        persist();
      },
    }),
    ...(relistingPractice && {
      async resetRelisting() {
        const { listing, handover, message } = recoverySample;
        listing.status = 'closed';
        if (!data.listings.includes(listing)) {
          data.listings.unshift(listing);
          data.handovers.unshift(handover);
          data.messages.push(message);
        }
      },
    }),
    // The sample book stays first in My listings.
    async read() {
      const copy = structuredClone(data);
      copy.listings.sort((a, b) => (b.id === sampleId) - (a.id === sampleId));
      return copy;
    },
    async setCollege(college) {
      if (college && !colleges.includes(college)) throw new Error('invalid_college');
      data.profile = { ...data.profile, college: college || '' };
      persist();
    },
    async sendReply(id, offer) {
      const request = data.listings.find(row => row.id === id && row.kind === 'request' && row.status === 'available'
        && reachable(row, data.profile.college) && row.owner_id !== guest);
      if (!request) throw new Error('request_unavailable');
      const replyId = crypto.randomUUID();
      data.replies.unshift({ id: replyId, request_id: id, request_title: request.title, requester_name: request.display_name,
        requester_id: request.owner_id, sender_id: guest, mode: request.mode, ...offer });
      persist();
      return replyId;
    },
    // Demo only: the simulated requester accepts a reply sent to a sample request.
    // Demo only: someone wants your offer. A simulated student proposes a time and place.
    async simulateInterest(id) {
      const item = data.listings.find(row => row.id === id && row.owner_id === guest && row.kind === 'offer'
        && row.status === 'available' && row.audience !== 'private');
      if (scenario || !item || data.handovers.some(row => row.listing_id === id && activeStatuses.includes(row.status))) {
        throw new Error('listing_unavailable');
      }
      const slot = item.pickup_slots.find(row => row.date > campusDate());
      const transfer = {
        id: crypto.randomUUID(), listing_id: id, item_title: item.title, owner_id: guest, recipient_id: demoRequester,
        pickup_date: slot?.date ?? nextCampusDay(), pickup_time: slot?.start ?? '18:00', place: 'library',
        status: 'proposed', placed: false, simulated: true, created_at: new Date().toISOString(),
      };
      data.handovers.unshift(transfer);
      data.messages.push({ id: crypto.randomUUID(), handover_id: transfer.id, sender_id: demoRequester,
        body: `${demoPeerName}: Hi! I would like this item. Does this time and place work for you?` });
      persist();
      return transfer.id;
    },
    // Demo only: someone has the item you asked for. A simulated student replies to your request.
    async simulateReply(id) {
      const request = data.listings.find(row => row.id === id && row.owner_id === guest && row.kind === 'request'
        && row.status === 'available' && row.audience !== 'private');
      if (scenario || !request) throw new Error('request_unavailable');
      const replyId = crypto.randomUUID();
      data.replies.unshift({ id: replyId, request_id: id, request_title: request.title, requester_name: request.display_name,
        requester_id: guest, sender_id: demoRequester, sender_name: demoPeerName, item_title: request.title,
        description: `${demoPeerName}: I have one in good condition and can meet on campus.`, condition: 'working', defects: '',
        mode: request.mode, price: request.mode === 'sell' ? 50 : null, simulated: true });
      persist();
      return replyId;
    },
    // Demo only: the simulated requester accepts your reply, or you accept a simulated reply to your request.
    async acceptReply(id) {
      const reply = data.replies.find(row => row.id === id);
      const request = reply && data.listings.find(row => row.id === reply.request_id);
      const allowed = (reply?.sender_id === guest && request?.simulated) || (reply?.requester_id === guest && reply.simulated);
      if (scenario || !allowed || reply.status === 'accepted') throw new Error('request_unavailable');
      reply.status = 'accepted';
      persist();
    },
    // Demo only: you choose a time and place; the simulated other person agrees to it.
    async arrangeReply(id, plan) {
      const reply = data.replies.find(row => row.id === id && row.status === 'accepted'
        && (row.sender_id === guest || (row.requester_id === guest && row.simulated)));
      if (scenario || !reply) throw new Error('request_unavailable');
      const giving = reply.sender_id === guest;
      if (data.handovers.some(row => row.reply_id === id && ['proposed', 'confirmed', 'awaiting', 'completed'].includes(row.status))) {
        throw new Error('active_handover');
      }
      const request = data.listings.find(row => row.id === reply.request_id);
      const transfer = {
        id: crypto.randomUUID(), listing_id: reply.request_id, reply_id: id, item_title: reply.item_title,
        owner_id: giving ? guest : demoOwner, recipient_id: giving ? demoRequester : guest, ...plan,
        status: 'confirmed', placed: false, simulated: true, created_at: new Date().toISOString(),
      };
      if (request) request.status = 'reserved';
      data.handovers.unshift(transfer);
      persist();
      return transfer.id;
    },
    async withdrawReply(id) {
      if (!data.replies.some(row => row.id === id && row.sender_id === guest)) throw new Error('request_unavailable');
      if (data.handovers.some(row => row.reply_id === id)) throw new Error('reply_in_handover');
      data.replies = data.replies.filter(row => row.id !== id);
      persist();
    },
    async saveListing(id, payload) {
      const item = id && data.listings.find(row => row.id === id && row.owner_id === guest);
      // R-F2: details can still be completed while a proposal waits for the owner; only confirmed handovers lock the post.
      if (id && (!item || item.status !== 'available' || data.handovers.some(row => row.listing_id === id && ['confirmed', 'awaiting'].includes(row.status)))) {
        throw new Error('listing_locked');
      }
      // Like the database, a college-only post always uses the poster's own college.
      if (payload.audience === 'college' && !data.profile.college) throw new Error('college_required');
      const row = { id: id ?? crypto.randomUUID(), owner_id: guest, display_name: 'Campus member', status: 'available',
        art: payload.category === 'study' ? 'books' : payload.category === 'electronics' ? 'keyboard' : 'box', ...payload,
        college: payload.audience === 'college' ? data.profile.college : null };
      // R-U1: remember the pickup area so the next offer starts with it filled in.
      if (row.kind === 'offer' && row.pickup_area) data.profile = { ...data.profile, pickup_area: row.pickup_area };
      if (item) Object.assign(item, row);
      else data.listings.unshift(row);
      persist();
      return row.id;
    },
    async deleteListing(id) {
      const item = data.listings.find(row => row.id === id && row.owner_id === guest);
      if (!item) throw new Error('listing_unavailable');
      if (data.handovers.some(row => row.listing_id === id && activeStatuses.includes(row.status))) {
        throw new Error('listing_locked');
      }
      const handoverIds = new Set(data.handovers.filter(row => row.listing_id === id).map(row => row.id));
      data.listings = data.listings.filter(row => row.id !== id);
      data.handovers = data.handovers.filter(row => !handoverIds.has(row.id));
      data.messages = data.messages.filter(row => !handoverIds.has(row.handover_id));
      data.replies = data.replies.filter(row => row.request_id !== id);
      if (id === sampleId && !scenario) setSampleDeleted(true);
      persist();
    },
    async propose(id, plan) {
      const item = data.listings.find(row => row.id === id);
      const practiceAllowed = !scenario || scenario === 'handover';
      if (!practiceAllowed || !item?.simulated || item.owner_id === guest || item.kind !== 'offer' || item.status !== 'available') {
        throw new Error('listing_unavailable');
      }
      if (missingDetails(item).length) throw new Error('details_missing');
      const transfer = {
        id: crypto.randomUUID(), listing_id: id, item_title: item.title, owner_id: demoOwner, recipient_id: guest,
        ...plan, status: 'confirmed', placed: false, simulated: true, created_at: new Date().toISOString(),
      };
      item.status = 'reserved';
      data.handovers.unshift(transfer);
      persist();
      return transfer.id;
    },
    async resetDemoActivity() {
      const sampleIds = new Set(data.listings.filter(row => row.simulated && row.owner_id === null).map(row => row.id));
      const demoHandovers = data.handovers.filter(row => row.simulated);
      const removed = new Set(demoHandovers.map(row => row.id));
      const touched = new Set(demoHandovers.map(row => row.listing_id));
      data.handovers = data.handovers.filter(row => !removed.has(row.id));
      data.messages = data.messages.filter(row => !removed.has(row.handover_id));
      data.replies = data.replies.filter(row => !row.simulated && !sampleIds.has(row.request_id));
      // Sample posts and your own posts that took part in a demo handover become available again.
      for (const row of data.listings) if (sampleIds.has(row.id) || touched.has(row.id)) row.status = 'available';
      persist();
    },
    async changeHandover(id, action) {
      const transfer = data.handovers.find(row => row.id === id);
      const simulatesOwner = transfer?.simulated && ['hand', 'place'].includes(action) && transfer.owner_id === demoOwner
        && transfer.recipient_id === guest && transfer.status === 'confirmed';
      const simulatesRequester = transfer?.simulated && action === 'receive' && transfer.recipient_id === demoRequester
        && transfer.owner_id === guest && transfer.status === 'awaiting';
      if (!simulatesOwner && !simulatesRequester && !allowedActions(transfer, guest).includes(action)) throw new Error('invalid_transition');
      const item = data.listings.find(row => row.id === transfer.listing_id);
      if (action === 'accept' && missingDetails(item).length) throw new Error('details_missing');
      // Cancelling a reply handover puts the sample request back on the board instead of closing it.
      if (action === 'cancel' && transfer.status !== 'proposed') item.status = transfer.reply_id ? 'available' : 'closed';
      if (action === 'accept') item.status = 'reserved';
      if (action === 'place') transfer.placed = true;
      if (action === 'receive') item.status = 'completed';
      transfer.status = { accept: 'confirmed', hand: 'awaiting', place: 'awaiting', receive: 'completed', cancel: 'cancelled' }[action];
      persist();
    },
    // N5: keeping an item is the owner's choice and is recorded as 'kept', apart from a cancelled handover ('closed').
    async keepListing(id) {
      const item = data.listings.find(row => row.id === id && row.owner_id === guest && row.kind === 'offer');
      if (!item || item.status !== 'available') throw new Error('listing_unavailable');
      if (data.handovers.some(row => row.listing_id === id && activeStatuses.includes(row.status))) throw new Error('listing_locked');
      item.status = 'kept';
      persist();
    },
    async offerAgain(id) {
      const item = data.listings.find(row => row.id === id && row.owner_id === guest);
      if (item?.status !== 'kept') throw new Error('listing_unavailable');
      item.status = 'available';
      item.pickup_slots = (item.pickup_slots ?? []).filter(slot => !slotEnded(slot));
      persist();
    },
    async relist(id, possession) {
      const item = data.listings.find(row => row.id === id && row.owner_id === guest);
      const latest = data.handovers.find(row => row.listing_id === id);
      reopenListing(item, latest, possession);
      persist();
    },
    async sendMessage(id, body) {
      const transfer = data.handovers.find(row => row.id === id);
      if (!transfer || !activeStatuses.includes(transfer.status)) throw new Error('invalid_transition');
      data.messages.push({ id: crypto.randomUUID(), handover_id: id, sender_id: guest, body });
      persist();
    },
  };
}

export async function connectRepository() {
  const params = new URLSearchParams(location.search);
  const test = params.get('test');
  if (testModes.includes(test)) {
    const kind = { handover: 'offer', reply: 'request' }[test];
    const startItemId = seedListings.find(row => row.id === params.get('item') && row.kind === kind)?.id;
    const relistingPractice = test === 'retrieval' && ['handover', 'my'].includes(params.get('start'));
    return demoRepository(test, startItemId, relistingPractice);
  }
  // All data is kept in this browser; there is no server.
  return demoRepository(null);
}
