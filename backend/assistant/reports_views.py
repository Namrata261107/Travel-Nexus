
import logging

from django.db import connection, DatabaseError
from django.http import JsonResponse
from django.views.decorators.http import require_GET

logger = logging.getLogger(__name__)


# Only use predefined database tables.
REPORT_TABLES = [
    {
        "category": "Travelers",
        "name": "Traveler Profiles",
        "table": "traveler_profiles",
        "summary_key": "travelers",
    },
    {
        "category": "Monitoring",
        "name": "Travel Sessions",
        "table": "travel_sessions",
        "summary_key": "travel_sessions",
    },
    {
        "category": "Alerts",
        "name": "Emergency Alerts",
        "table": "emergency_alerts",
        "summary_key": "emergency_alerts",
    },
    {
        "category": "Geofences",
        "name": "Geofences",
        "table": "geofences",
        "summary_key": "geofences",
    },
    {
        "category": "Lost & Found",
        "name": "Lost and Found Reports",
        "table": "lost_found_reports",
        "summary_key": "lost_found_reports",
    },
]


@require_GET
def reports_data(request):
    """
    Return live database counts for the Travel Nexus
    authority Reports and Analytics page.

    This endpoint returns category statistics, not a
    persistent history of generated reports.
    """

    categories = []
    summary = {
        "categories": len(REPORT_TABLES),
        "total_records": 0,
        "travelers": 0,
        "travel_sessions": 0,
        "emergency_alerts": 0,
        "geofences": 0,
        "lost_found_reports": 0,
    }

    try:
        with connection.cursor() as cursor:
            for item in REPORT_TABLES:
                # Table names come only from the fixed allow-list above.
                table_name = item["table"]

                try:
                    cursor.execute(
                        f'SELECT COUNT(*) FROM public."{table_name}"'
                    )
                    row = cursor.fetchone()
                    count = int(row[0]) if row else 0

                    categories.append({
                        "category": item["category"],
                        "name": item["name"],
                        "source": table_name,
                        "records": count,
                        "available": True,
                    })

                    summary[item["summary_key"]] = count
                    summary["total_records"] += count

                except DatabaseError:
                    logger.exception(
                        "Could not count records in table %s",
                        table_name,
                    )

                    categories.append({
                        "category": item["category"],
                        "name": item["name"],
                        "source": table_name,
                        "records": 0,
                        "available": False,
                    })

        return JsonResponse({
            "success": True,
            "generated_at": connection.ops.adapt_datetimefield_value(
                __import__("datetime").datetime.now(
                    __import__("datetime").timezone.utc
                )
            ).isoformat(),
            "summary": summary,
            "categories": categories,
            "reports": [],
            "message": (
                "Live database statistics loaded. "
                "Generated report history is not configured yet."
            ),
        })

    except Exception:
        logger.exception("Unable to load authority reports data")

        return JsonResponse({
            "success": False,
            "error": "Unable to load report statistics from the database.",
        }, status=500)
