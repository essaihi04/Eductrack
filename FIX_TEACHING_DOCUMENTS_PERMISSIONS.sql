-- Fix permissions for teaching_documents table
-- This script enables RLS and creates proper policies for teachers to access their documents

-- Enable RLS on teaching_documents table
ALTER TABLE teaching_documents ENABLE ROW LEVEL SECURITY;

-- Enable RLS on document_views table
ALTER TABLE document_views ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Teachers can view their own documents" ON teaching_documents;
DROP POLICY IF EXISTS "Teachers can insert their own documents" ON teaching_documents;
DROP POLICY IF EXISTS "Teachers can update their own documents" ON teaching_documents;
DROP POLICY IF EXISTS "Teachers can delete their own documents" ON teaching_documents;
DROP POLICY IF EXISTS "Students can view documents for their class" ON teaching_documents;
DROP POLICY IF EXISTS "Students can insert document views" ON document_views;
DROP POLICY IF EXISTS "Students can view their own document views" ON document_views;

-- Service role bypasses RLS - allow full access
GRANT ALL ON teaching_documents TO service_role;
GRANT ALL ON document_views TO service_role;

-- Policy: Teachers can view their own documents
CREATE POLICY "Teachers can view their own documents"
ON teaching_documents FOR SELECT
USING (
  auth.uid() = teacher_id OR
  auth.role() = 'service_role'
);

-- Policy: Teachers can insert their own documents
CREATE POLICY "Teachers can insert their own documents"
ON teaching_documents FOR INSERT
WITH CHECK (
  auth.uid() = teacher_id OR
  auth.role() = 'service_role'
);

-- Policy: Teachers can update their own documents
CREATE POLICY "Teachers can update their own documents"
ON teaching_documents FOR UPDATE
USING (
  auth.uid() = teacher_id OR
  auth.role() = 'service_role'
);

-- Policy: Teachers can delete their own documents
CREATE POLICY "Teachers can delete their own documents"
ON teaching_documents FOR DELETE
USING (
  auth.uid() = teacher_id OR
  auth.role() = 'service_role'
);

-- Policy: Students can view documents for their class
CREATE POLICY "Students can view documents for their class"
ON teaching_documents FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.class_id = teaching_documents.class_id
    AND profiles.role = 'student'
  ) OR
  auth.role() = 'service_role'
);

-- Policy: Students can insert document views
CREATE POLICY "Students can insert document views"
ON document_views FOR INSERT
WITH CHECK (
  auth.uid() = student_id OR
  auth.role() = 'service_role'
);

-- Policy: Students can view their own document views
CREATE POLICY "Students can view their own document views"
ON document_views FOR SELECT
USING (
  auth.uid() = student_id OR
  auth.role() = 'service_role'
);

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON teaching_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_views TO authenticated;

-- Grant permissions to anon (public) role if needed
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON teaching_documents TO anon;
GRANT SELECT ON document_views TO anon;
