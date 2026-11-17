(function () {
  const supabase = window.fpSupabase;

  if (!supabase) {
    console.error('Supabase client tidak ditemukan.');
    return;
  }

  const Auth = {
    async login(email, password) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) throw error;
      return data;
    },

    async register({ email, password, fullName, phone }) {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone.trim()
          }
        }
      });

      if (error) throw error;
      return data;
    },

    async getSession() {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async getProfile(userId) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      return data;
    },

    async logout() {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    },

    onChange(callback) {
      return supabase.auth.onAuthStateChange(callback);
    }
  };

  window.FPAuth = Auth;
})();
