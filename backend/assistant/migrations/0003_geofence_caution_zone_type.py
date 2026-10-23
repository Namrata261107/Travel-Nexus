from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ("assistant", "0002_facecase_created_by"),
    ]

    operations = [
        migrations.RunSQL(
            sql="""
                ALTER TABLE public.geofences
                DROP CONSTRAINT IF EXISTS geofences_zone_type_check;
                ALTER TABLE public.geofences
                ADD CONSTRAINT geofences_zone_type_check
                CHECK (zone_type IN (
                    'protected', 'restricted', 'tourist', 'safe',
                    'high_risk', 'caution'
                ));
            """,
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
