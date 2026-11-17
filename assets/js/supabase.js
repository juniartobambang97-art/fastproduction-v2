(function () {
  const config = window.FASTPRODUCTION_CONFIG;

  if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY) {
    throw new Error('Konfigurasi Supabase belum lengkap.');
  }

  if (!window.supabase?.createClient) {
    throw new Error('Supabase JS belum berhasil dimuat.');
  }

  window.fpSupabase = window.supabase.createClient(
    config.SUPABASE_URL,
    config.SUPABASE_ANON_KEY
  );
})();
