/**
 * Script de test pour le webhook WhatsApp Chatbot
 * 
 * Usage:
 * node backend/tests/webhook-test.js
 */

const API_URL = process.env.API_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET || 'test_secret';

// Test 1: Vérifier que le webhook est actif
async function testWebhookActive() {
  console.log('\n🧪 Test 1: Vérification webhook actif...');
  
  try {
    const response = await fetch(`${API_URL}/api/webhooks/whatsapp/incoming`);
    const data = await response.json();
    
    if (data.status === 'active') {
      console.log('✅ Webhook actif:', data.message);
      return true;
    } else {
      console.log('❌ Webhook non actif');
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return false;
  }
}

// Test 2: Envoyer un message de test
async function testIncomingMessage() {
  console.log('\n🧪 Test 2: Envoi message de test...');
  
  const testPayload = {
    event: 'messages.received',
    timestamp: Math.floor(Date.now() / 1000),
    data: {
      messages: {
        key: {
          id: `test_${Date.now()}`,
          fromMe: false,
          remoteJid: '212600000000@s.whatsapp.net',
          cleanedSenderPn: '212600000000'
        },
        messageBody: 'Bonjour, comment va mon fils Ahmed aujourd\'hui ?',
        message: {
          conversation: 'Bonjour, comment va mon fils Ahmed aujourd\'hui ?'
        }
      }
    }
  };
  
  try {
    const response = await fetch(`${API_URL}/api/webhooks/whatsapp/incoming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': WEBHOOK_SECRET
      },
      body: JSON.stringify(testPayload)
    });
    
    const data = await response.json();
    
    if (response.ok && data.received) {
      console.log('✅ Message reçu par le webhook');
      console.log('   Réponse:', JSON.stringify(data, null, 2));
      return true;
    } else {
      console.log('❌ Erreur réception message');
      console.log('   Status:', response.status);
      console.log('   Réponse:', JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return false;
  }
}

// Test 3: Vérifier la signature invalide
async function testInvalidSignature() {
  console.log('\n🧪 Test 3: Test signature invalide...');
  
  const testPayload = {
    event: 'messages.received',
    data: { messages: { key: { id: 'test' }, messageBody: 'test' } }
  };
  
  try {
    const response = await fetch(`${API_URL}/api/webhooks/whatsapp/incoming`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': 'invalid_signature'
      },
      body: JSON.stringify(testPayload)
    });
    
    if (response.status === 401) {
      console.log('✅ Signature invalide correctement rejetée');
      return true;
    } else {
      console.log('❌ Signature invalide acceptée (problème de sécurité!)');
      return false;
    }
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    return false;
  }
}

// Exécuter tous les tests
async function runAllTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('🚀 Tests du Webhook WhatsApp Chatbot');
  console.log('═══════════════════════════════════════════════');
  console.log(`API URL: ${API_URL}`);
  console.log(`Webhook Secret: ${WEBHOOK_SECRET ? '✓ Configuré' : '✗ Non configuré'}`);
  
  const results = {
    webhookActive: await testWebhookActive(),
    incomingMessage: await testIncomingMessage(),
    invalidSignature: await testInvalidSignature()
  };
  
  console.log('\n═══════════════════════════════════════════════');
  console.log('📊 Résultats des tests:');
  console.log('═══════════════════════════════════════════════');
  console.log(`Webhook actif:        ${results.webhookActive ? '✅' : '❌'}`);
  console.log(`Message entrant:      ${results.incomingMessage ? '✅' : '❌'}`);
  console.log(`Sécurité signature:   ${results.invalidSignature ? '✅' : '❌'}`);
  
  const totalTests = Object.keys(results).length;
  const passedTests = Object.values(results).filter(r => r).length;
  
  console.log('\n═══════════════════════════════════════════════');
  console.log(`Résultat final: ${passedTests}/${totalTests} tests réussis`);
  console.log('═══════════════════════════════════════════════\n');
  
  process.exit(passedTests === totalTests ? 0 : 1);
}

// Lancer les tests
runAllTests().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
