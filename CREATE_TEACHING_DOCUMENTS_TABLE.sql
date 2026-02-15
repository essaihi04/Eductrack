-- Table pour les documents pédagogiques envoyés par les enseignants
CREATE TABLE IF NOT EXISTS teaching_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES subjects(id) ON DELETE SET NULL,
    control_id UUID REFERENCES controls_plan(id) ON DELETE SET NULL,
    
    -- Informations sur le document
    title VARCHAR(60) NOT NULL,
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('cours', 'exercice', 'devoir', 'rattrapage', 'approfondissement')),
    description TEXT,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    file_type VARCHAR(100) NOT NULL,
    
    -- Statistiques et suivi
    total_students INTEGER DEFAULT 0,
    viewed_count INTEGER DEFAULT 0,
    downloaded_count INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Index pour les requêtes fréquentes
    CONSTRAINT teaching_documents_teacher_class_idx UNIQUE (teacher_id, class_id, title, created_at)
);

-- Table pour le suivi de consultation par les élèves
CREATE TABLE IF NOT EXISTS document_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES teaching_documents(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    downloaded_at TIMESTAMP WITH TIME ZONE,
    
    -- Empêcher les doublons de vue
    CONSTRAINT document_views_unique UNIQUE (document_id, student_id)
);

-- Créer les index pour optimiser les performances
CREATE INDEX IF NOT EXISTS idx_teaching_documents_teacher_id ON teaching_documents(teacher_id);
CREATE INDEX IF NOT EXISTS idx_teaching_documents_class_id ON teaching_documents(class_id);
CREATE INDEX IF NOT EXISTS idx_teaching_documents_created_at ON teaching_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_views_document_id ON document_views(document_id);
CREATE INDEX IF NOT EXISTS idx_document_views_student_id ON document_views(student_id);

-- Trigger pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_teaching_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teaching_documents_updated_at_trigger
    BEFORE UPDATE ON teaching_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_teaching_documents_updated_at();

-- Trigger pour mettre à jour les statistiques de consultation
CREATE OR REPLACE FUNCTION update_document_view_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE teaching_documents 
        SET viewed_count = viewed_count + 1
        WHERE id = NEW.document_id;
    END IF;
    
    IF TG_OP = 'UPDATE' AND NEW.downloaded_at IS NOT NULL AND OLD.downloaded_at IS NULL THEN
        UPDATE teaching_documents 
        SET downloaded_count = downloaded_count + 1
        WHERE id = NEW.document_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_views_stats_trigger
    AFTER INSERT OR UPDATE ON document_views
    FOR EACH ROW
    EXECUTE FUNCTION update_document_view_stats();

-- Commentaires pour la documentation
COMMENT ON TABLE teaching_documents IS 'Documents pédagogiques envoyés par les enseignants aux élèves';
COMMENT ON TABLE document_views IS 'Suivi de consultation des documents par les élèves';
COMMENT ON COLUMN teaching_documents.document_type IS 'Type de contenu: cours, exercice, devoir, rattrapage, approfondissement';
COMMENT ON COLUMN teaching_documents.total_students IS 'Nombre total d''élèves dans la classe';
COMMENT ON COLUMN teaching_documents.viewed_count IS 'Nombre d''élèves qui ont consulté le document';
COMMENT ON COLUMN teaching_documents.downloaded_count IS 'Nombre d''élèves qui ont téléchargé le document';
