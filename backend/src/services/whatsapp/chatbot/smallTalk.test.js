import test from 'node:test';
import assert from 'node:assert/strict';
import { isPureAck, isAnnounceReply } from './smallTalk.js';

// Messages réellement reçus par l'école MARCEL ARNAUD le 2026-08-26.
test('les politesses ne partent pas vers l\'IA', () => {
  for (const t of ['Merci', 'merci beaucoup', 'Ok', 'Bien reçu', '👍🏼👍🏼', 'شكرا', 'ان شاء الله', 'safi']) {
    assert.ok(isPureAck(t), t);
  }
});

test('une vraie question n\'est jamais prise pour une politesse', () => {
  for (const t of [
    'Merci samedi inchalah je viendrie payer merci',
    'et pour chahd zeghloul??',
    'Stp prix dyal programe nenuphar cp',
    'Bonjour a tous, Bonne reprise',
    'quelles sont les notes de mon fils',
  ]) {
    assert.ok(!isPureAck(t), t);
    assert.ok(!isAnnounceReply(t), t);
  }
});

test('les réponses aux annonces sont reconnues', () => {
  for (const t of [
    'Oui',
    'Oui, je souhaite recevoir le détail du message. Merci',
    "Bonjour, J'aimerais bien recevoir le detail",
    'Oui avec plaisir',
    'Oui marhba',
  ]) {
    assert.ok(isAnnounceReply(t), t);
  }
});
