#!/bin/bash

# Script de déploiement pour le serveur externe
# Usage: ./deploy.sh

echo "═══════════════════════════════════════════════"
echo "🚀 Déploiement du Chatbot IA WhatsApp"
echo "═══════════════════════════════════════════════"

# Variables
SERVER_USER="root"
SERVER_IP="51.79.251.164"
SERVER_PATH="/root/student-tracking-app"
BACKUP_PATH="/root/backups/$(date +%Y%m%d_%H%M%S)"

echo "📍 Serveur: $SERVER_IP"
echo "📂 Chemin: $SERVER_PATH"
echo "💾 Backup: $BACKUP_PATH"
echo ""

# 1. Créer un backup
echo "📦 1/5 - Création du backup..."
ssh $SERVER_USER@$SERVER_IP "mkdir -p /root/backups && cp -r $SERVER_PATH $BACKUP_PATH"
if [ $? -eq 0 ]; then
    echo "✅ Backup créé avec succès"
else
    echo "❌ Erreur lors du backup"
    exit 1
fi

# 2. Pull les dernières modifications
echo ""
echo "⬇️  2/5 - Récupération des modifications..."
ssh $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && git pull origin main"
if [ $? -eq 0 ]; then
    echo "✅ Modifications récupérées"
else
    echo "❌ Erreur lors du pull Git"
    exit 1
fi

# 3. Installer les dépendances
echo ""
echo "📦 3/5 - Installation des dépendances..."
ssh $SERVER_USER@$SERVER_IP "cd $SERVER_PATH/backend && npm install"
if [ $? -eq 0 ]; then
    echo "✅ Dépendances installées"
else
    echo "❌ Erreur lors de l'installation des dépendances"
    exit 1
fi

# 4. Exécuter la migration SQL
echo ""
echo "🗄️  4/5 - Migration de la base de données..."
ssh $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && psql -h localhost -U postgres -d postgres -f backend/migrations/create_whatsapp_chatbot_tables.sql"
if [ $? -eq 0 ]; then
    echo "✅ Migration SQL exécutée"
else
    echo "⚠️  Migration SQL peut avoir échoué (peut-être déjà exécutée)"
fi

# 5. Redémarrer le serveur
echo ""
echo "🔄 5/5 - Redémarrage du serveur..."
ssh $SERVER_USER@$SERVER_IP "cd $SERVER_PATH && pm2 restart all"
if [ $? -eq 0 ]; then
    echo "✅ Serveur redémarré"
else
    echo "❌ Erreur lors du redémarrage du serveur"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "🎉 Déploiement terminé avec succès !"
echo "═══════════════════════════════════════════════"
echo ""
echo "📋 Actions requises :"
echo "   1. Vérifiez que les variables d'environnement sont configurées :"
echo "      - DEEPSEEK_API_KEY"
echo "      - WASENDER_API_KEY" 
echo "      - WEBHOOK_BASE_URL=https://etrack.ma"
echo ""
echo "   2. Testez le webhook :"
echo "      curl https://etrack.ma/api/webhooks/whatsapp/incoming"
echo ""
echo "   3. Créez une nouvelle session WhatsApp depuis l'interface admin"
echo ""
echo "🌐 L'application est disponible sur : https://etrack.ma"
