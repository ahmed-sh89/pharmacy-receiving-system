// Offline pre-fix reproduction. Loads unchanged Project B scripts in a VM.
// No browser, credentials, real network, or real storage. Cloud script binding
// runs offline/unauthenticated; timers and DOM events never run automatically.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['js/config.js', 'js/utils.js', 'js/state.js', 'js/receiving.js',
  'js/reports.js', 'js/orders.js', 'cloud-workspace.js'];

async function scenario(count, staleCount, pending = false) {
  const storage = new Map();
  const calls = [];
  const paints = [];
  let stale, ledger = [], release, entered;
  const blocked = new Promise(resolve => { entered = resolve; });
  let hold = true;
  const context = vm.createContext({
    console, structuredClone,
    navigator: { onLine: false },
    document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; } },
    setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
    localStorage: { getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) },
    AuthState: { context: null },
    fetch() { throw new Error('Network forbidden'); },
    addEventListener() {},
    refreshEntireUI() { paints.push(sample()); },
    async authRpc(name, args) {
      calls.push({ name, args });
      assert.equal(args.p_pharmacy_id, 'SYNTHETIC-PHARMACY');
      if (name === 'get_pharmflow_workspace_generation') return 7;
      if (name === 'get_pharmflow_cloud_workspace') return structuredClone(stale);
      if (name === 'list_pharmflow_cloud_transactions_v2') {
        if (hold) { entered(); await new Promise(resolve => { release = resolve; }); hold = false; }
        const start = args.p_after_transaction_id
          ? ledger.findIndex(row => row.transaction_id === args.p_after_transaction_id) + 1 : 0;
        return structuredClone(ledger.slice(start, start + args.p_limit));
      }
      throw new Error('Unexpected/forbidden RPC: ' + name);
    }
  });
  context.window = context;
  const run = code => vm.runInContext(code, context);
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  function sample() {
    return JSON.parse(run(`JSON.stringify({
      received: AppState.workspace.orderData[0].receivedQty,
      remaining: AppState.workspace.orderData[0].remainingQty,
      history: AppState.workspace.receivingHistory.length,
      ids: AppState.indexes.transactionIds.size,
      perOrder: buildReceivedQuantityByOrder().get('SYNTHETIC-A||X'),
      completedItems: AppState.statistics.completedItems,
      remainingItems: AppState.statistics.remainingItems,
      totalScans: AppState.statistics.totalScans,
      pending: readCloudQueue().length,
      generation: PharmFlowCloudWorkspace.generation,
      revision: PharmFlowCloudWorkspace.activeManifestRevision
    })`));
  }
  run(`
    navigator.onLine = true;
    AuthState.context = {pharmacy_id:'SYNTHETIC-PHARMACY', user_id:'SYNTHETIC-USER'};
    AppState.session.deviceId = 'SYNTHETIC-DEVICE';
    localStorage.setItem(APP_CONFIG.storageKeys.deviceId, JSON.stringify('SYNTHETIC-DEVICE'));
    Object.assign(PharmFlowCloudWorkspace, {
      activeAccountScope: getAuthenticatedWorkspaceScope(), generation: 7,
      hydratedPharmacyId: 'SYNTHETIC-PHARMACY', activeManifestPresent: true,
      activeManifestRevision: 9, loginAuthorityReady: true
    });
    AppState.workspace = {...createEmptyWorkspace(), active: true, orderId: 'SYNTHETIC-A',
      selectedOrderNumber: 'SYNTHETIC-A',
      orderFiles: [{documentId: 'SYNTHETIC-A', name: 'Synthetic Order A', rowCount: 1}],
      orderData: [{itemCode:'X', itemName:'Synthetic Item X', orderedQty:11,
        receivedQty:0, orderNumbers:['SYNTHETIC-A']}]
    };
    rebuildStateIndexes();
  `);
  // The 1000-ID stress fixture uses zero-quantity padding, not 1000 real scans.
  const transactions = Array.from({ length: count }, (_, i) => ({
    transactionId: `SYNTHETIC-TX-${String(i).padStart(4, '0')}`,
    orderId: 'SYNTHETIC-A', selectedOrderNumber: 'SYNTHETIC-A', itemCode: 'X',
    quantity: i === count - 1 ? 10 : i === count - 2 ? 1 : 0,
    source: i === count - 1 ? 'MANUAL_ADD' : 'SCAN', cloudSynced: !pending,
    dateTime: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()
  }));
  context.fixture = transactions;
  run(`fixture.forEach(addReceivingTransaction); rebuildReceivingQuantitiesFromLedger(); recalculateStatistics();
    if (${pending}) writeCloudQueue(fixture);
    PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature = stableCloudWorkspaceSignature(serializeCurrentWorkspace());`);
  const before = sample();
  assert.equal(before.received, 11);
  // Structural manifest control: stale embedded quantity must preserve history.
  run(`const manifestControl = deepClone(AppState.workspace);
    manifestControl.orderData[0].receivedQty = 0;
    applyActiveOrderManifest(manifestControl, 9);`);
  assert.equal(sample().received, 11);
  stale = JSON.parse(run('JSON.stringify(serializeCurrentWorkspace())'));
  stale.workspace.receivingHistory = transactions.slice(0, staleCount);
  stale.workspace.orderData[0].receivedQty = 0;
  stale.workspace.orderData[0].remainingQty = 11;
  stale.workspace.orderData[0].status = run('APP_CONFIG.statuses.pending');
  stale = { workspace: stale, updated_at: '2026-01-01T01:00:00Z' };
  context.staleFixture = stale;
  assert.equal(run('stableCloudWorkspaceSignature(staleFixture.workspace, staleFixture) !== PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature'), true);
  assert.equal(await run('reconcileCloudWorkspaceAuthority()'), true);
  const afterStale = sample();
  assert.equal(afterStale.pending, pending ? count : 0);
  const persisted = JSON.parse(storage.get(run('getScopedWorkspaceStorageKey()')));
  assert.equal(persisted.workspace.receivingHistory.length, staleCount);
  assert.equal(persisted.workspace.orderData[0].receivedQty, 0);
  // Start the actual ledger pull and hold its mock response before any merge.
  ledger = transactions.map(tx => ({ transaction_id: tx.transactionId, order_number: tx.orderId,
    item_code: tx.itemCode, quantity: tx.quantity, source: tx.source, payload: tx,
    sync_created_at: tx.dateTime }));
  const recovery = run('pullCloudWorkspaceTransactions({force:true})');
  await blocked;
  assert.deepEqual(sample(), afterStale);
  release();
  assert.equal(await recovery, true);
  const recovered = sample();
  assert.equal(afterStale.received, 0);
  assert.equal(afterStale.history, staleCount);
  assert.equal(afterStale.ids, staleCount);
  assert.equal(afterStale.completedItems, 0);
  assert.equal(afterStale.remainingItems, 1);
  assert.equal(recovered.received, 11);
  assert.equal(recovered.history, count);
  assert.equal(recovered.ids, count);
  assert.deepEqual(JSON.parse(run('JSON.stringify([...AppState.indexes.transactionIds].sort())')),
    transactions.map(tx => tx.transactionId).sort());
  assert.ok(paints.some(p => p.received === 0));
  const completeRows=ledger; ledger = [];
  // Cursor control: repeat restore after bootstrap; an empty delta cannot recover IDs.
  run(`PharmFlowCloudWorkspace.lastAppliedWorkspaceSignature = stableCloudWorkspaceSignature(serializeCurrentWorkspace());`);
  assert.equal(await run('reconcileCloudWorkspaceAuthority()'), true);
  assert.equal(await run('pullCloudWorkspaceTransactions({force:true})'), true);
  const afterEmptyDelta = sample();
  assert.equal(afterEmptyDelta.received, 0);
  assert.equal(afterEmptyDelta.history, staleCount);
  // Signed-quantity control uses the real merge, without any max(old,new) fix.
  context.completeLedger = completeRows;
  run(`mergeCloudReceivingLedger(completeLedger);
    mergeCloudReceivingLedger([{transaction_id:'SYNTHETIC-NEGATIVE',order_number:'SYNTHETIC-A',item_code:'X',quantity:-2}]);`);
  assert.equal(sample().received, 9);
  return { scenario: `${count} -> ${staleCount} -> ${count}`, pendingFixture: pending,
    before, afterStale, recovered, afterEmptyDelta, negativeControlReceived: 9,
    rpcNames: [...new Set(calls.map(c => c.name))] };
}

const results = [];
for (const args of [[2, 0], [1000, 997], [2, 0, true]]) results.push(await scenario(...args));
console.log(JSON.stringify({ verdict: 'PRE-FIX BUG REPRODUCED', results }, null, 2));

