import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://udysvmpnivuybneeetnj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkeXN2bXBuaXZ1eWJuZWVldG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0ODIzODgsImV4cCI6MjA5MzA1ODM4OH0.O_FesCyEvn4wcsdn_06Bl1nj5Aeb_xqfVo2ejAWFVco';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function getUsers() {
  const { data, error } = await supabase.from('profiles').select('email, password, role, tier, is_certified').eq('role', 'DISTRIBUTOR');
  if (error) {
    console.error("ERROR:", error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

getUsers();
