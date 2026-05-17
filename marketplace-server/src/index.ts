import express from 'express';
import { Firestore } from '@google-cloud/firestore';
import { v4 as uuidv4 } from 'uuid';
import { google } from 'googleapis';

const app = express();
app.use(express.json());

// 環境変数から設定を取得
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'synapse-agent-prod';
const DATABASE_ID = process.env.FIRESTORE_DATABASE || 'synapse';
const PROVIDER_ID = process.env.MARKETPLACE_PROVIDER_ID || 'synapse-agent-framework';
const PORT = process.env.PORT || 8080;

const firestore = new Firestore({ 
  projectId: PROJECT_ID,
  databaseId: DATABASE_ID 
});

// Cloud Commerce Procurement API の初期化関数
// (起動時のクラッシュを防ぐため、必要になったタイミングで呼び出します)
function getProcurementClient() {
  return (google as any).cloudcommerceprocurement('v1');
}

// テスト用マスターキー
const MASTER_LICENSE_KEY = process.env.MASTER_LICENSE_KEY || `master_${uuidv4()}`;

/**
 * 1. マケプレ購入通知受け取り用エンドポイント (Pub/Sub Push)
 */
app.post('/pubsub/procurement', async (req, res) => {
  try {
    const message = req.body.message;
    if (!message || !message.data) {
      return res.status(400).send('Bad Request: Invalid Pub/Sub message');
    }

    const dataString = Buffer.from(message.data, 'base64').toString('utf-8');
    const event = JSON.parse(dataString);
    
    console.log(`[Marketplace Event] type=${event.eventType}, entitlementId=${event.entitlement?.id}`);

    const eventType = event.eventType;
    const entitlementId = event.entitlement?.id;
    const accountId = event.entitlement?.account;

    if (!entitlementId) return res.status(200).send('OK (No Entitlement ID)');

    // 新規購入リクエスト (ENTITLEMENT_CREATION_REQUESTED)
    if (eventType === 'ENTITLEMENT_CREATION_REQUESTED') {
      const docRef = firestore.collection('licenses').doc(entitlementId);
      const doc = await docRef.get();

      if (doc.exists && doc.data()?.status === 'ACTIVE') {
        console.log(`Entitlement ${entitlementId} is already processed. Skipping.`);
        return res.status(200).send('OK (Already Processed)');
      }

      const licenseKey = `syn_${uuidv4().replace(/-/g, '')}`;

      await docRef.set({
        accountId,
        entitlementId,
        licenseKey,
        status: 'PENDING_APPROVAL',
        createdAt: new Date()
      });

      try {
        await approveEntitlement(entitlementId);
        await docRef.update({ 
          status: 'ACTIVE',
          approvedAt: new Date()
        });
        console.log(`Successfully approved and activated: ${licenseKey}`);
      } catch (err: any) {
        console.error('Failed to approve entitlement via Google API:', err.message);
        return res.status(500).send('API Approval Error');
      }
    } 
    else if (eventType === 'ENTITLEMENT_CANCELLED' || eventType === 'ENTITLEMENT_SUSPENDED') {
      await firestore.collection('licenses').doc(entitlementId).update({
        status: eventType === 'ENTITLEMENT_CANCELLED' ? 'CANCELLED' : 'SUSPENDED',
        updatedAt: new Date()
      });
      console.log(`License ${entitlementId} status updated to ${eventType}`);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Fatal error in Pub/Sub handler:', error);
    res.status(500).send('Internal Server Error');
  }
});

/**
 * 2. ライブラリからのライセンス検証用エンドポイント
 */
app.post('/api/verify-license', async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ valid: false });

  // ⚡️ マスターキー（裏口）のチェック
  if (licenseKey === MASTER_LICENSE_KEY) {
    console.log('Master license key used. Verification bypassed.');
    return res.status(200).json({ 
      valid: true, 
      message: 'Master key verified (Test Mode).' 
    });
  }

  try {
    const snapshot = await firestore.collection('licenses')
      .where('licenseKey', '==', licenseKey)
      .where('status', '==', 'ACTIVE')
      .get();

    if (snapshot.empty) {
      return res.status(403).json({ valid: false, message: 'Invalid or inactive license.' });
    }

    res.status(200).json({ valid: true });
  } catch (error) {
    console.error('Error verifying license:', error);
    res.status(500).json({ valid: false });
  }
});

app.listen(PORT, () => {
  console.log(`Synapse Marketplace Server running on port ${PORT}`);
});

// --- Helper Functions ---

/**
 * Google Cloud Commerce Procurement API を叩いて Entitlement を承認する
 */
async function approveEntitlement(entitlementId: string) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform']
  });
  const authClient = await auth.getClient();
  google.options({ auth: authClient as any });

  const name = `providers/${PROVIDER_ID}/entitlements/${entitlementId}`;

  const procurement = getProcurementClient();
  await procurement.providers.entitlements.approve({
    name: name,
    requestBody: {
      // プラン名などは event から取得して動的に変えることも可能
    }
  });
}
