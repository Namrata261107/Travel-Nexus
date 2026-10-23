from pathlib import Path

import cv2

from deepface import DeepFace


DATABASE_PATH = Path(__file__).resolve().parent / "database"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def identity_name(identity_path: str) -> str:
    identity = Path(identity_path)
    relative_identity = identity.relative_to(DATABASE_PATH)
    if len(relative_identity.parts) > 1:
        return relative_identity.parts[0]
    return identity.stem


def main() -> None:
    DATABASE_PATH.mkdir(exist_ok=True)
    known_images = [
        path
        for path in DATABASE_PATH.rglob("*")
        if path.is_file() and path.suffix.lower() in IMAGE_EXTENSIONS
    ]
    if not known_images:
        raise FileNotFoundError(
            f"No known-face images found in {DATABASE_PATH}. "
            "Add images there, then run this script again."
        )

    camera = cv2.VideoCapture(0)
    if not camera.isOpened():
        camera.release()
        raise RuntimeError("Could not open the webcam. Check that a camera is connected.")

    database_initialized = False
    try:
        while True:
            success, frame = camera.read()
            if not success:
                raise RuntimeError("Could not read a frame from the webcam.")

            detected_faces = DeepFace.extract_faces(
                img_path=frame,
                detector_backend="opencv",
                enforce_detection=False,
                align=True,
                normalize_face=False,
            )
            if detected_faces:
                matches_by_face = DeepFace.find(
                    img_path=frame,
                    db_path=str(DATABASE_PATH),
                    model_name="VGG-Face",
                    detector_backend="opencv",
                    distance_metric="cosine",
                    enforce_detection=False,
                    silent=True,
                    refresh_database=True,
                    return_type="dict",
                )
                database_initialized = True

                for index, detected_face in enumerate(detected_faces):
                    area = detected_face["facial_area"]
                    x, y, width, height = (
                        area["x"],
                        area["y"],
                        area["w"],
                        area["h"],
                    )
                    candidates = (
                        matches_by_face[index] if index < len(matches_by_face) else []
                    )
                    if candidates:
                        label = identity_name(candidates[0]["identity"])
                        color = (0, 200, 0)
                    else:
                        label = "Unknown"
                        color = (0, 0, 255)

                    cv2.rectangle(
                        frame, (x, y), (x + width, y + height), color, 2
                    )
                    cv2.putText(
                        frame,
                        label,
                        (x, max(y - 10, 20)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        color,
                        2,
                    )

            cv2.imshow("DeepFace: Known / Unknown (press Q to quit)", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
