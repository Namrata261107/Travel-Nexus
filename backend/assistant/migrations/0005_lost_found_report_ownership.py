from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("assistant", "0004_geofence_entry_notifications"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE public.lost_found_reports
                    ADD COLUMN IF NOT EXISTS reported_by uuid NULL
                        REFERENCES public.profiles(id) ON DELETE SET NULL;
                ALTER TABLE public.lost_found_reports
                    ADD COLUMN IF NOT EXISTS reporter_contact text NULL;
                ALTER TABLE public.lost_found_reports
                    ADD COLUMN IF NOT EXISTS report_date date NULL;
                CREATE INDEX IF NOT EXISTS lost_found_reports_reported_by_idx
                    ON public.lost_found_reports (reported_by);
            """,
            reverse_sql="""
                DROP INDEX IF EXISTS public.lost_found_reports_reported_by_idx;
                ALTER TABLE public.lost_found_reports
                    DROP COLUMN IF EXISTS report_date;
                ALTER TABLE public.lost_found_reports
                    DROP COLUMN IF EXISTS reporter_contact;
                ALTER TABLE public.lost_found_reports
                    DROP COLUMN IF EXISTS reported_by;
            """,
        ),
    ]
