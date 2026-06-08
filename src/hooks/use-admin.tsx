import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AdminContextType {
  isAdmin: boolean;
  loading: boolean;
  refreshAdminStatus: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: React.ReactNode }) => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdminStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Heartbeat: keep "last login" fresh in the admin panel for any authenticated session.
      // auth.users.last_sign_in_at doesn't update on refresh-token activity, and the
      // record_user_login RPC only fires from the email/password form.
      void supabase.rpc('touch_last_active');



      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking admin status:', error);
      }

      setIsAdmin(!!data);
    } catch (error) {
      console.error('Error in checkAdminStatus:', error);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAdminStatus();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => subscription.unsubscribe();
  }, [checkAdminStatus]);

  return (
    <AdminContext.Provider value={{ isAdmin, loading, refreshAdminStatus: checkAdminStatus }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = () => {
  const context = useContext(AdminContext);
  
  // Fallback for components not wrapped in AdminProvider
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkAdminStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      void supabase.rpc('touch_last_active');



      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking admin status:', error);
      }

      setIsAdmin(!!data);
    } catch (error) {
      console.error('Error in checkAdminStatus:', error);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!context) {
      checkAdminStatus();
    }
  }, [context, checkAdminStatus]);

  if (context) {
    return context;
  }

  return { isAdmin, loading, refreshAdminStatus: checkAdminStatus };
};
