import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionLabel,
  assistantText,
  localizeAssistantReply,
  normalizeAssistantLocale,
  sectionLabel,
} from './parentAssistantLocalization.js';
import { isSuppliesQuery } from './whatsapp/chatbot/suppliesQuery.js';
import { isStrongPassword, passwordPolicy } from './parentCredentialSecurity.js';

test('la langue de l’assistant est normalisée sans ambiguïté', () => {
  assert.equal(normalizeAssistantLocale('ar-MA'), 'ar');
  assert.equal(normalizeAssistantLocale('fr-FR'), 'fr');
  assert.equal(normalizeAssistantLocale(), 'fr');
});

test('le menu parent utilise les libellés arabes attendus', () => {
  assert.equal(sectionLabel('pedagogy', 'Pédagogie', 'ar'), 'الدراسة');
  assert.equal(actionLabel('pedagogy.attendance', 'Présence cette semaine', 'ar'), 'حضور هذا الأسبوع');
  assert.equal(actionLabel('pedagogy.attendance', 'Présence cette semaine', 'fr'), 'Présence cette semaine');
});

test('les réponses générées sont traduites sans modifier les données de l’école', () => {
  const reply = localizeAssistantReply(
    'Présence cette semaine — École Albaida\nAucune séance enregistrée cette semaine.',
    'ar',
  );

  assert.match(reply, /الحضور هذا الأسبوع/);
  assert.match(reply, /لا توجد أي حصة مسجلة هذا الأسبوع/);
  assert.match(reply, /École Albaida/);
});

test('les messages système sont localisés et interpolés', () => {
  assert.equal(assistantText('serverError', 'ar'), 'حدث خطأ في الخادم');
  assert.equal(
    assistantText('disabledInfo', 'ar', { school: 'Albaida' }),
    'لم تعد Albaida تتيح هذه المعلومة. يُرجى التواصل مباشرة مع المؤسسة.',
  );
});

test('les fournitures sont reconnues en français, arabe et darija', () => {
  assert.equal(isSuppliesQuery('Je cherche la liste des fournitures'), true);
  assert.equal(isSuppliesQuery('فين نلقى لائحة اللوازم المدرسية؟'), true);
  assert.equal(isSuppliesQuery('3afak lwazim dyal 2AP'), true);
  assert.equal(isSuppliesQuery('Quel est son emploi du temps ?'), false);
});

test('les mots de passe réinitialisés respectent la politique parent', () => {
  assert.equal(isStrongPassword('Simple2026'), false);
  assert.equal(isStrongPassword('Solide#2026'), true);
  assert.deepEqual(passwordPolicy('Solide#2026'), {
    length: true,
    letter: true,
    number: true,
    special: true,
  });
});
