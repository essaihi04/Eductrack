import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../config/supabase.js';
import { drawSchoolLogo, fetchSchoolLogoBuffer } from './schoolLogo.js';
import { drawMixedParagraph, registerArabicFont } from './whatsapp/chatbot/pdfText.js';

const INK = '#1E1B4B';
const INDIGO = '#4F46E5';
const INDIGO_SOFT = '#EEF2FF';
const AMBER_SOFT = '#FFFBEB';
const AMBER = '#B45309';
const BORDER = '#E2E8F0';
const MUTED = '#64748B';

const LABELS = {
  fr: {
    title: 'Identifiants de connexion',
    subtitle: 'Document confidentiel — à conserver dans un endroit sûr',
    role: 'Compte',
    name: 'Utilisateur',
    email: 'Login (email)',
    password: 'Nouveau mot de passe',
    link: 'Lien de connexion',
    warning: "Ce mot de passe vient d'être réinitialisé. L'ancien mot de passe n'est plus valable. Ne partagez pas ce document.",
    generated: 'Document généré à la demande depuis le compte parent.',
  },
  ar: {
    title: 'بيانات الدخول',
    subtitle: 'وثيقة سرية — يرجى الاحتفاظ بها في مكان آمن',
    role: 'الحساب',
    name: 'المستخدم',
    email: 'البريد الإلكتروني',
    password: 'كلمة السر الجديدة',
    link: 'رابط الدخول',
    warning: 'تمت إعادة تعيين كلمة السر الآن ولم تعد الكلمة القديمة صالحة. لا تشاركوا هذه الوثيقة مع الغير.',
    generated: 'تم إنشاء هذه الوثيقة بطلب من حساب ولي الأمر.',
  },
};

const safeName = (value) => String(value || 'Compte')
  .normalize('NFD')
  .replace(/[^a-zA-Z0-9_-]+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_|_$/g, '')
  .slice(0, 50) || 'Compte';

const paragraph = (doc, text, x, y, width, options = {}) => drawMixedParagraph(doc, text, {
  x, y, width, size: options.size || 11, align: options.align || 'left',
  rtl: options.rtl || false, maxLines: options.maxLines,
});

export async function buildParentCredentialsPdf({
  schoolId, schoolName, accountName, accountRole, email, password, locale = 'fr',
}) {
  const lang = String(locale).startsWith('ar') ? 'ar' : 'fr';
  const rtl = lang === 'ar';
  const L = LABELS[lang];
  const { data: school } = await supabaseAdmin
    .from('schools')
    .select('name, logo_url')
    .eq('id', schoolId)
    .maybeSingle();
  const resolvedSchool = school?.name || schoolName || 'École';
  const logo = await fetchSchoolLogoBuffer(school?.logo_url);

  const buffer = await new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: { Title: L.title, Author: resolvedSchool, Subject: 'Identifiants de connexion' },
      });
      registerArabicFont(doc);
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const contentW = pageW - 96;
      doc.rect(0, 0, pageW, 124).fill(INK);
      doc.rect(0, 124, pageW, 5).fill('#F59E0B');

      doc.roundedRect(48, 28, 66, 66, 12).fill('#FFFFFF');
      const hasLogo = drawSchoolLogo(doc, logo, 55, 35, { fit: [52, 52], align: 'center', valign: 'center' });
      if (!hasLogo) {
        doc.fillColor(INDIGO);
        paragraph(doc, resolvedSchool.slice(0, 2).toUpperCase(), 48, 49, 66, { size: 20, align: 'center', rtl });
      }
      doc.fillColor('#FFFFFF');
      paragraph(doc, resolvedSchool, 132, 37, pageW - 180, { size: 18, rtl, align: rtl ? 'right' : 'left', maxLines: 1 });
      doc.fillColor('#C7D2FE');
      paragraph(doc, L.title, 132, 67, pageW - 180, { size: 12, rtl, align: rtl ? 'right' : 'left' });

      doc.fillColor(INK);
      paragraph(doc, L.title, 48, 158, contentW, { size: 23, rtl, align: rtl ? 'right' : 'left' });
      doc.fillColor(MUTED);
      paragraph(doc, L.subtitle, 48, 194, contentW, { size: 10, rtl, align: rtl ? 'right' : 'left' });

      doc.roundedRect(48, 232, contentW, 244, 16).fillAndStroke(INDIGO_SOFT, '#C7D2FE');
      const rows = [
        [L.role, accountRole],
        [L.name, accountName],
        [L.email, email],
        [L.password, password],
        [L.link, 'https://etrack.ma/login'],
      ];
      rows.forEach(([label, value], index) => {
        const y = 252 + index * 43;
        doc.fillColor(MUTED);
        paragraph(doc, label, 70, y, 145, { size: 9, rtl, align: rtl ? 'right' : 'left' });
        doc.fillColor(index === 3 ? INDIGO : INK);
        paragraph(doc, value, 220, y - 1, contentW - 194, {
          size: index === 3 ? 13 : 11, rtl: /[\u0600-\u06FF]/.test(String(value)),
          align: rtl ? 'right' : 'left', maxLines: 1,
        });
        if (index < rows.length - 1) {
          doc.moveTo(70, y + 27).lineTo(pageW - 70, y + 27).strokeColor(BORDER).lineWidth(1).stroke();
        }
      });

      doc.roundedRect(48, 500, contentW, 86, 14).fillAndStroke(AMBER_SOFT, '#FDE68A');
      doc.fillColor(AMBER);
      paragraph(doc, `⚠ ${L.warning}`, 66, 520, contentW - 36, {
        size: 10, rtl, align: rtl ? 'right' : 'left', maxLines: 4,
      });
      doc.fillColor(MUTED);
      paragraph(doc, L.generated, 48, 620, contentW, { size: 9, rtl, align: 'center' });
      doc.end();
    } catch (error) {
      reject(error);
    }
  });

  return {
    buffer,
    fileName: `Identifiants_${safeName(accountName)}.pdf`,
  };
}
