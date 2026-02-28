/**
 * Script pour activer le webhook sur une session existante
 * Usage: node backend/tests/test-webhook-activation.js <SESSION_ID> <AUTH_TOKEN>
 */

const sessionId = process.argv[2];
const authToken = process.argv[3];

if (!sessionId || !authToken) {
  console.error('❌ Usage: node test-webhook-activation.js <SESSION_ID> <AUTH_TOKEN>');
  console.error('   Exemple: node test-webhook-activation.js 123 eyJhbGc...');
  process.exit(1);
}

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function activateWebhook() {
  console.log('═══════════════════════════════════════════════');
  console.log('🔧 Activation du webhook pour la session');
  console.log('═══════════════════════════════════════════════');
  console.log(`Session ID: ${sessionId}`);
  console.log(`API URL: ${API_URL}`);
  console.log('');

  try {
    const response = await fetch(`${API_URL}/api/admin/whatsapp/sessions/${sessionId}/webhook`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok && data.success) {
      console.log('✅ Webhook activé avec succès !');
      console.log('');
      console.log('📋 Détails:');
      console.log(`   Webhook URL: ${data.webhook_url}`);
      console.log(`   Webhook Secret: ${data.webhook_secret || 'Généré par WasenderAPI'}`);
      console.log('');
      console.log('🎉 Le chatbot IA est maintenant opérationnel !');
      console.log('   Les parents peuvent envoyer des messages WhatsApp');
      console.log('   et recevoir des réponses automatiques.');
      console.log('');
    } else {
      console.error('❌ Erreur lors de l\'activation du webhook');
      console.error(`   Status: ${response.status}`);
      console.error(`   Message: ${data.error || data.message || 'Erreur inconnue'}`);
      console.error('');
      console.error('💡 Vérifiez que:');
      console.error('   1. Le SESSION_ID est correct');
      console.error('   2. Le token d\'authentification est valide');
      console.error('   3. La session appartient à votre école');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Erreur de connexion:', error.message);
    console.error('');
    console.error('💡 Vérifiez que le serveur backend est démarré');
    console.error(`   URL: ${API_URL}`);
    process.exit(1);
  }
}

activateWebhook();
