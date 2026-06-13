import { prisma } from '../lib/prisma.js';
import { activateClientDisputeCampaign } from '../lib/disputeAutomation.js';

async function clearAndRegenerate() {
  const clients = [
    '770a309f-a458-4dc4-ae19-80add69d80da',  // Dwayne Arnold
    '637c2e93-cfa6-4342-b3f9-b9d027868933',  // Fatima Curry
    '1335cc1d-81cf-4c3a-9b5f-0cc2e2548578',  // Sharon Gallaway
    '1bf7a5c0-20ec-4e35-9442-23490c3121a7',  // Kiara Dawson
    '217d8e06-ed9a-4fe3-8911-5f2b7d9cf0df'   // Chanthy Kim
  ];
  
  // Step 1: Clear old dispute data
  console.log('🧹 Clearing old dispute data...\n');
  for (const id of clients) {
    console.log('Clearing client:', id);
    await prisma.document.deleteMany({ where: { clientId: id, type: 'DISPUTE_LETTER' } });
    await prisma.disputeItem.deleteMany({ where: { clientId: id } });
    console.log('  ✅ Cleared');
  }
  
  // Step 2: Regenerate with new consolidated format
  console.log('\n🔄 Regenerating with consolidated format...\n');
  for (const id of clients) {
    const client = await prisma.client.findUnique({
      where: { id },
      include: { user: true, progress: true }
    });
    
    if (!client || !client.progress?.analysis) {
      console.log(`⏭️  Skipping ${id} — no analysis`);
      continue;
    }
    
    console.log(`📋 Processing: ${client.user.firstName} ${client.user.lastName}`);
    
    try {
      const result = await activateClientDisputeCampaign(id);
      if (result.success) {
        console.log(`  ✅ SUCCESS: ${result.lettersGenerated} consolidated letters generated`);
        console.log(`  ✅ Email: ${result.emailSent ? 'Sent' : 'Failed (SendGrid limit)'}`);
      } else {
        console.log(`  ❌ FAILED: ${result.errors?.join(', ')}`);
      }
    } catch (error) {
      console.log(`  ❌ ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
    console.log('');
  }
  
  console.log('✅ Regeneration complete!');
  process.exit(0);
}

clearAndRegenerate().catch(e => { console.error(e); process.exit(1); });
