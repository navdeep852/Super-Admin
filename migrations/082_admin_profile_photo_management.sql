-- ==============================================================================
-- Migration 082: Platform Admin Profile Photo Management & Extended Metadata
--
-- Adds:
-- 1. avatar_url column to public.platform_admins
-- 2. avatar_updated_at column to public.platform_admins
-- 3. Ensures phone_number column exists
-- ==============================================================================

ALTER TABLE public.platform_admins
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

ALTER TABLE public.platform_admins
ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;

ALTER TABLE public.platform_admins
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32);

-- Comment for schema documentation
COMMENT ON COLUMN public.platform_admins.avatar_url IS 'CDN URL or storage reference for the platform administrator profile photo';
COMMENT ON COLUMN public.platform_admins.avatar_updated_at IS 'Timestamp when the profile photo was last uploaded or modified';
