// Travel Nexus - Supabase Client
// Initializes the Supabase client without modifying database records.

(function () {
    const SUPABASE_URL = "https://llmatewekilkgnccwwqk.supabase.co";
    const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_eip52ChUKKVPDNchVTZ1Gg_9GaMXLfI";

    window.travelNexusSupabase = null;

    window.initializeSupabaseClient = function () {
        if (!window.supabase || typeof window.supabase.createClient !== "function") {
            console.error("Supabase library is not loaded.");
            return false;
        }

        if (
            SUPABASE_URL === "YOUR_SUPABASE_PROJECT_URL" ||
            SUPABASE_PUBLISHABLE_KEY === "YOUR_SUPABASE_PUBLISHABLE_KEY"
        ) {
            console.warn("Supabase configuration is incomplete.");
            return false;
        }

        window.travelNexusSupabase = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_PUBLISHABLE_KEY
        );

        console.log("Travel Nexus Supabase client initialized.");
        return true;
    };
})();

