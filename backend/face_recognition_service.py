import hashlib
import hmac
import json
import logging
import os
import sys
import threading

import cv2
import numpy as np
from flask import Flask, jsonify, request

for output in (sys.stdout, sys.stderr):
    if hasattr(output, "reconfigure"):
        output.reconfigure(encoding="utf-8", errors="replace")

os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

from deepface import DeepFace


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("travel_nexus.face_recognition")

MODEL_NAME = os.getenv("FACE_MODEL_NAME", "Facenet")
MATCH_THRESHOLD = float(os.getenv("FACE_MATCH_THRESHOLD", "0.90"))
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_CASES_PER_SYNC = 250
SERVICE_API_KEY = os.getenv("FACE_SERVICE_API_KEY", "")

app = Flask(__name__)
known_embeddings = {}
embeddings_lock = threading.RLock()


def service_key_required():
    supplied = request.headers.get("X-Face-Service-Key", "")
    if not SERVICE_API_KEY and os.getenv("RENDER") != "true":
        return None
    if not SERVICE_API_KEY or not hmac.compare_digest(supplied, SERVICE_API_KEY):
        return jsonify({"success": False, "error": "Unauthorized service request."}), 401
    return None


class NoFaceDetected(Exception):
    pass


def decode_image(image_bytes):
    image = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("The uploaded file is not a supported image.")
    return image


def image_embeddings(image_bytes):
    image = decode_image(image_bytes)
    try:
        detected_faces = DeepFace.extract_faces(
            img_path=image,
            detector_backend="opencv",
            enforce_detection=True,
        )
    except ValueError as exc:
        raise NoFaceDetected from exc
    if not detected_faces:
        raise NoFaceDetected

    faces = DeepFace.represent(
        img_path=image,
        model_name=MODEL_NAME,
        detector_backend="opencv",
        enforce_detection=True,
    )
    embeddings = []
    for face in faces:
        vector = np.asarray(face.get("embedding", []), dtype=np.float32)
        norm = np.linalg.norm(vector)
        if vector.size and norm > 0:
            embeddings.append(vector / norm)
    return embeddings


@app.get("/health")
def health():
    with embeddings_lock:
        count = len(known_embeddings)
    return jsonify({"success": True, "status": "ready", "registered_cases": count})


@app.post("/sync")
def sync_cases():
    denied = service_key_required()
    if denied:
        return denied
    manifest = request.form.get("reports", "")
    try:
        reports = json.loads(manifest)
    except json.JSONDecodeError:
        return jsonify({"success": False, "error": "Invalid report manifest."}), 400

    if not isinstance(reports, list) or len(reports) > MAX_CASES_PER_SYNC:
        return jsonify({
            "success": False,
            "error": f"Provide a list of up to {MAX_CASES_PER_SYNC} reports.",
        }), 400

    refreshed = {}
    rejected = []

    for index, report in enumerate(reports):
        if not isinstance(report, dict) or not str(report.get("id", "")).isdigit():
            return jsonify({"success": False, "error": "Invalid report record."}), 400

        upload = request.files.get(f"reference_{index}")
        if upload is None:
            return jsonify({"success": False, "error": "A reference photo is missing."}), 400

        image_bytes = upload.read(MAX_IMAGE_BYTES + 1)
        if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
            rejected.append({
                "id": int(report["id"]),
                "reason": "Reference photo is empty or exceeds 8 MB.",
            })
            continue

        digest = hashlib.sha256(image_bytes).hexdigest()
        cached_key = (int(report["id"]), digest)
        with embeddings_lock:
            existing = known_embeddings.get(cached_key)

        if existing is not None:
            refreshed[cached_key] = {
                **existing,
                "name": str(report.get("name", "")),
                "report_type": str(report.get("report_type", "")),
            }
            continue

        try:
            embeddings = image_embeddings(image_bytes)
            if len(embeddings) != 1:
                rejected.append({
                    "id": int(report["id"]),
                    "reason": "Reference photo must contain exactly one detectable face.",
                })
                continue

            refreshed[cached_key] = {
                "report_id": int(report["id"]),
                "name": str(report.get("name", "")),
                "report_type": str(report.get("report_type", "")),
                "embedding": embeddings[0],
            }
        except NoFaceDetected:
            rejected.append({
                "id": int(report["id"]),
                "reason": "No face was detected in the reference photo.",
            })
        except Exception as exc:
            logger.exception("Could not process reference photo for report %s.", report["id"])
            rejected.append({
                "id": int(report["id"]),
                "reason": f"Reference photo could not be processed: {type(exc).__name__}.",
            })

    with embeddings_lock:
        known_embeddings.clear()
        known_embeddings.update(refreshed)

    return jsonify({
        "success": True,
        "registered_cases": len(refreshed),
        "rejected_cases": rejected,
    })


@app.post("/recognize")
def recognize():
    denied = service_key_required()
    if denied:
        return denied
    upload = request.files.get("image")
    if upload is None:
        return jsonify({"success": False, "error": "A camera frame is required."}), 400

    image_bytes = upload.read(MAX_IMAGE_BYTES + 1)
    if not image_bytes or len(image_bytes) > MAX_IMAGE_BYTES:
        return jsonify({"success": False, "error": "Camera frame is empty or exceeds 8 MB."}), 400

    with embeddings_lock:
        references = list(known_embeddings.values())

    if not references:
        return jsonify({
            "success": True,
            "match": None,
            "registered_cases": 0,
            "message": "No usable reference photos are registered.",
        })

    try:
        probes = image_embeddings(image_bytes)
    except NoFaceDetected:
        return jsonify({
            "success": True,
            "match": None,
            "registered_cases": len(references),
            "message": "No face was detected in this camera frame.",
        })
    except Exception as exc:
        logger.exception("Face recognition failed.")
        return jsonify({
            "success": False,
            "error": f"Recognition failed: {type(exc).__name__}.",
        }), 503

    if len(probes) != 1:
        return jsonify({
            "success": True,
            "match": None,
            "registered_cases": len(references),
            "message": "Keep one face centered in the camera for an unambiguous comparison.",
        })

    best = None
    for reference in references:
        distance = min(
            float(np.linalg.norm(probe - reference["embedding"]))
            for probe in probes
        )
        if best is None or distance < best["distance"]:
            best = {**reference, "distance": distance}

    if best is None or best["distance"] > MATCH_THRESHOLD:
        return jsonify({
            "success": True,
            "match": None,
            "registered_cases": len(references),
            "message": "No reference passed the configured comparison threshold.",
        })

    similarity_score = max(0.0, min(1.0, 1.0 - best["distance"] ** 2 / 2))
    return jsonify({
        "success": True,
        "match": {
            "report_id": best["report_id"],
            "name": best["name"],
            "report_type": best["report_type"],
            "similarity_score": similarity_score,
            "distance": best["distance"],
        },
        "registered_cases": len(references),
        "message": "Potential match only; an authorized person must verify it.",
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8001, threaded=True)
