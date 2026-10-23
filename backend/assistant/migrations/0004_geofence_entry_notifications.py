from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("assistant", "0003_geofence_caution_zone_type"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                CREATE TABLE IF NOT EXISTS public.geofence_entry_states (
                    traveler_id uuid NOT NULL REFERENCES public.traveler_profiles(id) ON DELETE CASCADE,
                    geofence_id uuid NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
                    is_inside boolean NOT NULL DEFAULT false,
                    updated_at timestamptz NOT NULL DEFAULT NOW(),
                    PRIMARY KEY (traveler_id, geofence_id)
                );

                CREATE TABLE IF NOT EXISTS public.geofence_entry_alerts (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    traveler_id uuid NOT NULL REFERENCES public.traveler_profiles(id) ON DELETE CASCADE,
                    geofence_id uuid NOT NULL REFERENCES public.geofences(id) ON DELETE CASCADE,
                    latitude double precision NOT NULL,
                    longitude double precision NOT NULL,
                    status text NOT NULL DEFAULT 'active',
                    created_at timestamptz NOT NULL DEFAULT NOW(),
                    acknowledged_at timestamptz NULL,
                    resolved_at timestamptz NULL
                );
                CREATE INDEX IF NOT EXISTS geofence_entry_alerts_created_at_idx
                    ON public.geofence_entry_alerts (created_at DESC);
            """,
            reverse_sql="""
                DROP TABLE IF EXISTS public.geofence_entry_alerts;
                DROP TABLE IF EXISTS public.geofence_entry_states;
            """,
        ),
    ]
