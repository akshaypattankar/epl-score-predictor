// db.js - Dexie.js IndexedDB wrapper
// Dexie is loaded globally via CDN in index.html

const db = new Dexie('EPLPredictorDB');

db.version(1).stores({
  predictions: '++id, match_id, friend_key, [match_id+friend_key]',
});

/**
 * Save or update a prediction for a given match + friend.
 */
export async function savePrediction(match_id, friend_key, predicted_home, predicted_away) {
  const pH = predicted_home !== '' && predicted_home !== null && predicted_home !== undefined
    ? parseInt(predicted_home, 10) : null;
  const pA = predicted_away !== '' && predicted_away !== null && predicted_away !== undefined
    ? parseInt(predicted_away, 10) : null;

  const existing = await db.predictions
    .where('[match_id+friend_key]')
    .equals([match_id, friend_key])
    .first();

  if (existing) {
    await db.predictions.update(existing.id, {
      predicted_home: pH, predicted_away: pA,
      updated_at: new Date().toISOString(),
    });
  } else {
    await db.predictions.add({
      match_id, friend_key,
      predicted_home: pH, predicted_away: pA,
      updated_at: new Date().toISOString(),
    });
  }
}

/**
 * Load all predictions as a lookup map: `${match_id}_${friend_key}` → prediction
 */
export async function loadAllPredictions() {
  const all = await db.predictions.toArray();
  return Object.fromEntries(all.map(p => [`${p.match_id}_${p.friend_key}`, p]));
}
