
import os
from dotenv import load_dotenv
from supabase import create_client

# Load settings from the .env file
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Supabase URL or key is missing from .env")
else:
    try:
        # Create the Supabase client
        supabase = create_client(
            SUPABASE_URL,
            SUPABASE_KEY
        )

        print("Supabase client initialized successfully!")

        # Test access to an existing table
        response = (
            supabase
            .table("traveler_profiles")
            .select("id")
            .limit(1)
            .execute()
        )

        print("Supabase API request completed successfully!")
        print("Rows returned:", len(response.data))

        if not response.data:
            print(
                "No rows returned. This may be because "
                "RLS policies restrict access or the table is empty."
            )

    except Exception as error:
        print("Supabase connection test failed.")
        print("Error:", error)
