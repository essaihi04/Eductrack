-- Fix RLS policies for notifications table
-- This ensures the service role can create notifications for students

-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can insert their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can delete their own notifications" ON notifications;
DROP POLICY IF EXISTS "Service role bypasses RLS" ON notifications;

-- Grant ALL permissions to service role (bypasses RLS)
GRANT ALL ON notifications TO service_role;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications FOR SELECT
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Policy: Service role can insert notifications (for teachers creating notifications for students)
CREATE POLICY "Service role can insert notifications"
ON notifications FOR INSERT
WITH CHECK (auth.role() = 'service_role');

-- Policy: Users can update their own notifications
CREATE POLICY "Users can update their own notifications"
ON notifications FOR UPDATE
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Policy: Users can delete their own notifications
CREATE POLICY "Users can delete their own notifications"
ON notifications FOR DELETE
USING (auth.uid() = user_id OR auth.role() = 'service_role');

-- Grant necessary permissions to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE, DELETE ON notifications TO authenticated;

-- Grant permissions to anon (public) role if needed
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON notifications TO anon;

-- Verify the policies were created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'notifications';
