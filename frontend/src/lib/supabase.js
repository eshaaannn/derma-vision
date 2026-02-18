import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://naxucoudkdrflzxdcsiu.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5heHVjb3Vka2RyZmx6eGRjc2l1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzOTIxMDUsImV4cCI6MjA4Njk2ODEwNX0.HZmLAfzOcVT05oDkLtmrW8nKtV1izUrWDlWZOa_W0hI";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
