# Chatbot IA WhatsApp - Documentation

## Vue d'ensemble

Le système de chatbot IA WhatsApp permet aux parents de poser des questions sur leurs enfants via WhatsApp et de recevoir des réponses automatiques générées par l'IA, basées sur les données réelles de l'élève.

## Architecture

### 1. Flux de fonctionnement

```
Parent envoie message WhatsApp
    ↓
WasenderAPI reçoit le message
    ↓
Webhook appelle /api/webhooks/whatsapp/incoming
    ↓
Vérification de la signature webhook
    ↓
Identification du parent (par numéro de téléphone)
    ↓
Identification de l'élève (via IA)
    ↓
Collecte des données de l'élève (notes, présence, comportement)
    ↓
Génération de la réponse IA (DeepSeek)
    ↓
Envoi de la réponse via WhatsApp
```

### 2. Configuration du webhook

Lors de la création d'une session WhatsApp, le système configure automatiquement :

- **URL du webhook** : `https://etrack.ma/api/webhooks/whatsapp/incoming`
- **Secret webhook** : Généré automatiquement (32 bytes hex)
- **Événements écoutés** : `messages.received`

### 3. Sécurité

#### Vérification de signature
Chaque requête webhook est vérifiée via le header `X-Webhook-Signature` qui doit correspondre au secret stocké.

#### Vérification parent-élève
Le système vérifie que le numéro WhatsApp correspond à un parent enregistré dans la base de données avant de répondre.

## Tables Supabase

### `whatsapp_incoming_messages`
Stocke tous les messages entrants des parents.

```sql
- id: UUID
- phone_e164: TEXT (numéro au format international)
- parent_id: UUID (référence au parent)
- school_id: UUID (référence à l'école)
- message_text: TEXT (contenu du message)
- wasender_message_id: TEXT (ID du message WasenderAPI)
- received_at: TIMESTAMP
- processed: BOOLEAN
- ai_response_sent: BOOLEAN
- ai_response_text: TEXT
- student_id: UUID (élève identifié)
- error_message: TEXT
```

### `whatsapp_conversations`
Historique des conversations par parent.

```sql
- id: UUID
- school_id: UUID
- parent_id: UUID
- phone_e164: TEXT
- last_message_at: TIMESTAMP
- message_count: INTEGER
- is_active: BOOLEAN
```

### `whatsapp_school_sessions` (colonnes ajoutées)
```sql
- webhook_url: TEXT
- webhook_secret: TEXT
- webhook_enabled: BOOLEAN
```

## Configuration

### Variables d'environnement

```env
# API WasenderAPI
WASENDER_API_KEY=your_global_api_key

# Secret webhook (optionnel, pour vérification)
WASENDER_WEBHOOK_SECRET=your_webhook_secret

# URL de base pour les webhooks
WEBHOOK_BASE_URL=https://etrack.ma

# API DeepSeek pour l'IA
DEEPSEEK_API_KEY=your_deepseek_api_key
```

### Migration de la base de données

Exécuter le script SQL :
```bash
psql -h your_supabase_host -U postgres -d postgres -f backend/migrations/create_whatsapp_chatbot_tables.sql
```

Ou via l'interface Supabase SQL Editor.

## Utilisation

### 1. Créer une session WhatsApp

Depuis l'interface admin, onglet "Connexion" :
1. Cliquer sur "Nouvelle session"
2. Entrer le nom et le numéro de téléphone
3. Le webhook sera automatiquement configuré

### 2. Tester le webhook

```bash
# Vérifier que le webhook est actif
curl https://etrack.ma/api/webhooks/whatsapp/incoming

# Réponse attendue :
{
  "status": "active",
  "message": "EduTrack WhatsApp Webhook is running",
  "timestamp": "2026-02-28T10:00:00.000Z"
}
```

### 3. Exemple de message parent

**Parent envoie :**
```
Bonjour, comment va mon fils Ahmed aujourd'hui ?
```

**IA répond :**
```
Bonjour,

Voici le suivi d'Ahmed pour aujourd'hui :

📊 PRÉSENCE (7 derniers jours):
- Présent: 5/5 séances
- Absent: 0/5 séances

👤 COMPORTEMENT:
- Participation: Bon
- Discipline: Excellent

📝 DEVOIRS (7 derniers jours):
- Rendus: 4/5

📈 NOTES RÉCENTES:
- Mathématiques: 16/20 (Contrôle 1)
- Physique: 14/20 (Devoir)

Ahmed montre une bonne assiduité et un comportement exemplaire. Continuez à l'encourager ! 💪

━━━━━━━━━━━━━━━
👥 L'équipe pédagogique
🏫 École Principale
```

## Fonctionnalités de l'IA

### 1. Identification de l'élève
L'IA analyse le message pour identifier quel enfant est concerné :
- Si un seul enfant : sélection automatique
- Si plusieurs enfants : analyse du prénom mentionné
- Si ambiguïté : demande de clarification

### 2. Collecte de données
Le système collecte automatiquement :
- Présence des 7 derniers jours
- Comportement et participation
- Devoirs rendus
- Notes récentes
- Commentaires des professeurs

### 3. Génération de réponse
L'IA (DeepSeek) génère une réponse :
- Basée uniquement sur les données réelles
- Ton professionnel et bienveillant
- En français ou arabe selon la question
- Limitée à 10-15 lignes
- Avec emojis appropriés

## Monitoring et logs

### Logs serveur
```bash
# Voir les logs du webhook
tail -f backend/logs/webhook.log

# Logs de traitement IA
tail -f backend/logs/chatbot.log
```

### Requêtes SQL utiles

```sql
-- Messages entrants non traités
SELECT * FROM whatsapp_incoming_messages 
WHERE processed = false 
ORDER BY received_at DESC;

-- Messages avec erreurs
SELECT * FROM whatsapp_incoming_messages 
WHERE error_message IS NOT NULL 
ORDER BY received_at DESC;

-- Statistiques par école
SELECT 
  school_id,
  COUNT(*) as total_messages,
  SUM(CASE WHEN ai_response_sent THEN 1 ELSE 0 END) as responses_sent,
  SUM(CASE WHEN error_message IS NOT NULL THEN 1 ELSE 0 END) as errors
FROM whatsapp_incoming_messages
GROUP BY school_id;

-- Conversations actives
SELECT 
  c.*,
  p.first_name || ' ' || p.last_name as parent_name
FROM whatsapp_conversations c
JOIN profiles p ON c.parent_id = p.id
WHERE c.is_active = true
ORDER BY c.last_message_at DESC;
```

## Dépannage

### Le webhook ne reçoit pas de messages

1. Vérifier que le webhook est configuré dans WasenderAPI
2. Vérifier que l'URL est accessible publiquement (HTTPS)
3. Vérifier les logs du serveur
4. Tester manuellement :
```bash
curl -X POST https://etrack.ma/api/webhooks/whatsapp/incoming \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: your_secret" \
  -d '{
    "event": "messages.received",
    "data": {
      "messages": {
        "key": {
          "id": "test123",
          "cleanedSenderPn": "+212600000000"
        },
        "messageBody": "Test message"
      }
    }
  }'
```

### L'IA ne répond pas

1. Vérifier que le parent est enregistré dans la base
2. Vérifier que le numéro de téléphone correspond
3. Vérifier la clé API DeepSeek
4. Consulter les logs d'erreur dans `whatsapp_incoming_messages`

### Réponses incorrectes

1. Vérifier les données de l'élève dans la base
2. Ajuster le prompt système dans `whatsappChatbot.js`
3. Vérifier que les relations parent-élève sont correctes

## Limitations

- **Langue** : Français et arabe uniquement
- **Données** : Limité aux 7 derniers jours
- **Rate limit** : 1 message / 5 secondes (WasenderAPI)
- **Taille message** : Max 500 tokens pour la réponse IA

## Évolutions futures

- [ ] Support de messages vocaux
- [ ] Envoi de documents (bulletins, etc.)
- [ ] Notifications proactives (alertes automatiques)
- [ ] Multi-langue (anglais, espagnol)
- [ ] Analyse de sentiment des messages parents
- [ ] Statistiques d'engagement des parents
