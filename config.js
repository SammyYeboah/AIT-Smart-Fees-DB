// Fill in the two values from Supabase: Project Settings > API.
// The anon key is meant to be public. It cannot read or change anything on its own;
// every request is checked against the sign-in and the rules in supabase/schema.sql.
// Never put the "service_role" key here.
window.AIT_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: ""
};
