import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionLabel,
  assistantText,
  localizeAssistantReply,
  normalizeAssistantLocale,
  sectionLabel,
} from './parentAssistantLocalization.js';

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
