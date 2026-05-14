-- Add PWA push notifications admin setting
INSERT INTO admin_settings (setting_key, setting_value, description, category)
VALUES ('pwa_notifications_enabled', 'false', 'Allow the PWA to request push notification permission from users', 'general')
ON CONFLICT (setting_key) DO NOTHING;
