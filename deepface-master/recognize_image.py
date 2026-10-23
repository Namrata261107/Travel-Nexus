
import sys
import json
import os
import math
from pathlib import Path

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

ALLOWED_IDENTITIES = {"Alice", "Bob"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Conservative starting limit for VGG-Face cosine distance.
# This must be tested with genuine and unrelated photos.
THRESHOLD_FACTOR = 0.65
MAX_COSINE_DISTANCE = 0.40
DEFAULT_THRESHOLD = 0.68


def emit_result(data):
    print("TN_RESULT:" + json.dumps(data), flush=True)


def fail(message, face_detected=None):
    result = {
        "success": False,
        "comparison_status": "review_required",
        "message": message,
        "test_only": True,
    }

    if face_detected is not None:
        result["face_detected"] = face_detected

    emit_result(result)


def main():
    if len(sys.argv) != 3:
        fail("Expected an image path and a test identity.")
        return

    image_path = Path(sys.argv[1]).resolve()
    identity = sys.argv[2].strip()

    base_dir = Path(__file__).resolve().parent
    identity_dir = base_dir / "database" / identity

    if identity not in ALLOWED_IDENTITIES:
        fail("Unknown test identity.")
        return

    if not image_path.is_file():
        fail("Uploaded image could not be found.")
        return

    if image_path.suffix.lower() not in IMAGE_EXTENSIONS:
        fail("Unsupported image format.")
        return

    if not identity_dir.is_dir():
        fail(f"Reference folder not found for {identity}.")
        return

    references = sorted(
        file for file in identity_dir.iterdir()
        if file.is_file()
        and file.suffix.lower() in IMAGE_EXTENSIONS
    )

    if not references:
        fail(f"No reference images found for {identity}.")
        return

    try:
        from deepface import DeepFace

        comparisons = []

        for reference in references:
            result = DeepFace.verify(
                img1_path=str(image_path),
                img2_path=str(reference),
                model_name="VGG-Face",
                detector_backend="opencv",
                distance_metric="cosine",
                enforce_detection=True,
            )

            distance = float(result["distance"])
            model_threshold = float(
                result.get("threshold", DEFAULT_THRESHOLD)
            )

            if (
                not math.isfinite(distance)
                or not math.isfinite(model_threshold)
                or distance < 0
            ):
                continue

            threshold = min(
                model_threshold * THRESHOLD_FACTOR,
                MAX_COSINE_DISTANCE,
            )

            comparisons.append({
                "distance": distance,
                "threshold": threshold,
                "matched": distance <= threshold,
            })

        if not comparisons:
            fail("No valid comparisons were available.", True)
            return

        # Best comparison against all saved reference photos
        best = min(comparisons, key=lambda item: item["distance"])

        emit_result({
            "success": True,
            "face_detected": True,
            "comparison_status": (
                "matched" if best["matched"] else "not_matched"
            ),
            "distance": best["distance"],
            "threshold": best["threshold"],
            "test_identity": identity,
            "test_only": True,
            "message": (
                f"Matched the {identity} reference images."
                if best["matched"]
                else f"No verified match for {identity}."
            ),
        })

    except Exception as exc:
        fail(
            f"Face comparison failed: {type(exc).__name__}: {exc}"
        )


if __name__ == "__main__":
    main()
