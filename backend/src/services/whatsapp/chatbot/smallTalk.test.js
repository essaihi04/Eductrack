import test from 'node:test';
import assert from 'node:assert/strict';
import { isPureAck, isAnnounceReply, isGreeting } from './smallTalk.js';

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

// Ces salutations recevaient « Je n'ai pas cette information dans les documents »
// ou « 🤔 Option non reconnue » — jamais un accueil.
test('les salutations, abréviations comprises, sont reconnues', () => {
  for (const t of [
    'Bonjour', 'Bonsoir', 'Bjr', 'Bnj', 'Bsr', 'Salut', 'Cc', 'Hello',
    'Salam', 'Slm', 'Slam', 'Sl', 'Marhba',
    'سلام', 'السلام', 'السلام عليكم', 'وعليكم السلام', 'مرحبا',
    'السلام عليكم ورحمة الله وبركاته', 'salam alaykom wa rahmatou llah',
  ]) {
    assert.ok(isGreeting(t), t);
  }
});

test('une demande qui commence par une salutation reste une demande', () => {
  for (const t of [
    'Salam imta kayna la rentré scolaire li ki9raw f 2ème année lycée',
    'سلام هل ممكن ان اعرف تاريخ الدخول',
    'السلام عليكم عافاكم صيفطو ليا التفاصيل وشكرا',
    'Bonjour comment mon enfant a passer cette semaine',
    'Merci',
  ]) {
    assert.ok(!isGreeting(t), t);
  }
});
